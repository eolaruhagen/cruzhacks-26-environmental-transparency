import { test, expect } from "bun:test";
import {
    type BillEnrichmentWrite,
    type BillFetchBackend,
    type BillFetchRow,
    fetchCorpusMean,
    fetchSubcategoryEmbeddings,
    fetchUnenrichedBills,
    markInsufficientInfo,
    type SubcategoryEmbeddingRow,
    writeEnrichment,
} from "../bill-fetch.ts";

interface RecordedCall {
    method:
        | "fetchUnenrichedBills"
        | "fetchCorpusMean"
        | "writeEnrichment"
        | "markInsufficientInfo"
        | "fetchSubcategoryEmbeddings";
    payload: unknown;
}

function makeBackend(): {
    backend: BillFetchBackend;
    calls: RecordedCall[];
    nextRowsResult: {
        data: BillFetchRow[] | null;
        error: { message: string } | null;
    };
    nextMeanResult: {
        data: number[] | null;
        error: { message: string } | null;
    };
    nextWriteResult: { error: { message: string } | null };
    nextMarkResult: { error: { message: string } | null };
    nextSubcategoryResult: {
        data: SubcategoryEmbeddingRow[] | null;
        error: { message: string } | null;
    };
} {
    const calls: RecordedCall[] = [];
    const state = {
        nextRowsResult: { data: [], error: null } as {
            data: BillFetchRow[] | null;
            error: { message: string } | null;
        },
        nextMeanResult: { data: null, error: null } as {
            data: number[] | null;
            error: { message: string } | null;
        },
        nextWriteResult: { error: null } as {
            error: { message: string } | null;
        },
        nextMarkResult: { error: null } as {
            error: { message: string } | null;
        },
        nextSubcategoryResult: { data: [], error: null } as {
            data: SubcategoryEmbeddingRow[] | null;
            error: { message: string } | null;
        },
    };
    const backend: BillFetchBackend = {
        fetchUnenrichedBills: (batchSize) => {
            calls.push({ method: "fetchUnenrichedBills", payload: batchSize });
            return Promise.resolve(state.nextRowsResult);
        },
        fetchCorpusMean: (artifactType) => {
            calls.push({ method: "fetchCorpusMean", payload: artifactType });
            return Promise.resolve(state.nextMeanResult);
        },
        writeEnrichment: (id, payload) => {
            calls.push({ method: "writeEnrichment", payload: { id, payload } });
            return Promise.resolve(state.nextWriteResult);
        },
        markInsufficientInfo: (id, reason) => {
            calls.push({
                method: "markInsufficientInfo",
                payload: { id, reason },
            });
            return Promise.resolve(state.nextMarkResult);
        },
        fetchSubcategoryEmbeddings: (billType) => {
            calls.push({
                method: "fetchSubcategoryEmbeddings",
                payload: billType,
            });
            return Promise.resolve(state.nextSubcategoryResult);
        },
    };
    return {
        backend,
        calls,
        get nextRowsResult() {
            return state.nextRowsResult;
        },
        set nextRowsResult(v) {
            state.nextRowsResult = v;
        },
        get nextMeanResult() {
            return state.nextMeanResult;
        },
        set nextMeanResult(v) {
            state.nextMeanResult = v;
        },
        get nextWriteResult() {
            return state.nextWriteResult;
        },
        set nextWriteResult(v) {
            state.nextWriteResult = v;
        },
        get nextMarkResult() {
            return state.nextMarkResult;
        },
        set nextMarkResult(v) {
            state.nextMarkResult = v;
        },
        get nextSubcategoryResult() {
            return state.nextSubcategoryResult;
        },
        set nextSubcategoryResult(v) {
            state.nextSubcategoryResult = v;
        },
    };
}

const validRow: BillFetchRow = {
    id: "11111111-1111-4111-8111-111111111111",
    congress: 119,
    bill_type: "HR",
    bill_number: 1,
    title: "Lower Energy Costs Act",
    latest_summary: "A bill to lower energy costs.",
    subject_terms: ["Energy", "Environment"],
    bill_policy_area: "Energy",
    bill_text: "SECTION 1. SHORT TITLE...",
};

const mean1536: number[] = Array.from({ length: 1536 }, (_, i) => i / 1536);
const embedding1536: number[] = Array.from(
    { length: 1536 },
    (_, i) => (i % 7) * 0.01,
);

const validEnrichment: BillEnrichmentWrite = {
    category: "energy_and_resources",
    embedding: embedding1536,
    subcategory_scores: { renewable: 0.81, fossil: 0.12 },
};

// ---------------------------------------------------------------------------
// fetchUnenrichedBills
// ---------------------------------------------------------------------------

test("fetchUnenrichedBills: batchSize=0 → no backend call, returns []", async () => {
    const fake = makeBackend();
    const result = await fetchUnenrichedBills(fake.backend, 0);
    expect(result).toEqual([]);
    expect(fake.calls).toEqual([]);
});

