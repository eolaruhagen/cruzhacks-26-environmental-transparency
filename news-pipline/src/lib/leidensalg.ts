// TODO story clustering -> assume that embeddings have already been mean reduced when we are at this stage.
// what does this interfact look like?
// step 1 -> pull all artifact embeddings from public. tabe that fit the criteria of being added to the network (assigned to a story created within the last week.)
// step 2 -> pull ALL artifacts that have been enriched in the DB (need story assignment)
// step 3 -> run pairwise cosine similarity on all artifacts and embeddings pulled. (use threshold similarity for edge creation ~0.85)
// step 4 -> run leiden algorithm on the graph created in step 3.
// step 5 -> consolidate changes
import { type Node, type Link, NetworkClustering } from "networkanalysis-ts/run";
import { pullPublicArtifactsForLeiden, pullAllEnrichedArtifacts, timedQuery } from "./database";
import { STORY_SIMILARITY_THRESHOLD } from "../config";



/**
 * Build a unified map of article IDs to their story assignment and embeddings for clustering.
 * Combines already published artifacts with enriched-but-unassigned artifacts into a single lookup.
 *
 * The map keys are artifact IDs and the values include the current story ID (if any) and embedding vector.
 * If either underlying query fails, this function throws an error instead of returning partial results.
 */
export async function createStoryClusteringArticleMap(): Promise<Map<string, { storyId: string | null, embedding: number[] }>> {
    const articleMap = new Map<string, { storyId: string | null, embedding: number[] }>();

    const [publicArtifacts, enrichedArtifacts] = await Promise.all([
        timedQuery("pullPublicArtifactsForLeiden", pullPublicArtifactsForLeiden),
        timedQuery("pullAllEnrichedArtifacts", pullAllEnrichedArtifacts)
    ]);

    if (!publicArtifacts.ok || !enrichedArtifacts.ok) {
        throw new Error("Failed to pull artifacts for story clustering");
    }

    publicArtifacts.data.forEach(artifact => {
        articleMap.set(artifact.id, { storyId: artifact.storyId, embedding: artifact.embedding });
    });

    enrichedArtifacts.data.forEach(artifact => {
        articleMap.set(artifact.id, { storyId: null, embedding: artifact.embedding });
    });

    return articleMap;
}


function cosineSimilarity(vecA: number[], vecB: number[]): number {
    if (vecA.length !== vecB.length) {
        throw new Error("Vectors must have the same dimension");
    }

    let dotProduct = 0;
    let normA = 0;
    let normB = 0;

    for (let i = 0; i < vecA.length; i++) {
        if (vecA[i] === undefined || vecB[i] === undefined) {
            throw new Error("Vectors must not contain undefined values");
        }
        dotProduct += vecA[i]! * vecB[i]!;
        normA += vecA[i]! * vecA[i]!;
        normB += vecB[i]! * vecB[i]!;
    }

    const denominator = Math.sqrt(normA) * Math.sqrt(normB);

    if (denominator === 0) {
        return 0;
    }

    return dotProduct / denominator;
}

export function createPairWiseSimilarities(articleMap: Map<string, { storyId: string | null, embedding: number[] }>): { nodes: Node[], links: Link[] } {
    const articleIds = Array.from(articleMap.keys());

    // Build all Node objects first so links can reference them
    const nodes: Node[] = articleIds.map(id => ({ id }));
    const links: Link[] = [];

    for (let i = 0; i < articleIds.length; i++) {
        for (let j = i + 1; j < articleIds.length; j++) {
            // should be valid non-null assertions here -- articleIds is derived from articleMap.keys() & indexes i/j are bounded by length
            // HOW DO I HANDLE THE THROW HERE? LET CALLER CATCH IT?
            const similarity = cosineSimilarity(articleMap.get(articleIds[i]!)!.embedding, articleMap.get(articleIds[j]!)!.embedding);
            if (similarity > STORY_SIMILARITY_THRESHOLD) {
                links.push({
                    node1: nodes[i]!,
                    node2: nodes[j]!,
                    weight: similarity,
                });
            }
        }
    }
    return { nodes, links };
}


