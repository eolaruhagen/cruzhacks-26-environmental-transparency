import { test, expect } from "bun:test";
import { CongressClient, createCoordinatedGroup, HttpResponseError } from "@cruzhacks/shared";
import {
    type BillWriteBackend,
    type HouseBillUpsert,
    type RepresentativeUpsert,
} from "./bill-write.ts";
import {
    billChamberFromType,
    buildBillRows,
    congressYears,
    ENVIRONMENTAL_POLICY_AREAS,
    isEnvironmentalBill,
    mapDistrict,
    mapParty,
    processBill,
    type ProcessBillDeps,
    TextThrottleRetry,
} from "./process-bill.ts";

// ---------------------------------------------------------------------------
// Pure mapper tests — fast, no I/O
// ---------------------------------------------------------------------------

test("mapParty: 'D' / 'Democrat' → Democrat", () => {
    expect(mapParty("D")).toEqual("Democrat");
    expect(mapParty("Democrat")).toEqual("Democrat");
});

test("mapParty: 'R' / 'Republican' → Republican", () => {
    expect(mapParty("R")).toEqual("Republican");
    expect(mapParty("Republican")).toEqual("Republican");
});

test("mapParty: 'I' / 'Independent' / 'ID' → Independent", () => {
    expect(mapParty("I")).toEqual("Independent");
    expect(mapParty("Independent")).toEqual("Independent");
    expect(mapParty("ID")).toEqual("Independent");
});

test("mapParty: unknown / undefined → null (never guess)", () => {
    expect(mapParty("L")).toEqual(null);
    expect(mapParty("Libertarian")).toEqual(null);
    expect(mapParty(undefined)).toEqual(null);
    expect(mapParty("")).toEqual(null);
});

test("mapDistrict: number passes through", () => {
    expect(mapDistrict(16)).toEqual(16);
});

test("mapDistrict: numeric string → int", () => {
    expect(mapDistrict("16")).toEqual(16);
    expect(mapDistrict("0")).toEqual(0);
});

test("mapDistrict: undefined / non-numeric → null", () => {
    expect(mapDistrict(undefined)).toEqual(null);
    expect(mapDistrict("at-large")).toEqual(null);
});

test("billChamberFromType: H* → House, S* → Senate", () => {
    for (const t of ["HR", "HJRES", "HCONRES", "HRES"]) {
        expect(billChamberFromType(t)).toEqual("House");
    }
    for (const t of ["S", "SJRES", "SCONRES", "SRES"]) {
        expect(billChamberFromType(t)).toEqual("Senate");
    }
});

test("congressYears: 1st = 1789-1790", () => {
    expect(congressYears(1)).toEqual({ start: 1789, end: 1790 });
});

test("congressYears: 119th = 2025-2026", () => {
    expect(congressYears(119)).toEqual({ start: 2025, end: 2026 });
});

// ---------------------------------------------------------------------------
// Fixture builders — minimal valid Congress API responses
// ---------------------------------------------------------------------------

function detailResponse(): unknown {
    return {
        bill: {
            congress: 119,
            type: "HR",
            number: 1,
            originChamber: "House",
            title: "Lower Energy Costs Act",
            introducedDate: "2025-01-09",
            updateDate: "2025-03-15",
            updateDateIncludingText: "2025-03-15T12:00:00Z",
            legislationUrl: "https://www.congress.gov/bill/119th-congress/house-bill/1",
            latestAction: {
                actionDate: "2025-03-15",
                text: "Passed House without amendment.",
            },
            sponsors: [{
                bioguideId: "K000388",
                fullName: "Eshoo, Anna G.",
                firstName: "Anna",
                lastName: "Eshoo",
                party: "D",
                state: "CA",
                district: 16,
                url: "https://bioguide.congress.gov/search/bio/K000388",
            }],
            policyArea: { name: "Energy" },
        },
    };
}

function actionsResponse(): unknown {
    return {
        actions: [
            {
                actionDate: "2025-03-15",
                text: "Passed House without amendment.",
                type: "Floor",
                actionCode: "H37300",
            },
        ],
    };
}

