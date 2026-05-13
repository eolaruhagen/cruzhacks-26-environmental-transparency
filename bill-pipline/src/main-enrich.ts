import pino from "pino";
import {
    createCoordinatedGroup,
    DiscordSink,
    mapConcurrent,
    ObservabilityProvider,
} from "@cruzhacks/shared";
import { loadConfig } from "./config.ts";
import { fetchCorpusMean, fetchUnenrichedBills } from "./lib/bill-fetch.ts";
import { makeBillFetchBackend } from "./lib/make-fetch-backend.ts";
import { makeClassify } from "./lib/make-classify.ts";
import { makeEmbed } from "./lib/make-embed.ts";
import {
    LLMThrottleRetry,
    processBillEnrichment,
} from "./lib/process-bill-enrichment.ts";
import { makeSupabase } from "./lib/supabase-client.ts";

const logger = pino({ name: "bill-enrich" });

async function runOneBatch(): Promise<void> {
    const cfg = loadConfig();
    const supabase = makeSupabase();
    const classify = makeClassify(cfg.OPENROUTER_API_KEY);
    const embed = makeEmbed(cfg.OPENROUTER_API_KEY);
    const fetchBackend = makeBillFetchBackend(supabase);

    const sinks = cfg.DISCORD_WEBHOOK_URL
        ? [new DiscordSink({ webhookUrl: cfg.DISCORD_WEBHOOK_URL, username: "bill-enrich" })]
        : [];
    const obs = new ObservabilityProvider(sinks);

    await obs.withSession("bill-enrich", async (session) => {
        session.stage("fetch-corpus-mean");
        const corpusMean = await fetchCorpusMean(fetchBackend, "bill");
        if (corpusMean === null) {
            logger.warn("corpus mean not yet populated; embeddings will be stored raw");
        }

        session.stage("fetch-batch");
        const rows = await fetchUnenrichedBills(fetchBackend, cfg.BATCH_SIZE);
        if (rows.length === 0) {
            session.set("queue_empty", "true");
            logger.info("no unenriched bills");
            return;
        }
        session.set("batch_size", String(rows.length));

        const group = createCoordinatedGroup<LLMThrottleRetry>({
            shouldTrip: (err) => err instanceof Error && /429|rate.?limit/i.test(err.message),
            retryError: (ctx) => new LLMThrottleRetry(ctx),
        });

        session.stage(`process-${rows.length}`);
        const results = await mapConcurrent(
            rows,
            cfg.PER_BATCH_CONCURRENCY,
            (row) =>
                processBillEnrichment(row, {
                    classify,
                    embed,
                    fetchBackend,
                    corpusMean,
                    group,
                }),
        );

        let processed = 0;
        let throttled = 0;
        let failed = 0;
        for (let i = 0; i < results.length; i++) {
            const r = results[i]!;
            const row = rows[i]!;
            if (r.status === "fulfilled") {
                processed++;
            } else if (r.reason instanceof LLMThrottleRetry) {
                throttled++;
            } else {
                const reason = r.reason instanceof Error ? r.reason.message : String(r.reason);
                logger.warn({ billId: row.id, reason }, "bill enrichment failed");
                failed++;
            }
        }
        session.set("processed", String(processed));
        session.set("throttled", String(throttled));
        session.set("failed", String(failed));
        if (group.tripped) session.set("llm_blacked_out", "true");

        logger.info({ processed, throttled, failed, total: rows.length }, "batch complete");
    });
}

runOneBatch().catch((err) => {
    logger.fatal({ err }, "fatal");
    process.exit(1);
});
