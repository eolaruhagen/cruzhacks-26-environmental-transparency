import { tool } from "@openrouter/sdk";
import { z } from "zod";
import { readArtifactEnrichment, writeArtifactEnrichment, validateBillIds } from "./database";
import { DEFAULT_ENRICHMENT } from "../config";
import type { ArtifactEnrichment, StagingArtifact, ArtifactType } from "../types";

async function getOrCreateEnrichment(artifactId: string): Promise<ArtifactEnrichment> {
    const enrichment = await readArtifactEnrichment(artifactId);
    return enrichment ?? { ...DEFAULT_ENRICHMENT };
}

// ── Shared schemas ───────────────────────────────────────────────────
const environmentalTopicEnum = z.enum([
    "air_and_atmosphere",
    "water_resources",
    "waste_and_toxics",
    "energy_and_resources",
    "land_and_conservation",
    "disaster_and_emergency",
    "climate_and_emissions",
    "justice_and_environment",
]);

const impactLevelEnum = z.enum(["local", "state", "national", "international"]);

// ── Status object returned alongside tools ───────────────────────────
export interface EnrichmentStatus {
    rejected: boolean;
    rejectionReason: string;
    enriched: boolean;
}

/**
 * Creates enrichment tools scoped to a single artifact.
 * Two tools: reject_article (delete) or enrich_article (set everything at once).
 * Each call returns fresh tools + a status object closed over by the tool execute fns.
 */
export function createEnrichmentTools<K extends ArtifactType>(artifact: StagingArtifact<K>) {
    const status: EnrichmentStatus = {
        rejected: false,
        rejectionReason: "",
        enriched: false,
    };

    const rejectArticle = tool({
        name: "reject_article",
        description: "PERMANENTLY DELETE this article from the pipeline. Only call this if the article is NOT environmentally relevant. Do NOT call this for relevant articles — use enrich_article instead.",
        inputSchema: z.object({
            reason: z.string().describe("Why this article is not environmentally relevant, e.g. 'weather forecast', 'pet story', 'paywalled content'"),
        }),
        execute: async ({ reason }) => {
            if (status.enriched) {
                return { rejected: false, ignored: true, reason: "already enriched — cannot reject" };
            }
            status.rejected = true;
            status.rejectionReason = reason;
            return { rejected: true, reason };
        },
    });

    const enrichArticle = tool({
        name: "enrich_article",
        description: "Set ALL enrichment fields for this article in a single call. Every field is required. Use bill legislation_numbers from search tool results only — fabricated IDs will be dropped.",
        inputSchema: z.object({
            summary: z.string().min(20).describe("2-3 sentence summary of the article's environmental significance."),
            state: z.string().nullable().describe("U.S. state abbreviation (e.g. 'CA', 'NJ') or null if national/international scope"),
            stakeholders: z.array(z.string()).min(1).describe("Organizations, agencies, or communities involved. At least one required."),
            environmental_topic: environmentalTopicEnum.describe("Primary environmental category — choose carefully, not everything is climate_and_emissions"),
            impact_level: impactLevelEnum.describe("Geographic scope: local (city/county), state, national, or international"),
            sentiment: z.number().min(-1).max(1).describe("Environmental IMPACT score: -1 (harmful) to 1 (beneficial). Based on article content, not author tone."),
            key_quote: z.string().nullable().describe("A direct quote from the article, or null if none exists"),
            associated_bills: z.array(z.object({
                legislation_number: z.string().describe("Exact legislation_number from search results, e.g. 'H.R. 123 (119)'"),
                reason: z.string().describe("Short reason phrase, e.g. 'regulates same pollutant'"),
            })).describe("Bills from search results, or empty array if none found"),
        }),
        execute: async (params) => {
            if (status.rejected) {
                return { success: false, ignored: true, reason: "article was already rejected" };
            }

            const enrichment = await getOrCreateEnrichment(artifact.id);

            // Set analysis fields
            enrichment.summary = params.summary;
            enrichment.state = (params.state === "null" || params.state === "") ? null : params.state;
            enrichment.stakeholders = params.stakeholders;
            enrichment.environmental_topic = params.environmental_topic;
            enrichment.impact_level = params.impact_level;
            enrichment.sentiment = params.sentiment;
            enrichment.key_quote = params.key_quote;

            // Validate and set associated bills
            const bills = params.associated_bills ?? [];
            if (bills.length > 0) {
                const candidateIds = bills.map(b => b.legislation_number);
                const validIds = new Set(await validateBillIds(candidateIds));
                enrichment.associated_bills = bills.filter(b => validIds.has(b.legislation_number));
            } else {
                enrichment.associated_bills = [];
            }

            await writeArtifactEnrichment(artifact.id, enrichment);
            status.enriched = true;

            const dropped = bills.length - enrichment.associated_bills.length;
            return { success: true, fields_set: 8, bills_validated: enrichment.associated_bills.length, bills_dropped: dropped };
        },
    });

    return {
        tools: [rejectArticle, enrichArticle],
        status,
    };
}