function cosponsorsResponse(): unknown {
    return {
        cosponsors: [
            {
                bioguideId: "P000034",
                fullName: "Pelosi, Nancy",
                firstName: "Nancy",
                lastName: "Pelosi",
                party: "D",
                state: "CA",
                district: 11,
            },
            {
                bioguideId: "J000288",
                fullName: "Jeffries, Hakeem",
                firstName: "Hakeem",
                lastName: "Jeffries",
                party: "D",
                state: "NY",
                district: 8,
            },
        ],
    };
}

function summariesResponse(): unknown {
    return {
        summaries: [
            {
                actionDate: "2025-03-10",
                actionDesc: "Introduced in House",
                updateDate: "2025-03-10T15:00:00Z",
                text: "<p>Lowers energy costs for consumers.</p>",
            },
        ],
    };
}

function textVersionsResponse(): unknown {
    return {
        textVersions: [
            {
                type: "Engrossed",
                date: "2025-03-15T04:00:00Z",
                formats: [
                    {
                        type: "Formatted Text",
                        url: "https://www.congress.gov/119/bills/hr1/BILLS-119hr1eh.htm",
                    },
                    {
                        type: "PDF",
                        url: "https://www.congress.gov/119/bills/hr1/BILLS-119hr1eh.pdf",
                    },
                ],
            },
        ],
    };
}

function subjectsResponse(): unknown {
    return {
        subjects: {
            policyArea: { name: "Energy" },
            legislativeSubjects: [
                { name: "Energy efficiency and conservation" },
                { name: "Greenhouse gases" },
            ],
        },
    };
}

function committeesResponse(): unknown {
    return {
        committees: [
            { name: "House Energy and Commerce Committee", chamber: "House", type: "Standing" },
            { name: "House Natural Resources Committee", chamber: "House", type: "Standing" },
        ],
    };
}

// Sample HTML the text host (www.congress.gov/.../BILLS-...htm) returns.
// Strings in FIXTURE_RESPONSES are served as raw text() bodies; objects are
// JSON-encoded. The fetchBillText path reads response.text() directly.
const SAMPLE_BILL_TEXT_HTML =
    "<html><body><pre>\n[Congressional Bills 119th Congress]\n<DOC>\nA BILL\n<all>\n</pre></body></html>";

const FIXTURE_RESPONSES: Record<string, unknown> = {
    "/bill/119/hr/1": detailResponse(),
    "/bill/119/hr/1/actions": actionsResponse(),
    "/bill/119/hr/1/cosponsors": cosponsorsResponse(),
    "/bill/119/hr/1/summaries": summariesResponse(),
    "/bill/119/hr/1/text": textVersionsResponse(),
    "/bill/119/hr/1/subjects": subjectsResponse(),
    "/bill/119/hr/1/committees": committeesResponse(),
    "BILLS-119hr1eh.htm": SAMPLE_BILL_TEXT_HTML,
};

function fakeFetch(responses: Record<string, unknown>) {
    return (url: string) => {
        for (const [path, body] of Object.entries(responses)) {
            if (url.includes(path) && (
                url.endsWith(path) ||
                url.includes(path + "?")
            )) {
                // String bodies are served as raw text (for HTML endpoints
                // like the bill-text host). Object bodies are JSON.
                const isString = typeof body === "string";
                return Promise.resolve({
                    ok: true,
                    status: 200,
                    json: () => Promise.resolve(isString ? JSON.parse(body) : body),
                    text: () => Promise.resolve(isString ? body : JSON.stringify(body)),
                });
            }
        }
        return Promise.resolve({
            ok: false,
            status: 404,
            json: () => Promise.resolve({ error: "no fixture for " + url }),
            text: () => Promise.resolve("no fixture for " + url),
        });
    };
}

