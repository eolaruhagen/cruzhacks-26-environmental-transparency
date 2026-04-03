import { tool } from "@openrouter/sdk";
import { z } from "zod";
import { searchBillsByTextQuery, searchBillsBySponsorQuery, searchBillsByVectorQuery } from "./database";
import { embedText } from "./embeddings";

const billTypeEnum = z.enum([
    "air_and_atmosphere",
    "water_resources",
    "waste_and_toxics",
    "energy_and_resources",
    "land_and_conservation",
    "disaster_and_emergency",
    "climate_and_emissions",
    "justice_and_environment",
]);

// ── Tool 1: Text search with optional category ──────────────────────
export const searchBillsByText = tool({
    name: "search_bills_by_text",
    description: "Search house bills by text patterns across title, summary, and subject terms. Use ILIKE patterns with % wildcards. Optionally filter by environmental category.",
    inputSchema: z.object({
        patterns: z.array(z.string()).optional().default([]).describe("ILIKE patterns, e.g. ['%clean water%', '%EPA regulation%']"),
        category: billTypeEnum.optional().describe("Optional environmental category to narrow results"),
        limit: z.number().optional().default(10).describe("Max results to return (default: 10) cannot be more than 75"),
    }),
    execute: async ({ patterns, category, limit }) => {
        return await searchBillsByTextQuery(patterns, category, Math.min(limit, 75));
    },
});

// ── Tool 2: Sponsor / cosponsor search ──────────────────────────────
export const searchBillsBySponsor = tool({
    name: "search_bills_by_sponsor",
    description: "Search house bills by sponsor or cosponsor name patterns. Use ILIKE patterns with % wildcards for partial matching.",
    inputSchema: z.object({
        patterns: z.array(z.string()).describe("ILIKE patterns for names, e.g. ['%Smith%', '%Garcia%']"),
        category: billTypeEnum.optional().describe("Optional environmental category to narrow results"),
        party: z.string().optional().describe("Optional party filter, e.g. 'Democrat' or 'Republican'"),
        limit: z.number().optional().default(10).describe("Max results to return"),
    }),
    execute: async ({ patterns, category, party, limit }) => {
        return await searchBillsBySponsorQuery(patterns, category, party, limit);
    },
});

// ── Tool 3: Vector similarity search ────────────────────────────────
export const searchBillsByVector = tool({
    name: "search_bills_by_vector",
    description: "Semantic search over house bills using vector similarity. Provide a natural language query describing the legislation you're looking for. The query is embedded and compared against bill embeddings.",
    inputSchema: z.object({
        query: z.string().describe("Natural language description of the legislation to search for"),
        category: billTypeEnum.optional().describe("Optional environmental category to narrow results"),
        limit: z.number().optional().default(10).describe("Max results to return"),
        similarityThreshold: z.number().optional().default(0.3).describe("Minimum cosine similarity (0-1, lower = more permissive)"),
    }),
    execute: async ({ query, category, limit, similarityThreshold }) => {
        const queryEmbedding = await embedText(query);
        const embeddingStr = `[${queryEmbedding.join(",")}]`;
        return await searchBillsByVectorQuery(embeddingStr, category, limit, similarityThreshold);
    },
});

export const billTools = [searchBillsByText, searchBillsBySponsor, searchBillsByVector];
