import { tool } from "@openrouter/sdk";
import { z } from "zod";
import { readArtifactEnrichment, writeArtifactEnrichment, validateBillIds } from "./database";
import { DEFAULT_ENRICHMENT } from "../config";
import type { ArtifactEnrichment } from "../types";

async function getOrCreateEnrichment(artifactId: string): Promise<ArtifactEnrichment> {
    const enrichment = await readArtifactEnrichment(artifactId);
    return enrichment ?? { ...DEFAULT_ENRICHMENT };
}

function artifactId(ctx: unknown): string {
    return (ctx as { local: { artifactId: string } }).local.artifactId;
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

// ── Tool 1: Set article analysis (all direct-extraction fields at once) ──
export const setArticleAnalysis = tool({
    name: "set_article_analysis",
    description: "Set ALL analysis fields for this article in one call. Every field is required — do not leave any blank.",
    inputSchema: z.object({
        summary: z.string().min(20).describe("2-3 sentence summary of the article's environmental significance. Must be substantive."),
        state: z.string().nullable().describe("U.S. state abbreviation (e.g. 'CA', 'NJ') or null if national/international scope"),
        stakeholders: z.array(z.string()).min(1).describe("Organizations, agencies, or communities involved. At least one required."),
        environmental_topic: environmentalTopicEnum.describe("Primary environmental category"),
        impact_level: impactLevelEnum.describe("Geographic scope of the environmental impact"),
        sentiment: z.number().min(-1).max(1).describe("Environmental impact score: -1 (harmful) to 1 (beneficial). Based on article content, not author tone."),
        key_quote: z.string().nullable().describe("A direct quote from the article capturing environmental significance, or null if none"),
    }),
    contextSchema: z.object({
        artifactId: z.string(),
    }),
    execute: async (params, ctx) => {
        const enrichment = await getOrCreateEnrichment(artifactId(ctx));
        enrichment.summary = params.summary;
        enrichment.state = (params.state === "null" || params.state === "") ? null : params.state;
        enrichment.stakeholders = params.stakeholders;
        enrichment.environmental_topic = params.environmental_topic;
        enrichment.impact_level = params.impact_level;
        enrichment.sentiment = params.sentiment;
        enrichment.key_quote = params.key_quote;
        await writeArtifactEnrichment(artifactId(ctx), enrichment);
        return { success: true, fields_set: 7 };
    },
});

// ── Tool 2: Set associated bills (separate for validation) ───────────
export const setAssociatedBills = tool({
    name: "set_associated_bills",
    description: "Set the list of house bills associated with this article. Only use legislation_numbers returned by search tools — fabricated IDs will be rejected.",
    inputSchema: z.object({
        bills: z.array(z.object({
            legislation_number: z.string().describe("Exact legislation_number from search results, e.g. 'H.R. 123 (119)'"),
            reason: z.string().describe("Short reason phrase, e.g. 'regulates same pollutant', 'directly referenced'"),
        })).describe("Array of bill references, or empty array if none found"),
    }),
    contextSchema: z.object({
        artifactId: z.string(),
    }),
    execute: async ({ bills }, ctx) => {
        if (bills.length === 0) {
            const enrichment = await getOrCreateEnrichment(artifactId(ctx));
            enrichment.associated_bills = [];
            await writeArtifactEnrichment(artifactId(ctx), enrichment);
            return { success: true, field: "associated_bills", count: 0, dropped: 0 };
        }

        const candidateIds = bills.map(b => b.legislation_number);
        const validIds = new Set(await validateBillIds(candidateIds));
        const verified = bills.filter(b => validIds.has(b.legislation_number));
        const dropped = bills.length - verified.length;

        const enrichment = await getOrCreateEnrichment(artifactId(ctx));
        enrichment.associated_bills = verified;
        await writeArtifactEnrichment(artifactId(ctx), enrichment);
        return { success: true, field: "associated_bills", count: verified.length, dropped };
    },
});

export const enrichmentTools = [setArticleAnalysis, setAssociatedBills];
