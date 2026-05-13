import "@supabase/functions-js/edge-runtime.d.ts";
import { z } from "zod";
import type { Database } from "../lib/shared/database.types.ts";
import {
    createCoordinatedGroup,
    DiscordSink,
    mapConcurrent,
    ObservabilityProvider,
} from "../lib/shared/index.ts";
import { embedText } from "../lib/shared/utils/embeddings.ts";
import { getOpenRouter, ModelStream } from "../lib/shared/utils/llm.ts";
import { supabase } from "../lib/local/supabase-client.ts";
import { runEdgeInvocation } from "../lib/local/edge-invocation.ts";
import {
    type BillEnrichmentWrite,
    type BillFetchBackend,
    fetchCorpusMean,
    fetchUnenrichedBills,
    type SubcategoryEmbeddingRow,
} from "../lib/local/bill-fetch.ts";
import {
    type ClassifyFn,
    type EmbedFn,
    LLMThrottleRetry,
    processBillEnrichment,
} from "../lib/local/process-bill-enrichment.ts";
import { ClassifyResultSchema } from "../lib/local/bill-enrich.ts";
import { getTimeBudgetMs, isRunningLow } from "../lib/local/time-budget.ts";
import { selfInvoke } from "../lib/local/self-chain.ts";
import { isInBlackout, type TimeWindow } from "../lib/local/blackout.ts";

const TimeWindowSchema = z.object({
    startPt: z.string().regex(/^\d{2}:\d{2}$/),
    endPt: z.string().regex(/^\d{2}:\d{2}$/),
}) satisfies z.ZodType<TimeWindow>;

