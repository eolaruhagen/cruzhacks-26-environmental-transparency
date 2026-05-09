import "@supabase/functions-js/edge-runtime.d.ts";
import { z } from "zod";
import {
    CongressClient,
    DiscordSink,
    HttpResponseError,
    mapConcurrent,
    ObservabilityProvider,
} from "../lib/shared/index.ts";
import { supabase } from "../lib/local/supabase-client.ts";
import { runEdgeInvocation } from "../lib/local/edge-invocation.ts";
import { PgmqInteraction } from "../lib/local/pgmq-interactions.ts";
import { CongressSyncStateClient } from "../lib/local/congress-sync-state.ts";
import type { BillWriteBackend } from "../lib/local/bill-write.ts";
import { processBill } from "../lib/local/process-bill.ts";
import { isRunningLow } from "../lib/local/time-budget.ts";
import { selfInvoke } from "../lib/local/self-chain.ts";
import { isInBlackout, type TimeWindow } from "../lib/local/blackout.ts";
import { partitionPoisonMessages } from "../lib/local/queue-partition.ts";

// ---------------------------------------------------------------------------
// Body schema
// ---------------------------------------------------------------------------
// `invalidTimeWindows` is interpreted in PT inside isInBlackout. Format is
// "HH:MM" (24-hour). Cron supplies the windows so they're tunable without
// redeploy. `maxReads` is the PGMQ visibility-retry threshold — at read_ct
// >= maxReads we archive (drop) the message and move on.

const TimeWindowSchema = z.object({
    startPt: z.string().regex(/^\d{2}:\d{2}$/),
    endPt: z.string().regex(/^\d{2}:\d{2}$/),
}) satisfies z.ZodType<TimeWindow>;

const WorkerInvocationSchema = z.discriminatedUnion("kind", [
    z.object({
        kind: z.literal("manual"),
        reason: z.string(),
        invalidTimeWindows: z.array(TimeWindowSchema).default([]),
        maxReads: z.number().int().positive().default(5),
    }),
    z.object({
        kind: z.literal("scheduled"),
        invalidTimeWindows: z.array(TimeWindowSchema).default([]),
        maxReads: z.number().int().positive().default(5),
    }),
]);

const QUEUE_BATCH_SIZE = 20;
const VISIBILITY_TIMEOUT_SEC = 300;
const PER_BATCH_CONCURRENCY = 10;
const RATE_LIMIT_FALLBACK_MS = 60 * 60 * 1000;

function getDiscordSink(): DiscordSink {
    const webhookUrl = Deno.env.get("DISCORD_WEBHOOK_URL");
    if (!webhookUrl) throw new Error("Missing DISCORD_WEBHOOK_URL env var");
    return new DiscordSink({ webhookUrl, username: "bill-pipeline-worker" });
}

