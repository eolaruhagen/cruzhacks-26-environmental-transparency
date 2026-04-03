import pino from "pino";
import { stepCountIs } from "@openrouter/sdk";
import {
    acquireBatchWithRetries,
    advanceArtifactStatus,
    releaseArtifactLocksWithRetry,
    moveToFailedArtifacts,
    readArtifactEnrichmentAndEmbedding,
} from "../lib/database";
import { ModelStream } from "../lib/llm";
import { billTools } from "../lib/bill-tools";
import { enrichmentTools } from "../lib/enrichment-tools";
import { scrapeArticle } from "../lib/jina";
import { generateArtifactEmbedding } from "../lib/embeddings";
import { ENRICH_BATCH_SIZE, ENRICH_WORKER_ID, ENRICH_MODEL, ENRICH_MAX_STEPS, MAX_ARTIFACT_RETRY } from "../config";
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
const ENRICH_SYSTEM_PROMPT = `You are an enrichment agent for an environmental transparency platform. You receive a news article and must extract structured data by calling exactly 2 tool functions.

WORKFLOW — follow this exact sequence:
1. Read the article.
2. Search for related house bills (use 1-2 search tools: search_bills_by_text, search_bills_by_vector, or search_bills_by_sponsor).
3. Call set_article_analysis with ALL analysis fields filled in.
4. Call set_associated_bills with the bills you found (or empty array if none).

TOOL 1: set_article_analysis — You MUST fill every field:
- summary: 2-3 substantive sentences about the article's environmental significance
- state: U.S. state abbreviation or null if national/international
- stakeholders: organizations, agencies, communities (at least one)
- environmental_topic: choose carefully from the enum — not everything is climate_and_emissions
- impact_level: local (city/county), state, national, or international
- sentiment: -1 to 1 based on environmental IMPACT in the content (not author tone)
- key_quote: a direct quote from the article, or null only if truly none exists

TOOL 2: set_associated_bills — bills from your search results:
- legislation_number: exact format from search results, e.g. "H.R. 123 (119)"
- reason: short phrase explaining the connection (few words, not a sentence)
- Empty array if no relevant bills found

Do not write prose. Only make tool calls.`;

async function enrichArtifact<K extends ArtifactType>(
    artifact: StagingArtifact<K>,
    contentFn: EnrichmentContentFn<K>,
    workerId: string,
): Promise<{ success: boolean; error?: string }> {
    const alog = logger.child({ workerId, artifactId: artifact.id });

    alog.debug("starting content scrape");
    const content = await contentFn(artifact);

    if (!content) {
        alog.debug("scrape returned no content");
        return { success: false, error: "scrape returned no content" };
    }
    alog.debug({ contentLength: content.length }, "scrape complete");

    // Build per-tool context — every enrichment tool needs the artifact ID
    const enrichmentContext: Record<string, Record<string, unknown>> = {};
    for (const t of enrichmentTools) {
        enrichmentContext[t.function.name] = { artifactId: artifact.id };
    }

    alog.debug("starting LLM enrichment stream");
    const result = new ModelStream()
        .model(ENRICH_MODEL)
        .instructions(ENRICH_SYSTEM_PROMPT)
        .input(content)
        .reasoning({ effort: "high" })
        .tools([...billTools, ...enrichmentTools])
        .stopWhen([stepCountIs(ENRICH_MAX_STEPS)])
        .context(enrichmentContext as any)
        .execute();

    await result.getText();
    alog.debug("LLM stream complete");

    // Verify enrichment was actually written by the tools
    // (model may complete without calling any enrichment tools)
    const dbState = await readArtifactEnrichmentAndEmbedding(artifact.id);
    alog.debug({
        hasEnrichment: !!dbState?.enrichment,
        hasEmbedding: !!dbState?.embedding,
    }, "post-LLM DB state check");

    if (!dbState?.enrichment) {
        alog.warn("enrichment is null after LLM stream — tools were not called");
        return { success: false, error: "LLM stream completed but enrichment tools were not called" };
    }

    // Generate embedding BEFORE advancing to "enriched" status
    // (constraint: ck_embedding_when_enriched requires embedding IS NOT NULL)
    alog.debug("generating embedding");
    const embedded = await generateArtifactEmbedding(artifact);
    if (!embedded) {
        alog.warn("embedding generation failed");
        return { success: false, error: "embedding generation failed" };
    }

    // Final verification — both must exist before we return success
    const verify = await readArtifactEnrichmentAndEmbedding(artifact.id);
    if (!verify?.enrichment || !verify?.embedding) {
        alog.error({
            hasEnrichment: !!verify?.enrichment,
            hasEmbedding: !!verify?.embedding,
        }, "final verification failed — data missing before status advance");
        return { success: false, error: "final verification: enrichment or embedding missing" };
    }

    alog.debug("enrichment complete — ready for status advance");
    return { success: true };
}

export async function enrichWorker<K extends ArtifactType>(artifactType: K) {
    const contentFn = getEnrichmentContentFn(artifactType);
    const workerId = ENRICH_WORKER_ID + "-" + artifactType + "-" + Math.random().toString(36).substring(2, 15);

    let totalEnriched = 0;
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

        // Run enrichments in parallel — one per artifact in the batch
        const results = await Promise.allSettled(
            batch.map(artifact => enrichArtifact(artifact, contentFn, workerId))
        );

        const succeeded: StagingArtifact<K>[] = [];
        const failed: StagingArtifact<K>[] = [];

        for (let i = 0; i < results.length; i++) {
            const result = results[i]!;
            const artifact = batch[i]!;

            if (result.status === "fulfilled" && result.value.success) {
                succeeded.push(artifact);
            } else {
                const reason = result.status === "rejected"
                    ? result.reason?.message ?? "unknown"
                    : result.value.error ?? "unknown";
                logger.warn({ artifactId: artifact.id, reason }, "enrichment failed");
                failed.push(artifact);
            }
        }

        // Advance successful artifacts to "enriched" status
        // Data columns (enrichment, embedding) already written to DB by tools/embedding fn
        // — use advanceArtifactStatus to only change status + clear lock, not overwrite data
        if (succeeded.length > 0) {
            await advanceArtifactStatus(succeeded.map(a => a.id), workerId, "enriched");
            totalEnriched += succeeded.length;
        }

        // Handle failures — retry or move to failed
        for (const artifact of failed) {
            if (artifact.retry_attempts + 1 >= MAX_ARTIFACT_RETRY) {
                await moveToFailedArtifacts([artifact], workerId);
                totalFailed++;
            } else {
                await releaseArtifactLocksWithRetry([artifact.id], workerId);
            }
        }

        logger.info({
            enriched: succeeded.length,
            failed: failed.length,
            totalEnriched,
            totalFailed,
        }, "batch complete");
    }

    logger.info({ totalEnriched, totalFailed }, `enrich worker complete for ${artifactType}`);
}
