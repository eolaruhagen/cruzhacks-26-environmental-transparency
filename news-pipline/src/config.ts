import type { ArtifactEnrichment } from "./types";

// ── Worker IDs ───────────────────────────────────────────────────────
export const FETCH_WORKER_ID = "fetch-worker";
export const FILTER_WORKER_ID = "filter-worker";
export const ENRICH_WORKER_ID = "enrich-worker";
export const CATEGORIZE_WORKER_ID = "categorize-worker";

// ── Batch / retry limits ─────────────────────────────────────────────
export const BATCH_SIZE = 15;
export const MAX_ARTIFACT_RETRY = 5;
export const FILTER_MAX_TRIES = 3;
export const ENRICH_BATCH_SIZE = 2;
export const ENRICH_MAX_STEPS = 12;

// ── External API URLs ────────────────────────────────────────────────
export const NEWS_API_BASE_URL = "https://api.newsmesh.co/v1/latest";
export const NEWSIO_API_BASE_URL = "https://newsdata.io/api/1/latest";
export const OPENROUTER_EMBEDDINGS_URL = "https://openrouter.ai/api/v1/embeddings";
export const JINA_READER_URL = "https://r.jina.ai/";

// ── External API request caps ────────────────────────────────────────
export const MAX_WORKER_NEWS_REQUESTS = 100;
export const MAX_NEWSIO_REQUESTS = 100;

// ── Model config ─────────────────────────────────────────────────────
export const FILTER_MODEL = "openai/gpt-5.4-nano";
export const ENRICH_MODEL = "x-ai/grok-4-fast";
export const EMBEDDING_MODEL = "openai/text-embedding-3-small";
export const EMBEDDING_DIMENSIONS = 1536;

// ── Default enrichment shape ─────────────────────────────────────────
export const DEFAULT_ENRICHMENT: ArtifactEnrichment = {
    summary: "",
    state: null,
    associated_bills: [],
    associated_representatives: [],
    stakeholders: [],
    environmental_topic: "climate_and_emissions",
    impact_level: "national",
    sentiment: 0,
    key_quote: null,
};