import "@supabase/functions-js/edge-runtime.d.ts";
import { z } from "zod";
import { DiscordSink, ObservabilityProvider } from "../lib/shared/index.ts";
import { supabase } from "../lib/local/supabase-client.ts";
import { authenticateInvokaction } from "../lib/local/pgmq-interactions.ts";


const InvocationSchema = z.discriminatedUnion("kind", [
    z.object({ kind: z.literal("manual"), reason: z.string() }),
    z.object({ kind: z.literal("scheduled") }),
]);
type Invocation = z.infer<typeof InvocationSchema>;


function getDiscordSink(): DiscordSink {
    const webhookUrl = Deno.env.get("DISCORD_WEBHOOK_URL");
    if (!webhookUrl) throw new Error("Missing DISCORD_WEBHOOK_URL env var");
    return new DiscordSink({ webhookUrl, username: "sync-bills-new" });
}

Deno.serve(async (req: Request) => {
    // Auth gate — first thing. Cron sends Authorization: Bearer <SECRET_API_KEY>
    // and so does any trusted manual caller. Anyone hitting this endpoint with
    // just the publishable/anon key gets 401 here, before observability spins
    // up, so bad-auth attempts don't pollute Discord.
    const envSecretKey = Deno.env.get("SECRET_API_KEY") ?? "";
    const passedSecretKey = (req.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "");
    const authError = authenticateInvokaction(envSecretKey, passedSecretKey);
    if (authError) return authError;

    // ObservabilityProvider holds the list of sinks. withSession constructs a
    // Session, runs the callback, and emits "completed" on success or "failed"
    // on throw — then rethrows so the caller knows the work didn't finish.
    const obs = new ObservabilityProvider([getDiscordSink()]);

    try {
        await obs.withSession("sync-bills-new", async (session) => {
            // Stage the parse step BEFORE awaiting req.json(). If the body is
            // malformed or the schema rejects it, the failed-event Discord
            // embed will say "stage: parse-request" so the cause is obvious.
            session.stage("parse-request");
            const invocation: Invocation = InvocationSchema.parse(await req.json());

            // First log: stdout marker showing how the function was invoked.
            console.log(
                `[sync-bills-new] invoked: ${invocation.kind}` +
                    (invocation.kind === "manual" ? ` (reason: ${invocation.reason})` : ""),
            );

            // session.set(key, value) stashes context that lands in the
            // SessionEvent.fields object DiscordSink renders as embed fields.
            session.set("invocation_kind", invocation.kind);
            if (invocation.kind === "manual") {
                session.set("manual_reason", invocation.reason);
            }

            session.stage("placeholder");
            // ... actual work goes here ...
        });
    } catch (_err) {
        // error must be swallowed
    }


    // from congress sync state -> must get the last update time. If null default to now
    

    return new Response();
});
