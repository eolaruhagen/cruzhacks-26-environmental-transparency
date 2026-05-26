import { expect, test } from "bun:test";
import {
    type BillReferenceInsert,
    type CandidateBillRow,
    fetchReferenceCandidates,
    markExtracted,
    type ReferencesBackend,
    upsertCitedReferences,
    replaceBillReferences,
} from "../bill-references.ts";
import type { ExtractedReference, ReferenceKind } from "../types.ts";

type UpsertReturnedRow = {
    id: string;
    kind: ReferenceKind;
    normalized_key: string;
};

interface RecordedCall {
    method:
        | "fetchCandidates"
        | "upsertCitedReferences"
        | "deleteBillReferences"
        | "insertBillReferences"
        | "markExtracted";
    payload: unknown;
}

function makeBackend(): {
    backend: ReferencesBackend;
    calls: RecordedCall[];
    nextCandidatesResult: {
        data: CandidateBillRow[] | null;
        error: { message: string } | null;
    };
    nextUpsertResult: {
        data: UpsertReturnedRow[] | null;
        error: { message: string } | null;
    };
    nextDeleteResult: { error: { message: string } | null };
    nextInsertResult: { error: { message: string } | null };
    nextMarkResult: { error: { message: string } | null };
} {
    const calls: RecordedCall[] = [];
    const state = {
        nextCandidatesResult: { data: [], error: null } as {
            data: CandidateBillRow[] | null;
            error: { message: string } | null;
        },
        nextUpsertResult: { data: [], error: null } as {
            data: UpsertReturnedRow[] | null;
            error: { message: string } | null;
        },
        nextDeleteResult: { error: null } as {
            error: { message: string } | null;
        },
        nextInsertResult: { error: null } as {
            error: { message: string } | null;
        },
        nextMarkResult: { error: null } as {
            error: { message: string } | null;
        },
    };
    const backend: ReferencesBackend = {
        fetchCandidates: (batchSize) => {
            calls.push({ method: "fetchCandidates", payload: batchSize });
            return Promise.resolve(state.nextCandidatesResult);
        },
        upsertCitedReferences: (rows) => {
            calls.push({ method: "upsertCitedReferences", payload: rows });
            return Promise.resolve(state.nextUpsertResult);
        },
        deleteBillReferences: (billId) => {
            calls.push({ method: "deleteBillReferences", payload: billId });
            return Promise.resolve(state.nextDeleteResult);
        },
        insertBillReferences: (billId, rows) => {
            calls.push({
                method: "insertBillReferences",
                payload: { billId, rows },
            });
            return Promise.resolve(state.nextInsertResult);
        },
        markExtracted: (billId) => {
            calls.push({ method: "markExtracted", payload: billId });
            return Promise.resolve(state.nextMarkResult);
        },
    };
    return {
        backend,
        calls,
        get nextCandidatesResult() {
            return state.nextCandidatesResult;
        },
        set nextCandidatesResult(v) {
            state.nextCandidatesResult = v;
        },
        get nextUpsertResult() {
            return state.nextUpsertResult;
        },
        set nextUpsertResult(v) {
            state.nextUpsertResult = v;
        },
        get nextDeleteResult() {
            return state.nextDeleteResult;
        },
        set nextDeleteResult(v) {
            state.nextDeleteResult = v;
        },
        get nextInsertResult() {
            return state.nextInsertResult;
        },
        set nextInsertResult(v) {
            state.nextInsertResult = v;
        },
        get nextMarkResult() {
            return state.nextMarkResult;
        },
        set nextMarkResult(v) {
            state.nextMarkResult = v;
        },
    };
}

const validCandidateRow: CandidateBillRow = {
    id: "11111111-1111-4111-8111-111111111111",
    congress: 119,
    bill_type: "HR",
    bill_number: 1,
    title: "Clean Air Restoration Act",
    bill_text: "SECTION 1...",
    latest_summary: "A bill to restore the Clean Air Act.",
};