test("fetchUnenrichedBills: negative batchSize → no backend call, returns []", async () => {
    const fake = makeBackend();
    const result = await fetchUnenrichedBills(fake.backend, -5);
    expect(result).toEqual([]);
    expect(fake.calls).toEqual([]);
});

test("fetchUnenrichedBills: returns parsed rows on happy path", async () => {
    const fake = makeBackend();
    fake.nextRowsResult = { data: [validRow], error: null };
    const result = await fetchUnenrichedBills(fake.backend, 10);
    expect(result.length).toEqual(1);
    expect(result[0]).toEqual(validRow);
    expect(fake.calls.length).toEqual(1);
    expect(fake.calls[0].method).toEqual("fetchUnenrichedBills");
    expect(fake.calls[0].payload).toEqual(10);
});

test("fetchUnenrichedBills: rejects schema-invalid row from backend", async () => {
    const fake = makeBackend();
    const badRow = { id: "11111111-1111-4111-8111-111111111111" };
    fake.nextRowsResult = {
        data: [badRow] as unknown as BillFetchRow[],
        error: null,
    };
    await expect(fetchUnenrichedBills(fake.backend, 10)).rejects.toThrow(
        "fetchUnenrichedBills",
    );
});

test("fetchUnenrichedBills: throws with backend error context", async () => {
    const fake = makeBackend();
    fake.nextRowsResult = {
        data: null,
        error: { message: "connection refused" },
    };
    await expect(fetchUnenrichedBills(fake.backend, 10)).rejects.toThrow(
        "fetchUnenrichedBills",
    );
});

// ---------------------------------------------------------------------------
// fetchCorpusMean
// ---------------------------------------------------------------------------

test("fetchCorpusMean: returns null on cold start (data === null)", async () => {
    const fake = makeBackend();
    fake.nextMeanResult = { data: null, error: null };
    const result = await fetchCorpusMean(fake.backend, "bill");
    expect(result).toEqual(null);
    expect(fake.calls.length).toEqual(1);
    expect(fake.calls[0].method).toEqual("fetchCorpusMean");
    expect(fake.calls[0].payload).toEqual("bill");
});

test("fetchCorpusMean: returns array on happy path", async () => {
    const fake = makeBackend();
    fake.nextMeanResult = { data: mean1536, error: null };
    const result = await fetchCorpusMean(fake.backend, "bill");
    expect(result?.length).toEqual(1536);
});

test("fetchCorpusMean: throws on wrong-length data", async () => {
    const fake = makeBackend();
    fake.nextMeanResult = { data: [0.1, 0.2, 0.3], error: null };
    await expect(fetchCorpusMean(fake.backend, "bill")).rejects.toThrow(
        "fetchCorpusMean",
    );
});

test("fetchCorpusMean: throws with backend error context", async () => {
    const fake = makeBackend();
    fake.nextMeanResult = {
        data: null,
        error: { message: "rpc not found" },
    };
    await expect(fetchCorpusMean(fake.backend, "bill")).rejects.toThrow(
        "fetchCorpusMean",
    );
});

// ---------------------------------------------------------------------------
// writeEnrichment
// ---------------------------------------------------------------------------

test("writeEnrichment: forwards validated payload to backend", async () => {
    const fake = makeBackend();
    await writeEnrichment(fake.backend, validRow.id, validEnrichment);
    expect(fake.calls.length).toEqual(1);
    expect(fake.calls[0].method).toEqual("writeEnrichment");
    const payload = fake.calls[0].payload as {
        id: string;
        payload: BillEnrichmentWrite;
    };
    expect(payload.id).toEqual(validRow.id);
    expect(payload.payload.category).toEqual("energy_and_resources");
    expect(payload.payload.embedding?.length).toEqual(1536);
});

test("writeEnrichment: accepts partial payload (category-only)", async () => {
    const fake = makeBackend();
    await writeEnrichment(fake.backend, validRow.id, {
        category: "climate_and_emissions",
    });
    expect(fake.calls.length).toEqual(1);
});

test("writeEnrichment: rejects unknown columns (typo guard)", async () => {
    const fake = makeBackend();
    await expect(
        writeEnrichment(fake.backend, validRow.id, {
            ...validEnrichment,
            catgory: "energy_and_resources",
        }),
    ).rejects.toThrow("writeEnrichment");
    expect(fake.calls).toEqual([]);
});

test("writeEnrichment: rejects empty id", async () => {
    const fake = makeBackend();
    await expect(
        writeEnrichment(fake.backend, "", validEnrichment),
    ).rejects.toThrow("writeEnrichment");
    expect(fake.calls).toEqual([]);
});

test("writeEnrichment: rejects non-string id", async () => {
    const fake = makeBackend();
    await expect(
        writeEnrichment(fake.backend, 42, validEnrichment),
    ).rejects.toThrow("writeEnrichment");
    expect(fake.calls).toEqual([]);
});

