import { parseArgs } from "util";
import postgres from "postgres";
import pino from "pino";
import { formatEmbedding } from "../src/lib/story-clustering";
import { EMBEDDING_DIMENSIONS } from "../src/config";
import type { ArtifactType, ArtifactStatus, StagingArtifact } from "../src/types";

const logger = pino({ name: "pull-prod-staging" });

const VALID_TYPES: ArtifactType[] = ["article"];
const VALID_STATUSES: ArtifactStatus[] = ["raw", "filtered", "enriched"];

const { values } = parseArgs({
    args: Bun.argv.slice(2),
    options: {
        type: { type: "string", default: "article" },
        status: { type: "string", default: "enriched" },
    },
    strict: true,
});

const type = values.type as string;
const status = values.status as string;

if (!VALID_TYPES.includes(type as ArtifactType)) {
    logger.fatal({ type, valid: VALID_TYPES }, "invalid --type");
    process.exit(1);
}

if (!VALID_STATUSES.includes(status as ArtifactStatus)) {
    logger.fatal({ status, valid: VALID_STATUSES }, "invalid --status");
    process.exit(1);
}

const artifactType = type as ArtifactType;
const artifactStatus = status as ArtifactStatus;

async function main() {
    const prodSql = postgres(process.env.PROD_DATABASE_URL!);
    const localSql = postgres(process.env.DATABASE_URL!);

    try {
        logger.info({ type: artifactType, status: artifactStatus }, "fetching rows from prod");

        const rows = await prodSql<StagingArtifact[]>`
        SELECT id, url, type, status, source_icon_url, metadata, retry_attempts,
               embedding::float4[] AS embedding, enrichment, created_at, updated_at
        FROM pipelines.artifact_staging
        WHERE type = ${artifactType} AND status = ${artifactStatus}
    `;

        logger.info({ count: rows.length }, "fetched from prod, inserting into local");

        let insertedCount = 0;

        for (const row of rows) {
            const embeddingStr = row.embedding !== null
                ? formatEmbedding(row.embedding, EMBEDDING_DIMENSIONS)
                : null;

            if (artifactStatus === "enriched" && embeddingStr === null) {
                logger.warn({ id: row.id }, "enriched artifact with no embedding, skipping");
                continue;
            }

            const enrichmentValue = row.enrichment !== null
                ? localSql.json(row.enrichment)
                : null;

            if (artifactStatus === "enriched" && enrichmentValue === null) {
                logger.warn({ id: row.id }, "enriched artifact with no enrichment, skipping");
                continue;
            }

            const result = await localSql`
            INSERT INTO pipelines.artifact_staging
                (url, type, status, source_icon_url, metadata, retry_attempts,
                 locked_by, locked_at, embedding, enrichment, created_at, updated_at)
            VALUES (
                ${row.url},
                ${row.type},
                ${row.status},
                ${row.source_icon_url},
                ${localSql.json(row.metadata as unknown as postgres.JSONValue)},
                ${row.retry_attempts},
                ${null},
                ${null},
                ${embeddingStr}::halfvec,
                ${enrichmentValue},
                ${row.created_at},
                ${row.updated_at}
            )
            ON CONFLICT (url) DO NOTHING
            RETURNING id
        `;

            if (result.length > 0) {
                insertedCount++;
            }
        }

        logger.info(
            { inserted: insertedCount, total: rows.length, skipped: rows.length - insertedCount },
            "done"
        );
    } finally {
        await prodSql.end();
        await localSql.end();
    }
}

main()
    .catch((error) => { logger.fatal(error, "script crashed"); process.exit(1); });
