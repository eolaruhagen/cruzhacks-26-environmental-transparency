import { z } from "zod";
import { NEWS_API_BASE_URL, NEWSIO_API_BASE_URL } from "../config";

const { NEWSMESH_API_KEY, NEWSIO_API_KEY } = process.env;

// Strict on fields we read directly, lenient on fields normalized
// downstream by toStringArray() in the fetch worker.

export const NewsMeshItemSchema = z.object({
    article_id: z.string(),
    title: z.string(),
    description: z.string(),
    link: z.string(),
    media_url: z.string().nullish(),
    published_date: z.string(),
    source: z.string().nullish(),
    category: z.string().nullish(),
    topics: z.unknown().default([]),
    people: z.unknown().default([]),
    author: z.unknown().default([]),
});

export const NewsMeshResponseSchema = z.object({
    data: z.array(NewsMeshItemSchema),
    next_cursor: z.string().nullish(),
});

export type NewsMeshItem = z.infer<typeof NewsMeshItemSchema>;
export type NewsMeshResponse = z.infer<typeof NewsMeshResponseSchema>;

export async function fetchNewsArtifacts(cursor?: string): Promise<NewsMeshResponse> {
    const url = new URL(NEWS_API_BASE_URL);
    url.searchParams.set("category", "environment, politics");
    url.searchParams.set("country", "us");
    url.searchParams.set("limit", "10");
    url.searchParams.set("apiKey", NEWSMESH_API_KEY!);
    if (cursor) {
        url.searchParams.set("cursor", cursor);
    }

    const res = await fetch(url);

    if (!res.ok) {
        const error: any = new Error(`NewsMesh API error: ${res.status}`);
        error.statusCode = res.status;
        throw error;
    }

    return NewsMeshResponseSchema.parse(await res.json());
}

export function filterFromLastDay<T>(artifacts: T[], dateField: keyof T): T[] {
    const now = Date.now();
    return artifacts.filter((artifact) => {
        const published = new Date(artifact[dateField] as string);
        return (now - published.getTime()) / (1000 * 60 * 60) < 24;
    });
}

// ── NewsData.io schemas ─────────────────────────────────────────────

export const NewsIOItemSchema = z.object({
    article_id: z.string(),
    title: z.string(),
    description: z.string().nullish(),
    link: z.string(),
    source_icon: z.string().nullish(),
    pubDate: z.string(),
    source_name: z.string(),
    category: z.array(z.string()).nullish(),
    keywords: z.unknown().default(null),
    creator: z.unknown().default(null),
});

export const NewsIOResponseSchema = z.object({
    status: z.string(),
    totalResults: z.number(),
    results: z.array(NewsIOItemSchema),
    nextPage: z.string().nullish(),
});

export type NewsIOItem = z.infer<typeof NewsIOItemSchema>;
export type NewsIOResponse = z.infer<typeof NewsIOResponseSchema>;

export async function fetchNewsIOArtifacts(page?: string): Promise<NewsIOResponse> {
    const url = new URL(NEWSIO_API_BASE_URL);
    url.searchParams.set("apikey", NEWSIO_API_KEY!);
    url.searchParams.set("country", "us");
    url.searchParams.set("language", "en");
    url.searchParams.set("category", "environment");
    url.searchParams.set("size", "10");

    if (page) {
        url.searchParams.set("page", page);
    }

    const res = await fetch(url);

    if (!res.ok) {
        const error: any = new Error(`NewsData.io API error: ${res.status}`);
        error.statusCode = res.status;
        throw error;
    }

    return NewsIOResponseSchema.parse(await res.json());
}
