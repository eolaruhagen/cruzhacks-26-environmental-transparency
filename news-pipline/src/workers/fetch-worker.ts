import { fetchNewsArtifacts, filterNewsArtifactsFromLastDay } from "../lib/externalApis";
import { MAX_WORKER_NEWS_REQUESTS } from "../config";
import { insertRawArtifacts, timedQuery, type ArtifactType, type StagingArtifact, type JsonSerializable } from "../lib/database";
import pino from "pino";

const logger = pino({ name: "fetch-worker" });


export interface FetchStrategy<TMeta extends Record<string, JsonSerializable>> {
    readonly artifactType: ArtifactType;
    readonly maxRequests: number;
    fetch(cursor?: string): Promise<{ items: StagingArtifact<TMeta>[]; nextCursor: string | null }>;
}

export interface NewsArtifactMetadata extends Record<string, JsonSerializable> {
    title: string;
    description: string;
    people: string[];
    topics: string[];
    author: string[];
}

export const newsFetchStrategy: FetchStrategy<NewsArtifactMetadata> = {
    artifactType: "article",
    maxRequests: MAX_WORKER_NEWS_REQUESTS,

    async fetch(cursor?: string) {
        const response = await fetchNewsArtifacts(cursor);
        const filtered = filterNewsArtifactsFromLastDay(response.data);

        const items: StagingArtifact<NewsArtifactMetadata>[] = filtered.map(artifact => ({
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

interface strategyMetaMap {
    article: NewsArtifactMetadata;
}


const strategyRegistry: Record<string, FetchStrategy<strategyMetaMap[keyof strategyMetaMap]>> = {
    article: newsFetchStrategy,
};

export function getFetchStrategy<T extends keyof strategyMetaMap>(artifactType: string): FetchStrategy<strategyMetaMap[T]> {
    const strategy = strategyRegistry[artifactType];
    if (!strategy) {
        throw new Error(`Unknown artifact type: "${artifactType}". Available: ${Object.keys(strategyRegistry).join(", ")}`);
    }
    return strategy;
}


export async function fetchArtifactsWorker<TMeta extends Record<string, JsonSerializable>>(strategy: FetchStrategy<TMeta>) {
    let cursor: string | undefined = undefined;
    let totalInserted = 0;
    let totalDupes = 0;

    for (let i = 0; i < strategy.maxRequests; i++) {
        let items: StagingArtifact<TMeta>[];
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
