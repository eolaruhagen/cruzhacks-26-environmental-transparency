export type JsonSerializable =
    | string
    | number
    | boolean
    | null
    | JsonSerializable[]
    | { [key: string]: JsonSerializable };


export interface NewsArtifactMetadata extends Record<string, JsonSerializable> {
    title: string;
    description: string;
    people: string[];
    topics: string[];
    author: string[];
}


export interface ArtifactMetaMap {
    article: NewsArtifactMetadata;
}

export type ArtifactType = keyof ArtifactMetaMap;

export type ArtifactStatus = "raw" | "filtered" | "enriched";

export type ArtifactEnrichment = {
    state: string;
    associated_bill_ids: string[];
    associated_representatives: string[];
    subcategories: string[];
    sentiment: number;
}

export interface StagingArtifact<K extends ArtifactType = ArtifactType> {
    id: string;
    url: string;
    type: K;
    status: ArtifactStatus;
    source_icon_url: string | null;
    metadata: ArtifactMetaMap[K];
    retry_attempts: number;
    locked_by: string | null;
    locked_at: Date | null;
    embedding: number[] | null;
    enrichment: ArtifactEnrichment | null;
    created_at: Date;
    updated_at: Date;
}

export interface FetchSource<K extends ArtifactType> {
    readonly name: string;
    readonly maxRequests: number;
    fetch(cursor?: string): Promise<{ items: StagingArtifact<K>[]; nextCursor: string | null }>;
}

export interface FetchStrategy<K extends ArtifactType> {
    readonly artifactType: K;
    readonly sources: FetchSource<K>[];
}

export interface ArtifactFormatSpec<K extends ArtifactType> {
    artifactType: K;
    formatDescription: string;
    serializeArtifacts: (artifacts: StagingArtifact<K>[]) => string;
}
