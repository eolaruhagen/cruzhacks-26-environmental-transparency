import pino from "pino";
import {
    acquireArtifactLock,
    releaseArtifactLocks,
    releaseArtifactLocksWithRetry,
    moveToFailedArtifacts,
    moveToRejectedArtifacts,
} from "../lib/database";
import { filterDocuments } from "../lib/llm";
import { BATCH_SIZE, FILTER_MAX_TRIES, FILTER_WORKER_ID, MAX_ARTIFACT_RETRY, FILTER_MODEL } from "../config";
import type { ArtifactFormatSpec, ArtifactType, StagingArtifact } from "../types";

const logger = pino({ name: "filter-worker" });

interface FilterDocumentsResponse {
    filterValue: boolean[];
}


/**
 * Parses filtering response from LLM
 * - **Asserts that the response array has the same length as the batch size**
 * @param raw - the raw text response from LLM
 * @param expectedLength - the batch size of the artifacts being filtered (the expected size of the filterValue array)
 * @returns FilterDocumentsResponse if successful, null otherwise
 */
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

async function handleBatchFailure<K extends ArtifactType>(
    batch: StagingArtifact<K>[],
    workerId: string
): Promise<{ retried: number; failed: number }> {
    const retryable: string[] = [];
    const terminal: StagingArtifact<K>[] = [];

    for (const artifact of batch) {
        if (artifact.retry_attempts + 1 >= MAX_ARTIFACT_RETRY) {
            terminal.push(artifact);
        } else {
            retryable.push(artifact.id);
        }
    }

    if (terminal.length > 0) {
        logger.error({ count: terminal.length }, "artifacts exceeded max retries, moving to failed");
        await moveToFailedArtifacts(terminal, workerId);
    }

    if (retryable.length > 0) {
        await releaseArtifactLocksWithRetry(retryable, workerId);
    }

    return { retried: retryable.length, failed: terminal.length };
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
        logger.error({ batchSize: batch.length }, "batch failed all filter attempts");
        const { retried, failed } = await handleBatchFailure(batch, workerId);
        return { kept: 0, rejected: 0, retried, failed, abort: false };
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

    if (kept.length > 0) {
        await releaseArtifactLocks(kept, workerId, "filtered");
    }

    if (rejected.length > 0) {
        await moveToRejectedArtifacts(rejected, workerId);
    }

    return { kept: kept.length, rejected: rejected.length, retried: 0, failed: 0, abort: false };
}

export async function filterWorker<K extends ArtifactType>(artifactSpec: ArtifactFormatSpec<K>) {
    const workerId = FILTER_WORKER_ID + "-" + artifactSpec.artifactType + "-" + Math.random().toString(36).substring(2, 15);
    let totalKept = 0;
    let totalRejected = 0;
    let totalRetried = 0;
    let totalFailed = 0;
    const maxAcquireAttempts = 5;
    let acquireAttempts = 0;

    while (true) {
        let batch: StagingArtifact<K>[];
        try {
            batch = await acquireArtifactLock("raw", artifactSpec.artifactType, BATCH_SIZE, workerId);
        } catch (error) {
            if (acquireAttempts >= maxAcquireAttempts) {
                logger.error(error, "failed to acquire batch lock");
                break;
            }
            acquireAttempts++;
            logger.warn({ attempt: acquireAttempts }, "failed to acquire batch lock, retrying");
            await new Promise(r => setTimeout(r, Math.pow(2, acquireAttempts) * 1000));
            continue;
        }
        acquireAttempts = 0;

        if (batch.length === 0) {
            logger.info("no more raw artifacts to filter");
            break;
        }

        logger.info({ batchSize: batch.length }, "processing filter batch");
        const result = await processBatch(batch, artifactSpec, workerId);
        totalKept += result.kept;
        totalRejected += result.rejected;
        totalRetried += result.retried;
        totalFailed += result.failed;

        if (result.abort) {
            logger.error("aborting filter worker due to API error");
            break;
        }
    }

    logger.info({ totalKept, totalRejected, totalRetried, totalFailed }, `filter worker complete for ${artifactSpec.artifactType}`);
}
