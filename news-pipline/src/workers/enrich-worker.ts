import pino from "pino";
import { stepCountIs, hasToolCall } from "@openrouter/sdk";
import { acquireBatchWithRetries, settleBatch } from "../lib/database";
import { ModelStream } from "../lib/llm";
import { billTools } from "../lib/bill-tools";
import { createEnrichmentTools } from "../lib/enrichment-tools";
import { scrapeArticle } from "../lib/jina";
import { generateArtifactEmbedding } from "../lib/embeddings";
import { ENRICH_BATCH_SIZE, ENRICH_WORKER_ID, ENRICH_MODEL, ENRICH_MAX_STEPS } from "../config";
import type { ArtifactType, StagingArtifact } from "../types";

const logger = pino({ name: "enrich-worker", level: process.env.LOG_LEVEL ?? "info" });

type EnrichmentContentFn<K extends ArtifactType> = (artifact: StagingArtifact<K>) => Promise<string | null>;

const enrichmentContentRegistry: { [K in ArtifactType]?: EnrichmentContentFn<K> } = {
    article: async (artifact) => {
        const meta = artifact.metadata;
        const scraped = await scrapeArticle(artifact.url);

        if (!scraped) return null;

        const authors = Array.isArray(meta.author) ? meta.author.join(", ") : (meta.author || "Unknown");
        const people = Array.isArray(meta.people) ? meta.people.join(", ") : (meta.people || "None");
        const topics = Array.isArray(meta.topics) ? meta.topics.join(", ") : (meta.topics || "None");

        return [
            `# ${meta.title}`,
            `**Authors**: ${authors}`,
            `**People mentioned**: ${people}`,
            `**Topics**: ${topics}`,
            `**Source URL**: ${artifact.url}`,
            "",
            "## Article Content",
            scraped,
        ].join("\n");
    },
};

function getEnrichmentContentFn<K extends ArtifactType>(artifactType: K): EnrichmentContentFn<K> {
    const fn = enrichmentContentRegistry[artifactType];
    if (!fn) {
        throw new Error(`No enrichment content function for artifact type: "${artifactType}"`);
    }
    return fn as EnrichmentContentFn<K>;
}

// ── System prompt ────────────────────────────────────────────────────
const ENRICH_SYSTEM_PROMPT = `You are an enrichment agent for an environmental transparency platform. You receive a news article and must either enrich it or reject it.

STEP 1 — Is this article environmentally relevant?
If NOT relevant, call reject_article and stop. Reject if:
- Weather forecasts without climate analysis, pet stories, gardening tips
- General politics/sports/entertainment without environmental substance
- Routine emergency coverage without environmental analysis
- Advertisements, non-English content, paywalled/truncated content

STEP 2 — If relevant, search for related house bills:
Use 1-2 search tools (search_bills_by_text, search_bills_by_vector, or search_bills_by_sponsor).

STEP 3 — Call enrich_article with ALL fields in ONE call:
- summary: 2-3 substantive sentences about environmental significance
- state: U.S. state abbreviation or null if national/international
- stakeholders: organizations, agencies, communities (at least one)
- environmental_topic: choose carefully — not everything is climate_and_emissions
- impact_level: local / state / national / international
- sentiment: -1 to 1 based on environmental IMPACT (not author tone)
- key_quote: direct quote from the article, or null
- associated_bills: array of objects from search results, or empty array []. Each object:
  - legislation_number: EXACT format from search results — e.g. "H.R." = House Resolution, "S." = Senate, number, then congress session in parens: "H.R. 4513 (108)", "S. 2856 (116)"
  - reason: short phrase (few words) for the connection, e.g. "regulates same pollutant", "directly referenced"

You MUST call exactly one of: reject_article OR enrich_article. Do not write prose.`;

// ── Outcome type ─────────────────────────────────────────────────────
type EnrichOutcome =
    | { outcome: "enriched" }
    | { outcome: "rejected"; reason: string }
    | { outcome: "failed"; error: string };

