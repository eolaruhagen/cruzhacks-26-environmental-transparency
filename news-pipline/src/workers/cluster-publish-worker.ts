import pino from "pino";
import {
    publishArticleArtifact,
    createStory,
    reassignArtifactStories,
    deleteEmptyStories,
    pullStagingArtifactsByIds,
    pullPublicArtifactNamingContext,
    withPgRetry,
} from "../lib/database";
import {
    createStoryClusteringArticleMap,
    createPairWiseSimilarities,
    runLeidenClustering,
    consolidateClusters,
    type ClusteringConsolidation,
} from "../lib/leidensalg";
import { generateStoryName, artifactsToNamingContext, type StoryNamingContext } from "../lib/llm";
import { formatEmbedding } from "../lib/parse-utils";
import { EMBEDDING_DIMENSIONS } from "../config";
import type { ArtifactType, StagingArtifact } from "../types";

const logger = pino({ name: "cluster-publish-worker", level: process.env.LOG_LEVEL ?? "info" });

const ZERO_CENTROID = formatEmbedding(new Array(EMBEDDING_DIMENSIONS).fill(0), EMBEDDING_DIMENSIONS);

/**
 * create new stories and publish their artifacts.
 * For each new story make a name from its member articles, create the story row,
 * then reassign any public artifacts and publish any pipeline artifacts.
 */
async function executeNewStories(
    newStories: ClusteringConsolidation["newStories"],
): Promise<{ storiesCreated: number; artifactsPublished: number; artifactsReassigned: number }> {
    let storiesCreated = 0;
    let artifactsPublished = 0;
    let artifactsReassigned = 0;

    for (const story of newStories) {
        const pipelineArtifacts = await withPgRetry(() =>
            pullStagingArtifactsByIds<"article">(story.pipelineArtifactIds)
        );

        // pull naming context from both public and pipeline artifacts
        const publicContext = await withPgRetry(() =>
            pullPublicArtifactNamingContext(story.publicTableArtifactIds)
        );
        const pipelineContext = artifactsToNamingContext(pipelineArtifacts);
        const namingContext: StoryNamingContext[] = [...publicContext, ...pipelineContext];

        const name = await generateStoryName(namingContext);
        const storyId = await withPgRetry(() => createStory(name, ZERO_CENTROID));
        storiesCreated++;
        logger.info({ storyId, name, publicCount: story.publicTableArtifactIds.length, pipelineCount: story.pipelineArtifactIds.length }, "created new story");

        // reassign existing public artifacts to the new story
        if (story.publicTableArtifactIds.length > 0) {
            const reassigned = await withPgRetry(() =>
                reassignArtifactStories(story.publicTableArtifactIds, storyId)
            );
            artifactsReassigned += reassigned;
        }

        // publish pipeline artifacts into the new story
        for (const artifact of pipelineArtifacts) {
            await withPgRetry(() => publishArticleArtifact(artifact, storyId));
            artifactsPublished++;
        }
    }

    return { storiesCreated, artifactsPublished, artifactsReassigned };
}

/**
 * update stories via artifact publishing and reassignment
 */
async function executeStoryUpdates(
    updateStories: ClusteringConsolidation["updateStories"],
): Promise<{ artifactsPublished: number; artifactsReassigned: number }> {
    let artifactsPublished = 0;
    let artifactsReassigned = 0;

    for (const [storyId, update] of updateStories) {
        // reassign public artifacts from other stories to this one
        if (update.newPublicTableArtifactIds.length > 0) {
            const reassigned = await withPgRetry(() =>
                reassignArtifactStories(update.newPublicTableArtifactIds, storyId)
            );
            artifactsReassigned += reassigned;
            logger.info({ storyId, reassigned }, "reassigned public artifacts to existing story");
        }

        // publish pipeline artifacts into this story
        if (update.newPipelineArtifactIds.length > 0) {
            const pipelineArtifacts = await withPgRetry(() =>
                // shouldnt have hard typed artifact type here but whatever TODO LATER
                pullStagingArtifactsByIds<"article">(update.newPipelineArtifactIds)
            );
            for (const artifact of pipelineArtifacts) {
                // same issue here
                await withPgRetry(() => publishArticleArtifact(artifact, storyId));
                artifactsPublished++;
            }
            logger.info({ storyId, published: pipelineArtifacts.length }, "published pipeline artifacts to existing story");
        }
    }

    return { artifactsPublished, artifactsReassigned };
}

/**
 * delete stories that have had all of their artifacts stripped
 */
async function executeStoryDeletions(deleteStories: string[]): Promise<{ deleted: number; skipped: string[] }> {
    if (deleteStories.length === 0) return { deleted: 0, skipped: [] };

    const result = await withPgRetry(() => deleteEmptyStories(deleteStories));
    logger.info({ deleted: result.deleted, skipped: result.skipped.length, requested: deleteStories.length }, "story deletion phase complete");
    return result;
}

export async function clusterPublishWorker<K extends ArtifactType>(artifactType: K) {
    const clusteringArticleMap = await createStoryClusteringArticleMap();

    if (clusteringArticleMap.size === 0) {
        logger.info("no artifacts to cluster, exiting");
        return;
    }

    const { nodes, links } = createPairWiseSimilarities(clusteringArticleMap);
    logger.info({ nodes: nodes.length, links: links.length }, "pairwise similarities computed");

    const clusteredNodes = runLeidenClustering(nodes, links);
    const results = consolidateClusters(clusteredNodes, clusteringArticleMap);

    logger.info({
        newStories: results.newStories.length,
        updateStories: results.updateStories.size,
        deleteStories: results.deleteStories.length,
    }, "consolidation complete");

    const newResults = await executeNewStories(results.newStories);
    logger.info(newResults, "new stories phase complete");

    const updateResults = await executeStoryUpdates(results.updateStories);
    logger.info(updateResults, "story updates phase complete");

    const deleteResult = await executeStoryDeletions(results.deleteStories);

    logger.info({
        storiesCreated: newResults.storiesCreated,
        storiesDeleted: deleteResult.deleted,
        storiesSkipped: deleteResult.skipped,
        storiesUpdated: results.updateStories.size,
        totalPublished: newResults.artifactsPublished + updateResults.artifactsPublished,
        totalReassigned: newResults.artifactsReassigned + updateResults.artifactsReassigned,
    }, "cluster-publish worker complete");
}
