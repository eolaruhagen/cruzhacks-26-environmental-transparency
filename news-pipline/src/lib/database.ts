import postgres, { type Error } from "postgres";
import pino from "pino";
import type { ArtifactType, ArtifactStatus, StagingArtifact, ArtifactMetaMap, JsonSerializable, ArtifactEnrichment, EnvironmentalTopic } from "../types";

const logger = pino({ name: "postgres" });

const toJson = (value: object) => dbConn.json(value as unknown as postgres.JSONValue);

type QueryResult<T> =
    | { ok: true, data: T; durationMs: number }
    | { ok: false, error: Error; durationMs: number }

export const dbConn = postgres(process.env.DATABASE_URL!, {
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

type AcquireBatchError = "retry_exhausted" | "query_failed";

/**
 * Acquire a batch of artifacts with timed query, exponential backoff retries,
 * and custom error handling. Returns null when no more artifacts are available.
 *
 * @param label - Log label for the timed query
 * @param status - Pipeline stage to pull from
 * @param artifactType - Artifact type to filter by
 * @param batchSize - Max artifacts to lock
 * @param workerId - Worker ID for the lock
 * @param maxAttempts - Max retry attempts before calling onError
 * @param onError - Custom behavior when retries are exhausted or query fails
 * @returns The locked batch, or null if empty (caller should break)
 */
export async function acquireBatchWithRetries<K extends ArtifactType>(
    label: string,
    status: ArtifactStatus,
    artifactType: K,
    batchSize: number,
    workerId: string,
    maxAttempts: number,
    onError: (type: AcquireBatchError, error: unknown, attempt: number) => void,
): Promise<StagingArtifact<K>[] | null> {
    let attempts = 0;

    while (true) {
        try {
            const result = await timedQuery(label, () =>
                acquireArtifactLock(status, artifactType, batchSize, workerId)
            );
            if (!result.ok) throw result.error;

            if (result.data.length === 0) return null;
            return result.data;
        } catch (error) {
            attempts++;
            if (attempts >= maxAttempts) {
                onError("retry_exhausted", error, attempts);
                return null;
            }
            onError("query_failed", error, attempts);
            await new Promise(r => setTimeout(r, Math.pow(2, attempts) * 1000));
        }
    }
}

/**
 * Pull unlocked artifacts at a given pipeline stage.
 * Does NOT acquire a lock — use acquireArtifactLock for that.
 */
export async function pullArtifactsByStatus<K extends ArtifactType>(
    status: ArtifactStatus,
    artifactType: K,
    limit: number = 50
): Promise<StagingArtifact<K>[]> {
    return await dbConn<StagingArtifact<K>[]>`
        SELECT * FROM pipelines.artifact_staging
        WHERE status = ${status} AND type = ${artifactType} AND locked_by IS NULL
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
export async function acquireArtifactLock<K extends ArtifactType>(
    status: ArtifactStatus,
    artifactType: K,
    batchSize: number,
    workerId: string
): Promise<StagingArtifact<K>[]> {
    return await dbConn<StagingArtifact<K>[]>`
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
export async function releaseArtifactLocks<K extends ArtifactType>(
    artifacts: StagingArtifact<K>[],
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
                metadata = ${toJson(artifact.metadata)},
                enrichment = ${artifact.enrichment ? toJson(artifact.enrichment) : null},
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
 * Advance artifact status and clear locks WITHOUT overwriting data columns.
 * Use when enrichment/embedding were already written directly to DB
 * by tool calls or other functions during processing.
 */
export async function advanceArtifactStatus(
    artifactIds: string[],
    workerId: string,
    nextStatus: ArtifactStatus
): Promise<string[]> {
    if (artifactIds.length === 0) return [];

    const rows = await dbConn<{ id: string }[]>`
        UPDATE pipelines.artifact_staging
        SET locked_by = NULL,
            locked_at = NULL,
            status = ${nextStatus},
            updated_at = now()
        WHERE id = ANY(${artifactIds}) AND locked_by = ${workerId}
        RETURNING id
    `;

    return rows.map(r => r.id);
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

export async function insertRawArtifacts<K extends ArtifactType>(
    artifacts: StagingArtifact<K>[]
): Promise<{ inserted: number; dupes: number }> {
    const rows = artifacts.map(a => ({
        url: a.url,
        type: a.type,
        status: a.status,
        source_icon_url: a.source_icon_url,
        metadata: toJson(a.metadata),
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

/**
 * Move artifacts to the failed_artifacts table.
 * These are artifacts that exceeded MAX_ARTIFACT_RETRY across pipeline stages.
 * Stores the full artifact data as JSONB for debugging and post-mortem analysis.
 * Also deletes the artifact from the staging table to prevent re-processing.
 */
export async function moveToFailedArtifacts<K extends ArtifactType>(
    artifacts: StagingArtifact<K>[],
    workerId: string
): Promise<void> {
    if (artifacts.length === 0) return;

    for (const artifact of artifacts) {
        await dbConn`
            INSERT INTO pipelines.failed_artifacts (url, type, data)
            VALUES (
                ${artifact.url},
                ${artifact.type},
                ${toJson({ metadata: artifact.metadata, enrichment: artifact.enrichment, status: artifact.status, retry_attempts: artifact.retry_attempts })}
            )
        `;
        await dbConn`
            DELETE FROM pipelines.artifact_staging
            WHERE id = ${artifact.id} AND locked_by = ${workerId}
        `;
    }
}

/**
 * Move artifacts to the rejected_artifacts table.
 * These are artifacts the LLM filter determined are not environmentally relevant.
 * Stored for future classifier training data (the LLM's keep/drop decisions
 * become labeled examples for distilling into a BERT model later).
 * Also deletes the artifact from the staging table.
 */
export async function moveToRejectedArtifacts<K extends ArtifactType>(
    artifacts: StagingArtifact<K>[],
    workerId: string
): Promise<void> {
    if (artifacts.length === 0) return;

    for (const artifact of artifacts) {
        await dbConn`
            INSERT INTO pipelines.rejected_artifacts (url, type, data)
            VALUES (
                ${artifact.url},
                ${artifact.type},
                ${toJson({ metadata: artifact.metadata, status: artifact.status })}
            )
        `;
        await dbConn`
            DELETE FROM pipelines.artifact_staging
            WHERE id = ${artifact.id} AND locked_by = ${workerId}
        `;
    }
}


/**
 * Deduplicate artifacts in the staging pipeline based on a list of fields present inside of the metadata column for the artifact type.
 * - ***UNSAFE***: Uses dbConn.unsafe() to build the query -> is vulnerable to SQL injection
 * @param artifactType - The artifact type to deduplicate by -> required to check JSONB in DB against fields: T[]
 * @param fields - The fields to deduplicate by
 * @param status - The status to deduplicate by, best practice is to use "raw"
 * @returns The number of artifacts that were deduplicated
 */
export async function dedupByMetadataFields<K extends ArtifactType, T extends keyof ArtifactMetaMap[K]>(artifactType: K, fields: T[], status: ArtifactStatus = "raw"): Promise<number> {
    const jsonFields = fields.map(f => `metadata->>'${String(f)}'`).join(', ');
    const result = await dbConn.unsafe(`
        WITH duplicates AS (
            SELECT id,
                   ROW_NUMBER() OVER (
                       PARTITION BY ${jsonFields}
                       ORDER BY created_at ASC
                   ) as rn
            FROM pipelines.artifact_staging
            WHERE type = $1 AND status = $2
        )
        DELETE FROM pipelines.artifact_staging
        WHERE id IN (
            SELECT id FROM duplicates WHERE rn > 1
        )
    `, [artifactType, status]);

    return result.count;
}

// ── Enrichment / embedding queries ───────────────────────────────────

/**
 * Read the enrichment column for a single artifact.
 * Returns the enrichment object or null if the artifact has none yet.
 * Throws if the artifact ID doesn't exist.
 */
export async function readArtifactEnrichment(artifactId: string): Promise<ArtifactEnrichment | null> {
    const rows = await dbConn<{ enrichment: ArtifactEnrichment | null }[]>`
        SELECT enrichment FROM pipelines.artifact_staging WHERE id = ${artifactId}
    `;
    if (rows.length === 0) throw new Error(`Artifact ${artifactId} not found`);
    return rows[0]!.enrichment;
}

/**
 * Write enrichment JSON to a single artifact row.
 */
export async function writeArtifactEnrichment(artifactId: string, enrichment: ArtifactEnrichment): Promise<void> {
    await dbConn`
        UPDATE pipelines.artifact_staging
        SET enrichment = ${toJson(enrichment)}, updated_at = now()
        WHERE id = ${artifactId}
    `;
}

/**
 * Write a precomputed embedding vector to a single artifact row.
 * Expects embeddingStr in the format "[0.1,0.2,...]".
 */
export async function writeArtifactEmbedding(artifactId: string, embeddingStr: string): Promise<void> {
    await dbConn`
        UPDATE pipelines.artifact_staging
        SET embedding = ${embeddingStr}::halfvec, updated_at = now()
        WHERE id = ${artifactId}
    `;
}

/**
 * Read enrichment and embedding columns for a single artifact.
 * Used for post-processing verification (e.g. after LLM enrichment + embedding generation).
 */
export async function readArtifactEnrichmentAndEmbedding(artifactId: string): Promise<{ enrichment: unknown; embedding: unknown } | undefined> {
    const rows = await dbConn<{ enrichment: unknown; embedding: unknown }[]>`
        SELECT enrichment, embedding FROM pipelines.artifact_staging WHERE id = ${artifactId}
    `;
    return rows[0];
}

/**
 * Validate bill legislation_numbers against the house_bills table.
 * Returns only the IDs that actually exist.
 */
export async function validateBillIds(legislationNumbers: string[]): Promise<string[]> {
    const found = await dbConn<{ legislation_number: string }[]>`
        SELECT legislation_number FROM public.house_bills
        WHERE legislation_number = ANY(${legislationNumbers})
    `;
    return found.map(r => r.legislation_number);
}

// ── Bill search queries ──────────────────────────────────────────────

export interface BillSearchRow {
    id: string;
    legislation_number: string;
    title: string;
    sponsor: string;
    party_of_sponsor: string;
    category: string;
    bill_policy_area: string;
    subject_terms?: string[];
    cosponsors?: string[];
    latest_summary: string;
    similarity?: number;
}

/**
 * Text search across title, summary, and subject terms with optional category filter.
 */
export async function searchBillsByTextQuery(
    patterns: string[],
    category: EnvironmentalTopic | undefined,
    limit: number,
): Promise<BillSearchRow[]> {
    const categoryFilter = category
        ? dbConn`AND category = ${category}`
        : dbConn``;

    return await dbConn<BillSearchRow[]>`
        SELECT id, legislation_number, title, sponsor, party_of_sponsor,
               category, bill_policy_area, subject_terms,
               left(latest_summary, 500) AS latest_summary
        FROM public.house_bills
        WHERE (
            title ILIKE ANY(${patterns})
            OR latest_summary ILIKE ANY(${patterns})
            OR array_to_string(subject_terms, ' ') ILIKE ANY(${patterns})
        )
        ${categoryFilter}
        ORDER BY latest_action_date DESC NULLS LAST
        LIMIT ${limit}
    `;
}

/**
 * Search bills by sponsor or cosponsor name patterns with optional category and party filters.
 */
export async function searchBillsBySponsorQuery(
    patterns: string[],
    category: EnvironmentalTopic | undefined,
    party: string | undefined,
    limit: number,
): Promise<BillSearchRow[]> {
    const categoryFilter = category
        ? dbConn`AND category = ${category}`
        : dbConn``;
    const partyFilter = party
        ? dbConn`AND party_of_sponsor = ${party}`
        : dbConn``;

    return await dbConn<BillSearchRow[]>`
        SELECT id, legislation_number, title, sponsor, party_of_sponsor,
               cosponsors, category, bill_policy_area,
               left(latest_summary, 500) AS latest_summary
        FROM public.house_bills
        WHERE (
            sponsor ILIKE ANY(${patterns})
            OR EXISTS (
                SELECT 1 FROM unnest(cosponsors) AS cs
                WHERE cs ILIKE ANY(${patterns})
            )
        )
        ${categoryFilter}
        ${partyFilter}
        ORDER BY latest_action_date DESC NULLS LAST
        LIMIT ${limit}
    `;
}

/**
 * Vector similarity search over house bills.
 * embeddingStr should be in "[0.1,0.2,...]" format.
 */
export async function searchBillsByVectorQuery(
    embeddingStr: string,
    category: EnvironmentalTopic | undefined,
    limit: number,
    similarityThreshold: number,
): Promise<BillSearchRow[]> {
    const categoryFilter = category
        ? dbConn`AND category = ${category}`
        : dbConn``;

    return await dbConn<BillSearchRow[]>`
        SELECT id, legislation_number, title, sponsor, party_of_sponsor,
               category, bill_policy_area, subject_terms,
               left(latest_summary, 500) AS latest_summary,
               1 - (embedding <=> ${embeddingStr}::halfvec) AS similarity
        FROM public.house_bills
        WHERE embedding IS NOT NULL
        AND 1 - (embedding <=> ${embeddingStr}::halfvec) >= ${similarityThreshold}
        ${categoryFilter}
        ORDER BY embedding <=> ${embeddingStr}::halfvec ASC
        LIMIT ${limit}
    `;
}

export async function close() {
    await dbConn.end();
}