function makeBackend(): {
    backend: BillWriteBackend;
    repsCalls: RepresentativeUpsert[][];
    billCalls: HouseBillUpsert[];
    nextRepsResult: { error: { message: string } | null };
    nextBillResult: { error: { message: string } | null };
} {
    const repsCalls: RepresentativeUpsert[][] = [];
    const billCalls: HouseBillUpsert[] = [];
    const state = {
        nextRepsResult: { error: null } as { error: { message: string } | null },
        nextBillResult: { error: null } as { error: { message: string } | null },
    };
    const backend: BillWriteBackend = {
        upsertRepresentatives: (reps) => {
            repsCalls.push(reps);
            return Promise.resolve(state.nextRepsResult);
        },
        upsertHouseBill: (bill) => {
            billCalls.push(bill);
            return Promise.resolve(state.nextBillResult);
        },
    };
    return {
        backend,
        repsCalls,
        billCalls,
        get nextRepsResult() {
            return state.nextRepsResult;
        },
        set nextRepsResult(v) {
            state.nextRepsResult = v;
        },
        get nextBillResult() {
            return state.nextBillResult;
        },
        set nextBillResult(v) {
            state.nextBillResult = v;
        },
    };
}

// ---------------------------------------------------------------------------
// buildBillRows — pure mapping, exhaustive
// ---------------------------------------------------------------------------

async function loadAllResponses(client: CongressClient) {
    const scope = client.bill(119, "hr", 1);
    return {
        detail: await scope.detail(),
        actions: await scope.actions(),
        cosponsors: await scope.cosponsors(),
        summaries: await scope.summaries(),
        textVersions: await scope.textVersions(),
        subjects: await scope.subjects(),
        committees: await scope.committees(),
    };
}

test("buildBillRows: produces sponsor + 2 cosponsors as reps", async () => {
    const client = new CongressClient({
        apiKey: "test",
        fetchImpl: fakeFetch(FIXTURE_RESPONSES),
    });
    const responses = await loadAllResponses(client);
    const { reps } = buildBillRows({
        message: { congress: 119, bill_type: "HR", bill_number: "1" },
        ...responses,
    });
    expect(reps.length).toEqual(3); // 1 sponsor + 2 cosponsors

    const sponsor = reps.find((r) => r.bioguide_id === "K000388")!;
    expect(sponsor.first_name).toEqual("Anna");
    expect(sponsor.last_name).toEqual("Eshoo");
    expect(sponsor.party).toEqual("Democrat");
    expect(sponsor.state).toEqual("CA");
    expect(sponsor.district).toEqual(16);
    expect(sponsor.role).toEqual("House");
});

test("buildBillRows: bill row maps detail + summaries + subjects + committees", async () => {
    const client = new CongressClient({
        apiKey: "test",
        fetchImpl: fakeFetch(FIXTURE_RESPONSES),
    });
    const responses = await loadAllResponses(client);
    const { bill } = buildBillRows({
        message: { congress: 119, bill_type: "HR", bill_number: "1" },
        ...responses,
        billTextContent: "<p>Sample bill text content.</p>",
    });
    expect(bill.congress).toEqual(119);
    expect(bill.bill_type).toEqual("HR");
    expect(bill.bill_number).toEqual(1);
    expect(bill.title).toEqual("Lower Energy Costs Act");
    expect(bill.origin_chamber).toEqual("House");
    expect(bill.date_of_introduction).toEqual("2025-01-09");
    expect(bill.congress_start_year).toEqual(2025);
    expect(bill.congress_end_year).toEqual(2026);
    expect(bill.sponsor_bioguide_id).toEqual("K000388");
    expect(bill.cosponsor_bioguide_ids.sort()).toEqual(["J000288", "P000034"]);
    expect(bill.num_cosponsors).toEqual(2);
    expect(bill.latest_action).toEqual("Passed House without amendment.");
    expect(bill.latest_action_date).toEqual("2025-03-15");
    expect(bill.bill_policy_area).toEqual("Energy");
    expect(bill.subject_terms.sort()).toEqual([
        "Energy efficiency and conservation",
        "Greenhouse gases",
    ]);
    expect(bill.committees.length).toEqual(2);
    expect(bill.url).toEqual("https://www.congress.gov/bill/119th-congress/house-bill/1");
    expect(bill.bill_text).toEqual("<p>Sample bill text content.</p>");
    expect(bill.is_law).toEqual(false);
});

// ---------------------------------------------------------------------------
// processBill — full integration with fake fetch + fake backend
// ---------------------------------------------------------------------------

