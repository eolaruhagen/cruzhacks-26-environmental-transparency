import { parseArgs } from "util";
import postgres from "postgres";
import pino from "pino";
import { formatEmbedding } from "../src/lib/story-clustering";
import { EMBEDDING_DIMENSIONS } from "../src/config";
import type { NewsArtifactMetadata, ArtifactEnrichment, BillReference } from "../src/types";

const logger = pino({ name: "restore-to-enriched" });

function resolveDbUrl(db: string): string {
    if (db === "prod") return process.env.PROD_DATABASE_URL!;
    if (db === "local") return process.env.DATABASE_URL!;
    throw new Error(`--db must be "prod" or "local", got "${db}"`);
}

const { values } = parseArgs({
    args: Bun.argv.slice(2),
    options: {
        db: { type: "string", default: "local" },
    },
    strict: true,
});

const sql = postgres(resolveDbUrl(values.db!));

async function main() {
    logger.info({ db: values.db }, "starting restore-public-artifacts-to-enriched");

    await sql.begin(async (_tx) => {
        const tx = _tx as unknown as postgres.Sql;

        // 1. SELECT all published artifacts with their article details and enrichments
        const rows = await tx<{
            id: string;
            url: string;
            type: string;
            source_icon_url: string | null;
            embedding: number[];
            title: string;
            description: string | null;
            source: string | null;
            author: string[] | null;
            topics: string[] | null;
            people: string[] | null;
            summary: string;
            state: string | null;
            associated_bills: BillReference[];
            associated_representatives: string[] | null;
            stakeholders: string[] | null;
            environmental_topic: string;
            impact_level: string;
            sentiment: number;
            key_quote: string | null;
        }[]>`
            SELECT a.id, a.url, a.type, a.source_icon_url,
                   a.embedding::float4[] AS embedding,
                   ad.title, ad.description, ad.source, ad.author, ad.topics, ad.people,
                   ae.summary, ae.state,
                   (
                       SELECT coalesce(jsonb_agg(
                           jsonb_build_object('legislation_number', (b).legislation_number, 'reason', (b).reason)
                       ), '[]'::jsonb)
                       FROM unnest(ae.associated_bills) AS b
                   ) AS associated_bills,
                   ae.associated_representatives, ae.stakeholders,
                   ae.environmental_topic, ae.impact_level, ae.sentiment, ae.key_quote
            FROM public.artifacts a
            JOIN public.article_details ad ON ad.artifact_id = a.id
            JOIN public.artifact_enrichments ae ON ae.artifact_id = a.id
            WHERE a.embedding IS NOT NULL
        `;

        logger.info({ fetched: rows.length }, "fetched public artifacts");

        if (rows.length === 0) {
            logger.info("nothing to restore, exiting");
            return;
        }

        // 2. INSERT each into staging with ON CONFLICT (url) DO NOTHING
        let inserted = 0;
        for (const row of rows) {
            const metadata: NewsArtifactMetadata = {
                title: row.title,
                description: row.description ?? "",
                source: row.source,
                author: row.author ?? [],
                topics: row.topics ?? [],
                people: row.people ?? [],
            };

            const enrichment: ArtifactEnrichment = {
                summary: row.summary,
                state: row.state,
                associated_bills: row.associated_bills,
                associated_representatives: row.associated_representatives ?? [],
                stakeholders: row.stakeholders ?? [],
                environmental_topic: row.environmental_topic as ArtifactEnrichment["environmental_topic"],
                impact_level: row.impact_level as ArtifactEnrichment["impact_level"],
                sentiment: row.sentiment,
                key_quote: row.key_quote,
            };

            const embeddingStr = formatEmbedding(row.embedding, EMBEDDING_DIMENSIONS);

            const result = await tx`
                INSERT INTO pipelines.artifact_staging
                  (url, type, status, source_icon_url, metadata, retry_attempts,
                   locked_by, locked_at, embedding, enrichment, created_at, updated_at)
                VALUES (
                  ${row.url}, ${row.type}, 'enriched', ${row.source_icon_url},
                  ${tx.json(metadata as unknown as postgres.JSONValue)}, 0,
                  NULL, NULL,
                  ${embeddingStr}::halfvec,
                  ${tx.json(enrichment)},
                  now(), now()
                ) ON CONFLICT (url) DO NOTHING
            `;
            inserted += result.count;
        }

        logger.info({ inserted, skipped: rows.length - inserted }, "inserted into artifact_staging");

        // 3. DELETE from public.artifacts (cascades to article_details and artifact_enrichments)
        const ids = rows.map(r => r.id);
        const deleted = await tx`
            DELETE FROM public.artifacts WHERE id = ANY(${ids})
        `;

        logger.info(
            { fetched: rows.length, inserted, deleted: deleted.count },
            "restore-to-enriched complete",
        );
    });
}

main()
    .catch((err) => {
        logger.error({ err }, "restore-to-enriched failed");
        process.exit(1);
    })
    .finally(() => sql.end());
