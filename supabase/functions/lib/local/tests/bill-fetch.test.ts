import { assertEquals, assertRejects } from "jsr:@std/assert@1";
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

Deno.test("fetchUnenrichedBills: batchSize=0 → no backend call, returns []", async () => {
    const fake = makeBackend();
    const result = await fetchUnenrichedBills(fake.backend, 0);
    assertEquals(result, []);
    assertEquals(fake.calls, []);
});

Deno.test("fetchUnenrichedBills: negative batchSize → no backend call, returns []", async () => {
    const fake = makeBackend();
    const result = await fetchUnenrichedBills(fake.backend, -5);
    assertEquals(result, []);
    assertEquals(fake.calls, []);
});

Deno.test("fetchUnenrichedBills: returns parsed rows on happy path", async () => {
    const fake = makeBackend();
    fake.nextRowsResult = { data: [validRow], error: null };
    const result = await fetchUnenrichedBills(fake.backend, 10);
    assertEquals(result.length, 1);
    assertEquals(result[0], validRow);
    assertEquals(fake.calls.length, 1);
    assertEquals(fake.calls[0].method, "fetchUnenrichedBills");
    assertEquals(fake.calls[0].payload, 10);
});

Deno.test("fetchUnenrichedBills: rejects schema-invalid row from backend", async () => {
    const fake = makeBackend();
    const badRow = { id: "11111111-1111-4111-8111-111111111111" };
    fake.nextRowsResult = {
        data: [badRow] as unknown as BillFetchRow[],
        error: null,
    };
    await assertRejects(
        () => fetchUnenrichedBills(fake.backend, 10),
        Error,
        "fetchUnenrichedBills",
    );
});

Deno.test("fetchUnenrichedBills: throws with backend error context", async () => {
    const fake = makeBackend();
    fake.nextRowsResult = {
        data: null,
        error: { message: "connection refused" },
    };
    await assertRejects(
        () => fetchUnenrichedBills(fake.backend, 10),
        Error,
        "fetchUnenrichedBills",
    );
});

// ---------------------------------------------------------------------------
// fetchCorpusMean
// ---------------------------------------------------------------------------

Deno.test("fetchCorpusMean: returns null on cold start (data === null)", async () => {
    const fake = makeBackend();
    fake.nextMeanResult = { data: null, error: null };
    const result = await fetchCorpusMean(fake.backend, "bill");
    assertEquals(result, null);
    assertEquals(fake.calls.length, 1);
    assertEquals(fake.calls[0].method, "fetchCorpusMean");
    assertEquals(fake.calls[0].payload, "bill");
});

Deno.test("fetchCorpusMean: returns array on happy path", async () => {
    const fake = makeBackend();
    fake.nextMeanResult = { data: mean1536, error: null };
    const result = await fetchCorpusMean(fake.backend, "bill");
    assertEquals(result?.length, 1536);
});

Deno.test("fetchCorpusMean: throws on wrong-length data", async () => {
    const fake = makeBackend();
    fake.nextMeanResult = { data: [0.1, 0.2, 0.3], error: null };
    await assertRejects(
        () => fetchCorpusMean(fake.backend, "bill"),
        Error,
        "fetchCorpusMean",
    );
});

Deno.test("fetchCorpusMean: throws with backend error context", async () => {
    const fake = makeBackend();
    fake.nextMeanResult = {
        data: null,
        error: { message: "rpc not found" },
    };
    await assertRejects(
        () => fetchCorpusMean(fake.backend, "bill"),
        Error,
        "fetchCorpusMean",
    );
});

// ---------------------------------------------------------------------------
// writeEnrichment
// ---------------------------------------------------------------------------

Deno.test("writeEnrichment: forwards validated payload to backend", async () => {
    const fake = makeBackend();
    await writeEnrichment(fake.backend, validRow.id, validEnrichment);
    assertEquals(fake.calls.length, 1);
    assertEquals(fake.calls[0].method, "writeEnrichment");
    const payload = fake.calls[0].payload as {
        id: string;
        payload: BillEnrichmentWrite;
    };
    assertEquals(payload.id, validRow.id);
    assertEquals(payload.payload.category, "energy_and_resources");
    assertEquals(payload.payload.embedding?.length, 1536);
});

Deno.test("writeEnrichment: accepts partial payload (category-only)", async () => {
    const fake = makeBackend();
    await writeEnrichment(fake.backend, validRow.id, {
        category: "climate_and_emissions",
    });
    assertEquals(fake.calls.length, 1);
});

Deno.test("writeEnrichment: rejects unknown columns (typo guard)", async () => {
    const fake = makeBackend();
    await assertRejects(
        () =>
            writeEnrichment(fake.backend, validRow.id, {
                ...validEnrichment,
                catgory: "energy_and_resources",
            }),
        Error,
        "writeEnrichment",
    );
    assertEquals(fake.calls, []);
});

Deno.test("writeEnrichment: rejects empty id", async () => {
    const fake = makeBackend();
    await assertRejects(
        () => writeEnrichment(fake.backend, "", validEnrichment),
        Error,
        "writeEnrichment",
    );
    assertEquals(fake.calls, []);
});