/**
 * Returns the mutated Node[] array with an assigned "cluster" property on the Node objects
 */
export function runLeidenClustering(nodes: Node[], links: Link[]) {
    new NetworkClustering()
        .data(nodes, links)
        .qualityFunction("CPM")
        .algorithm("Leiden")
        .normalization("AssociationStrength")
        .minClusterSize(1)
        .iterations(50)
        .resolution(0.008)
        .randomness(0.01)
        .seed(42)
        .run();
    return nodes;
}

/**
 * Result of rule application to cluster assignments returned by some community detection Algorithm
 * In our case specifically the Leiden Algorithm
 */
export interface ClusteringConsolidation {
    /** Existing stories with new articles assigned to them (either pulled from other story and/or pulls unassigned artifacts*/
    updateStories: Map<string, {
        newPublicTableArtifactIds: string[],
        newPipelineArtifactIds: string[]
    }>
    /** Stories whos entire content has been re-assigned to other stories (i.e storyIds.len() === 0)*/
    deleteStories: string[]
    /** Stories that were created as a result of the clustering algorithm */
    /* I.e. a cluster of articles that were previously unassigned to any story or a cluster made of 50% or more unassigned articles*/
    newStories: {
        publicTableArtifactIds: string[],
        pipelineArtifactIds: string[]
    }[]
}

interface PartialClusteringConsolidation {
    updateStories: Map<string, {
        newPublicTableArtifactIds: string[],
        newPipelineArtifactIds: string[]
    }>
    removeFromStory: Map<string, {
        publicTableArtifactIds: string[]
    }>
    newStories: {
        publicTableArtifactIds: string[],
        pipelineArtifactIds: string[]
    }[]
}

/** Whether an artifact currently lives in the public table or pipeline staging */
function isPublicArtifact(storyId: string | null): boolean {
    return storyId !== null;
}

/**
 * Apply rules to Leiden cluster assignments to produce the set of story mutations
 * (updates, creations, deletions) needed to reconcile clusters with existing stories.
 *
 * Classification rules per cluster:
 * - If a cluster has a majority (>50%) of members from one existing story → UPDATE that story
 * - Otherwise → NEW story (including clusters of all-pipeline artifacts)
 *
 * Artifacts that leave their original story are tracked in removeFromStory
 * so deriveDeletedStories can detect fully-emptied stories.
 */
