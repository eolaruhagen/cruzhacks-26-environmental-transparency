import { test, expect } from "bun:test";
import {
    type BillWriteBackend,
    type HouseBillUpsert,
    type RepresentativeUpsert,
    upsertHouseBill,
    upsertRepresentatives,
} from "./bill-write.ts";

interface RecordedCall {
    method: "upsertRepresentatives" | "upsertHouseBill";
    payload: unknown;
}

function makeBackend(): {
    backend: BillWriteBackend;
    calls: RecordedCall[];
    nextRepsResult: { error: { message: string } | null };
    nextBillResult: { error: { message: string } | null };
} {
    const calls: RecordedCall[] = [];
    const state = {
        nextRepsResult: { error: null } as { error: { message: string } | null },
        nextBillResult: { error: null } as { error: { message: string } | null },
    };
    const backend: BillWriteBackend = {
        upsertRepresentatives: (reps) => {
            calls.push({ method: "upsertRepresentatives", payload: reps });
            return Promise.resolve(state.nextRepsResult);
        },
        upsertHouseBill: (bill) => {
            calls.push({ method: "upsertHouseBill", payload: bill });
            return Promise.resolve(state.nextBillResult);
        },
    };
    return {
        backend,
        calls,
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

const validRep: RepresentativeUpsert = {
    bioguide_id: "K000388",
    first_name: "Anna",
    last_name: "Eshoo",
    party: "Democrat",
    state: "CA",
    district: 16,
    role: "House",
    url: "https://bioguide.congress.gov/search/bio/K000388",
    last_seen_in_congress: 119,
};

const validBill: HouseBillUpsert = {
    congress: 119,
    bill_type: "HR",
    bill_number: 1,
    title: "Lower Energy Costs Act",
    origin_chamber: "House",
    congress_start_year: 2025,
    congress_end_year: 2027,
    sponsor_bioguide_id: "K000388",
    cosponsor_bioguide_ids: [],
    num_cosponsors: 0,
    is_law: false,
    subject_terms: [],
    committees: [],
};

// ---------------------------------------------------------------------------
// upsertRepresentatives
// ---------------------------------------------------------------------------

test("upsertRepresentatives: empty array → no backend call", async () => {
    const fake = makeBackend();
    await upsertRepresentatives(fake.backend, []);
    expect(fake.calls).toEqual([]);
});

test("upsertRepresentatives: forwards validated payload to backend", async () => {
    const fake = makeBackend();
    await upsertRepresentatives(fake.backend, [validRep]);
    expect(fake.calls.length).toEqual(1);
    expect(fake.calls[0].method).toEqual("upsertRepresentatives");
    expect(fake.calls[0].payload).toEqual([validRep]);
});

test("upsertRepresentatives: dedupes by bioguide_id, last write wins", async () => {
    const fake = makeBackend();
    const repA = { ...validRep, first_name: "Old" };
    const repB = { ...validRep, first_name: "New" }; // same bioguide_id
    await upsertRepresentatives(fake.backend, [repA, repB]);
    expect(fake.calls.length).toEqual(1);
    const sent = fake.calls[0].payload as RepresentativeUpsert[];
    expect(sent.length).toEqual(1);
    expect(sent[0].first_name).toEqual("New"); // last write wins
});

test("upsertRepresentatives: rejects invalid rep before backend call", async () => {
    const fake = makeBackend();
    // Public signature is unknown[] (Zod validates), so this is a runtime-only
    // failure — no @ts-expect-error needed.
    await expect(
        upsertRepresentatives(fake.backend, [{ role: "House" }]),
    ).rejects.toThrow("upsertRepresentatives");
    expect(fake.calls).toEqual([]);
});

test("upsertRepresentatives: rejects unknown columns (typo guard)", async () => {
    const fake = makeBackend();
    await expect(
        upsertRepresentatives(fake.backend, [
            { ...validRep, partyAffiliation: "Democrat" },
        ]),
    ).rejects.toThrow("upsertRepresentatives");
    expect(fake.calls).toEqual([]);
});

test("upsertRepresentatives: throws with backend error context", async () => {
    const fake = makeBackend();
    fake.nextRepsResult = { error: { message: "FK violation: states" } };
    await expect(
        upsertRepresentatives(fake.backend, [validRep]),
    ).rejects.toThrow("upsertRepresentatives");
});

// ---------------------------------------------------------------------------
// upsertHouseBill
// ---------------------------------------------------------------------------

test("upsertHouseBill: forwards validated payload to backend", async () => {
    const fake = makeBackend();
    await upsertHouseBill(fake.backend, validBill);
    expect(fake.calls.length).toEqual(1);
    expect(fake.calls[0].method).toEqual("upsertHouseBill");
    expect(fake.calls[0].payload).toEqual(validBill);
});

test("upsertHouseBill: applies defaults for missing array/bool fields", async () => {
    const fake = makeBackend();
    const minimal = {
        congress: 119,
        bill_type: "HR" as const,
        bill_number: 2,
        title: "Test bill",
        origin_chamber: "House" as const,
        congress_start_year: 2025,
        congress_end_year: 2027,
    };
    await upsertHouseBill(fake.backend, minimal);
    const sent = fake.calls[0].payload as HouseBillUpsert;
    expect(sent.cosponsor_bioguide_ids).toEqual([]);
    expect(sent.subject_terms).toEqual([]);
    expect(sent.committees).toEqual([]);
    expect(sent.is_law).toEqual(false);
    expect(sent.num_cosponsors).toEqual(0);
});

test("upsertHouseBill: rejects invalid bill before backend call", async () => {
    const fake = makeBackend();
    await expect(
        upsertHouseBill(fake.backend, { congress: 119 }),
    ).rejects.toThrow("upsertHouseBill");
    expect(fake.calls).toEqual([]);
});

test("upsertHouseBill: rejects bill_type outside the legislation_type enum", async () => {
    const fake = makeBackend();
    await expect(
        upsertHouseBill(fake.backend, {
            ...validBill,
            bill_type: "INVALID",
        }),
    ).rejects.toThrow("upsertHouseBill");
    expect(fake.calls).toEqual([]);
});

test("upsertHouseBill: throws with backend error context", async () => {
    const fake = makeBackend();
    fake.nextBillResult = {
        error: { message: "FK violation: sponsor_bioguide_id" },
    };
    await expect(
        upsertHouseBill(fake.backend, validBill),
    ).rejects.toThrow("upsertHouseBill");
});
