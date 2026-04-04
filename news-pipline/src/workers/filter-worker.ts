import pino from "pino";
import {
    acquireBatchWithRetries,
    releaseArtifactLocks,
    settleBatch,
} from "../lib/database";
import { filterDocuments } from "../lib/llm";
import { BATCH_SIZE, FILTER_MAX_TRIES, FILTER_WORKER_ID, FILTER_MODEL } from "../config";
import type { ArtifactFormatSpec, ArtifactType, StagingArtifact } from "../types";

const logger = pino({ name: "filter-worker" });

interface FilterDocumentsResponse {
    filterValue: boolean[];
}

function parseFilterResponse(raw: string, expectedLength: number): FilterDocumentsResponse | null {
    try {
        const parsed = JSON.parse(raw);
        if (
            !parsed.filterValue ||
            !Array.isArray(parsed.filterValue) ||
            parsed.filterValue.length !== expectedLength ||
            !parsed.filterValue.every((v: unknown) => typeof v === "boolean")
        ) {
            return null;
        }
        return parsed as FilterDocumentsResponse;
    } catch {
        return null;
    }
}

async function processBatch<K extends ArtifactType>(
    batch: StagingArtifact<K>[],
    spec: ArtifactFormatSpec<K>,
    workerId: string
): Promise<{ kept: number; rejected: number; retried: number; failed: number; abort: boolean }> {
    let filterResult: FilterDocumentsResponse | null = null;
    let apiSourcedError = false;

    for (let attempt = 1; attempt <= FILTER_MAX_TRIES; attempt++) {
        try {
            const text = await filterDocuments(FILTER_MODEL, batch, spec);
            filterResult = parseFilterResponse(text, batch.length);

            if (!filterResult) {
                logger.warn({ attempt, rawResponse: text.slice(0, 500) }, "LLM response failed validation");
                continue;
            }

            break;
        } catch (error: any) {
            apiSourcedError = true;
            if (error.statusCode === 429) {
                logger.warn({ attempt }, "rate limited, exponential backoff");
                await new Promise(r => setTimeout(r, Math.pow(2, attempt) * 1000));
            } else if (error.statusCode === 401 || error.statusCode === 402) {
                logger.error({ statusCode: error.statusCode }, "auth/billing error, aborting");
                break;
            } else {
                logger.warn({ attempt, statusCode: error.statusCode, message: error.message }, "LLM call failed");
            }
        }
    }

    if (!filterResult) {
        if (apiSourcedError) {
            logger.error({ batchSize: batch.length }, "API error — releasing locks without incrementing retries");
            await releaseArtifactLocks(batch, workerId, "raw");
            return { kept: 0, rejected: 0, retried: 0, failed: 0, abort: true };
        }
        // Entire batch failed validation — treat all as failed, settleBatch handles retry logic
        const counts = await settleBatch(workerId, "raw", [], [], batch);
        return { kept: 0, rejected: 0, retried: counts.retried, failed: counts.failed, abort: false };
    }

    const kept: StagingArtifact<K>[] = [];
    const rejected: StagingArtifact<K>[] = [];

    for (let i = 0; i < batch.length; i++) {
        if (filterResult.filterValue[i]) {
            kept.push(batch[i]!);
        } else {
            rejected.push(batch[i]!);
        }
    }

    const counts = await settleBatch(workerId, "filtered", kept, rejected, []);
    return { kept: counts.advanced, rejected: counts.rejected, retried: 0, failed: 0, abort: false };
}

export async function filterWorker<K extends ArtifactType>(artifactSpec: ArtifactFormatSpec<K>) {
    const workerId = FILTER_WORKER_ID + "-" + artifactSpec.artifactType + "-" + Math.random().toString(36).substring(2, 15);
    let totalKept = 0;
    let totalRejected = 0;
    let totalRetried = 0;
    let totalFailed = 0;

    while (true) {
        const batch = await acquireBatchWithRetries(
            "acquire-filter-batch", "raw", artifactSpec.artifactType,
            BATCH_SIZE, workerId, 5,
            (type, error, attempt) => {
                if (type === "retry_exhausted") logger.error(error, "failed to acquire batch lock");
                else logger.warn({ attempt }, "failed to acquire batch lock, retrying");
            },
        );

        if (!batch) {
            logger.info("no more raw artifacts to filter (or acquire failed)");
            break;
        }

        logger.info({ batchSize: batch.length }, "processing filter batch");
        const result = await processBatch(batch, artifactSpec, workerId);
        totalKept += result.kept;
        totalRejected += result.rejected;
        totalRetried += result.retried;
        totalFailed += result.failed;

        if (result.abort) {
            logger.error({ totalKept, totalRejected, totalRetried, totalFailed }, `filter worker aborted for ${artifactSpec.artifactType}`);
            throw new Error("Filter worker aborted: fatal LLM API error (check OPENROUTER_API_KEY / billing)");
        }
    }

    logger.info({ totalKept, totalRejected, totalRetried, totalFailed }, `filter worker complete for ${artifactSpec.artifactType}`);
}
