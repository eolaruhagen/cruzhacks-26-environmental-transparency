import { parseArgs } from "util";
import postgres from "postgres";
import pino from "pino";
import type { NewsArtifactMetadata } from "../src/types";

const logger = pino({ name: "restore-to-filtered" });

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
    logger.info({ db: values.db }, "starting restore-public-artifacts-to-filtered");

    await sql.begin(async (_tx) => {
        const tx = _tx as unknown as postgres.Sql;

        // 1. SELECT all published artifacts with their article details
        const rows = await tx<{
            id: string;
            url: string;
            type: string;
            source_icon_url: string | null;
            title: string;
            description: string | null;
            source: string | null;
            author: string[] | null;
            topics: string[] | null;
            people: string[] | null;
        }[]>`
            SELECT a.id, a.url, a.type, a.source_icon_url,
                   ad.title, ad.description, ad.source, ad.author, ad.topics, ad.people
            FROM public.artifacts a
            JOIN public.article_details ad ON ad.artifact_id = a.id
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

            const result = await tx`
                INSERT INTO pipelines.artifact_staging
                  (url, type, status, source_icon_url, metadata, retry_attempts,
                   locked_by, locked_at, embedding, enrichment, created_at, updated_at)
                VALUES (
                  ${row.url}, ${row.type}, 'filtered', ${row.source_icon_url},
                  ${tx.json(metadata as unknown as postgres.JSONValue)}, 0,
                  NULL, NULL, NULL, NULL,
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
            "restore-to-filtered complete",
        );
    });
}

main()
    .catch((err) => {
        logger.error({ err }, "restore-to-filtered failed");
        process.exit(1);
    })
    .finally(() => sql.end());
