import type { StringLike } from "bun";
import { NEWS_API_BASE_URL } from "../config";

const { NEWSMESH_API_KEY } = process.env;


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
    url.searchParams.set("category", "environment");
    url.searchParams.set("country", "us");
    url.searchParams.set("limit", "10");
    url.searchParams.set("apiKey", NEWSMESH_API_KEY!);
    if (cursor) {
        url.searchParams.set("cursor", cursor);
    }

    const res = await fetch(url, {
        method: "GET",
    });

    return await res.json() as NewsMeshResponse;
}

export function filterNewsArtifactsFromLastDay(artifacts: NewsMeshItem[]): NewsMeshItem[] {
    return artifacts.filter((artifact) => {
        const publishedDate = new Date(artifact.published_date);
        const now = new Date();
        const diff = now.getTime() - publishedDate.getTime();
        const hours = diff / (1000 * 60 * 60);
        return hours < 24;
    });
}