const REF_ID_A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const REF_ID_B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const BILL_ID = "22222222-2222-4222-8222-222222222222";

function makeExtractedRef(
    overrides: Partial<ExtractedReference> = {},
): ExtractedReference {
    return {
        kind: "usc",
        raw: "42 U.S.C. 7401",
        normalized_key: "usc:42:7401",
        normalized: { title: 42, section: "7401" },
        context: "as amended by",
        span_start: 100,
        span_end: 115,
        is_self_ref: false,
        ...overrides,
    };
}

// ---------------------------------------------------------------------------
// fetchReferenceCandidates
// ---------------------------------------------------------------------------

test("fetchReferenceCandidates: batchSize=0 → no backend call, returns []", async () => {
    const fake = makeBackend();
    const result = await fetchReferenceCandidates(fake.backend, 0);
    expect(result).toEqual([]);
    expect(fake.calls).toEqual([]);
});

test("fetchReferenceCandidates: negative batchSize → no backend call, returns []", async () => {
    const fake = makeBackend();
    const result = await fetchReferenceCandidates(fake.backend, -5);
    expect(result).toEqual([]);
    expect(fake.calls).toEqual([]);
});

test("fetchReferenceCandidates: returns parsed rows on happy path", async () => {
    const fake = makeBackend();
    fake.nextCandidatesResult = { data: [validCandidateRow], error: null };
    const result = await fetchReferenceCandidates(fake.backend, 10);
    expect(result.length).toEqual(1);
    expect(result[0]).toEqual(validCandidateRow);
    expect(fake.calls.length).toEqual(1);
    expect(fake.calls[0].method).toEqual("fetchCandidates");
    expect(fake.calls[0].payload).toEqual(10);
});

test("fetchReferenceCandidates: rejects schema-invalid row with index in message", async () => {
    const fake = makeBackend();
    const badRow = { id: "11111111-1111-4111-8111-111111111111" };
    fake.nextCandidatesResult = {
        data: [validCandidateRow, badRow] as unknown as CandidateBillRow[],
        error: null,
    };
    await expect(fetchReferenceCandidates(fake.backend, 10)).rejects.toThrow(
        "fetchReferenceCandidates: invalid row at index 1",
    );
});

test("fetchReferenceCandidates: throws with backend error context", async () => {
    const fake = makeBackend();
    fake.nextCandidatesResult = {
        data: null,
        error: { message: "connection refused" },
    };
    await expect(fetchReferenceCandidates(fake.backend, 10)).rejects.toThrow(
        "fetchReferenceCandidates: backend error",
    );
});

// ---------------------------------------------------------------------------
// upsertCitedReferences
// ---------------------------------------------------------------------------

test("upsertCitedReferences: empty refs → no backend call, returns empty Map", async () => {
    const fake = makeBackend();
    const result = await upsertCitedReferences(fake.backend, []);
    expect(result.size).toEqual(0);
    expect(fake.calls).toEqual([]);
});

test("upsertCitedReferences: dedupes by (kind, normalized_key) before sending", async () => {
    const fake = makeBackend();
    const refs: ExtractedReference[] = [
        makeExtractedRef({ normalized_key: "usc:42:7401", raw: "42 USC 7401" }),
        makeExtractedRef({
            normalized_key: "usc:42:7401",
            raw: "42 U.S.C. § 7401",
        }),
        makeExtractedRef({
            kind: "named_law",
            normalized_key: "named:clean air act",
            normalized: { name: "Clean Air Act" },
            raw: "Clean Air Act",
        }),
    ];
    fake.nextUpsertResult = {
        data: [
            { id: REF_ID_A, kind: "usc", normalized_key: "usc:42:7401" },
            {
                id: REF_ID_B,
                kind: "named_law",
                normalized_key: "named:clean air act",
            },
        ],
        error: null,
    };
    const result = await upsertCitedReferences(fake.backend, refs);

    expect(fake.calls.length).toEqual(1);
    expect(fake.calls[0].method).toEqual("upsertCitedReferences");
    const sent = fake.calls[0].payload as unknown[];
    expect(sent.length).toEqual(2);

    // Map should contain composite-key entries for both unique refs.
    expect(result.size).toEqual(2);
    expect(result.get("usc:usc:42:7401")).toEqual(REF_ID_A);
    expect(result.get("named_law:named:clean air act")).toEqual(REF_ID_B);
});

