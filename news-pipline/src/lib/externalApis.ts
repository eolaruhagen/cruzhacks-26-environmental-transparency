import { NEWS_API_BASE_URL, NEWSIO_API_BASE_URL } from "../config";

const { NEWSMESH_API_KEY, NEWSIO_API_KEY } = process.env;


export interface NewsMeshItem {
    article_id: string;
    title: string;
    description: string;
    link: string;
    media_url: string;
    published_date: string;
    source: string;
    category: string;
    topics: string[];
    people: string[];
    author: string[];
}

export interface NewsMeshResponse {
    data: NewsMeshItem[];
    next_cursor?: string;
}

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

    return await res.json() as NewsMeshResponse;
}

export function filterFromLastDay<T>(artifacts: T[], dateField: keyof T): T[] {
    const now = Date.now();
    return artifacts.filter((artifact) => {
        const published = new Date(artifact[dateField] as string);
        return (now - published.getTime()) / (1000 * 60 * 60) < 24;
    });
}

// --- NewsData.io (archive endpoint) ---

export interface NewsIOItem {
    article_id: string;
    title: string;
    description: string | null;
    link: string;
    source_icon: string | null;
    pubDate: string;
    source_name: string;
    category: string[];
    keywords: string[] | null;
    creator: string[] | null;
}

export interface NewsIOResponse {
    status: string;
    totalResults: number;
    results: NewsIOItem[];
    nextPage?: string;
}

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

    return await res.json() as NewsIOResponse;
}