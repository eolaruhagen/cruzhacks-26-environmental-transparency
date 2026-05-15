import pino from "pino";
import { createCoordinatedGroup, mapConcurrent } from "@cruzhacks/shared";
import { loadConfig } from "./config.ts";
import { fetchCorpusMean, fetchUnenrichedBills } from "./lib/enrich/bill-fetch.ts";
import { makeBillFetchBackend } from "./lib/enrich/make-fetch-backend.ts";
import { makeClassify } from "./lib/enrich/make-classify.ts";
import { makeEmbed } from "./lib/enrich/make-embed.ts";
import { makeObservability } from "./lib/runtime/observability.ts";
import {
    LLMThrottleRetry,
    processBillEnrichment,
} from "./lib/enrich/process-bill-enrichment.ts";
import { makeSupabase } from "./lib/runtime/supabase-client.ts";
import { getTimeBudgetMs, isRunningLow } from "./lib/runtime/time-budget.ts";

const logger = pino({ name: "bill-enrich" });

async function run(): Promise<void> {
    const startedAt = Date.now();
    const cfg = loadConfig();
    const budgetMs = getTimeBudgetMs(process.env.TIME_BUDGET_MS);
    const supabase = makeSupabase();
    const classify = makeClassify(cfg.OPENROUTER_API_KEY);
    const embed = makeEmbed(cfg.OPENROUTER_API_KEY);
    const fetchBackend = makeBillFetchBackend(supabase);

    const obs = makeObservability("bill-enrich");

    await obs.withSession("bill-enrich", async (session) => {
        session.stage("fetch-corpus-mean");
        const corpusMean = await fetchCorpusMean(fetchBackend, "bill");
        if (corpusMean === null) {
            logger.warn("corpus mean not yet populated; embeddings will be stored raw");
        }

        const group = createCoordinatedGroup<LLMThrottleRetry>({
            shouldTrip: (err) => err instanceof Error && /429|rate.?limit/i.test(err.message),
            retryError: (ctx) => new LLMThrottleRetry(ctx),
        });

        let totalProcessed = 0;
        let totalThrottled = 0;
        let totalFailed = 0;
        let totalBatches = 0;

        while (true) {
            if (isRunningLow(startedAt, budgetMs)) {
                session.set("stopped_early", "time_budget");
                logger.info("time budget exhausted; next cron picks up");
                break;
            }

            session.stage(`fetch-batch-${totalBatches + 1}`);
            const rows = await fetchUnenrichedBills(fetchBackend, cfg.BATCH_SIZE);
            if (rows.length === 0) {
                if (totalBatches === 0) session.set("queue_empty", "true");
                break;
            }

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

            for (let i = 0; i < results.length; i++) {
                const r = results[i]!;
                const row = rows[i]!;
                if (r.status === "fulfilled") {
                    totalProcessed++;
                } else if (r.reason instanceof LLMThrottleRetry) {
                    totalThrottled++;
                } else {
                    const reason = r.reason instanceof Error ? r.reason.message : String(r.reason);
                    logger.warn({ billId: row.id, reason }, "bill enrichment failed");
                    totalFailed++;
                }
            }
            totalBatches++;

            if (group.tripped) break;
        }

        session.set("batches", String(totalBatches));
        session.set("processed", String(totalProcessed));
        session.set("throttled", String(totalThrottled));
        session.set("failed", String(totalFailed));
        if (group.tripped) session.set("llm_blacked_out", "true");

        logger.info(
            { batches: totalBatches, processed: totalProcessed, throttled: totalThrottled, failed: totalFailed },
            "run complete",
        );
    });
}

run().catch((err) => {
    logger.fatal({ err }, "fatal");
    process.exit(1);
});
