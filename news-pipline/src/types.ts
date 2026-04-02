export type JsonSerializable =
    | string
    | number
    | boolean
    | null
    | JsonSerializable[]
    | { [key: string]: JsonSerializable };


export interface NewsArtifactMetadata {
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

export type EnvironmentalTopic =
    | "air_and_atmosphere"
    | "water_resources"
    | "waste_and_toxics"
    | "energy_and_resources"
    | "land_and_conservation"
    | "disaster_and_emergency"
    | "climate_and_emissions"
    | "justice_and_environment";

export type ImpactLevel = "local" | "state" | "national" | "international";

export type StringTuple = [string, string];

export type ArtifactEnrichment = {
    summary: string;
    state: string | null;
    associated_bills: StringTuple[];
    associated_representatives: string[];
    stakeholders: string[];
    environmental_topic: EnvironmentalTopic;
    impact_level: ImpactLevel;
    sentiment: number;
    key_quote: string | null;
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
    readonly dedupFields: (keyof ArtifactMetaMap[K])[];
}

export interface ArtifactFormatSpec<K extends ArtifactType> {
    artifactType: K;
    formatDescription: string;
    serializeArtifacts: (artifacts: StagingArtifact<K>[]) => string;
}