export function consolidateClusters(
    nodes: Node[],
    articleMap: Map<string, { storyId: string | null, embedding: number[] }>,
): ClusteringConsolidation {
    // first we have to make a map of the clusters created by leidens
    const clusterGroups = new Map<number, string[]>();
    for (const node of nodes) {
        if (node.cluster === undefined) {
            // i love my non-null assertions so safe :) 
            console.warn(`unclustered node found??? with id ${node.id} is public artifact (t/f): ${isPublicArtifact(articleMap.get(String(node.id))!.storyId)}`);
            continue
        };
        const id = String(node.id);
        let group = clusterGroups.get(node.cluster);
        if (!group) {
            group = [];
            clusterGroups.set(node.cluster, group);
        }
        group.push(id);
    }

    const partial: PartialClusteringConsolidation = {
        updateStories: new Map(),
        removeFromStory: new Map(),
        newStories: [],
    };

    for (const [, memberIds] of clusterGroups) {
        // Count how many members belong to each existing story
        const storyVotes = new Map<string, number>();
        let totalWithStory = 0;

        // then iterate through members of a group and count story membership
        for (const id of memberIds) {
            const entry = articleMap.get(id)!;
            if (isPublicArtifact(entry.storyId)) {
                // non-null assertial -> storyId cannot be null when reaching here
                storyVotes.set(entry.storyId!, (storyVotes.get(entry.storyId!) ?? 0) + 1);
                totalWithStory++;
            }
        }

        // Find the story with the most votes (if any) -> if its all unassigned articles, winningStoryId will be null
        let winningStoryId: string | null = null;
        let winningCount = 0;
        for (const [storyId, count] of storyVotes) {
            if (count > winningCount) {
                winningStoryId = storyId;
                winningCount = count;
            }
        }

        // winning story must have more than 50% of the cluster's members
        const isMajority = winningStoryId !== null && winningCount > memberIds.length / 2;

        // Partition members into public-table vs pipeline-table IDs
        const publicIds: string[] = [];
        const pipelineIds: string[] = [];
        for (const id of memberIds) {
            const entry = articleMap.get(id)!;
            if (isPublicArtifact(entry.storyId)) {
                publicIds.push(id);
            } else {
                pipelineIds.push(id);
            }
        }

        // when there is a winning story -> i.e must be updated in some way
        if (isMajority && winningStoryId !== null) {
            const newPublic = publicIds.filter(id => articleMap.get(id)!.storyId !== winningStoryId);
            const existing = partial.updateStories.get(winningStoryId);
            if (existing) {
                existing.newPublicTableArtifactIds.push(...newPublic);
                existing.newPipelineArtifactIds.push(...pipelineIds);
            } else {
                partial.updateStories.set(winningStoryId, {
                    newPublicTableArtifactIds: newPublic,
                    newPipelineArtifactIds: pipelineIds,
                });
            }

            // find articles to be removed from its original storiy
            for (const id of newPublic) {
                // valid non-null assertion here???? Idk man.
                const originalStoryId = articleMap.get(id)!.storyId!;
                const removal = partial.removeFromStory.get(originalStoryId);
                if (removal) {
                    removal.publicTableArtifactIds.push(id);
                } else {
                    partial.removeFromStory.set(originalStoryId, { publicTableArtifactIds: [id] });
                }
            }
        } else {
            // when no winning story its gotta be new
            partial.newStories.push({
                publicTableArtifactIds: publicIds,
                pipelineArtifactIds: pipelineIds,
            });

            // All public artifacts in this cluster are leaving their original story
            for (const id of publicIds) {
                const originalStoryId = articleMap.get(id)!.storyId!;
                const removal = partial.removeFromStory.get(originalStoryId);
                if (removal) {
                    removal.publicTableArtifactIds.push(id);
                } else {
                    partial.removeFromStory.set(originalStoryId, { publicTableArtifactIds: [id] });
                }
            }
        }
    }

    // finally turn partial consolidation into full consolidation by finding stories to delete
    return deriveDeletedStories(partial, articleMap);
}

/**
 * Build a reverse index of storyId → set of public artifact IDs from the articleMap,
 * then subtract removals to find stories that have been fully emptied.
 */
function deriveDeletedStories(
    partial: PartialClusteringConsolidation,
    articleMap: Map<string, { storyId: string | null, embedding: number[] }>,
): ClusteringConsolidation {
    // Reverse index: storyId → all public artifact IDs originally under that story
    const storyMemberCounts = new Map<string, number>();
    for (const [, entry] of articleMap) {
        if (!isPublicArtifact(entry.storyId)) continue;
        // non-null assertion -> storyId cannot be null when reaching here
        storyMemberCounts.set(entry.storyId!, (storyMemberCounts.get(entry.storyId!) ?? 0) + 1);
    }

    // Subtract removals
    for (const [storyId, removal] of partial.removeFromStory) {
        const current = storyMemberCounts.get(storyId) ?? 0;
        storyMemberCounts.set(storyId, current - removal.publicTableArtifactIds.length);
    }

    // Stories at zero or below are fully emptied → delete
    const deleteStories: string[] = [];
    for (const [storyId, remaining] of storyMemberCounts) {
        if (remaining <= 0) {
            deleteStories.push(storyId);
        }
    }

    return {
        updateStories: partial.updateStories,
        deleteStories,
        newStories: partial.newStories,
    };
}