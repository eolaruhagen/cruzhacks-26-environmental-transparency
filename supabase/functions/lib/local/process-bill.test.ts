import { assertEquals, assertRejects } from "jsr:@std/assert@1";
import { CongressClient } from "../shared/index.ts";
import {
    type BillWriteBackend,
    type HouseBillUpsert,
    type RepresentativeUpsert,
} from "./bill-write.ts";
import {
    billChamberFromType,
    buildBillRows,
    congressYears,
    mapDistrict,
    mapParty,
    processBill,
    type ProcessBillDeps,
} from "./process-bill.ts";

// ---------------------------------------------------------------------------
// Pure mapper tests — fast, no I/O
// ---------------------------------------------------------------------------

Deno.test("mapParty: 'D' / 'Democrat' → Democrat", () => {
    assertEquals(mapParty("D"), "Democrat");
    assertEquals(mapParty("Democrat"), "Democrat");
});

Deno.test("mapParty: 'R' / 'Republican' → Republican", () => {
    assertEquals(mapParty("R"), "Republican");
    assertEquals(mapParty("Republican"), "Republican");
});

Deno.test("mapParty: 'I' / 'Independent' / 'ID' → Independent", () => {
    assertEquals(mapParty("I"), "Independent");
    assertEquals(mapParty("Independent"), "Independent");
    assertEquals(mapParty("ID"), "Independent");
});

Deno.test("mapParty: unknown / undefined → null (never guess)", () => {
    assertEquals(mapParty("L"), null);
    assertEquals(mapParty("Libertarian"), null);
    assertEquals(mapParty(undefined), null);
    assertEquals(mapParty(""), null);
});

Deno.test("mapDistrict: number passes through", () => {
    assertEquals(mapDistrict(16), 16);
});

Deno.test("mapDistrict: numeric string → int", () => {
    assertEquals(mapDistrict("16"), 16);
    assertEquals(mapDistrict("0"), 0);
});

Deno.test("mapDistrict: undefined / non-numeric → null", () => {
    assertEquals(mapDistrict(undefined), null);
    assertEquals(mapDistrict("at-large"), null);
});

Deno.test("billChamberFromType: H* → House, S* → Senate", () => {
    for (const t of ["HR", "HJRES", "HCONRES", "HRES"]) {
        assertEquals(billChamberFromType(t), "House");
    }
    for (const t of ["S", "SJRES", "SCONRES", "SRES"]) {
        assertEquals(billChamberFromType(t), "Senate");
    }
});

Deno.test("congressYears: 1st = 1789-1790", () => {
    assertEquals(congressYears(1), { start: 1789, end: 1790 });
});