test("writeEnrichment: rejects wrong-length embedding", async () => {
    const fake = makeBackend();
    await expect(
        writeEnrichment(fake.backend, validRow.id, {
            embedding: [0.1, 0.2, 0.3],
        }),
    ).rejects.toThrow("writeEnrichment");
    expect(fake.calls).toEqual([]);
});

test("writeEnrichment: rejects category outside the bill_type enum", async () => {
    const fake = makeBackend();
    await expect(
        writeEnrichment(fake.backend, validRow.id, {
            category: "not_a_real_category",
        } as unknown as BillEnrichmentWrite),
    ).rejects.toThrow("writeEnrichment");
    expect(fake.calls).toEqual([]);
});

test("writeEnrichment: throws with id=... backend error context", async () => {
    const fake = makeBackend();
    fake.nextWriteResult = {
        error: { message: "unique violation" },
    };
    await expect(
        writeEnrichment(fake.backend, validRow.id, validEnrichment),
    ).rejects.toThrow(`writeEnrichment: backend error (id=${validRow.id})`);
});

// ---------------------------------------------------------------------------
// markInsufficientInfo
// ---------------------------------------------------------------------------

test("markInsufficientInfo: forwards id+reason to backend on happy path", async () => {
    const fake = makeBackend();
    await markInsufficientInfo(fake.backend, validRow.id, "no bill text");
    expect(fake.calls.length).toEqual(1);
    expect(fake.calls[0].method).toEqual("markInsufficientInfo");
    expect(fake.calls[0].payload).toEqual({
        id: validRow.id,
        reason: "no bill text",
    });
});

test("markInsufficientInfo: rejects empty id", async () => {
    const fake = makeBackend();
    await expect(
        markInsufficientInfo(fake.backend, "", "no bill text"),
    ).rejects.toThrow("markInsufficientInfo");
    expect(fake.calls).toEqual([]);
});

test("markInsufficientInfo: rejects non-string id", async () => {
    const fake = makeBackend();
    await expect(
        markInsufficientInfo(fake.backend, 42, "no bill text"),
    ).rejects.toThrow("markInsufficientInfo");
    expect(fake.calls).toEqual([]);
});

test("markInsufficientInfo: rejects empty reason", async () => {
    const fake = makeBackend();
    await expect(
        markInsufficientInfo(fake.backend, validRow.id, ""),
    ).rejects.toThrow("markInsufficientInfo");
    expect(fake.calls).toEqual([]);
});

test("markInsufficientInfo: throws with id=... backend error context", async () => {
    const fake = makeBackend();
    fake.nextMarkResult = {
        error: { message: "row not found" },
    };
    await expect(
        markInsufficientInfo(fake.backend, validRow.id, "no bill text"),
    ).rejects.toThrow(`markInsufficientInfo: backend error (id=${validRow.id})`);
});

// ---------------------------------------------------------------------------
// fetchSubcategoryEmbeddings
// ---------------------------------------------------------------------------

const subcategoryEmbedding1536: number[] = Array.from(
    { length: 1536 },
    (_, i) => (i % 11) * 0.001,
);

const validSubcategoryRow: SubcategoryEmbeddingRow = {
    subcategory: "renewable",
    embedding: subcategoryEmbedding1536,
};

test("fetchSubcategoryEmbeddings: returns [] when backend data is empty array", async () => {
    const fake = makeBackend();
    fake.nextSubcategoryResult = { data: [], error: null };
    const result = await fetchSubcategoryEmbeddings(fake.backend, "HR");
    expect(result).toEqual([]);
    expect(fake.calls.length).toEqual(1);
    expect(fake.calls[0].method).toEqual("fetchSubcategoryEmbeddings");
    expect(fake.calls[0].payload).toEqual("HR");
});

test("fetchSubcategoryEmbeddings: returns parsed rows on happy path", async () => {
    const fake = makeBackend();
    fake.nextSubcategoryResult = {
        data: [validSubcategoryRow],
        error: null,
    };
    const result = await fetchSubcategoryEmbeddings(fake.backend, "HR");
    expect(result.length).toEqual(1);
    expect(result[0].subcategory).toEqual("renewable");
    expect(result[0].embedding.length).toEqual(1536);
});

test("fetchSubcategoryEmbeddings: rejects schema-invalid row (wrong-length embedding)", async () => {
    const fake = makeBackend();
    fake.nextSubcategoryResult = {
        data: [
            {
                subcategory: "renewable",
                embedding: [0.1, 0.2, 0.3],
            },
        ] as unknown as SubcategoryEmbeddingRow[],
        error: null,
    };
    await expect(
        fetchSubcategoryEmbeddings(fake.backend, "HR"),
    ).rejects.toThrow("fetchSubcategoryEmbeddings");
});

test("fetchSubcategoryEmbeddings: throws on backend error", async () => {
    const fake = makeBackend();
    fake.nextSubcategoryResult = {
        data: null,
        error: { message: "rpc failed" },
    };
    await expect(
        fetchSubcategoryEmbeddings(fake.backend, "HR"),
    ).rejects.toThrow("fetchSubcategoryEmbeddings: backend error");
});
