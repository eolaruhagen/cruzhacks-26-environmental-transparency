import { test, expect } from "bun:test";
import type { CoordinatedRequestGroup } from "@cruzhacks/shared";
import {
    type BillEnrichmentWrite,
    type BillFetchBackend,
    type BillFetchRow,
    type SubcategoryEmbeddingRow,
} from "./bill-fetch.ts";
import type { ClassifyResult } from "./bill-enrich.ts";
import {
    type ClassifyFn,
    type EmbedFn,
    LLMThrottleRetry,
    processBillEnrichment,
    type ProcessBillEnrichmentDeps,
} from "./process-bill-enrichment.ts";

// ---------------------------------------------------------------------------
// Fixtures + closure-recording fakes
// ---------------------------------------------------------------------------

const v1536 = (fill: number) => Array.from({ length: 1536 }, () => fill);

const sampleRow: BillFetchRow = {
    id: "11111111-1111-4111-8111-111111111111",
    congress: 119,
    bill_type: "HR",
    bill_number: 1,
    title: "Clean Water Act",
    latest_summary: "A bill about water quality.",
    subject_terms: ["Water"],
    bill_policy_area: "Environmental Protection",
    bill_text: null,
};

function makeClassify(
    handler: (prompt: string) => Promise<ClassifyResult>,
): { fn: ClassifyFn; calls: string[] } {
    const calls: string[] = [];
    return {
        calls,
        fn: (prompt) => {
            calls.push(prompt);
            return handler(prompt);
        },
    };
}

function makeEmbed(
    handler: (text: string) => Promise<number[]>,
): { fn: EmbedFn; calls: string[] } {
    const calls: string[] = [];
    return {
        calls,
        fn: (text) => {
            calls.push(text);
            return handler(text);
        },
    };
}

function makeFetchBackend(): {
    backend: BillFetchBackend;
    writes: { id: string; payload: BillEnrichmentWrite }[];
    marks: { id: string; reason: string }[];
    subcategoryCalls: string[];
    nextSubcategoryResult: {
        data: SubcategoryEmbeddingRow[] | null;
        error: { message: string } | null;
    };
} {
    const writes: { id: string; payload: BillEnrichmentWrite }[] = [];
    const marks: { id: string; reason: string }[] = [];
    const subcategoryCalls: string[] = [];
    const state = {
        nextSubcategoryResult: { data: [], error: null } as {
            data: SubcategoryEmbeddingRow[] | null;
            error: { message: string } | null;
        },
    };
    const backend: BillFetchBackend = {
        fetchUnenrichedBills: () => Promise.resolve({ data: [], error: null }),
        fetchCorpusMean: () => Promise.resolve({ data: null, error: null }),
        writeEnrichment: (id, payload) => {
            writes.push({ id, payload });
            return Promise.resolve({ error: null });
        },
        markInsufficientInfo: (id, reason) => {
            marks.push({ id, reason });
            return Promise.resolve({ error: null });
        },
        fetchSubcategoryEmbeddings: (billType) => {
            subcategoryCalls.push(billType);
            return Promise.resolve(state.nextSubcategoryResult);
        },
    };
    return {
        backend,
        writes,
        marks,
        subcategoryCalls,
        get nextSubcategoryResult() {
            return state.nextSubcategoryResult;
        },
        set nextSubcategoryResult(v) {
            state.nextSubcategoryResult = v;
        },
    };
}

function makeAlwaysTripGroup(): {
    group: CoordinatedRequestGroup<LLMThrottleRetry>;
    tripCount: number;
    increment: () => void;
} {
    const controller = new AbortController();
    let tripped = false;
    let tripCount = 0;
    const self = {
        tripCount,
        increment: () => {
            self.tripCount += 1;
        },
        group: {
            signal: controller.signal,
            get tripped() {
                return tripped;
            },
            trip() {
                if (tripped) return;
                tripped = true;
                self.increment();
                controller.abort();
            },
            shouldTripOn: () => true,
            retryError: (ctx: string) => new LLMThrottleRetry(ctx),
        } as CoordinatedRequestGroup<LLMThrottleRetry>,
    };
    return self;
}

