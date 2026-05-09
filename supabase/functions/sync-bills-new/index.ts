import "@supabase/functions-js/edge-runtime.d.ts";
import { z } from "zod";
import {
    type BillListResponse,
    CongressClient,
    DiscordSink,
    HttpResponseError,
    ObservabilityProvider,
} from "../lib/shared/index.ts";
import { supabase } from "../lib/local/supabase-client.ts";
import { runEdgeInvocation } from "../lib/local/edge-invocation.ts";
import {
    type HouseBillQueueMessage,
    PgmqInteraction,
} from "../lib/local/pgmq-interactions.ts";
import { CongressSyncStateClient } from "../lib/local/congress-sync-state.ts";
import { csvBillSource, type CsvSource } from "../lib/local/csv-bill-source.ts";
import { isRunningLow } from "../lib/local/time-budget.ts";
import { selfInvoke } from "../lib/local/self-chain.ts";

// ---------------------------------------------------------------------------
// Body schema
// ---------------------------------------------------------------------------
// Manual mode: caller picks `source` (api or csv). CSV mode is one-shot —
// the function processes whatever fits in the time budget and exits, no
// self-chain (the bulk CSV is a finite file; a re-run continues from where
// it left off only if the caller passes a fresh offset).
//
// API mode (also the default for scheduled cron): self-chains via `nextUrl`
// when the time budget runs low, so a wide cursor doesn't drop bills.

const SyncBillsInvocationSchema = z.discriminatedUnion("kind", [
    z.object({
        kind: z.literal("manual"),
        reason: z.string(),
        source: z.enum(["api", "csv"]).default("api"),
        nextUrl: z.url().optional(),
    }),
    z.object({
        kind: z.literal("scheduled"),
        nextUrl: z.url().optional(),
    }),
]);

const BATCH_SIZE = 250;
const RATE_LIMIT_FALLBACK_MS = 60 * 60 * 1000; // 1 hour rolling window

function getDiscordSink(): DiscordSink {
    const webhookUrl = Deno.env.get("DISCORD_WEBHOOK_URL");
    if (!webhookUrl) throw new Error("Missing DISCORD_WEBHOOK_URL env var");
    return new DiscordSink({ webhookUrl, username: "sync-bills-new" });
}

function billListItemToMessage(
    item: BillListResponse["bills"][number],
): HouseBillQueueMessage | null {
    // Filter out items that don't carry the natural key. Rare but seen in
    // the wild when the API returns a stub during data refreshes.
    const { congress } = item;
    const billType = item.type;
    const number = typeof item.number === "number" ? String(item.number) : item.number;
    if (!congress || !billType || !number) return null;
    return {
        congress,
        bill_type: billType,
        bill_number: number,
    };
}

function makeStorageCsvSource(bucket: string, fileName: string): CsvSource {
    return {
        readText: async () => {
            const { data, error } = await supabase.storage.from(bucket).download(fileName);
            if (error) {
                throw new Error(
                    `[sync-bills-new] CSV download failed (bucket=${bucket}, file=${fileName}): ${error.message}`,
                );
            }
            return await data.text();
        },
    };
}

Deno.serve(async (req: Request) => {
    const startedAt = Date.now();
    const envSecretKey = Deno.env.get("SECRET_API_KEY") ?? "";
    const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
    const congressApiKey = Deno.env.get("CONGRESS_API_KEY") ?? "";
    if (!congressApiKey) throw new Error("Missing CONGRESS_API_KEY env var");

    const gate = await runEdgeInvocation({
        req,
        envSecretKey,
        schema: SyncBillsInvocationSchema,
    });
    if (gate.kind === "deny") return gate.response;
    const { invocation } = gate;

    const obs = new ObservabilityProvider([getDiscordSink()]);

    try {
        await obs.withSession("sync-bills-new", async (session) => {
            session.set("invocation_kind", invocation.kind);
            const source = invocation.kind === "manual" ? invocation.source : "api";
            session.set("source", source);
            if (invocation.kind === "manual") session.set("manual_reason", invocation.reason);
            if (invocation.nextUrl) session.set("next_url", invocation.nextUrl);

            session.stage("read-sync-state");
            const syncStateClient = CongressSyncStateClient.fromSupabase(supabase);
            const state = await syncStateClient.read();

            // Rate-limit gate. If the previous run set api_rate_limit_reset_at
            // in the future, we sit out until that timestamp passes.
            if (
                state.api_rate_limit_reset_at &&
                new Date(state.api_rate_limit_reset_at).getTime() > Date.now()
            ) {
                session.set("skipped_reason", "rate_limited_until_" + state.api_rate_limit_reset_at);
                console.log(
                    `[sync-bills-new] api_rate_limit_reset_at=${state.api_rate_limit_reset_at} > now, skipping`,
                );
                return;
            }

            const queue = new PgmqInteraction("house_bills_queue_new", supabase);
            const congressClient = new CongressClient({ apiKey: congressApiKey });

            try {
                if (source === "csv") {
                    session.stage("csv-stream");
                    const bucket = Deno.env.get("CSV_BUCKET_NAME") ?? "csv-data";
                    const fileName = Deno.env.get("KICKSTART_CSV_NAME") ?? "all_bills.csv";
                    const csvSrc = makeStorageCsvSource(bucket, fileName);

                    let buffer: HouseBillQueueMessage[] = [];
                    let totalEnqueued = 0;
                    let stoppedEarly = false;
                    for await (const msg of csvBillSource(csvSrc)) {
                        buffer.push(msg);
                        if (buffer.length >= BATCH_SIZE) {
                            await queue.sendBatch(buffer);
                            totalEnqueued += buffer.length;
                            buffer = [];
                            if (isRunningLow(startedAt)) {
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
                    // API mode: cursor-based pagination, self-chain on time pressure.
                    session.stage("api-stream");
                    const fromDateTime = invocation.nextUrl
                        ? undefined // listBillsAt uses the absolute URL
                        : (state.last_sync_at ??
                            new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString());
                    if (fromDateTime) session.set("from_date_time", fromDateTime);

                    let page = invocation.nextUrl
                        ? await congressClient.listBillsAt(invocation.nextUrl)
                        : await congressClient.listBills({
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
                        if (isRunningLow(startedAt)) {
                            session.stage("self-chain");
                            // Fire-and-forget: do NOT await. See bill-pipeline-worker
                            // for the same pattern + reasoning.
                            selfInvoke({
                                fnName: "sync-bills-new",
                                body: { ...invocation, nextUrl: next },
                                secretApiKey: envSecretKey,
                                supabaseUrl,
                            });
                            session.set("total_enqueued", String(totalEnqueued));
                            session.set("self_chained", "true");
                            return; // chained invocation continues the work
                        }
                        page = await congressClient.listBillsAt(next);
                    }
                    session.set("total_enqueued", String(totalEnqueued));
                }

                // Drained cleanly — bump last_sync_at if this wasn't a continuation.
                // For continuations (nextUrl set), the FINAL invocation in the
                // chain is the one that drains, and only it bumps state.
                session.stage("update-sync-state");
                await syncStateClient.update({
                    last_sync_at: new Date().toISOString(),
                    last_error: null,
                });
            } catch (err) {
                // instanceof narrows `err` to HttpResponseError directly — no
                // separate cast needed. Substring matching against err.message
                // would be fragile to any future tweak of the error format.
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
    } catch (_err) {
        // observability already failed the session; we just don't want to
        // crash the runtime because that loses the discord embed.
    }

    return new Response("ok");
});
