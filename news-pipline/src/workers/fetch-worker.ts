import { fetchNewsArtifacts, filterNewsArtifactsFromLastDay } from "../lib/externalApis";
import { MAX_WORKER_NEWS_REQUESTS } from "../config";
import { insertRawArtifacts, timedQuery } from "../lib/database";
import type { ArtifactType, ArtifactMetaMap, FetchStrategy, StagingArtifact } from "../types";
import pino from "pino";

const logger = pino({ name: "fetch-worker" });

export const newsFetchStrategy: FetchStrategy<"article"> = {
    artifactType: "article",
    maxRequests: MAX_WORKER_NEWS_REQUESTS,

    async fetch(cursor?: string) {
        const response = await fetchNewsArtifacts(cursor);
        const filtered = filterNewsArtifactsFromLastDay(response.data);

        const items: StagingArtifact<"article">[] = filtered.map(artifact => ({
            id: crypto.randomUUID(),
            url: artifact.link,
            type: "article",
            status: "raw",
            source_icon_url: artifact.media_url,
            metadata: {
                title: artifact.title,
                description: artifact.description,
                people: artifact.people,
                topics: artifact.topics,
                author: artifact.author,
            },
            retry_attempts: 0,
            locked_by: null,
            locked_at: null,
            embedding: null,
            enrichment: null,
            created_at: new Date(),
            updated_at: new Date(),
        }));

        return { items, nextCursor: response.next_cursor ?? null };
    }
};

const strategyRegistry: { [K in ArtifactType]?: FetchStrategy<K> } = {
    article: newsFetchStrategy,
};

export function getFetchStrategy<K extends ArtifactType>(artifactType: K): FetchStrategy<K> {
    const strategy = strategyRegistry[artifactType];
    if (!strategy) {
        throw new Error(`Unknown artifact type: "${artifactType}". Available: ${Object.keys(strategyRegistry).join(", ")}`);
    }
    return strategy as FetchStrategy<K>;
}


export async function fetchArtifactsWorker<K extends ArtifactType>(strategy: FetchStrategy<K>) {
    let cursor: string | undefined = undefined;
    let totalInserted = 0;
    let totalDupes = 0;

    for (let i = 0; i < strategy.maxRequests; i++) {
        let items: StagingArtifact<K>[];
        let nextCursor: string | null;
        try {
            const result = await strategy.fetch(cursor);
            items = result.items;
            nextCursor = result.nextCursor;
        } catch (error) {
            logger.error(error, `fetch request ${i + 1} failed`);
            break;
        }

        if (items.length === 0) {
            logger.info(`page ${i + 1}: no items after filtering, skipping insert`);
            if (!nextCursor) break;
            cursor = nextCursor;
            continue;
        }

        try {
            const result = await timedQuery(`insert-batch-${i + 1}`, () => insertRawArtifacts(items));
            if (result.ok) {
                totalInserted += result.data.inserted;
                totalDupes += result.data.dupes;
                logger.info({ page: i + 1, inserted: result.data.inserted, dupes: result.data.dupes }, "batch inserted");
            } else {
                logger.error(result.error, `insert failed on page ${i + 1}`);
            }
        } catch (error) {
            logger.error(error, `insert failed on page ${i + 1}`);
        }

        if (!nextCursor) {
            logger.info("no more pages, fetch complete");
            break;
        }
        cursor = nextCursor;
    }

    logger.info({ totalInserted, totalDupes }, `fetch worker complete for ${strategy.artifactType}`);
    return;
}
