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
const ENRICH_SYSTEM_PROMPT = `You are an enrichment agent for an environmental transparency platform. You receive a news article and must either enrich it with structured data OR reject it if it's not environmentally relevant.

FIRST DECISION — Is this article environmentally relevant?
If NO, call reject_article with a brief reason and stop. Rejection criteria (same as filter step):
- Weather forecasts, temperature predictions, storm warnings without climate analysis
- Pet stories, zoo exhibits, gardening tips, seasonal nature tourism
- General politics/sports/entertainment without environmental substance
- Routine emergency coverage without environmental analysis
- Advertisements or non-English content
- Content too short or paywalled to meaningfully analyze

If YES, follow this workflow:
1. Read the article.
2. Search for related house bills (use 1-2 search tools: search_bills_by_text, search_bills_by_vector, or search_bills_by_sponsor).
3. Call set_article_analysis with ALL analysis fields filled in.
4. Call set_associated_bills with the bills you found (or empty array if none).

TOOL: reject_article — call this INSTEAD of the enrichment tools if the article is not relevant.

TOOL: set_article_analysis — You MUST fill every field:
- summary: 2-3 substantive sentences about the article's environmental significance
- state: U.S. state abbreviation or null if national/international
- stakeholders: organizations, agencies, communities (at least one)
- environmental_topic: choose carefully from the enum — not everything is climate_and_emissions
- impact_level: local (city/county), state, national, or international
- sentiment: -1 to 1 based on environmental IMPACT in the content (not author tone)
- key_quote: a direct quote from the article, or null only if truly none exists

TOOL: set_associated_bills — bills from your search results:
- legislation_number: exact format from search results, e.g. "H.R. 123 (119)"
- reason: short phrase explaining the connection (few words, not a sentence)
- Empty array if no relevant bills found

Do not write prose. Only make tool calls.`;

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
        .stopWhen([stepCountIs(ENRICH_MAX_STEPS), hasToolCall("reject_article")])
        .context({} as any)
        .execute();

    await result.getText();
    alog.debug({ rejected: status.rejected, analysisSet: status.analysisSet, billsSet: status.billsSet }, "LLM stream complete");

    if (status.rejected) {
        alog.info({ reason: status.rejectionReason }, "article rejected by LLM");
        return { outcome: "rejected", reason: status.rejectionReason };
    }

    if (!status.analysisSet) {
        alog.warn("analysis tool was not called");
        return { outcome: "failed", error: "LLM stream completed but set_article_analysis was not called" };
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

    for (let _ = 0; _ < 2; _++) {
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
                failed.push(artifact);
            } else {
                switch (settled.value.outcome) {
                    case "enriched": succeeded.push(artifact); break;
                    case "rejected": rejected.push(artifact); break;
                    case "failed":   failed.push(artifact); break;
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
