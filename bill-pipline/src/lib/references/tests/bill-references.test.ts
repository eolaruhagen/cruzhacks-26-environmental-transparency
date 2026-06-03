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

function makeBackend() {
    const calls: RecordedCall[] = [];
    const fake = {
        calls,
        nextCandidatesResult: { data: [] as CandidateBillRow[] | null, error: null as { message: string } | null },
        nextUpsertResult: { data: [] as UpsertReturnedRow[] | null, error: null as { message: string } | null },
        nextDeleteResult: { error: null as { message: string } | null },
        nextInsertResult: { error: null as { message: string } | null },
        nextMarkResult: { error: null as { message: string } | null },
        backend: null as unknown as ReferencesBackend,
    };
    fake.backend = {
        fetchCandidates: (batchSize) => {
            calls.push({ method: "fetchCandidates", payload: batchSize });
            return Promise.resolve(fake.nextCandidatesResult);
        },
        upsertCitedReferences: (rows) => {
            calls.push({ method: "upsertCitedReferences", payload: rows });
            return Promise.resolve(fake.nextUpsertResult);
        },
        deleteBillReferences: (billId) => {
            calls.push({ method: "deleteBillReferences", payload: billId });
            return Promise.resolve(fake.nextDeleteResult);
        },
        insertBillReferences: (billId, rows) => {
            calls.push({ method: "insertBillReferences", payload: { billId, rows } });
            return Promise.resolve(fake.nextInsertResult);
        },
        markExtracted: (billId) => {
            calls.push({ method: "markExtracted", payload: billId });
            return Promise.resolve(fake.nextMarkResult);
        },
    };
    return fake;
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

test("upsertCitedReferences: throws on short RETURNING (fewer rows than sent)", async () => {
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
    // Two unique composites sent, only one returned — the incomplete-RETURNING
    // guard must catch this before we build a partial keyToId map.
    fake.nextUpsertResult = {
        data: [{ id: REF_ID_A, kind: "usc", normalized_key: "usc:42:7401" }],
        error: null,
    };
    await expect(upsertCitedReferences(fake.backend, refs)).rejects.toThrow(
        "sent 2 rows, backend returned 1",
    );
});

test("upsertCitedReferences: throws when a returned row has the wrong key", async () => {
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
    // Right COUNT (2), but one row comes back under a key we never sent, so the
    // per-ref lookup must still throw for the composite it can't resolve.
    fake.nextUpsertResult = {
        data: [
            { id: REF_ID_A, kind: "usc", normalized_key: "usc:42:7401" },
            { id: REF_ID_B, kind: "named_law", normalized_key: "named:WRONG" },
        ],
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

test.each([["", "empty string"], [42, "non-string"]])(
    "replaceBillReferences: rejects %s billId without calling backend",
    async (billId) => {
        const fake = makeBackend();
        await expect(
            replaceBillReferences(fake.backend, billId, [validInsertRow]),
        ).rejects.toThrow("replaceBillReferences");
        expect(fake.calls).toEqual([]);
    },
);

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

test.each([["", "empty string"], [42, "non-string"]])(
    "markExtracted: rejects %s billId",
    async (billId) => {
        const fake = makeBackend();
        await expect(markExtracted(fake.backend, billId)).rejects.toThrow(
            "markExtracted",
        );
        expect(fake.calls).toEqual([]);
    },
);

test("markExtracted: throws with bill_id=... backend error context", async () => {
    const fake = makeBackend();
    fake.nextMarkResult = { error: { message: "row not found" } };
    await expect(markExtracted(fake.backend, BILL_ID)).rejects.toThrow(
        `markExtracted: backend error (bill_id=${BILL_ID})`,
    );
});