function withCapturedWarn<T>(fn: () => Promise<T>): Promise<{ value: T; warnings: unknown[][] }> {
    const original = console.warn;
    const warnings: unknown[][] = [];
    console.warn = (...args: unknown[]) => {
        warnings.push(args);
    };
    return fn()
        .then((value) => ({ value, warnings }))
        .finally(() => {
            console.warn = original;
        });
}

// ---------------------------------------------------------------------------
// processBillEnrichment
// ---------------------------------------------------------------------------

test("processBillEnrichment: classified happy path writes enrichment with scores", async () => {
    const classify = makeClassify(() =>
        Promise.resolve({
            kind: "classified",
            category: "water_resources",
            reasoning: "about water",
        })
    );
    const embed = makeEmbed(() => Promise.resolve(v1536(0.5)));
    const fake = makeFetchBackend();
    fake.nextSubcategoryResult = {
        data: [{ subcategory: "drinking_water", embedding: v1536(0.5) }],
        error: null,
    };

    const deps: ProcessBillEnrichmentDeps = {
        classify: classify.fn,
        embed: embed.fn,
        fetchBackend: fake.backend,
        corpusMean: v1536(0.1),
    };

    await processBillEnrichment(sampleRow, deps);

    expect(fake.writes.length).toEqual(1);
    const write = fake.writes[0];
    expect(write.id).toEqual(sampleRow.id);
    expect(write.payload.category).toEqual("water_resources");
    expect(write.payload.embedding?.length).toEqual(1536);
    expect(write.payload.embedding?.[0]).toEqual(0.4);
    const scores = write.payload.subcategory_scores as Record<string, number>;
    expect(Object.keys(scores)).toEqual(["drinking_water"]);
    expect(Math.abs(scores.drinking_water - 1) < 1e-9).toEqual(true);
    expect(fake.marks.length).toEqual(0);
    expect(fake.subcategoryCalls).toEqual(["water_resources"]);
});

test("processBillEnrichment: insufficient_info marks row and skips embed", async () => {
    const classify = makeClassify(() =>
        Promise.resolve({ kind: "insufficient_info", reason: "missing summary" })
    );
    const embed = makeEmbed(() => Promise.resolve(v1536(0.5)));
    const fake = makeFetchBackend();

    await processBillEnrichment(sampleRow, {
        classify: classify.fn,
        embed: embed.fn,
        fetchBackend: fake.backend,
        corpusMean: v1536(0.1),
    });

    expect(embed.calls.length).toEqual(0);
    expect(fake.subcategoryCalls.length).toEqual(0);
    expect(fake.writes.length).toEqual(0);
    expect(fake.marks.length).toEqual(1);
    expect(fake.marks[0]).toEqual({
        id: sampleRow.id,
        reason: "missing summary",
    });
});

test("processBillEnrichment: cold-start (null corpusMean) skips reduction and warns", async () => {
    const classify = makeClassify(() =>
        Promise.resolve({
            kind: "classified",
            category: "water_resources",
            reasoning: "about water",
        })
    );
    const embed = makeEmbed(() => Promise.resolve(v1536(0.7)));
    const fake = makeFetchBackend();

    const { warnings } = await withCapturedWarn(() =>
        processBillEnrichment(sampleRow, {
            classify: classify.fn,
            embed: embed.fn,
            fetchBackend: fake.backend,
            corpusMean: null,
        })
    );

    expect(fake.writes.length).toEqual(1);
    expect(fake.writes[0].payload.embedding?.[0]).toEqual(0.7);
    expect(warnings.length).toEqual(1);
    const joined = warnings[0].map((a) => String(a)).join(" ");
    expect(joined).toContain("cold start");
    expect(joined).toContain("HR-1 (congress 119)");
});

