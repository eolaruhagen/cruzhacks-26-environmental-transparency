import postgres, { type Error } from "postgres";
import pino from "pino";

const logger = pino({ name: "postgres" });

export type ArtifactStatus = "raw" | "filtered" | "enriched";

export type ArtifactType = "article" | "social_post";

export type JsonSerializable =
    | string
    | number
    | boolean
    | null
    | JsonSerializable[]
    | { [key: string]: JsonSerializable };


export type ArtifactEnrichment = {
    state: string;
    associated_bill_ids: string[];
    associated_representatives: string[];
    subcategories: string[];
    sentiment: number; // -1 to 1
}
/**
 * A row from pipelines.artifact_staging.
 * The metadata JSONB column holds source-specific data (API response fields,
 * social post metrics, etc.) — its shape varies by artifact type.
 */
export interface StagingArtifact<TMeta extends Record<string, JsonSerializable> = Record<string, JsonSerializable>> {
    id: string;
    url: string;
    type: ArtifactType;
    status: ArtifactStatus;
    source_icon_url: string | null;
    metadata: TMeta;
    retry_attempts: number;
    locked_by: string | null;
    locked_at: Date | null;
    embedding: number[] | null
    enrichment: ArtifactEnrichment | null;
    created_at: Date;
    updated_at: Date;
}

type QueryResult<T> =
    | { ok: true, data: T; durationMs: number }
    | { ok: false, error: Error; durationMs: number }

const dbConn = postgres(process.env.DATABASE_URL!, {
    debug: (query, params) => {
        logger.debug({ query, params }, "query executed");
    }
});


function logQuery(queryDuration: number, query: string, error?: Error) {
    switch (error) {
        case undefined:
            switch (true) {
                case queryDuration < 100:
                    logger.info({ queryDuration, query }, "Query completed successfully");
                    break;
                case queryDuration < 1000:
                    logger.warn({ queryDuration, query }, "Query completed successfully");
                    break;
                default:
                    logger.error({ queryDuration, query }, "Query completed successfully");
                    break;
            }
            break;
        default:
            logger.error({ queryDuration, query, error }, "Query failed");
            break;
    }
}

/**
 * Executes an asynchronous query function while measuring how long it takes to complete. 
 * It returns a structured result indicating success or failure along with timing information.
 * 
 * @param queryLabel - A descriptive label used to identify the query in logs.
 * @param queryFn - An asynchronous function that performs the query and returns a result.
 * 
 * @returns A promise that resolves to an object indicating whether the query succeeded, the result or error, and the duration in milliseconds.
 */
export async function timedQuery<T>(queryLabel: string, queryFn: () => Promise<T>): Promise<QueryResult<T>> {
    const start = performance.now();
    try {
        const result = await queryFn();
        const end = performance.now();
        logQuery(end - start, queryLabel, undefined);
        return { ok: true, data: result, durationMs: end - start };
    } catch (error) {
        const end = performance.now();
        logQuery(end - start, queryLabel, error as Error);
        return { ok: false, error: error as Error, durationMs: end - start };
    }
}

/**
 * Pull unlocked artifacts at a given pipeline stage.
 * Does NOT acquire a lock — use acquireArtifactLock for that.
 */
export async function pullArtifactsByStatus<TMeta extends Record<string, JsonSerializable> = Record<string, JsonSerializable>>(
    status: ArtifactStatus,
    limit: number = 50
): Promise<StagingArtifact<TMeta>[]> {
    return await dbConn<StagingArtifact<TMeta>[]>`
        SELECT * FROM pipelines.artifact_staging
        WHERE status = ${status} AND locked_by IS NULL
        LIMIT ${limit}
    `;
}

/**
 * Atomically claim a batch of artifacts for processing.
 * Locks rows by setting locked_by/locked_at so no other worker can grab them.
 * Returns the locked rows so the caller can process them immediately.
 *
 * Filters by both status AND artifact type — the type parameter serves double
 * duty: it constrains the SQL query (so you only pull articles, not social posts)
 * and narrows the TypeScript generic (so metadata is typed correctly).
 *
 * @param status - Only grab artifacts at this pipeline stage
 * @param artifactType - Only grab artifacts of this type (article, social_post)
 * @param batchSize - Max number of artifacts to lock in one call
 * @param workerId - Unique identifier for this worker (used to release locks on completion)
 * @returns The locked artifacts, typed with optional metadata generic
 */
