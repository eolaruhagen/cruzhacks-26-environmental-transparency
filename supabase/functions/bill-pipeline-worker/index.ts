import "@supabase/functions-js/edge-runtime.d.ts";
import { z } from "zod";
import { DiscordSink, ObservabilityProvider } from "../lib/shared/index.ts";
import { authenticateInvokaction } from "../lib/local/pgmq-interactions.ts";

// ---------------------------------------------------------------------------
// Request body schema
// ---------------------------------------------------------------------------
// Cron sends the blackout windows as part of the body (see the migration
// supabase/migrations/20260508011159_new-house-bills-queue.sql) so they can
// be edited live by altering the cron schedule, no redeploy needed.
//
// "HH:MM" is interpreted in PT (America/Los_Angeles); see isInBlackout below.
const TimeWindowSchema = z.object({
    startPt: z.string().regex(/^\d{2}:\d{2}$/),
    endPt: z.string().regex(/^\d{2}:\d{2}$/),
});
type TimeWindow = z.infer<typeof TimeWindowSchema>;

const InvocationSchema = z.discriminatedUnion("kind", [
    z.object({
        kind: z.literal("manual"),
        reason: z.string(),
        invalidTimeWindows: z.array(TimeWindowSchema).default([]),
    }),
    z.object({
        kind: z.literal("scheduled"),
        invalidTimeWindows: z.array(TimeWindowSchema).default([]),
    }),
]);
type Invocation = z.infer<typeof InvocationSchema>;

// ---------------------------------------------------------------------------
// Blackout check
// ---------------------------------------------------------------------------
// Returns true if the current PT clock-time falls inside any of the windows.
// Using `Intl.DateTimeFormat` with the `America/Los_Angeles` timeZone keeps
// this DST-correct year-round — no UTC math required at the call site.
function isInBlackout(windows: TimeWindow[]): boolean {
    if (windows.length === 0) return false;
    const fmt = new Intl.DateTimeFormat("en-US", {
        timeZone: "America/Los_Angeles",
        hour12: false,
        hour: "2-digit",
        minute: "2-digit",
    }).format(new Date());
    const [hh, mm] = fmt.split(":").map(Number);
    const nowMin = hh * 60 + mm;
    return windows.some((w) => {
        const [sH, sM] = w.startPt.split(":").map(Number);
        const [eH, eM] = w.endPt.split(":").map(Number);
        return nowMin >= sH * 60 + sM && nowMin < eH * 60 + eM;
    });
}

function getDiscordSink(): DiscordSink {
    const webhookUrl = Deno.env.get("DISCORD_WEBHOOK_URL");
    if (!webhookUrl) throw new Error("Missing DISCORD_WEBHOOK_URL env var");
    return new DiscordSink({ webhookUrl, username: "bill-pipeline-worker" });
}

Deno.serve(async (req: Request) => {
    // Auth gate — first thing. Cron sends Authorization: Bearer <SECRET_API_KEY>
    // and so does any trusted manual caller. Anyone hitting this endpoint with
    // just the publishable/anon key gets 401 here.
    const envSecretKey = Deno.env.get("SECRET_API_KEY") ?? "";
    const passedSecretKey = (req.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "");
    const authError = authenticateInvokaction(envSecretKey, passedSecretKey);
    if (authError) return authError;

    const invocation: Invocation = InvocationSchema.parse(await req.json());
    console.log(`[bill-pipeline-worker] invoked: ${invocation.kind}`);

    // Blackout applies to BOTH manual and scheduled invocations. The constraint
    // ("don't hit Congress API during the daily sync or the existing prod
    // pipeline's heavy windows") is global — a manual override shouldn't bypass
    // it. Skip silently (console-only); don't spam Discord with skip events.
    if (isInBlackout(invocation.invalidTimeWindows)) {
        console.log(
            `[bill-pipeline-worker] in blackout window, skipping (PT now)`,
        );
        return new Response("skipped: blackout", { status: 200 });
    }

    // TODO: also check congress_sync_state.api_rate_limit_reset_time once
    // that column exists. If now() < reset_time, the daily Congress API
    // limit is exhausted — return early without doing the work.

    const obs = new ObservabilityProvider([getDiscordSink()]);
    await obs.withSession("bill-pipeline-worker", async (session) => {
        session.set("invocation_kind", invocation.kind);
        if (invocation.kind === "manual") {
            session.set("manual_reason", invocation.reason);
        }

        session.stage("placeholder");
        // TODO: pop K messages from house_bills_queue_new
        // TODO: for each, fetch bill data via CongressClient (parallel)
        // TODO: upsert reps + bill in a transaction
        // TODO: archive PGMQ messages on success
    });

    return new Response("ok");
});