Deno.test("congressYears: 119th = 2025-2026", () => {
    assertEquals(congressYears(119), { start: 2025, end: 2026 });
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

const FIXTURE_RESPONSES: Record<string, unknown> = {
    "/bill/119/hr/1": detailResponse(),
    "/bill/119/hr/1/actions": actionsResponse(),
    "/bill/119/hr/1/cosponsors": cosponsorsResponse(),
    "/bill/119/hr/1/summaries": summariesResponse(),
    "/bill/119/hr/1/text": textVersionsResponse(),
    "/bill/119/hr/1/subjects": subjectsResponse(),
    "/bill/119/hr/1/committees": committeesResponse(),
};

function fakeFetch(responses: Record<string, unknown>) {
    return (url: string) => {
        for (const [path, body] of Object.entries(responses)) {
            if (url.includes(path) && (
                url.endsWith(path) ||
                url.includes(path + "?")
            )) {
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

Deno.test("buildBillRows: produces sponsor + 2 cosponsors as reps", async () => {
    const client = new CongressClient({
        apiKey: "test",
        fetchImpl: fakeFetch(FIXTURE_RESPONSES),
    });
    const responses = await loadAllResponses(client);
    const { reps } = buildBillRows({
        message: { congress: 119, bill_type: "HR", bill_number: "1" },
        ...responses,
    });
    assertEquals(reps.length, 3); // 1 sponsor + 2 cosponsors

    const sponsor = reps.find((r) => r.bioguide_id === "K000388")!;
    assertEquals(sponsor.first_name, "Anna");
    assertEquals(sponsor.last_name, "Eshoo");
    assertEquals(sponsor.party, "Democrat");
    assertEquals(sponsor.state, "CA");
    assertEquals(sponsor.district, 16);
    assertEquals(sponsor.role, "House");
});

Deno.test("buildBillRows: bill row maps detail + summaries + subjects + committees", async () => {
    const client = new CongressClient({
        apiKey: "test",
        fetchImpl: fakeFetch(FIXTURE_RESPONSES),
    });
    const responses = await loadAllResponses(client);
    const { bill } = buildBillRows({
        message: { congress: 119, bill_type: "HR", bill_number: "1" },
        ...responses,
    });
    assertEquals(bill.congress, 119);
    assertEquals(bill.bill_type, "HR");
    assertEquals(bill.bill_number, 1);
    assertEquals(bill.title, "Lower Energy Costs Act");
    assertEquals(bill.origin_chamber, "House");
    assertEquals(bill.date_of_introduction, "2025-01-09");
    assertEquals(bill.congress_start_year, 2025);
    assertEquals(bill.congress_end_year, 2026);
    assertEquals(bill.sponsor_bioguide_id, "K000388");
    assertEquals(bill.cosponsor_bioguide_ids.sort(), ["J000288", "P000034"]);
    assertEquals(bill.num_cosponsors, 2);
    assertEquals(bill.latest_action, "Passed House without amendment.");
    assertEquals(bill.latest_action_date, "2025-03-15");
    assertEquals(bill.bill_policy_area, "Energy");
    assertEquals(bill.subject_terms.sort(), [
        "Energy efficiency and conservation",
        "Greenhouse gases",
    ]);
    assertEquals(bill.committees.length, 2);
    assertEquals(bill.url, "https://www.congress.gov/bill/119th-congress/house-bill/1");
    assertEquals(bill.bill_text, "https://www.congress.gov/119/bills/hr1/BILLS-119hr1eh.htm");
    assertEquals(bill.is_law, false);
});

// ---------------------------------------------------------------------------
// processBill — full integration with fake fetch + fake backend
// ---------------------------------------------------------------------------

Deno.test("processBill: happy path upserts reps then bill", async () => {
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
    assertEquals(fake.repsCalls.length, 1);
    assertEquals(fake.repsCalls[0].length, 3);

    // Bill upsert called exactly once.
    assertEquals(fake.billCalls.length, 1);
    assertEquals(fake.billCalls[0].title, "Lower Energy Costs Act");
    assertEquals(fake.billCalls[0].sponsor_bioguide_id, "K000388");
});

Deno.test("processBill: skips bill upsert when reps upsert fails", async () => {
    const client = new CongressClient({
        apiKey: "test",
        fetchImpl: fakeFetch(FIXTURE_RESPONSES),
    });
    const fake = makeBackend();
    fake.nextRepsResult = { error: { message: "FK violation" } };

    await assertRejects(
        () =>
            processBill(
                { congress: 119, bill_type: "HR", bill_number: "1" },
                { congressClient: client, backend: fake.backend },
            ),
        Error,
        "upsertRepresentatives",
    );

    assertEquals(fake.repsCalls.length, 1);
    assertEquals(fake.billCalls.length, 0);
});

Deno.test("processBill: throws when bill upsert fails (after reps succeeded)", async () => {
    const client = new CongressClient({
        apiKey: "test",
        fetchImpl: fakeFetch(FIXTURE_RESPONSES),
    });
    const fake = makeBackend();
    fake.nextBillResult = { error: { message: "constraint violation" } };

    await assertRejects(
        () =>
            processBill(
                { congress: 119, bill_type: "HR", bill_number: "1" },
                { congressClient: client, backend: fake.backend },
            ),
        Error,
        "upsertHouseBill",
    );

    // Reps did upsert successfully — orphan rows are tolerated by design.
    assertEquals(fake.repsCalls.length, 1);
    assertEquals(fake.billCalls.length, 1);
});

Deno.test("processBill: propagates Congress API failure", async () => {
    const client = new CongressClient({
        apiKey: "test",
        // No fixtures registered for this URL → every call returns 404.
        fetchImpl: fakeFetch({}),
    });
    const fake = makeBackend();

    // The 404 is surfaced by CongressClient as `HTTP 404` in the message;
    // matching that substring forces processBill to actually run the fetch
    // (a stub `throw "not implemented"` cannot satisfy this).
    await assertRejects(
        () =>
            processBill(
                { congress: 119, bill_type: "HR", bill_number: "1" },
                { congressClient: client, backend: fake.backend },
            ),
        Error,
        "HTTP 404",
    );

    // No DB writes attempted when the fetch failed.
    assertEquals(fake.repsCalls.length, 0);
    assertEquals(fake.billCalls.length, 0);
});

Deno.test("processBill: dedupes a sponsor that also cosponsors", async () => {
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
    assertEquals(fake.repsCalls[0].length, 2);
});
