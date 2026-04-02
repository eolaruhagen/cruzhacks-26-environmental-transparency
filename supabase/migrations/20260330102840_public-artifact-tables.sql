-- Enums for enrichment (idempotent)

-- bill_type already exists in public schema (from remote_schema migration)
-- reuse it as the environmental topic for enrichment

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'impact_level') THEN
    CREATE TYPE public.impact_level AS ENUM (
      'local', 'state', 'national', 'international'
    );
  END IF;
END $$;


-- (4) Stories table

CREATE TABLE IF NOT EXISTS public.stories (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name        TEXT NOT NULL, -- story name is required on generation
  centroid    extensions.halfvec(1536),
  created_at  TIMESTAMPTZ DEFAULT now(),
  updated_at  TIMESTAMPTZ DEFAULT now()
);

-- (1) High-level artifact table (shared across all artifact types)

CREATE TABLE IF NOT EXISTS public.artifacts (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  url             TEXT NOT NULL UNIQUE,
  type            public.artifact_type NOT NULL,
  source_icon_url TEXT,
  story_id        UUID REFERENCES public.stories(id),
  embedding       extensions.halfvec(1536),
  published_at    TIMESTAMPTZ,
  created_at      TIMESTAMPTZ DEFAULT now(),
  updated_at      TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_artifacts_type ON public.artifacts(type);
CREATE INDEX IF NOT EXISTS idx_artifacts_story ON public.artifacts(story_id) WHERE story_id IS NOT NULL;

-- (2) News article details (foreign keyed to artifacts)

CREATE TABLE IF NOT EXISTS public.article_details (
  artifact_id  UUID PRIMARY KEY REFERENCES public.artifacts(id) ON DELETE CASCADE,
  title        TEXT NOT NULL,
  description  TEXT,
  source       TEXT,
  author       TEXT[],
  topics       TEXT[],
  people       TEXT[]
);

-- (3) Enrichment table (foreign keyed to artifacts, one per artifact)

CREATE TABLE IF NOT EXISTS public.artifact_enrichments (
  artifact_id                UUID PRIMARY KEY REFERENCES public.artifacts(id) ON DELETE CASCADE,
  summary                    TEXT NOT NULL,
  state                      TEXT,
  associated_bills           TEXT[][], -- references bills by their legislation_number column in house bills table ties them to a reason (bill, reason)
  associated_representatives TEXT[],
  stakeholders               TEXT[],
  environmental_topic        public.bill_type NOT NULL,
  impact_level               public.impact_level NOT NULL,
  sentiment                  REAL NOT NULL,
  key_quote                  TEXT
);

CREATE INDEX IF NOT EXISTS idx_enrichments_bill_type ON public.artifact_enrichments(environmental_topic);
CREATE INDEX IF NOT EXISTS idx_enrichments_impact ON public.artifact_enrichments(impact_level);
CREATE INDEX IF NOT EXISTS idx_enrichments_state ON public.artifact_enrichments(state) WHERE state IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_enrichments_