test("processBill: happy path upserts reps then bill", async () => {
    const client = new CongressClient({
        apiKey: "test",
        fetchImpl: fakeFetch(FIXTURE_RESPONSES),
    });
    const fake = makeBackend();
    const deps: ProcessBillDeps = {
        congressClient: client,
        backend: fake.backend,
    };

    await processBill(
        { congress: 119, bill_type: "HR", bill_number: "1" },
        deps,
    );

    // Reps upsert called exactly once with 3 rows.
    expect(fake.repsCalls.length).toEqual(1);
    expect(fake.repsCalls[0].length).toEqual(3);

    // Bill upsert called exactly once.
    expect(fake.billCalls.length).toEqual(1);
    expect(fake.billCalls[0].title).toEqual("Lower Energy Costs Act");
    expect(fake.billCalls[0].sponsor_bioguide_id).toEqual("K000388");
});

test("processBill: skips bill upsert when reps upsert fails", async () => {
    const client = new CongressClient({
        apiKey: "test",
        fetchImpl: fakeFetch(FIXTURE_RESPONSES),
    });
    const fake = makeBackend();
    fake.nextRepsResult = { error: { message: "FK violation" } };

    await expect(
        processBill(
            { congress: 119, bill_type: "HR", bill_number: "1" },
            { congressClient: client, backend: fake.backend },
        ),
    ).rejects.toThrow("upsertRepresentatives");

    expect(fake.repsCalls.length).toEqual(1);
    expect(fake.billCalls.length).toEqual(0);
});

test("processBill: throws when bill upsert fails (after reps succeeded)", async () => {
    const client = new CongressClient({
        apiKey: "test",
        fetchImpl: fakeFetch(FIXTURE_RESPONSES),
    });
    const fake = makeBackend();
    fake.nextBillResult = { error: { message: "constraint violation" } };

    await expect(
        processBill(
            { congress: 119, bill_type: "HR", bill_number: "1" },
            { congressClient: client, backend: fake.backend },
        ),
    ).rejects.toThrow("upsertHouseBill");

    // Reps did upsert successfully — orphan rows are tolerated by design.
    expect(fake.repsCalls.length).toEqual(1);
    expect(fake.billCalls.length).toEqual(1);
});

test("processBill: propagates Congress API failure", async () => {
    const client = new CongressClient({
        apiKey: "test",
        // No fixtures registered for this URL → every call returns 404.
        fetchImpl: fakeFetch({}),
    });
    const fake = makeBackend();

    // The 404 is surfaced by CongressClient as `HTTP 404` in the message;
    // matching that substring forces processBill to actually run the fetch
    // (a stub `throw "not implemented"` cannot satisfy this).
    await expect(
        processBill(
            { congress: 119, bill_type: "HR", bill_number: "1" },
            { congressClient: client, backend: fake.backend },
        ),
    ).rejects.toThrow("HTTP 404");

    // No DB writes attempted when the fetch failed.
    expect(fake.repsCalls.length).toEqual(0);
    expect(fake.billCalls.length).toEqual(0);
});

test("processBill: dedupes a sponsor that also cosponsors", async () => {
    // Edge case: the Congress API sometimes lists a bill's sponsor in its
    // cosponsor array too. The reps upsert must dedupe by bioguide_id.
    const responsesWithDupCosponsor = {
        ...FIXTURE_RESPONSES,
        "/bill/119/hr/1/cosponsors": {
            cosponsors: [
                {
                    bioguideId: "K000388", // same as the sponsor
                    fullName: "Eshoo, Anna G.",
                    firstName: "Anna",
                    lastName: "Eshoo",
                    party: "D",
                    state: "CA",
                    district: 16,
                },
                {
                    bioguideId: "P000034",
                    fullName: "Pelosi, Nancy",
                    firstName: "Nancy",
                    lastName: "Pelosi",
                    party: "D",
                    state: "CA",
                    district: 11,
                },
            ],
        },
    };
    const client = new CongressClient({
        apiKey: "test",
        fetchImpl: fakeFetch(responsesWithDupCosponsor),
    });
    const fake = makeBackend();

    await processBill(
        { congress: 119, bill_type: "HR", bill_number: "1" },
        { congressClient: client, backend: fake.backend },
    );

    // 2 unique reps after dedupe (K000388 and P000034).
    expect(fake.repsCalls[0].length).toEqual(2);
});