test("upsertCitedReferences: cross-kind same-key returns distinct ids per kind", async () => {
    const fake = makeBackend();
    // Two refs sharing the same normalized_key but with different kinds —
    // the DB's unique constraint is on the (kind, normalized_key) pair so
    // both rows coexist with separate ids, and the wrapper must not collapse
    // them.
    const refs: ExtractedReference[] = [
        makeExtractedRef({
            kind: "named_law",
            normalized_key: "collision",
            normalized: { name: "Collision" },
            raw: "Collision",
        }),
        makeExtractedRef({
            kind: "public_law",
            normalized_key: "collision",
            normalized: { congress: 117, number: 58 },
            raw: "Public Law 117-58",
        }),
    ];
    fake.nextUpsertResult = {
        data: [
            { id: REF_ID_A, kind: "named_law", normalized_key: "collision" },
            { id: REF_ID_B, kind: "public_law", normalized_key: "collision" },
        ],
        error: null,
    };
    const result = await upsertCitedReferences(fake.backend, refs);

    expect(result.size).toEqual(2);
    const idA = result.get("named_law:collision");
    const idB = result.get("public_law:collision");
    expect(idA).toEqual(REF_ID_A);
    expect(idB).toEqual(REF_ID_B);
    expect(idA).not.toEqual(idB);
});

test("upsertCitedReferences: throws when backend omits a key from results", async () => {
    const fake = makeBackend();
    const refs: ExtractedReference[] = [
        makeExtractedRef({ normalized_key: "usc:42:7401" }),
        makeExtractedRef({
            kind: "named_law",
            normalized_key: "named:missing law",
            normalized: { name: "Missing" },
            raw: "Missing Law",
        }),
    ];
    fake.nextUpsertResult = {
        data: [{ id: REF_ID_A, kind: "usc", normalized_key: "usc:42:7401" }],
        error: null,
    };
    await expect(upsertCitedReferences(fake.backend, refs)).rejects.toThrow(
        "upsertCitedReferences: backend returned no id for named_law:named:missing law",
    );
});

test("upsertCitedReferences: throws with count context on backend error", async () => {
    const fake = makeBackend();
    const refs: ExtractedReference[] = [
        makeExtractedRef({ normalized_key: "usc:42:7401" }),
        makeExtractedRef({
            kind: "named_law",
            normalized_key: "named:clean air act",
            normalized: { name: "Clean Air Act" },
            raw: "Clean Air Act",
        }),
    ];
    fake.nextUpsertResult = {
        data: null,
        error: { message: "unique violation" },
    };
    await expect(upsertCitedReferences(fake.backend, refs)).rejects.toThrow(
        "upsertCitedReferences: backend error (count=2)",
    );
});

// ---------------------------------------------------------------------------
// replaceBillReferences
// ---------------------------------------------------------------------------

const validInsertRow: BillReferenceInsert = {
    reference_id: REF_ID_A,
    raw: "42 U.S.C. § 7401",
    context: "as amended by",
    span_start: 100,
    span_end: 115,
    source: "bill_text",
    is_self_ref: false,
};

test("replaceBillReferences: empty rows → delete is still called, insert is NOT called", async () => {
    const fake = makeBackend();
    await replaceBillReferences(fake.backend, BILL_ID, []);
    expect(fake.calls.length).toEqual(1);
    expect(fake.calls[0].method).toEqual("deleteBillReferences");
    expect(fake.calls[0].payload).toEqual(BILL_ID);
});

