import { embedText } from "@cruzhacks/shared";
import type { EmbedFn } from "./process-bill-enrichment.ts";

const EMBEDDING_MODEL = "openai/text-embedding-3-small";
const EMBEDDING_DIMS = 1536;
const EMBEDDING_URL = "https://openrouter.ai/api/v1/embeddings";

export function makeEmbed(apiKey: string): EmbedFn {
    return (text: string) =>
        embedText(text, apiKey, EMBEDDING_DIMS, EMBEDDING_MODEL, EMBEDDING_URL);
}
