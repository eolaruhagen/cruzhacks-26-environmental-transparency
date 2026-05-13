import {
    type BillActionsResponse,
    type BillCommitteesResponse,
    type BillCosponsorsResponse,
    type BillDetailResponse,
    type BillSubjectsResponse,
    type BillSummariesResponse,
    type BillTextResponse,
    type BillTypeAsParam,
    CongressClient,
    type CoordinatedRequestGroup,
} from "@cruzhacks/shared";
import type { HouseBillQueueMessage } from "./pgmq-interactions.ts";
import {
    type BillWriteBackend,
    type HouseBillUpsert,
    type RepresentativeUpsert,
    upsertHouseBill,
    upsertRepresentatives,
} from "./bill-write.ts";
import { tryFetchBillText } from "./bill-text-fetch.ts";

// One-to-one mapping from the persisted legislation_type enum (uppercase, no
// dots — what we store and what the queue carries) to the URL-param form
// CongressClient expects (lowercase). Keeping it as a typed Record means
// the lookup itself is type-safe; no `as` cast.
const LEGISLATION_TO_PARAM = {
    HR: "hr",
    S: "s",
    HJRES: "hjres",
    SJRES: "sjres",
    HCONRES: "hconres",
    SCONRES: "sconres",
    HRES: "hres",
    SRES: "sres",
} as const satisfies Record<HouseBillQueueMessage["bill_type"], BillTypeAsParam>;

// ---------------------------------------------------------------------------
// Environmental policy-area allowlist
// ---------------------------------------------------------------------------
// Congress.gov assigns every bill exactly one top-level `policyArea` from a
// fixed list of ~30 values (full list: https://www.congress.gov/help/field-values/policy-area).
// We only persist bills whose policy area is directly environmental — keeps
// house_bills_2 from collecting thousands of unrelated rows without needing
// any LLM/extra-API filtering. To widen the scope, add to this set; to drop
// it back to "all bills", swap `isEnvironmentalBill` for `() => true`.

export const ENVIRONMENTAL_POLICY_AREAS: ReadonlySet<string> = new Set([
    "Energy",
    "Environmental Protection",
    "Public Lands and Natural Resources",
    "Water Resources Development",
]);

/**
 * Decide whether a bill detail's policyArea places it in scope. Conservative:
 * a missing or unknown policyArea returns false (skip), so a bill with no
 * classification is dropped rather than persisted "just in case."
 */
export function isEnvironmentalBill(detail: BillDetailResponse["bill"]): boolean {
    const name = detail.policyArea?.name;
    if (!name) return false;
    return ENVIRONMENTAL_POLICY_AREAS.has(name);
}


/**
 * Sentinel thrown when text fetch is aborted by the throttle group. Worker
 * recognizes this class and leaves the message in queue (no archive, no
 * "failed" counter bump, no warn log). After the cooldown elapses, PGMQ vt
 * re-delivery picks the bill back up and the retry runs all 7 API calls +
 * text fetch fresh — idempotent on the metadata.
 */
export class TextThrottleRetry extends Error {
    constructor(public readonly billRef: string) {
        super(`bill_text throttled; bill ${billRef} left in queue for retry`);
        this.name = "TextThrottleRetry";
    }
}

export interface ProcessBillDeps {
    congressClient: CongressClient;
    backend: BillWriteBackend;
    /**
     * Optional. Coordinated request group shared across all bills in a
     * `mapConcurrent` batch. The first 403 from congress.gov text host
     * trips the group, which aborts in-flight siblings and signals the
     * worker to back off. Omit in tests that don't exercise the throttle.
     */
    textGroup?: CoordinatedRequestGroup<TextThrottleRetry>;
}


/**
 * Per-bill unit of work for the worker.
 *
 * Fetches `detail()` first — it carries the policyArea we filter on. If the
 * bill isn't environmentally relevant we return early: no further Congress
 * API calls, no DB writes. The worker still archives the message because
 * processing succeeded ("we looked, it didn't apply").
 *
 *
 * Throws on any failure so the worker leaves the message in the PGMQ queue
 * (visibility timeout will re-surface it for retry).
 */
