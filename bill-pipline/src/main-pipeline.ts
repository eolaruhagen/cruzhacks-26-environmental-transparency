import pino from "pino";
import {
    CongressClient,
    createCoordinatedGroup,
    DiscordSink,
    HttpResponseError,
    mapConcurrent,
    ObservabilityProvider,
} from "@cruzhacks/shared";
import { makeSupabase } from "./lib/supabase-client.ts";
import { PgmqInteraction } from "./lib/pgmq-interactions.ts";
import { CongressSyncStateClient } from "./lib/congress-sync-state.ts";
import { processBill, TextThrottleRetry } from "./lib/process-bill.ts";
import { getTimeBudgetMs, isRunningLow } from "./lib/time-budget.ts";
import { isInBlackout, type TimeWindow } from "./lib/blackout.ts";
import { partitionPoisonMessages } from "./lib/queue-partition.ts";
import { makeBillWriteBackend } from "./lib/make-bill-write-backend.ts";

const logger = pino({ name: "bill-pipeline" });

const QUEUE_BATCH_SIZE = 20;
const VISIBILITY_TIMEOUT_SEC = 300;
const PER_BATCH_CONCURRENCY = 10;
const RATE_LIMIT_FALLBACK_MS = 60 * 60 * 1000;
const DEFAULT_MAX_READS = 5;

function parseBlackoutWindows(raw: string | undefined): TimeWindow[] {
    if (!raw) return [];
    return raw.split(";").filter(Boolean).map((pair) => {
        const [startPt, endPt] = pair.split("-");
        if (!startPt || !endPt || !/^\d{2}:\d{2}$/.test(startPt) || !/^\d{2}:\d{2}$/.test(endPt)) {
            throw new Error(`Invalid BLACKOUT_WINDOWS entry: "${pair}"`);
        }
        return { startPt, endPt };
    });
}

async function runPipeline(): Promise<void> {
    const startedAt = Date.now();
    const congressApiKey = process.env.CONGRESS_API_KEY;
    const webhookUrl = process.env.DISCORD_WEBHOOK_URL;
    const budgetMs = getTimeBudgetMs(process.env.TIME_BUDGET_MS);
    const maxReads = Number(process.env.MAX_READS) || DEFAULT_MAX_READS;
    const invalidTimeWindows = parseBlackoutWindows(process.env.BLACKOUT_WINDOWS);
    if (!congressApiKey) throw new Error("Missing CONGRESS_API_KEY");

    if (isInBlackout(invalidTimeWindows)) {
        logger.info({ invalidTimeWindows }, "in blackout window, skipping");
        return;
    }

    const supabase = makeSupabase();
    const syncStateClient = CongressSyncStateClient.fromSupabase(supabase);
    const state = await syncStateClient.read();
    if (
        state.api_rate_limit_reset_at &&
        new Date(state.api_rate_limit_reset_at).getTime() > Date.now()
    ) {
        logger.info({ resetAt: state.api_rate_limit_reset_at }, "rate-limited, skipping");
        return;
    }

    const sinks = webhookUrl
        ? [new DiscordSink({ webhookUrl, username: "bill-pipeline" })]
        : [];
    const obs = new ObservabilityProvider(sinks);

    await obs.withSession("bill-pipeline", async (session) => {
        session.set("max_reads", String(maxReads));

        const queue = new PgmqInteraction("house_bills_queue_new", supabase);
        const congressClient = new CongressClient({ apiKey: congressApiKey });
        const billBackend = makeBillWriteBackend(supabase);

        const textGroup = createCoordinatedGroup<TextThrottleRetry>({
            shouldTrip: (err) => err instanceof HttpResponseError && err.status === 403,
            retryError: (ctx) => new TextThrottleRetry(ctx),
        });

        let totalProcessed = 0;
        let totalFailed = 0;
        let totalDropped = 0;
        let rateLimited = false;

        while (true) {
            if (isRunningLow(startedAt, budgetMs)) {
                session.set("stopped_early", "time_budget");
                logger.info("time budget exhausted; next cron picks up");
                break;
            }

            session.stage("read-batch");
            const messages = await queue.readBatch(QUEUE_BATCH_SIZE, VISIBILITY_TIMEOUT_SEC);
            if (messages.length === 0) break;

            const { fresh, droppedCount } = await partitionPoisonMessages(
                messages,
                queue,
                maxReads,
                "bill-pipeline",
            );
            totalDropped += droppedCount;
            if (fresh.length === 0) continue;

            session.stage(`process-${fresh.length}`);
            const results = await mapConcurrent(
                fresh,
                PER_BATCH_CONCURRENCY,
                (m) => processBill(m.message, { congressClient, backend: billBackend, textGroup }),
            );

            for (let i = 0; i < results.length; i++) {
                const r = results[i]!;
                const msg = fresh[i]!;
                if (r.status === "fulfilled") {
                    await queue.archive(msg.msg_id);
                    totalProcessed++;
                } else if (r.reason instanceof TextThrottleRetry) {
                    // Leave in queue; visibility timeout re-surfaces it later.
                } else {
                    const reason = r.reason instanceof Error ? r.reason.message : String(r.reason);
                    logger.warn({ msgId: msg.msg_id, readCt: msg.read_ct, reason }, "bill failed");
                    totalFailed++;
                    if (r.reason instanceof HttpResponseError && r.reason.status === 429) {
                        rateLimited = true;
                    }
                }
            }

            if (textGroup.tripped) rateLimited = true;
            if (rateLimited) break;
        }

        session.set("processed", String(totalProcessed));
        session.set("failed", String(totalFailed));
        session.set("dropped", String(totalDropped));
        if (textGroup.tripped) session.set("text_blacked_out", "true");

        if (rateLimited) {
            const resetAt = new Date(Date.now() + RATE_LIMIT_FALLBACK_MS).toISOString();
            const reason = textGroup.tripped
                ? "congress.gov text host HTTP 403 (rate-limited)"
                : "Congress API HTTP 429 detected during batch processing";
            await syncStateClient.update({
                api_rate_limit_reset_at: resetAt,
                last_error: reason,
            });
            session.set("rate_limited_until", resetAt);
            throw new Error(`bill-pipeline: rate-limited; cooldown until ${resetAt}`);
        }
    });
}

runPipeline().catch((err) => {
    logger.fatal({ err }, "fatal");
    process.exit(1);
});
