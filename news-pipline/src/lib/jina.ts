import pino from "pino";
import { JINA_READER_URL } from "../config";

const logger = pino({ name: "jina-reader" });

const { JINA_API_KEY } = process.env;

interface JinaResponse {
    code: number;
    data: {
        content: string;
        title?: string;
        url?: string;
    };
}

/**
 * Scrape article content via Jina Reader API.
 * Returns clean markdown optimized for LLM consumption:
 * - Respects robots.txt (GoogleBot user-agent)
 * - Strips images and links to reduce token usage
 * - Caps output at tokenBudget tokens
 */
export async function scrapeArticle(url: string, tokenBudget: number = 80000): Promise<string | null> {
    if (!JINA_API_KEY) throw new Error("JINA_API_KEY is required");

    const response = await fetch(JINA_READER_URL, {
        method: "POST",
        headers: {
            "Authorization": `Bearer ${JINA_API_KEY}`,
            "Content-Type": "application/json",
            "Accept": "application/json",
            "X-Return-Format": "markdown",
            "X-Retain-Images": "none",
            "X-Md-Link-Style": "discarded",
            //"X-Robots-Txt": "*",
            "X-Token-Budget": String(tokenBudget),
        },
        body: JSON.stringify({ url }),
    });

    if (!response.ok) {
        logger.warn({ url, status: response.status }, "Jina scrape failed");
        return null;
    }

    const data = await response.json() as JinaResponse;

    if (!data.data?.content) {
        logger.warn({ url }, "Jina returned empty content");
        return null;
    }

    return data.data.content;
}