Deno.test("writeEnrichment: rejects non-string id", async () => {
    const fake = makeBackend();
    await assertRejects(
        () => writeEnrichment(fake.backend, 42, validEnrichment),
        Error,
        "writeEnrichment",
    );
    assertEquals(fake.calls, []);
});

Deno.test("writeEnrichment: rejects wrong-length embedding", async () => {
    const fake = makeBackend();
    await assertRejects(
        () =>
            writeEnrichment(fake.backend, validRow.id, {
                embedding: [0.1, 0.2, 0.3],
            }),
        Error,
        "writeEnrichment",
    );
    assertEquals(fake.calls, []);
});

Deno.test("writeEnrichment: rejects category outside the bill_type enum", async () => {
    const fake = makeBackend();
    await assertRejects(
        () =>
            writeEnrichment(fake.backend, validRow.id, {
                category: "not_a_real_category",
            } as unknown as BillEnrichmentWrite),
        Error,
        "writeEnrichment",
    );
    assertEquals(fake.calls, []);
});

Deno.test("writeEnrichment: throws with id=... backend error context", async () => {
    const fake = makeBackend();
    fake.nextWriteResult = {
        error: { message: "unique violation" },
    };
    await assertRejects(
        () => writeEnrichment(fake.backend, validRow.id, validEnrichment),
        Error,
        `writeEnrichment: backend error (id=${validRow.id})`,
    );
});

// ---------------------------------------------------------------------------
// markInsufficientInfo
// ---------------------------------------------------------------------------

Deno.test("markInsufficientInfo: forwards id+reason to backend on happy path", async () => {
    const fake = makeBackend();
    await markInsufficientInfo(fake.backend, validRow.id, "no bill text");
    assertEquals(fake.calls.length, 1);
    assertEquals(fake.calls[0].method, "markInsufficientInfo");
    assertEquals(fake.calls[0].payload, {
        id: validRow.id,
        reason: "no bill text",
    });
});

Deno.test("markInsufficientInfo: rejects empty id", async () => {
    const fake = makeBackend();
    await assertRejects(
        () => markInsufficientInfo(fake.backend, "", "no bill text"),
        Error,
        "markInsufficientInfo",
    );
    assertEquals(fake.calls, []);
});

Deno.test("markInsufficientInfo: rejects non-string id", async () => {
    const fake = makeBackend();
    await assertRejects(
        () => markInsufficientInfo(fake.backend, 42, "no bill text"),
        Error,
        "markInsufficientInfo",
    );
    assertEquals(fake.calls, []);
});

Deno.test("markInsufficientInfo: rejects empty reason", async () => {
    const fake = makeBackend();
    await assertRejects(
        () => markInsufficientInfo(fake.backend, validRow.id, ""),
        Error,
        "markInsufficientInfo",
    );
    assertEquals(fake.calls, []);
});

Deno.test("markInsufficientInfo: throws with id=... backend error context", async () => {
    const fake = makeBackend();
    fake.nextMarkResult = {
        error: { message: "row not found" },
    };
    await assertRejects(
        () =>
            markInsufficientInfo(fake.backend, validRow.id, "no bill text"),
        Error,
        `markInsufficientInfo: backend error (id=${validRow.id})`,
    );
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

Deno.test("fetchSubcategoryEmbeddings: returns [] when backend data is empty array", async () => {
    const fake = makeBackend();
    fake.nextSubcategoryResult = { data: [], error: null };
    const result = await fetchSubcategoryEmbeddings(fake.backend, "HR");
    assertEquals(result, []);
    assertEquals(fake.calls.length, 1);
    assertEquals(fake.calls[0].method, "fetchSubcategoryEmbeddings");
    assertEquals(fake.calls[0].payload, "HR");
});

Deno.test("fetchSubcategoryEmbeddings: returns parsed rows on happy path", async () => {
    const fake = makeBackend();
    fake.nextSubcategoryResult = {
        data: [validSubcategoryRow],
        error: null,
    };
    const result = await fetchSubcategoryEmbeddings(fake.backend, "HR");
    assertEquals(result.length, 1);
    assertEquals(result[0].subcategory, "renewable");
    assertEquals(result[0].embedding.length, 1536);
});

Deno.test("fetchSubcategoryEmbeddings: rejects schema-invalid row (wrong-length embedding)", async () => {
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
    await assertRejects(
        () => fetchSubcategoryEmbeddings(fake.backend, "HR"),
        Error,
        "fetchSubcategoryEmbeddings",
    );
});

Deno.test("fetchSubcategoryEmbeddings: throws on backend error", async () => {
    const fake = makeBackend();
    fake.nextSubcategoryResult = {
        data: null,
        error: { message: "rpc failed" },
    };
    await assertRejects(
        () => fetchSubcategoryEmbeddings(fake.backend, "HR"),
        Error,
        "fetchSubcategoryEmbeddings: backend error",
    );
});