test("processBillEnrichment: classify rejection propagates and skips downstream work", async () => {
    // After the refactor, schema validation lives in the adapter. The
    // orchestrator's job is just to surface whatever classify throws.
    const classify = makeClassify(() =>
        Promise.reject(new Error("classify: invalid LLM response: missing category"))
    );
    const embed = makeEmbed(() => Promise.resolve(v1536(0)));
    const fake = makeFetchBackend();

    await expect(
        processBillEnrichment(sampleRow, {
            classify: classify.fn,
            embed: embed.fn,
            fetchBackend: fake.backend,
            corpusMean: v1536(0),
        }),
    ).rejects.toThrow("classify: invalid LLM response");

    expect(embed.calls.length).toEqual(0);
    expect(fake.writes.length).toEqual(0);
    expect(fake.marks.length).toEqual(0);
});

test("processBillEnrichment: LLM 429 trips group + throws LLMThrottleRetry", async () => {
    const classify = makeClassify(() => Promise.reject(new Error("HTTP 429")));
    const embed = makeEmbed(() => Promise.resolve(v1536(0)));
    const fake = makeFetchBackend();
    const helper = makeAlwaysTripGroup();

    await expect(
        processBillEnrichment(sampleRow, {
            classify: classify.fn,
            embed: embed.fn,
            fetchBackend: fake.backend,
            corpusMean: v1536(0),
            group: helper.group,
        }),
    ).rejects.toBeInstanceOf(LLMThrottleRetry);

    expect(helper.tripCount).toEqual(1);
    expect(helper.group.tripped).toEqual(true);
    expect(fake.writes.length).toEqual(0);
    expect(fake.marks.length).toEqual(0);
});

test(
    "processBillEnrichment: bails immediately with LLMThrottleRetry when group is already tripped",
    async () => {
        const controller = new AbortController();
        controller.abort();
        let tripCount = 0;
        const group: CoordinatedRequestGroup<LLMThrottleRetry> = {
            signal: controller.signal,
            get tripped() {
                return true;
            },
            trip() {
                tripCount += 1;
            },
            shouldTripOn: () => true,
            retryError: (ctx) => new LLMThrottleRetry(ctx),
        };

        const classify = makeClassify(() =>
            Promise.resolve({
                kind: "classified",
                category: "water_resources",
                reasoning: "about water",
            })
        );
        const embed = makeEmbed(() => Promise.resolve(v1536(0)));
        const fake = makeFetchBackend();

        await expect(
            processBillEnrichment(sampleRow, {
                classify: classify.fn,
                embed: embed.fn,
                fetchBackend: fake.backend,
                corpusMean: v1536(0),
                group,
            }),
        ).rejects.toBeInstanceOf(LLMThrottleRetry);

        expect(classify.calls.length).toEqual(0);
        expect(embed.calls.length).toEqual(0);
        expect(fake.writes.length).toEqual(0);
        expect(fake.marks.length).toEqual(0);
        expect(tripCount).toEqual(0);
    },
);

test("processBillEnrichment: embedding dimension mismatch throws", async () => {
    const classify = makeClassify(() =>
        Promise.resolve({
            kind: "classified",
            category: "water_resources",
            reasoning: "about water",
        })
    );
    const embed = makeEmbed(() => Promise.resolve(Array.from({ length: 100 }, () => 0)));
    const fake = makeFetchBackend();

    await expect(
        processBillEnrichment(sampleRow, {
            classify: classify.fn,
            embed: embed.fn,
            fetchBackend: fake.backend,
            corpusMean: v1536(0),
        }),
    ).rejects.toThrow("dimension mismatch (got 100, expected 1536)");

    expect(fake.writes.length).toEqual(0);
});

test(
    "processBillEnrichment: empty subcategory list writes empty scores object",
    async () => {
        const classify = makeClassify(() =>
            Promise.resolve({
                kind: "classified",
                category: "water_resources",
                reasoning: "about water",
            })
        );
        const embed = makeEmbed(() => Promise.resolve(v1536(0.5)));
        const fake = makeFetchBackend();
        fake.nextSubcategoryResult = { data: [], error: null };

        await processBillEnrichment(sampleRow, {
            classify: classify.fn,
            embed: embed.fn,
            fetchBackend: fake.backend,
            corpusMean: v1536(0.1),
        });

        expect(fake.writes.length).toEqual(1);
        expect(fake.writes[0].payload.subcategory_scores).toEqual({});
    },
);