const WorkerInvocationSchema = z.discriminatedUnion("kind", [
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

const BATCH_SIZE = 20;
const PER_BATCH_CONCURRENCY = 10;
const RATE_LIMIT_FALLBACK_MS = 60 * 60 * 1000;
const LLM_MODEL = "google/gemini-3.1-flash-lite";
const EMBEDDING_MODEL = "openai/text-embedding-3-small";
const EMBEDDING_DIMS = 1536;
const EMBEDDING_URL = "https://openrouter.ai/api/v1/embeddings";

const BILL_CLASSIFY_SYSTEM_PROMPT =
    `You are a classifier for U.S. legislative bills, deciding whether each bill belongs to one of 8 environmental categories.

Respond with valid JSON matching one of these two shapes:

1. If you can confidently classify:
   {"kind":"classified","category":"<one of: air_and_atmosphere, water_resources, waste_and_toxics, energy_and_resources, land_and_conservation, disaster_and_emergency, climate_and_emissions, justice_and_environment>","reasoning":"<<=500 chars explaining the choice>"}

2. If the bill's metadata (title, summary, subjects, policy area) doesn't carry enough signal to confidently choose a category:
   {"kind":"insufficient_info","reason":"<<=500 chars on what's missing>"}

Prefer insufficient_info over guessing. Output ONLY the JSON object, no prose.`;

// Module scope — survives across invocations within a warm container.
// Reset by container recycle. Worker fetches once per cold start, reuses
// across batches and self-chains.
let cachedCorpusMean: number[] | null | undefined = undefined;
//                                                  ^ undefined = not yet fetched
//                                                    null     = fetched, RPC returned NULL (cold start)
//                                                    number[] = fetched, real mean

function getDiscordSink(): DiscordSink {
    const webhookUrl = Deno.env.get("DISCORD_WEBHOOK_URL");
    if (!webhookUrl) throw new Error("Missing DISCORD_WEBHOOK_URL env var");
    return new DiscordSink({ webhookUrl, username: "bill-enrich-worker" });
}

// --- backends ---

function serializeHalfvec(v: number[]): string {
    return `[${v.join(",")}]`;
}

function parseHalfvecText(s: string): number[] {
    // halfvec text form is "[v1,v2,...]" — strip brackets, split, parseFloat each.
    const inner = s.startsWith("[") && s.endsWith("]") ? s.slice(1, -1) : s;
    if (inner.length === 0) return [];
    return inner.split(",").map((x) => parseFloat(x));
}

function makeBillFetchBackend(): BillFetchBackend {
    return {
        fetchUnenrichedBills: async (batchSize) => {
            // last_categorization_attempt_at is reset to NULL by
            // trg_house_bills_2_reset_categorization whenever Congress bumps
            // congress_update_date_including_text — so this two-NULL filter
            // catches both first-time bills and bills that got fresh content.
            const { data, error } = await supabase
                .from("house_bills_2")
                .select(
                    "id, congress, bill_type, bill_number, title, latest_summary, subject_terms, bill_policy_area, bill_text",
                )
                .is("category", null)
                .is("last_categorization_attempt_at", null)
                .order("created_at")
                .limit(batchSize);
            return {
                data: data ?? null,
                error: error ? { message: error.message } : null,
            };
        },
        fetchCorpusMean: async (artifactType) => {
            // artifactType is constrained at the orchestrator boundary —
            // cast is the cheap escape from the codegen'd enum literal type.
            const { data, error } = await supabase.rpc("get_corpus_mean", {
                p_type: artifactType as Database["public"]["Enums"]["artifact_type"],
            });
            return {
                data: (data as number[] | null) ?? null,
                error: error ? { message: error.message } : null,
            };
        },
        writeEnrichment: async (id, payload: BillEnrichmentWrite) => {
            const update: Database["public"]["Tables"]["house_bills_2"]["Update"] = {};
            if (payload.category !== undefined) update.category = payload.category;
            if (payload.embedding !== undefined) {
                update.embedding = serializeHalfvec(payload.embedding) as unknown as Database["public"]["Tables"]["house_bills_2"]["Update"]["embedding"];
            }
            if (payload.subcategory_scores !== undefined) {
                update.subcategory_scores = payload.subcategory_scores;
            }
            const { error } = await supabase
                .from("house_bills_2")
                .update(update)
                .eq("id", id);
            return { error: error ? { message: error.message } : null };
        },
        markInsufficientInfo: async (id, reason) => {
            const { error } = await supabase
                .from("house_bills_2")
                .update({
                    last_categorization_attempt_at: new Date().toISOString(),
                    last_categorization_reason: reason,
                })
                .eq("id", id);
            return { error: error ? { message: error.message } : null };
        },
        fetchSubcategoryEmbeddings: async (billType) => {
            const { data, error } = await supabase
                .from("categories_embeddings")
                .select("subcategory, embedding")
                .eq("bill_type", billType as Database["public"]["Enums"]["bill_type"]);
            if (error) {
                return { data: null, error: { message: error.message } };
            }
            const parsed: SubcategoryEmbeddingRow[] = (data ?? []).map(
                (row) => ({
                    subcategory: row.subcategory,
                    embedding: parseHalfvecText(row.embedding as string),
                }),
            );
            return { data: parsed, error: null };
        },
    };
}

function makeClassify(apiKey: string): ClassifyFn {
    const client = getOpenRouter(apiKey);
    return async (prompt: string) => {
        const result = new ModelStream()
            .model(LLM_MODEL, client)
            .instructions(BILL_CLASSIFY_SYSTEM_PROMPT)
            .input(prompt)
            .text({ format: { type: "json_object" } })
            .execute();
        const text = await result.getText();
        const parsed = ClassifyResultSchema.safeParse(JSON.parse(text));
        if (!parsed.success) {
            throw new Error(`classify: invalid LLM response: ${parsed.error.message}`);
        }
        return parsed.data;
    };
}

function makeEmbed(apiKey: string): EmbedFn {
    return (text: string) =>
        embedText(text, apiKey, EMBEDDING_DIMS, EMBEDDING_MODEL, EMBEDDING_URL);
}

Deno.serve(async (req: Request) => {
    const startedAt = Date.now();
    const envSecretKey = Deno.env.get("SECRET_API_KEY") ?? "";
    const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
    const openrouterApiKey = Deno.env.get("OPENROUTER_API_KEY") ?? "";
    const budgetMs = getTimeBudgetMs(Deno.env.get("TIME_BUDGET_MS"));
    if (!openrouterApiKey) throw new Error("Missing OPENROUTER_API_KEY env var");

    const gate = await runEdgeInvocation({
        req,
        envSecretKey,
        schema: WorkerInvocationSchema,
    });
    if (gate.kind === "deny") return gate.response;
    const { invocation } = gate;

    if (isInBlackout(invocation.invalidTimeWindows)) {
        console.log("[bill-enrich-worker] in blackout window, skipping");
        return new Response("skipped: blackout", { status: 200 });
    }

    const obs = new ObservabilityProvider([getDiscordSink()]);

    try {
        await obs.withSession("bill-enrich-worker", async (session) => {
            session.set("invocation_kind", invocation.kind);
            if (invocation.kind === "manual") {
                session.set("manual_reason", invocation.reason);
            }

            const classify = makeClassify(openrouterApiKey);
            const embed = makeEmbed(openrouterApiKey);
            const fetchBackend = makeBillFetchBackend();

            const group = createCoordinatedGroup<LLMThrottleRetry>({
                shouldTrip: (err) =>
                    err instanceof Error && /429|rate.?limit/i.test(err.message), // holy pattern here but whatever
                retryError: (ctx) => new LLMThrottleRetry(ctx),
            });

            if (cachedCorpusMean === undefined) {
                session.stage("fetch-corpus-mean");
                cachedCorpusMean = await fetchCorpusMean(fetchBackend, "bill");
            }

            let totalProcessed = 0;
            let totalFailed = 0;
            let rateLimited = false;

            while (true) {
                if (isRunningLow(startedAt, budgetMs)) {
                    session.stage("self-chain");
                    // Fire-and-forget: do NOT await. Chained invocation owns
                    // its own wall-clock budget; awaiting would compound timeouts.
                    selfInvoke({
                        fnName: "bill-enrich-worker",
                        body: invocation,
                        secretApiKey: envSecretKey,
                        supabaseUrl,
                    });
                    session.set("self_chained", "true");
                    break;
                }

                session.stage("fetch-batch");
                const rows = await fetchUnenrichedBills(fetchBackend, BATCH_SIZE);
                if (rows.length === 0) break;

                session.stage(`process-${rows.length}`);
                const results = await mapConcurrent(
                    rows,
                    PER_BATCH_CONCURRENCY,
                    (row) =>
                        processBillEnrichment(row, {
                            classify,
                            embed,
                            fetchBackend,
                            corpusMean: cachedCorpusMean ?? null,
                            group,
                        }),
                );

                for (let i = 0; i < results.length; i++) {
                    const r = results[i];
                    const row = rows[i];
                    if (r.status === "fulfilled") {
                        totalProcessed++;
                    } else if (r.reason instanceof LLMThrottleRetry) {
                        // Left for retry on next cron tick.
                    } else {
                        const reason = r.reason instanceof Error
                            ? r.reason.message
                            : String(r.reason);
                        console.warn(
                            `[bill-enrich-worker] bill ${row.id} failed: ${reason}`,
                        );
                        totalFailed++;
                    }
                }

                if (group.tripped) {
                    rateLimited = true;
                    break;
                }
            }

            session.set("processed", String(totalProcessed));
            session.set("failed", String(totalFailed));
            if (group.tripped) session.set("llm_blacked_out", "true");

            if (rateLimited) {
                const resetAt = new Date(Date.now() + RATE_LIMIT_FALLBACK_MS)
                    .toISOString();
                session.set("rate_limited_until", resetAt);
                session.set("ayo_check_yo_credits_please", true)
                throw new Error(
                    "bill-enrich-worker: LLM rate-limited, will retry next cron",
                );
            }
        });
    } catch (_err) {
        // session.fail already emitted to Discord; swallow to keep the
        // edge runtime from logging a generic crash.
    }

    return new Response("ok");
});
