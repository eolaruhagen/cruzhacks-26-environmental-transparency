import { parseArgs } from "util";
import postgres from "postgres";
import pino from "pino";
import { formatEmbedding } from "../src/lib/story-clustering";
import { EMBEDDING_DIMENSIONS } from "../src/config";
import type { ArtifactType } from "../src/types";

const logger = pino({ name: "mean-reduce-staging" });

const VALID_TYPES: ArtifactType[] = ["article"];

const { values } = parseArgs({
    args: Bun.argv.slice(2),
    options: {
        db: { type: "string", default: "local" },
        type: { type: "string", default: "article" },
    },
    strict: true,
});

function resolveDbUrl(db: string): string {
    if (db === "prod") return process.env.PROD_DATABASE_URL!;
    if (db === "local") return process.env.DATABASE_URL!;
    throw new Error(`--db must be "prod" or "local", got "${db}"`);
}

const sql = postgres(resolveDbUrl(values.db!));

const type = values.type as string;

if (!VALID_TYPES.includes(type as ArtifactType)) {
    logger.fatal({ type, valid: VALID_TYPES }, "invalid --type");
    process.exit(1);
}

const artifactType = type as ArtifactType;

async function main() {
    logger.info({ type: artifactType, db: values.db }, "loading corpus mean");

    const meanRows = await sql<{ embedding: number[] }[]>`
        SELECT embedding::float4[] AS embedding
        FROM pipelines.corpus_mean
        WHERE artifact_type = ${artifactType}
    `;

    if (meanRows.length === 0) {
        throw new Error(
            `No corpus mean found for type "${artifactType}". Run compute-corpus-embedding-mean first.`
        );
    }

    const corpusMean = meanRows[0]!.embedding;

    if (corpusMean.length !== EMBEDDING_DIMENSIONS) {
        throw new Error(
            `Corpus mean has ${corpusMean.length} dimensions, expected ${EMBEDDING_DIMENSIONS}`
        );
    }

    logger.info({ type: artifactType }, "loading enriched staging artifacts");

    const artifacts = await sql<{ id: string; embedding: number[] }[]>`
        SELECT id, embedding::float4[] AS embedding
        FROM pipelines.artifact_staging
        WHERE type = ${artifactType} AND status = 'enriched' AND embedding IS NOT NULL
    `;

    if (artifacts.length === 0) {
        logger.warn({ type: artifactType }, "no enriched artifacts with embeddings found, nothing to do");
        return;
    }

    logger.info({ count: artifacts.length, type: artifactType }, "applying mean reduction");

    await sql.begin(async (_tx) => {
        const tx = _tx as unknown as postgres.Sql;
        let updated = 0;
        for (const artifact of artifacts) {
            const reduced = artifact.embedding.map((v: number, i: number) => v - corpusMean[i]!);
            const reducedStr = formatEmbedding(reduced, EMBEDDING_DIMENSIONS);
            await tx`
                UPDATE pipelines.artifact_staging
                SET embedding = ${reducedStr}::halfvec, updated_at = now()
                WHERE id = ${artifact.id}
            `;
            updated++;
        }
        logger.info({ updated }, "mean reduction applied");
    });
}

main()
    .catch((err) => { logger.fatal(err, "script crashed"); process.exit(1); })
    .finally(() => sql.end());