// ── Per-artifact enrichment ──────────────────────────────────────────
async function enrichArtifact<K extends ArtifactType>(
    artifact: StagingArtifact<K>,
    contentFn: EnrichmentContentFn<K>,
    workerId: string,
): Promise<EnrichOutcome> {
    const alog = logger.child({ workerId, artifactId: artifact.id });

    alog.debug("starting content scrape");
    const content = await contentFn(artifact);

    if (!content) {
        alog.debug("scrape returned no content");
        return { outcome: "failed", error: "scrape returned no content" };
    }
    alog.debug({ contentLength: content.length }, "scrape complete");

    const { tools: enrichTools, status } = createEnrichmentTools(artifact);

    alog.debug("starting LLM enrichment stream");
    const result = new ModelStream()
        .model(ENRICH_MODEL)
        .instructions(ENRICH_SYSTEM_PROMPT)
        .input(content)
        .reasoning({ effort: "high" })
        .tools([...billTools, ...enrichTools])
        .stopWhen([stepCountIs(ENRICH_MAX_STEPS), hasToolCall("reject_article"), hasToolCall("enrich_article")])
        .context({} as any)
        .execute();

    await result.getText();
    alog.debug({ rejected: status.rejected, enriched: status.enriched }, "LLM stream complete");

    if (status.rejected) {
        alog.info({ reason: status.rejectionReason }, "article rejected by LLM");
        return { outcome: "rejected", reason: status.rejectionReason };
    }

    if (!status.enriched) {
        alog.warn("enrich_article tool was not called — article will be retried");
        return { outcome: "failed", error: "LLM stream completed without calling enrich_article" };
    }

    alog.debug("generating embedding");
    const embedded = await generateArtifactEmbedding(artifact);
    if (!embedded) {
        alog.warn("embedding generation failed");
        return { outcome: "failed", error: "embedding generation failed" };
    }

    alog.debug("enrichment complete — ready for status advance");
    return { outcome: "enriched" };
}

// ── Main worker loop ─────────────────────────────────────────────────
export async function enrichWorker<K extends ArtifactType>(artifactType: K) {
    const contentFn = getEnrichmentContentFn(artifactType);
    const workerId = ENRICH_WORKER_ID + "-" + artifactType + "-" + Math.random().toString(36).substring(2, 15);

    let totalEnriched = 0;
    let totalRejected = 0;
    let totalRetried = 0;
    let totalFailed = 0;

    while (true) {
        const batch = await acquireBatchWithRetries(
            "acquire-enrich-batch", "filtered", artifactType,
            ENRICH_BATCH_SIZE, workerId, 5,
            (type, error, attempt) => {
                if (type === "retry_exhausted") logger.error(error, "failed to acquire enrich batch lock");
                else logger.warn({ attempt }, "failed to acquire batch lock, retrying");
            },
        );

        if (!batch) {
            logger.info("no more filtered artifacts to enrich (or acquire failed)");
            break;
        }

        logger.info({ batchSize: batch.length }, "processing enrich batch");

        const results = await Promise.allSettled(
            batch.map(artifact => enrichArtifact(artifact, contentFn, workerId))
        );

        const succeeded: StagingArtifact<K>[] = [];
        const rejected: StagingArtifact<K>[] = [];
        const failed: StagingArtifact<K>[] = [];

        for (let i = 0; i < results.length; i++) {
            const settled = results[i]!;
            const artifact = batch[i]!;

            if (settled.status === "rejected") {
                logger.error({ artifactId: artifact.id, error: settled.reason?.message ?? settled.reason }, "enrichArtifact threw");
                failed.push(artifact);
            } else {
                switch (settled.value.outcome) {
                    case "enriched": succeeded.push(artifact); break;
                    case "rejected": rejected.push(artifact); break;
                    case "failed": failed.push(artifact); break;
                }
            }
        }

        const counts = await settleBatch(workerId, "enriched", succeeded, rejected, failed);
        totalEnriched += counts.advanced;
        totalRejected += counts.rejected;
        totalRetried += counts.retried;
        totalFailed += counts.failed;

        logger.info(counts, "batch complete");
    }

    logger.info({ totalEnriched, totalRejected, totalRetried, totalFailed }, `enrich worker complete for ${artifactType}`);
}
