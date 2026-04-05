import pino from "pino";
import {
    findMostSimilarStory,
    createStory,
    updateStoryCentroid,
    getStoryArticleCount,
    getStoryCentroid,
} from "./database";
import { generateStoryName } from "./llm";
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
    const embeddingStr = formatEmbedding(artifact.embedding);
    // postgres.js returns halfvec as string — always parse to number[] for math
    const embeddingVec = parseEmbedding(artifact.embedding);

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
    const centroidStr = await getStoryCentroid(storyId);

    if (!centroidStr) {
        logger.warn({ storyId }, "story has no centroid, overwriting with new embedding");
        await updateStoryCentroid(storyId, formatEmbedding(newEmbedding));
        return;
    }

    const oldCentroid = parseCentroid(centroidStr);
    const newCount = oldCount + 1;
    const updated = computeRunningAverage(oldCentroid, oldCount, newEmbedding, newCount);
    await updateStoryCentroid(storyId, `[${updated.join(",")}]`);
}

function computeRunningAverage(
    oldCentroid: number[],
    oldCount: number,
    newEmbedding: number[],
    newCount: number,
): number[] {
    return oldCentroid.map((v, i) => (v * oldCount + newEmbedding[i]!) / newCount);
}

function parseCentroid(centroidStr: string): number[] {
    return centroidStr.replace(/[\[\]]/g, "").split(",").map(Number);
}

function formatEmbedding(embedding: number[] | string | null): string {
    if (typeof embedding === "string") return embedding;
    if (!embedding) throw new Error("Cannot format null embedding");
    return `[${embedding.join(",")}]`;
}

/** Parse an embedding that may be a string (from postgres halfvec) or already a number[] */
function parseEmbedding(embedding: number[] | string | null): number[] {
    if (!embedding) throw new Error("Cannot parse null embedding");
    if (Array.isArray(embedding)) return embedding;
    return embedding.replace(/[\[\]]/g, "").split(",").map(Number);
}
