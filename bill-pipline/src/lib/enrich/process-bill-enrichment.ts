import { callOrTrip, type CoordinatedRequestGroup } from "@cruzhacks/shared";
import {
    type BillFetchBackend,
    type BillFetchRow,
    fetchSubcategoryEmbeddings,
    markInsufficientInfo,
    writeEnrichment,
} from "./bill-fetch.ts";
import {
    buildClassifyPrompt,
    buildEmbedText,
    type ClassifyResult,
    computeSubcategoryScores,
} from "./bill-enrich.ts";

const EMBEDDING_DIM = 1536;

/**
 * Sentinel thrown when the LLM or embed provider trips the shared throttle
 * group. Worker recognizes this class and leaves the bill un-enriched so
 * the next cron tick retries (idempotent — markInsufficientInfo /
 * writeEnrichment are guaranteed not to have run yet).
 */
export class LLMThrottleRetry extends Error {
    constructor(public readonly billRef: string) {
        super(`LLM/embed throttled; bill ${billRef} left for retry`);
        this.name = "LLMThrottleRetry";
    }
}

export type ClassifyFn = (prompt: string) => Promise<ClassifyResult>;
export type EmbedFn = (text: string) => Promise<number[]>;

export interface ProcessBillEnrichmentDeps {
    classify: ClassifyFn;
    embed: EmbedFn;
    fetchBackend: BillFetchBackend;
    /** Pre-fetched once per batch by the worker. null on cold start. */
    corpusMean: number[] | null;
    group?: CoordinatedRequestGroup<LLMThrottleRetry>;
}

// ---------------------------------------------------------------------------
// Orchestrator
// ---------------------------------------------------------------------------

/**
 * Per-bill enrichment unit: classify → embed → mean-reduce → score → write.
 *
 * On `insufficient_info` from the classifier, marks the row and returns
 * without embedding. On a trip-worthy LLM/embed error, trips the shared
 * group and throws `LLMThrottleRetry` so siblings back off and the worker
 * leaves the bill for the next cycle.
 */
export async function processBillEnrichment(
    row: BillFetchRow,
    deps: ProcessBillEnrichmentDeps,
): Promise<void> {
    const billRef = `${row.bill_type}-${row.bill_number} (congress ${row.congress})`;

    if (deps.group?.tripped) throw new LLMThrottleRetry(billRef);

    const prompt = buildClassifyPrompt(row);
    const result = await callOrTrip(
        () => deps.classify(prompt),
        deps.group,
        billRef,
    );

    if (result.kind === "insufficient_info") {
        await markInsufficientInfo(deps.fetchBackend, row.id, result.reason);
        return;
    }

    const embedTextValue = buildEmbedText(row);
    const embedding = await callOrTrip(
        () => deps.embed(embedTextValue),
        deps.group,
        billRef,
    );

    if (embedding.length !== EMBEDDING_DIM) {
        throw new Error(
            `processBillEnrichment: embedding dimension mismatch (got ${embedding.length}, expected ${EMBEDDING_DIM})`,
        );
    }

    let reducedEmbedding: number[];
    if (deps.corpusMean !== null) {
        const mean = deps.corpusMean;
        reducedEmbedding = embedding.map((v, i) => v - mean[i]);
    } else {
        console.warn(
            `[processBillEnrichment] ${billRef}: skipping mean reduction (cold start)`,
        );
        reducedEmbedding = embedding;
    }

    const subcategoryRows = await fetchSubcategoryEmbeddings(
        deps.fetchBackend,
        result.category,
    );
    const scores = computeSubcategoryScores(reducedEmbedding, subcategoryRows);

    await writeEnrichment(deps.fetchBackend, row.id, {
        category: result.category,
        embedding: reducedEmbedding,
        subcategory_scores: scores,
    });
}