test("replaceBillReferences: non-empty rows → delete then insert with bill_id payload", async () => {
    const fake = makeBackend();
    await replaceBillReferences(fake.backend, BILL_ID, [validInsertRow]);
    expect(fake.calls.length).toEqual(2);
    expect(fake.calls[0].method).toEqual("deleteBillReferences");
    expect(fake.calls[0].payload).toEqual(BILL_ID);
    expect(fake.calls[1].method).toEqual("insertBillReferences");
    const insertPayload = fake.calls[1].payload as {
        billId: string;
        rows: BillReferenceInsert[];
    };
    expect(insertPayload.billId).toEqual(BILL_ID);
    expect(insertPayload.rows).toEqual([validInsertRow]);
});

test("replaceBillReferences: delete error → throws with bill_id context", async () => {
    const fake = makeBackend();
    fake.nextDeleteResult = { error: { message: "fk violation" } };
    await expect(
        replaceBillReferences(fake.backend, BILL_ID, [validInsertRow]),
    ).rejects.toThrow(
        `replaceBillReferences: backend error (bill_id=${BILL_ID})`,
    );
    // Insert should NOT have been issued after delete failure.
    expect(fake.calls.length).toEqual(1);
    expect(fake.calls[0].method).toEqual("deleteBillReferences");
});

test("replaceBillReferences: insert error → throws with bill_id context", async () => {
    const fake = makeBackend();
    fake.nextInsertResult = { error: { message: "fk violation" } };
    await expect(
        replaceBillReferences(fake.backend, BILL_ID, [validInsertRow]),
    ).rejects.toThrow(
        `replaceBillReferences: backend error (bill_id=${BILL_ID})`,
    );
});

test("replaceBillReferences: invalid row → no DELETE, no INSERT, throws with index", async () => {
    const fake = makeBackend();
    const badRow = {
        // Missing reference_id, raw, etc. — fails BillReferenceInsertSchema.
        source: "bill_text",
    } as unknown as BillReferenceInsert;
    await expect(
        replaceBillReferences(fake.backend, BILL_ID, [validInsertRow, badRow]),
    ).rejects.toThrow(
        `replaceBillReferences: invalid row at index 1 (bill_id=${BILL_ID})`,
    );
    expect(fake.calls.length).toEqual(0);
});

test("replaceBillReferences: rejects empty billId without calling backend", async () => {
    const fake = makeBackend();
    await expect(
        replaceBillReferences(fake.backend, "", [validInsertRow]),
    ).rejects.toThrow("replaceBillReferences");
    expect(fake.calls).toEqual([]);
});

test("replaceBillReferences: rejects non-string billId without calling backend", async () => {
    const fake = makeBackend();
    await expect(
        replaceBillReferences(fake.backend, 42, [validInsertRow]),
    ).rejects.toThrow("replaceBillReferences");
    expect(fake.calls).toEqual([]);
});

// ---------------------------------------------------------------------------
// markExtracted
// ---------------------------------------------------------------------------

test("markExtracted: forwards billId to backend on happy path", async () => {
    const fake = makeBackend();
    await markExtracted(fake.backend, BILL_ID);
    expect(fake.calls.length).toEqual(1);
    expect(fake.calls[0].method).toEqual("markExtracted");
    expect(fake.calls[0].payload).toEqual(BILL_ID);
});

test("markExtracted: rejects empty billId", async () => {
    const fake = makeBackend();
    await expect(markExtracted(fake.backend, "")).rejects.toThrow(
        "markExtracted",
    );
    expect(fake.calls).toEqual([]);
});

test("markExtracted: rejects non-string billId", async () => {
    const fake = makeBackend();
    await expect(markExtracted(fake.backend, 42)).rejects.toThrow(
        "markExtracted",
    );
    expect(fake.calls).toEqual([]);
});

test("markExtracted: throws with bill_id=... backend error context", async () => {
    const fake = makeBackend();
    fake.nextMarkResult = { error: { message: "row not found" } };
    await expect(markExtracted(fake.backend, BILL_ID)).rejects.toThrow(
        `markExtracted: backend error (bill_id=${BILL_ID})`,
    );
});
