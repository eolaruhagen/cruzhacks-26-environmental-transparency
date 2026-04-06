import { fetchNewsArtifacts, filterFromLastDay, fetchNewsIOArtifacts } from "../lib/externalApis";
import { MAX_WORKER_NEWS_REQUESTS, MAX_NEWSIO_REQUESTS } from "../config";
import { insertRawArtifacts, timedQuery, dedupByMetadataFields } from "../lib/database";
import type { ArtifactType, FetchStrategy, FetchSource, StagingArtifact } from "../types";
import pino from "pino";

const logger = pino({ name: "fetch-worker" });

/** Normalize API fields that may be string, string[], or null into string[] */
function toStringArray(value: unknown): string[] {
    if (Array.isArray(value)) return value;
    if (typeof value === "string" && value.length > 0) return [value];
    return [];
}

const newsMeshSource: FetchSource<"article"> = {
    name: "newsmesh",
    maxRequests: MAX_WORKER_NEWS_REQUESTS,

    async fetch(cursor?: string) {
        const response = await fetchNewsArtifacts(cursor);
        const filtered = filterFromLastDay(response.data, "published_date");

        const items: StagingArtifact<"article">[] = filtered.map(artifact => ({
            id: crypto.randomUUID(),
            url: artifact.link,
            type: "article",
            status: "raw",
            source_icon_url: artifact.media_url ?? null,
            metadata: {
                title: artifact.title,
                description: artifact.description,
                people: toStringArray(artifact.people),
                topics: toStringArray(artifact.topics),
                author: toStringArray(artifact.author),
                source: artifact.source ?? null,
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

const newsIOSource: FetchSource<"article"> = {
    name: "newsdata.io",
    maxRequests: MAX_NEWSIO_REQUESTS,

    async fetch(cursor?: string) {
        const response = await fetchNewsIOArtifacts(cursor);
        const filtered = filterFromLastDay(response.results ?? [], "pubDate");

        const items: StagingArtifact<"article">[] = filtered
            .filter(a => a.title && a.link)
            .map(artifact => ({
                id: crypto.randomUUID(),
                url: artifact.link,
                type: "article",
                status: "raw",
                source_icon_url: artifact.source_icon ?? null,
                metadata: {
                    title: artifact.title,
                    description: artifact.description ?? "",
                    people: [],
                    topics: toStringArray(artifact.keywords),
                    author: toStringArray(artifact.creator),
                    source: artifact.source_name ?? null,
                },
                retry_attempts: 0,
                locked_by: null,
                locked_at: null,
                embedding: null,
                enrichment: null,
                created_at: new Date(),
                updated_at: new Date(),
            }));

        return { items, nextCursor: response.nextPage ?? null };
    }
};

const newsFetchStrategy: FetchStrategy<"article"> = {
    artifactType: "article",
    sources: [newsMeshSource, newsIOSource],
    dedupFields: ["title"],
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

async function runSource<K extends ArtifactType>(source: FetchSource<K>) {
    let cursor: string | undefined = undefined;
    let totalInserted = 0;
    let totalDupes = 0;

    for (let i = 0; i < source.maxRequests; i++) {
        let items: StagingArtifact<K>[];
        let nextCursor: string | null;
        try {
            const result = await source.fetch(cursor);
            items = result.items;
            nextCursor = result.nextCursor;
        } catch (error) {
            logger.error({ source: source.name, error }, `fetch request ${i + 1} failed`);
            break;
        }

        if (items.length === 0) {
            logger.info({ source: source.name }, `page ${i + 1}: no items after filtering, skipping insert`);
            if (!nextCursor) break;
            cursor = nextCursor;
            continue;
        }

        try {
            const result = await timedQuery(`${source.name}-insert-batch-${i + 1}`, () => insertRawArtifacts(items));
            if (result.ok) {
                totalInserted += result.data.inserted;
                totalDupes += result.data.dupes;
                logger.info({ source: source.name, page: i + 1, inserted: result.data.inserted, dupes: result.data.dupes }, "batch inserted");
            } else {
                logger.error({ source: source.name, error: result.error }, `insert failed on page ${i + 1}`);
            }
        } catch (error) {
            logger.error({ source: source.name, error }, `insert failed on page ${i + 1}`);
        }

        if (!nextCursor) {
            logger.info({ source: source.name }, "no more pages, fetch complete");
            break;
        }
        cursor = nextCursor;
    }

    logger.info({ source: source.name, totalInserted, totalDupes }, "source complete");
    return { totalInserted, totalDupes };
}

export async function fetchArtifactsWorker<K extends ArtifactType>(strategy: FetchStrategy<K>) {
    let grandTotalInserted = 0;
    let grandTotalDupes = 0;

    for (const source of strategy.sources) {
        logger.info({ source: source.name, maxRequests: source.maxRequests }, "starting source");
        const { totalInserted, totalDupes } = await runSource(source);
        grandTotalInserted += totalInserted;
        grandTotalDupes += totalDupes;
    }

    if (strategy.dedupFields.length > 0) {
        const deduped = await dedupByMetadataFields(strategy.artifactType, strategy.dedupFields, "raw");
        grandTotalDupes += deduped;
        logger.info({ deduped }, "cross-source dedup complete");
    }

    logger.info({ totalInserted: grandTotalInserted, totalDupes: grandTotalDupes }, `fetch worker complete for ${strategy.artifactType}`);
}