function makeBillWriteBackend(): BillWriteBackend {
    return {
        upsertRepresentatives: async (reps) => {
            const result = await supabase
                .from("representatives")
                .upsert(reps, { onConflict: "bioguide_id" });
            return { error: result.error };
        },
        upsertHouseBill: async (bill) => {
            const result = await supabase
                .from("house_bills_2")
                .upsert(bill, { onConflict: "congress,bill_type,bill_number" });
            return { error: result.error };
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
        schema: WorkerInvocationSchema,
    });
    if (gate.kind === "deny") return gate.response;
    const {invocation} = gate;

    // Blackout — skip silently (no Discord noise on routine skips).
    if (isInBlackout(invocation.invalidTimeWindows)) {
        console.log("[bill-pipeline-worker] in blackout window, skipping");
        return new Response("skipped: blackout", { status: 200 });
    }

    // Pre-check rate-limit gate before spinning up observability so we don't
    // emit a "session_started" Discord embed for a no-op skip.
    const syncStateClient = CongressSyncStateClient.fromSupabase(supabase);
    const state = await syncStateClient.read();
    if (
        state.api_rate_limit_reset_at &&
        new Date(state.api_rate_limit_reset_at).getTime() > Date.now()
    ) {
        console.log(
            `[bill-pipeline-worker] api_rate_limit_reset_at=${state.api_rate_limit_reset_at} > now, skipping`,
        );
        return new Response("skipped: rate-limited", { status: 200 });
    }

    const obs = new ObservabilityProvider([getDiscordSink()]);

    try {
        await obs.withSession("bill-pipeline-worker", async (session) => {
            session.set("invocation_kind", invocation.kind);
            if (invocation.kind === "manual") session.set("manual_reason", invocation.reason);
            session.set("max_reads", String(invocation.maxReads));

            const queue = new PgmqInteraction("house_bills_queue_new", supabase);
            const congressClient = new CongressClient({ apiKey: congressApiKey });
            const billBackend = makeBillWriteBackend();

            let totalProcessed = 0;
            let totalFailed = 0;
            let totalDropped = 0;
            let rateLimited = false;

            while (true) {
                if (isRunningLow(startedAt)) {
                    session.stage("self-chain");
                    // Fire-and-forget: do NOT await. The chained invocation
                    // owns its own wall-clock budget; awaiting would compound
                    // timeouts. selfInvoke kicks off the request and logs
                    // any reach failure via console.warn.
                    selfInvoke({
                        fnName: "bill-pipeline-worker",
                        body: invocation,
                        secretApiKey: envSecretKey,
                        supabaseUrl,
                    });
                    session.set("self_chained", "true");
                    break;
                }

                session.stage("read-batch");
                const messages = await queue.readBatch(QUEUE_BATCH_SIZE, VISIBILITY_TIMEOUT_SEC);
                if (messages.length === 0) break;

                // Drop poison messages first — anything that's been retried
                // beyond `maxReads` gets archived with a log line. This keeps
                // a single bad bill from holding up the queue forever.
                // Helper survives a transient archive() throw (logs, leaves
                // for next-tick retry) so a flaky DB blip can't stall us.
                const { fresh, droppedCount } = await partitionPoisonMessages(
                    messages,
                    queue,
                    invocation.maxReads,
                    "bill-pipeline-worker",
                );
                totalDropped += droppedCount;
                if (fresh.length === 0) continue;

                session.stage(`process-${fresh.length}`);
                const results = await mapConcurrent(
                    fresh,
                    PER_BATCH_CONCURRENCY,
                    (m) => processBill(m.message, { congressClient, backend: billBackend }),
                );

                for (let i = 0; i < results.length; i++) {
                    const r = results[i];
                    const msg = fresh[i];
                    if (r.status === "fulfilled") {
                        await queue.archive(msg.msg_id);
                        totalProcessed++;
                    } else {
                        const reason = r.reason instanceof Error
                            ? r.reason.message
                            : String(r.reason);
                        console.warn(
                            `[bill-pipeline-worker] msg ${msg.msg_id} failed (read_ct=${msg.read_ct}): ${reason}`,
                        );
                        totalFailed++;
                        // instanceof narrows the reason naturally.
                        if (
                            r.reason instanceof HttpResponseError &&
                            r.reason.status === 429
                        ) {
                            rateLimited = true;
                        }
                    }
                }

                if (rateLimited) break; // don't keep hammering the API
            }

            session.set("processed", String(totalProcessed));
            session.set("failed", String(totalFailed));
            session.set("dropped", String(totalDropped));

            if (rateLimited) {
                const resetAt = new Date(Date.now() + RATE_LIMIT_FALLBACK_MS).toISOString();
                await syncStateClient.update({
                    api_rate_limit_reset_at: resetAt,
                    last_error: "Congress API HTTP 429 detected during batch processing",
                });
                session.set("rate_limited_until", resetAt);
                throw new Error(
                    `bill-pipeline-worker: rate-limited; cooldown until ${resetAt}`,
                );
            }
        });
    } catch (_err) {
        // session.fail already emitted to Discord; swallow to keep the
        // edge runtime from logging a generic crash.
    }

    return new Response("ok");
});