// ---------------------------------------------------------------------------
// Environmental policy-area filter
// ---------------------------------------------------------------------------

test("ENVIRONMENTAL_POLICY_AREAS contains the expected core 4", () => {
    expect(ENVIRONMENTAL_POLICY_AREAS.has("Energy")).toEqual(true);
    expect(ENVIRONMENTAL_POLICY_AREAS.has("Environmental Protection")).toEqual(true);
    expect(ENVIRONMENTAL_POLICY_AREAS.has("Public Lands and Natural Resources")).toEqual(true);
    expect(ENVIRONMENTAL_POLICY_AREAS.has("Water Resources Development")).toEqual(true);
});

test("isEnvironmentalBill: true for each allowlisted policyArea", () => {
    for (const area of ENVIRONMENTAL_POLICY_AREAS) {
        // Build a minimal BillDetail with just the policyArea set.
        // deno-lint-ignore no-explicit-any
        const detail = { policyArea: { name: area } } as any;
        expect(isEnvironmentalBill(detail)).toEqual(true);
    }
});

test("isEnvironmentalBill: false for unrelated policyAreas", () => {
    for (const area of ["Health", "Taxation", "Crime and Law Enforcement", ""]) {
        // deno-lint-ignore no-explicit-any
        const detail = { policyArea: { name: area } } as any;
        expect(isEnvironmentalBill(detail)).toEqual(false);
    }
});

test("isEnvironmentalBill: false (conservative skip) when policyArea is missing", () => {
    // deno-lint-ignore no-explicit-any
    expect(isEnvironmentalBill({} as any)).toEqual(false);
    // deno-lint-ignore no-explicit-any
    expect(isEnvironmentalBill({ policyArea: undefined } as any)).toEqual(false);
});

// Recording fake-fetch — counts calls per URL substring so we can prove the
// non-env path stops after detail() and never hits the other 6 endpoints.
function recordingFakeFetch(responses: Record<string, unknown>): {
    fetch: (url: string) => Promise<{
        ok: boolean;
        status: number;
        json: () => Promise<unknown>;
        text: () => Promise<string>;
    }>;
    callsByPath: Map<string, number>;
} {
    const callsByPath = new Map<string, number>();
    const fetch = (url: string) => {
        for (const [path, body] of Object.entries(responses)) {
            if (url.includes(path) && (url.endsWith(path) || url.includes(path + "?"))) {
                callsByPath.set(path, (callsByPath.get(path) ?? 0) + 1);
                return Promise.resolve({
                    ok: true,
                    status: 200,
                    json: () => Promise.resolve(body),
                    text: () => Promise.resolve(JSON.stringify(body)),
                });
            }
        }
        return Promise.resolve({
            ok: false,
            status: 404,
            json: () => Promise.resolve({ error: "no fixture for " + url }),
            text: () => Promise.resolve("no fixture for " + url),
        });
    };
    return { fetch, callsByPath };
}

test(
    "processBill: skips non-environmental bill — no further API calls, no upserts",
    async () => {
        // Detail fixture has policyArea "Health" — outside the allowlist.
        const nonEnvDetail = {
            ...detailResponse() as Record<string, unknown>,
        } as { bill: Record<string, unknown> };
        nonEnvDetail.bill = { ...nonEnvDetail.bill, policyArea: { name: "Health" } };
        const responses = { "/bill/119/hr/1": nonEnvDetail };

        const { fetch, callsByPath } = recordingFakeFetch(responses);
        const client = new CongressClient({ apiKey: "test", fetchImpl: fetch });
        const fake = makeBackend();

        await processBill(
            { congress: 119, bill_type: "HR", bill_number: "1" },
            { congressClient: client, backend: fake.backend },
        );

        // detail() called exactly once.
        expect(callsByPath.get("/bill/119/hr/1")).toEqual(1);
        // None of the other six endpoints were even attempted.
        for (
            const sub of [
                "/bill/119/hr/1/actions",
                "/bill/119/hr/1/cosponsors",
                "/bill/119/hr/1/summaries",
                "/bill/119/hr/1/text",
                "/bill/119/hr/1/subjects",
                "/bill/119/hr/1/committees",
            ]
        ) {
            expect(callsByPath.get(sub) ?? 0).toEqual(0);
        }
        // No DB writes attempted.
        expect(fake.repsCalls.length).toEqual(0);
        expect(fake.billCalls.length).toEqual(0);
    },
);