export async function processBill(
    message: HouseBillQueueMessage,
    deps: ProcessBillDeps,
): Promise<void> {
    const billNumberInt = parseInt(message.bill_number, 10);
    if (!Number.isFinite(billNumberInt)) {
        throw new Error(
            `processBill: bill_number "${message.bill_number}" is not a valid integer`,
        );
    }
    const billTypeParam = LEGISLATION_TO_PARAM[message.bill_type];
    const scope = deps.congressClient.bill(message.congress, billTypeParam, billNumberInt);

    // Detail-first so we can bail before the other 6 API calls when the bill
    // isn't environmentally relevant. Most House bills aren't — this is the
    // single biggest knob for keeping API budget and DB rows under control.
    const detail = await scope.detail();
    if (!isEnvironmentalBill(detail.bill)) return;

    const [actions, cosponsors, summaries, textVersions, subjects, committees] =
        await Promise.all([
            scope.actions(),
            scope.cosponsors(),
            scope.summaries(),
            scope.textVersions(),
            scope.subjects(),
            scope.committees(),
        ]);

    const billRef = `${message.bill_type}-${message.bill_number} (congress ${message.congress})`;
    const billTextContent = await tryFetchBillText({
        url: CongressClient.getMostRecentTextUrl(textVersions.textVersions),
        congressClient: deps.congressClient,
        group: deps.textGroup,
        billRef,
    });

    const { reps, bill } = buildBillRows({
        message,
        detail,
        actions,
        cosponsors,
        summaries,
        textVersions,
        subjects,
        committees,
        billTextContent,
    });

    // Reps before bill — bill has FK on sponsor_bioguide_id, so reps must
    // exist first. If reps fails we abort; if bill fails the orphan reps
    // are tolerated by design (best-effort atomicity per the plan).
    await upsertRepresentatives(deps.backend, reps);
    await upsertHouseBill(deps.backend, bill);
}

// ---------------------------------------------------------------------------
// Pure mapping — exported for unit-testing in isolation
// ---------------------------------------------------------------------------

/**
 * Convert the API party string ("D", "R", "I", "Democrat", "Republican",
 * "Independent", "ID", "L", ...) into the `party` enum used by the DB. Any
 * value we can't confidently classify returns null — we never guess.
 */
export function mapParty(
    party: string | undefined,
): "Democrat" | "Republican" | "Independent" | null {
    if (!party) return null;
    const p = party.trim().toUpperCase();
    if (p === "D" || p === "DEM" || p.startsWith("DEMOC")) return "Democrat";
    if (p === "R" || p === "REP" || p.startsWith("REPUB")) return "Republican";
    if (p === "I" || p === "ID" || p.startsWith("INDEP")) return "Independent";
    return null;
}

/**
 * Coerce the district field (number or string per the API spec) into an int,
 * or null if absent/unparseable.
 */
export function mapDistrict(district: number | string | undefined): number | null {
    if (district === undefined || district === null) return null;
    if (typeof district === "number") return Number.isFinite(district) ? district : null;
    const n = parseInt(district, 10);
    return Number.isFinite(n) ? n : null;
}

/**
 * Map a `BillTypeAsParam`-style enum value (uppercase) to the chamber the
 * bill's sponsors sit in. H* → House, S* → Senate. There are no joint bill
 * types in the Congress API, so "Joint" is unused here (it shows up only
 * for joint committees in `representatives.role`).
 */
export function billChamberFromType(billType: string): "House" | "Senate" {
    return billType.toUpperCase().startsWith("H") ? "House" : "Senate";
}

/**
 * Compute the calendar-year span of an N-th Congress.
 *   1st Congress: 1789–1790
 *   119th Congress: 2025–2026
 * end_year is start_year + 1 because Congresses meet for two calendar years
 * and we follow the convention used on congress.gov ("(2025-2026)").
 */
export function congressYears(congress: number): { start: number; end: number } {
    const start = 1789 + (congress - 1) * 2;
    return { start, end: start + 1 };
}

/**
 * Take the full set of API responses for one bill plus the original queue
 * message and return the rows we need to upsert. Pure — no I/O. Validation
 * runs inside the upsert helpers when this output is passed to them.
 */
