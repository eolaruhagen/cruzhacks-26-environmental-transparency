import pino from "pino";
import {
    type BillListResponse,
    CongressClient,
    DiscordSink,
    HttpResponseError,
    ObservabilityProvider,
} from "@cruzhacks/shared";
import { makeSupabase } from "./lib/supabase-client.ts";
import { type HouseBillQueueMessage, PgmqInteraction } from "./lib/pgmq-interactions.ts";
import { CongressSyncStateClient } from "./lib/congress-sync-state.ts";
import { csvBillSource, type CsvSource } from "./lib/csv-bill-source.ts";
import { getTimeBudgetMs, isRunningLow } from "./lib/time-budget.ts";

const logger = pino({ name: "bill-sync" });

const BATCH_SIZE = 250;
const RATE_LIMIT_FALLBACK_MS = 60 * 60 * 1000;

function makeStorageCsvSource(
    supabase: ReturnType<typeof makeSupabase>,
    bucket: string,
    fileName: string,
): CsvSource {
    return {
        readText: async () => {
            const { data, error } = await supabase.storage.from(bucket).download(fileName);
            if (error) {
                throw new Error(
                    `[bill-sync] CSV download failed (bucket=${bucket}, file=${fileName}): ${error.message}`,
                );
            }
            return await data.text();
        },
    };
}

function billListItemToMessage(
    item: BillListResponse["bills"][number],
): HouseBillQueueMessage | null {
    const { congress } = item;
    const billType = item.type;
    const number = typeof item.number === "number" ? String(item.number) : item.number;
    if (!congress || !billType || !number) return null;
    return { congress, bill_type: billType, bill_number: number };
}

async function runSync(): Promise<void> {
    const startedAt = Date.now();
    const congressApiKey = process.env.CONGRESS_API_KEY;
    const webhookUrl = process.env.DISCORD_WEBHOOK_URL;
    const budgetMs = getTimeBudgetMs(process.env.TIME_BUDGET_MS);
    if (!congressApiKey) throw new Error("Missing CONGRESS_API_KEY");

    const source = (process.env.SYNC_SOURCE === "csv" ? "csv" : "api") as "api" | "csv";
    const manualReason = process.env.SYNC_REASON;

    const supabase = makeSupabase();
    const sinks = webhookUrl
        ? [new DiscordSink({ webhookUrl, username: "bill-sync" })]
        : [];
    const obs = new ObservabilityProvider(sinks);

    await obs.withSession("bill-sync", async (session) => {
        session.set("source", source);
        if (manualReason) session.set("manual_reason", manualReason);

        session.stage("read-sync-state");
        const syncStateClient = CongressSyncStateClient.fromSupabase(supabase);
        const state = await syncStateClient.read();

        if (
            state.api_rate_limit_reset_at &&
            new Date(state.api_rate_limit_reset_at).getTime() > Date.now()
        ) {
            session.set("skipped_reason", "rate_limited_until_" + state.api_rate_limit_reset_at);
            logger.info({ resetAt: state.api_rate_limit_reset_at }, "rate-limited, skipping");
            return;
        }

        const queue = new PgmqInteraction("house_bills_queue_new", supabase);
        const congressClient = new CongressClient({ apiKey: congressApiKey });

        try {
            if (source === "csv") {
                session.stage("csv-stream");
                const bucket = process.env.CSV_BUCKET_NAME ?? "csv-data";
                const fileName = process.env.KICKSTART_CSV_NAME ?? "all_bills.csv";
                const csvSrc = makeStorageCsvSource(supabase, bucket, fileName);

                let buffer: HouseBillQueueMessage[] = [];
                let totalEnqueued = 0;
                let stoppedEarly = false;
                for await (const msg of csvBillSource(csvSrc)) {
                    buffer.push(msg);
                    if (buffer.length >= BATCH_SIZE) {
                        await queue.sendBatch(buffer);
                        totalEnqueued += buffer.length;
                        buffer = [];
                        if (isRunningLow(startedAt, budgetMs)) {
                            stoppedEarly = true;
                            break;
                        }
                    }
                }
                if (buffer.length > 0) {
                    await queue.sendBatch(buffer);
                    totalEnqueued += buffer.length;
                }
                session.set("total_enqueued", String(totalEnqueued));
                if (stoppedEarly) session.set("stopped_early", "csv_time_budget");
            } else {
                session.stage("api-stream");
                const fromDateTime = state.last_sync_at ??
                    new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
                session.set("from_date_time", fromDateTime);

                let page = await congressClient.listBills({
                    fromDateTime,
                    limit: BATCH_SIZE,
                    sort: "updateDate+asc",
                });

                let totalEnqueued = 0;
                while (true) {
                    const messages = page.bills
                        .map(billListItemToMessage)
                        .filter((m): m is HouseBillQueueMessage => m !== null);
                    if (messages.length > 0) {
                        await queue.sendBatch(messages);
                        totalEnqueued += messages.length;
                    }
                    const next = page.pagination?.next;
                    if (!next) break;
                    if (isRunningLow(startedAt, budgetMs)) {
                        // No self-chain on Bun: time-budget hit means the next
                        // cron tick continues from where Congress's cursor left
                        // off (last_sync_at gets updated only on a clean drain).
                        session.set("total_enqueued", String(totalEnqueued));
                        session.set("stopped_early", "api_time_budget");
                        logger.warn("time budget exhausted; next cron picks up");
                        return;
                    }
                    page = await congressClient.listBillsAt(next);
                }
                session.set("total_enqueued", String(totalEnqueued));
            }

            session.stage("update-sync-state");
            await syncStateClient.update({
                last_sync_at: new Date().toISOString(),
                last_error: null,
            });
        } catch (err) {
            if (err instanceof HttpResponseError && err.status === 429) {
                const resetAt = new Date(Date.now() + RATE_LIMIT_FALLBACK_MS).toISOString();
                await syncStateClient.update({
                    api_rate_limit_reset_at: resetAt,
                    last_error: err.message.slice(0, 500),
                });
                session.set("rate_limited_until", resetAt);
            }
            throw err;
        }
    });
}

runSync().catch((err) => {
    logger.fatal({ err }, "fatal");
    process.exit(1);
});
