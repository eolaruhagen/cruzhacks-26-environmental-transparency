import { parseArgs } from "util";
import postgres from "postgres";
import pino from "pino";
import { formatEmbedding } from "../src/lib/story-clustering";
import { EMBEDDING_DIMENSIONS } from "../src/config";
import type { ArtifactType } from "../src/types";

const logger = pino({ name: "compute-corpus-embedding-mean" });

const VALID_TYPES: ArtifactType[] = ["article"];

function resolveDbUrl(db: string): string {
    if (db === "prod") return process.env.PROD_DATABASE_URL!;
    if (db === "local") return process.env.DATABASE_URL!;
    throw new Error(`--db must be "prod" or "local", got "${db}"`);
}

const { values } = parseArgs({
    args: Bun.argv.slice(2),
    options: {
        db: { type: "string", default: "local" },
        type: { type: "string", default: "article" },
    },
    strict: true,
});

if (!VALID_TYPES.includes(values.type as ArtifactType)) {
    logger.fatal({ type: values.type, valid: VALID_TYPES }, "invalid --type");
    process.exit(1);
}

const type = values.type as ArtifactType;
const sql = postgres(resolveDbUrl(values.db!));

async function main() {
    logger.info({ type, db: values.db }, "fetching embeddings from public.artifacts");

    const rows = await sql<{ embedding: number[] }[]>`
        SELECT embedding::float4[] AS embedding
        FROM public.artifacts
        WHERE type = ${type} AND embedding IS NOT NULL
        LIMIT 500
    `;

    if (rows.length === 0) {
        logger.warn({ type }, "no embeddings found — skipping corpus mean update");
        return;
    }

    logger.info({ count: rows.length }, "computing element-wise mean");

    const dims = EMBEDDING_DIMENSIONS; // 1536
    const sum = new Float64Array(dims);
    for (const row of rows) {
        for (let i = 0; i < dims; i++) {
            if (row.embedding[i] === undefined || sum[i] === undefined) {
                throw new Error(`Embedding dimension ${i} is undefined`);
            } else {
                sum[i]! += row.embedding[i]!;
            }
        }
    }
    const mean = Array.from(sum, v => v / rows.length);

    const meanStr = formatEmbedding(mean, EMBEDDING_DIMENSIONS);

    const result = await sql`
        UPDATE pipelines.corpus_mean
        SET embedding = ${meanStr}::halfvec, updated_at = now()
        WHERE artifact_type = ${type}
        RETURNING *
    `;

    if (result.length !== 1) {
        throw new Error("Failed to update corpus mean or more than 1 corpus mean column exists for a type");
    }

    logger.info({ embeddings_used: rows.length, artifact_type: type }, "corpus mean stored");
}

main()
    .catch((err) => { logger.fatal(err, "script crashed"); process.exit(1); })
    .finally(() => sql.end());
