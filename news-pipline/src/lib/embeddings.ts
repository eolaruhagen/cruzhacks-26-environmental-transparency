import { z } from "zod";
import pino from "pino";
import { readArtifactEnrichment, writeArtifactEmbedding } from "./database";
import { OPENROUTER_EMBEDDINGS_URL, EMBEDDING_MODEL, EMBEDDING_DIMENSIONS } from "../config";
import type { ArtifactType, StagingArtifact } from "../types";

const logger = pino({ name: "embeddings" });

const { OPENROUTER_API_KEY } = process.env;

// ── Embedding API schema ────────────────────────────────────────────

export const EmbeddingResponseSchema = z.object({
    data: z.array(z.object({
        embedding: z.array(z.number()),
    })).min(1, "Embedding API returned empty data array"),
});

export type EmbeddingResponse = z.infer<typeof EmbeddingResponseSchema>;

/**
 * Embed a text string via OpenRouter's embedding API.
 * Returns a vector (dimension set by EMBEDDING_DIMENSIONS config).
 */
export async function embedText(text: string): Promise<number[]> {
    if (!OPENROUTER_API_KEY) throw new Error("OPENROUTER_API_KEY is required");

    const response = await fetch(OPENROUTER_EMBEDDINGS_URL, {
        method: "POST",
        headers: {
            "Authorization": `Bearer ${OPENROUTER_API_KEY}`,
            "Content-Type": "application/json",
        },
        body: JSON.stringify({
            model: EMBEDDING_MODEL,
            input: [text],
            dimensions: EMBEDDING_DIMENSIONS,
        }),
    });

    if (!response.ok) {
        const error = await response.text();
        throw new Error(`Embedding API error: ${response.status} - ${error}`);
    }

    const parsed = EmbeddingResponseSchema.parse(await response.json());
    const { embedding } = parsed.data[0] ?? { embedding: [] };

    if (embedding.length !== EMBEDDING_DIMENSIONS) {
        throw new Error(
            `Embedding dimension mismatch: expected ${EMBEDDING_DIMENSIONS}, got ${embedding.length}`
        );
    }

    return embedding;
}

// ── Embedding content registry ───────────────────────────────────────
// Per artifact type: builds the text that should be embedded.
// Reads enrichment from DB (already written by enrichment tools)
// and combines with metadata for a rich embedding.

type EmbeddingContentFn<K extends ArtifactType> = (artifact: StagingArtifact<K>) => Promise<string | null>;

const embeddingContentRegistry: { [K in ArtifactType]?: EmbeddingContentFn<K> } = {
    article: async (artifact) => {
        const enrichment = await readArtifactEnrichment(artifact.id);

        const parts: string[] = [];

        if (enrichment) {
            parts.push(`Environmental topic: ${enrichment.environmental_topic}`);
        }

        // Title provides event-level specificity (prevents mega-cluster collapse)
        parts.push(artifact.metadata.title);

        // Summary is the main semantic content (LLM-generated from full article)
        if (enrichment?.summary) {
            parts.push(`Summary: ${enrichment.summary}`);
        }

        const topics = Array.isArray(artifact.metadata.topics) ? artifact.metadata.topics : [];
        if (topics.length > 0) {
            parts.push(`Topics: ${topics.join(", ")}`);
        }

        if (enrichment) {
            const stakeholders = Array.isArray(enrichment.stakeholders) ? enrichment.stakeholders : [];
            if (stakeholders.length > 0) {
                parts.push(`Stakeholders: ${stakeholders.join(", ")}`);
            }
        }

        return parts.join("\n\n");
    },
};

/**
 * Generate and store an embedding for a staging artifact.
 * Uses the artifact type registry to determine what content gets embedded.
 * Writes the embedding directly to the artifact row in the DB.
 *
 * Must be called BEFORE advancing status to "enriched"
 * (constraint: ck_embedding_when_enriched).
 */
export async function generateArtifactEmbedding<K extends ArtifactType>(
    artifact: StagingArtifact<K>,
): Promise<boolean> {
    const contentFn = embeddingContentRegistry[artifact.type];
    if (!contentFn) {
        logger.error({ type: artifact.type }, "no embedding content function registered");
        return false;
    }

    const text = await (contentFn as EmbeddingContentFn<K>)(artifact);
    if (!text) {
        logger.warn({ artifactId: artifact.id }, "embedding content was empty");
        return false;
    }

    const embedding = await embedText(text);
    const embeddingStr = `[${embedding.join(",")}]`;

    await writeArtifactEmbedding(artifact.id, embeddingStr);

    return true;
}