export function buildBillRows(input: {
    message: HouseBillQueueMessage;
    detail: BillDetailResponse;
    actions: BillActionsResponse;
    cosponsors: BillCosponsorsResponse;
    summaries: BillSummariesResponse;
    textVersions: BillTextResponse;
    subjects: BillSubjectsResponse;
    committees: BillCommitteesResponse;
    /** Already-fetched bill text content. Caller resolves the URL + downloads. */
    billTextContent?: string | null;
}): { reps: RepresentativeUpsert[]; bill: HouseBillUpsert } {
    const { detail: { bill: detail }, message } = input;
    const role = billChamberFromType(message.bill_type);

    // Sponsor — first entry only. The API allows multiple sponsors but we
    // store one (matches house_bills_2.sponsor_bioguide_id being scalar).
    const sponsor = detail.sponsors?.[0];

    const reps: RepresentativeUpsert[] = [];
    if (sponsor?.bioguideId) {
        reps.push({
            bioguide_id: sponsor.bioguideId,
            first_name: sponsor.firstName ?? null,
            middle_name: sponsor.middleName ?? null,
            last_name: sponsor.lastName ?? null,
            party: mapParty(sponsor.party),
            state: sponsor.state ?? null,
            district: mapDistrict(sponsor.district),
            role,
            url: sponsor.url ?? null,
            last_seen_in_congress: detail.congress,
        });
    }

    for (const c of input.cosponsors.cosponsors) {
        if (!c.bioguideId) continue;
        reps.push({
            bioguide_id: c.bioguideId,
            first_name: c.firstName ?? null,
            middle_name: c.middleName ?? null,
            last_name: c.lastName ?? null,
            party: mapParty(c.party),
            state: c.state ?? null,
            district: mapDistrict(c.district),
            role,
            url: c.url ?? null,
            last_seen_in_congress: detail.congress,
        });
    }

    const cosponsorIds = input.cosponsors.cosponsors
        .map((c) => c.bioguideId)
        .filter((id): id is string => typeof id === "string" && id.length > 0);

    const yrs = congressYears(detail.congress);
    const billNumberInt = typeof detail.number === "number"
        ? detail.number
        : parseInt(detail.number, 10);
    const latestSummary = input.summaries.summaries
        .slice()
        .sort((a, b) => (b.updateDate ?? "").localeCompare(a.updateDate ?? ""))[0];
    const latestActionFromActions = input.actions.actions
        .slice()
        .sort((a, b) => (b.actionDate ?? "").localeCompare(a.actionDate ?? ""))[0];

    const bill: HouseBillUpsert = {
        congress: detail.congress,
        bill_type: detail.type,
        bill_number: billNumberInt,
        title: detail.title ?? "",
        url: detail.legislationUrl ?? null,
        bill_text: input.billTextContent ?? null,
        origin_chamber: detail.originChamber ?? (role === "House" ? "House" : "Senate"),
        date_of_introduction: detail.introducedDate ?? null,
        congress_start_year: yrs.start,
        congress_end_year: yrs.end,
        congress_update_date: detail.updateDate ?? null,
        congress_update_date_including_text: detail.updateDateIncludingText ?? null,
        sponsor_bioguide_id: sponsor?.bioguideId ?? null,
        cosponsor_bioguide_ids: cosponsorIds,
        num_cosponsors: cosponsorIds.length,
        latest_action: detail.latestAction?.text ?? null,
        latest_action_date: detail.latestAction?.actionDate ?? null,
        latest_action_code: latestActionFromActions?.actionCode ?? null,
        latest_action_type: latestActionFromActions?.type ?? null,
        is_law: (detail.laws?.length ?? 0) > 0,
        law_type: detail.laws?.[0]?.type ?? null,
        law_number: detail.laws?.[0]?.number ?? null,
        subject_terms: input.subjects.subjects.legislativeSubjects?.map((s) => s.name) ?? [],
        bill_policy_area: detail.policyArea?.name ?? null,
        latest_summary: latestSummary?.text ?? null,
        committees: input.committees.committees
            .map((c) => c.name)
            .filter((n): n is string => typeof n === "string" && n.length > 0),
    };

    return { reps, bill };
}