export async function acquireArtifactLock<TMeta extends Record<string, JsonSerializable> = Record<string, JsonSerializable>>(
    status: ArtifactStatus,
    artifactType: ArtifactType,
    batchSize: number,
    workerId: string
): Promise<StagingArtifact<TMeta>[]> {
    return await dbConn<StagingArtifact<TMeta>[]>`
        UPDATE pipelines.artifact_staging
        SET locked_by = ${workerId}, locked_at = now()
        WHERE id IN (
            SELECT id FROM pipelines.artifact_staging
            WHERE status = ${status} AND type = ${artifactType} AND locked_by IS NULL
            LIMIT ${batchSize}
            FOR UPDATE SKIP LOCKED
        )
        RETURNING *
    `;
}

/**
 * Release locks on processed artifacts, write back any changes, and advance status.
 * Each artifact in the batch gets its own UPDATE so metadata/enrichment/embedding
 * changes are persisted per-row. Returns the IDs that were successfully updated.
 *
 * @param artifacts - The modified artifacts to write back (must have been acquired by this worker)
 * @param workerId - Must match locked_by or the update is a no-op
 * @param nextStatus - The pipeline stage to advance these artifacts to
 * @returns IDs of artifacts that were successfully advanced
 */
export async function releaseArtifactLocks<TMeta extends Record<string, JsonSerializable> = Record<string, JsonSerializable>>(
    artifacts: StagingArtifact<TMeta>[],
    workerId: string,
    nextStatus: ArtifactStatus
): Promise<string[]> {
    if (artifacts.length === 0) return [];

    const advancedIds: string[] = [];

    for (const artifact of artifacts) {
        const rows = await dbConn<{ id: string }[]>`
            UPDATE pipelines.artifact_staging
            SET locked_by = NULL,
                locked_at = NULL,
                status = ${nextStatus},
                metadata = ${JSON.stringify(artifact.metadata)},
                enrichment = ${artifact.enrichment ? JSON.stringify(artifact.enrichment) : null},
                embedding = ${artifact.embedding},
                updated_at = now()
            WHERE id = ${artifact.id} AND locked_by = ${workerId}
            RETURNING id
        `;
        if (rows.length > 0) advancedIds.push(rows[0]!.id);
    }

    return advancedIds;
}

/**
 * Release locks without advancing status and bump retry_attempts.
 * Used when processing fails — artifacts stay at their current stage
 * for retry on the next run, with retry_attempts incremented.
 *
 * @param artifactIds - IDs of the artifacts to release
 * @param workerId - Must match the locked_by value or the update is a no-op
 */
export async function releaseArtifactLocksWithRetry(
    artifactIds: string[],
    workerId: string
): Promise<void> {
    if (artifactIds.length === 0) return;

    await dbConn`
        UPDATE pipelines.artifact_staging
        SET locked_by = NULL, locked_at = NULL, retry_attempts = retry_attempts + 1, updated_at = now()
        WHERE id = ANY(${artifactIds}) AND locked_by = ${workerId}
    `;
}

export async function insertRawArtifacts<TMeta extends Record<string, JsonSerializable> = Record<string, JsonSerializable>>(
    artifacts: StagingArtifact<TMeta>[]
): Promise<{ inserted: number; dupes: number }> {
    const rows = artifacts.map(a => ({
        url: a.url,
        type: a.type,
        status: a.status,
        source_icon_url: a.source_icon_url,
        metadata: a.metadata,
        retry_attempts: a.retry_attempts,
        locked_by: a.locked_by,
        locked_at: a.locked_at,
        embedding: a.embedding,
        enrichment: a.enrichment,
        created_at: a.created_at,
        updated_at: a.updated_at,
    }));

    const columns = [
        'url', 'type', 'status', 'source_icon_url', 'metadata',
        'retry_attempts', 'locked_by', 'locked_at', 'embedding',
        'created_at', 'updated_at',
    ] as const;

    const result = await dbConn`
        INSERT INTO pipelines.artifact_staging ${dbConn(rows, ...columns)} ON CONFLICT (url) DO NOTHING
    `;
    const inserted = result.count;
    return { inserted, dupes: artifacts.length - inserted };
}

export async function close() {
    await dbConn.end();
}
