import pino from "pino";
import { acquireBatchWithRetries, settleBatch, publishArticleArtifact } from "../lib/database";
import { isRetryablePgError } from "../lib/parse-utils";
import { assignToStory, type StoryAssignment } from "../lib/story-clustering";
import { CLUSTER_WORKER_ID, CLUSTER_BATCH_SIZE, STORY_SIMILARITY_THRESHOLD } from "../config";
import type { ArtifactType, StagingArtifact } from "../types";

type PublishFn<K extends ArtifactType> = (artifact: StagingArtifact<K>, storyId: string) => Promise<void>;

const publishRegistry: { [K in ArtifactType]?: PublishFn<K> } = {
    article: publishArticleArtifact,
};

/**
 * Look up the publish function for an artifact type.
 * Throws if no publisher is registered for the given type.
 */
function getPublishFn<K extends ArtifactType>(artifactType: K): PublishFn<K> {
    const fn = publishRegistry[artifactType];
    if (!fn) {
        throw new Error(`No publish function registered for artifact type: "${artifactType}"`);
    }
    return fn as PublishFn<K>;
}

const logger = pino({ name: "cluster-publish-worker", level: process.env.LOG_LEVEL ?? "info" });

interface BatchCounts {
    published: number;
    retried: number;
    failed: number;
}

/**
 * Process a single artifact: assign to story, then publish.
 * Returns true on success. On failure, the caller handles cleanup.
 */
async function processArtifact<K extends ArtifactType>(
    artifact: StagingArtifact<K>,
    publishFn: (artifact: StagingArtifact<K>, storyId: string) => Promise<void>,
): Promise<boolean> {
    const alog = logger.child({ artifactId: artifact.id });

    if (!artifact.embedding) {
        alog.warn("artifact has no embedding, cannot cluster");
        return false;
    }
    if (!artifact.enrichment) {
        alog.warn("artifact has no enrichment, cannot publish");
        return false;
    }

    const assignment: StoryAssignment = await assignToStory(artifact, STORY_SIMILARITY_THRESHOLD);
    alog.info({ storyId: assignment.storyId, created: assignment.created }, "story assigned");

    await publishFn(artifact, assignment.storyId);
    alog.info("published to public tables");
    return true;
}

async function processBatch<K extends ArtifactType>(
    batch: StagingArtifact<K>[],
    publishFn: (artifact: StagingArtifact<K>, storyId: string) => Promise<void>,
    workerId: string,
): Promise<BatchCounts> {
    const published: StagingArtifact<K>[] = [];
    const retryable: StagingArtifact<K>[] = [];
    const terminal: StagingArtifact<K>[] = [];

    for (const artifact of batch) {
        try {
            const ok = await processArtifact(artifact, publishFn);
            if (ok) published.push(artifact);
            else retryable.push(artifact);
        } catch (error) {
            const err = error instanceof Error ? { message: error.message, stack: error.stack, code: (error as any).code } : String(error);
            logger.error({ artifactId: artifact.id, error: err }, "failed to process artifact");
            if (isRetryablePgError(error)) {
                retryable.push(artifact);
            } else {
                logger.error({ artifactId: artifact.id, code: (error as any).code }, "permanent DB error — moving to failed immediately");
                terminal.push(artifact);
            }
        }
    }

    // Published artifacts already deleted from staging inside the publish transaction.
    // Route retryable and terminal failures through settleBatch.
    const counts = await settleBatch(workerId, "enriched", [], [], retryable, terminal);
    return { published: published.length, retried: counts.retried, failed: counts.failed };
}

export async function clusterPublishWorker<K extends ArtifactType>(artifactType: K) {
    const publishFn = getPublishFn(artifactType);
    const workerId = CLUSTER_WORKER_ID + "-" + artifactType + "-" + Math.random().toString(36).substring(2, 15);

    let totalPublished = 0;
    let totalRetried = 0;
    let totalFailed = 0;

    while (true) {
        const batch = await acquireBatchWithRetries(
            "acquire-cluster-batch", "enriched", artifactType,
            CLUSTER_BATCH_SIZE, workerId, 5,
            (type, error, attempt) => {
                if (type === "retry_exhausted") logger.error(error, "failed to acquire cluster batch lock");
                else logger.warn({ attempt }, "failed to acquire batch lock, retrying");
            },
        );

        if (!batch) {
            logger.info("no more enriched artifacts to cluster/publish (or acquire failed)");
            break;
        }

        logger.info({ batchSize: batch.length }, "processing cluster-publish batch");
        try {
            const counts = await processBatch(batch, publishFn, workerId);
            totalPublished += counts.published;
            totalRetried += counts.retried;
            totalFailed += counts.failed;
            logger.info(counts, "batch complete");
        } catch (error) {
            // honestly not 100% best way to handle this now, just better than pg erroring out
            logger.error({ error }, "failed to process batch");
            break;
        }
    }

    logger.info({ totalPublished, totalRetried, totalFailed }, `cluster-publish worker complete for ${artifactType}`);
}
