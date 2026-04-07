import pino from "pino";
import {
    findMostSimilarStory,
    createStory,
    updateStoryCentroid,
    getStoryArticleCount,
    getStoryCentroid,
} from "./database";
import { generateStoryName } from "./llm";
import { EMBEDDING_DIMENSIONS } from "../config";
import type { ArtifactType, StagingArtifact } from "../types";

const logger = pino({ name: "story-clustering" });

export interface StoryAssignment {
    storyId: string;
    created: boolean;
}

/**
 * Assign an artifact to an existing story or create a new one.
 * Returns the story ID and whether a new story was created.
 */
export async function assignToStory<K extends ArtifactType>(
    artifact: StagingArtifact<K>,
    threshold: number,
): Promise<StoryAssignment> {
    if (!artifact.embedding) throw new Error(`Artifact ${artifact.id} has null embedding`);
    const embeddingStr = formatEmbedding(artifact.embedding, EMBEDDING_DIMENSIONS);
    const embeddingVec = artifact.embedding;

    const match = await findMostSimilarStory(embeddingStr, threshold);

    if (match) {
        logger.info({ storyId: match.id, storyName: match.name, similarity: match.similarity }, "matched existing story");
        await updateCentroidRunningAverage(match.id, embeddingVec);
        return { storyId: match.id, created: false };
    }

    const name = await generateStoryName(artifact);
    logger.info({ name }, "creating new story");
    const storyId = await createStory(name, embeddingStr);
    return { storyId, created: true };
}

/**
 * Compute a running average centroid and write it back.
 * new_centroid[i] = (old_centroid[i] * oldCount + new_embedding[i]) / newCount
 */
async function updateCentroidRunningAverage(storyId: string, newEmbedding: number[]): Promise<void> {
    const oldCount = await getStoryArticleCount(storyId);
    const oldCentroid = await getStoryCentroid(storyId);

    if (!oldCentroid) {
        logger.warn({ storyId }, "story has no centroid, overwriting with new embedding");
        await updateStoryCentroid(storyId, formatEmbedding(newEmbedding, EMBEDDING_DIMENSIONS));
        return;
    }

    const newCount = oldCount + 1;
    const updated = computeRunningAverage(oldCentroid, oldCount, newEmbedding, newCount);
    await updateStoryCentroid(storyId, formatEmbedding(updated, EMBEDDING_DIMENSIONS));
}

export function computeRunningAverage(
    oldCentroid: number[],
    oldCount: number,
    newEmbedding: number[],
    newCount: number,
): number[] {
    return oldCentroid.map((v, i) => (v * oldCount + newEmbedding[i]!) / newCount);
}

export function formatEmbedding(embedding: number[], dims?: number): string {
    if (dims !== undefined && embedding.length !== dims) {
        throw new Error(`formatEmbedding: expected ${dims} dimensions, got ${embedding.length}`);
    }
    return `[${embedding.join(",")}]`;
}