// Test-side strategy mirrors what the worker injects in production.
function makeTextGroup() {
    return createCoordinatedGroup<TextThrottleRetry>({
        shouldTrip: (err) => err instanceof HttpResponseError && err.status === 403,
        retryError: (ctx) => new TextThrottleRetry(ctx),
    });
}

test(
    "processBill: 403 from text host trips group + throws TextThrottleRetry; nothing upserts",
    async () => {
        // Text URL hits a 403 (congress.gov anonymous throttle). Expectation:
        //   - group.tripped flipped
        //   - signal aborted (siblings cancelled)
        //   - TextThrottleRetry thrown so the worker leaves the message for retry
        //   - NO upserts (we don't want to land partial data)
        const textUrlPath = "BILLS-119hr1eh.htm";
        const fetch403OnText = (url: string) => {
            if (url.includes(textUrlPath)) {
                return Promise.resolve({
                    ok: false,
                    status: 403,
                    json: () => Promise.resolve({}),
                    text: () => Promise.resolve("Forbidden"),
                });
            }
            return fakeFetch(FIXTURE_RESPONSES)(url);
        };
        const client = new CongressClient({ apiKey: "test", fetchImpl: fetch403OnText });
        const fake = makeBackend();
        const textGroup = makeTextGroup();

        await expect(
            processBill(
                { congress: 119, bill_type: "HR", bill_number: "1" },
                { congressClient: client, backend: fake.backend, textGroup },
            ),
        ).rejects.toBeInstanceOf(TextThrottleRetry);

        expect(textGroup.tripped).toEqual(true);
        expect(textGroup.signal.aborted).toEqual(true);
        // Bill is left for retry — nothing was written.
        expect(fake.repsCalls.length).toEqual(0);
        expect(fake.billCalls.length).toEqual(0);
    },
);

test(
    "processBill: bails immediately with TextThrottleRetry when group is already tripped",
    async () => {
        // Pre-condition: textGroup is already tripped (a sibling did it).
        // We bail right after the API metadata calls, BEFORE attempting the
        // text fetch. Verified by fixture absence on the text URL — if we
        // tried the fetch, fakeFetch would 404 and the error would be
        // HttpResponseError, not TextThrottleRetry.
        const client = new CongressClient({ apiKey: "test", fetchImpl: fakeFetch(FIXTURE_RESPONSES) });
        const fake = makeBackend();
        const textGroup = makeTextGroup();
        textGroup.trip();

        await expect(
            processBill(
                { congress: 119, bill_type: "HR", bill_number: "1" },
                { congressClient: client, backend: fake.backend, textGroup },
            ),
        ).rejects.toBeInstanceOf(TextThrottleRetry);

        // Nothing landed; flag stays flipped (we didn't accidentally reset it).
        expect(fake.repsCalls.length).toEqual(0);
        expect(fake.billCalls.length).toEqual(0);
        expect(textGroup.tripped).toEqual(true);
    },
);

test(
    "processBill: bill with no policyArea is treated as non-environmental",
    async () => {
        const detailWithoutPolicyArea = {
            ...detailResponse() as Record<string, unknown>,
        } as { bill: Record<string, unknown> };
        delete detailWithoutPolicyArea.bill.policyArea;
        const { fetch, callsByPath } = recordingFakeFetch({
            "/bill/119/hr/1": detailWithoutPolicyArea,
        });
        const client = new CongressClient({ apiKey: "test", fetchImpl: fetch });
        const fake = makeBackend();

        await processBill(
            { congress: 119, bill_type: "HR", bill_number: "1" },
            { congressClient: client, backend: fake.backend },
        );

        expect(callsByPath.get("/bill/119/hr/1")).toEqual(1);
        expect(fake.repsCalls.length).toEqual(0);
        expect(fake.billCalls.length).toEqual(0);
    },
);
