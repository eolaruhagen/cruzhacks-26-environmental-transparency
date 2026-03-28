CREATE SCHEMA IF NOT EXISTS pipelines;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_type
    WHERE typname = 'artifact_status'
      AND typnamespace = (
        SELECT oid FROM pg_namespace WHERE nspname = 'pipelines'
      )
  ) THEN
    CREATE TYPE pipelines.artifact_status AS ENUM (
        'raw', -- raw just pulled via API
        'filtered', -- a valid piece to be kept
        'enriched' -- artifact that has been successfully tagged (state, bill, representative, sentiment)
    );
  END IF;
END $$;

DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_type
    WHERE typname = 'artifact_type'
      AND typnamespace = (
        SELECT oid FROM pg_namespace WHERE nspname = 'public'
      )
  ) THEN
    CREATE TYPE public.artifact_type AS ENUM (
        'article',
        'social_post'
    );
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS pipelines.rejected_artifacts(
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    url TEXT NOT NULL,
    type public.artifact_type NOT NULL,
    data JSONB NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- table for artifacts that went over max retry attempts (say 5)
CREATE TABLE IF NOT EXISTS pipelines.failed_artifacts(
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    url TEXT NOT NULL,
    type public.artifact_type NOT NULL,
    data JSONB NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

CREATE TABLE IF NOT EXISTS pipelines.artifact_staging(
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    url TEXT NOT NULL UNIQUE,
    type public.artifact_type NOT NULL,
    status pipelines.artifact_status NOT NULL DEFAULT 'raw',
    source_icon_url TEXT, -- nullable to things like twitter, bluesky, reddit, or articles that just dont provide it
    metadata JSONB NOT NULL, -- no provided default this MUST BE SET
    retry_attempts INT NOT NULL DEFAULT 0,
    locked_by TEXT,
    locked_at TIMESTAMP WITH TIME ZONE,
    embedding extensions.halfvec(1536),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT now(),

    CONSTRAINT ck_embedding_when_enriched
        CHECK (
            status != 'enriched' OR embedding IS NOT NULL
        )
);

-- Workers grab unlocked rows by stage
CREATE INDEX IF NOT EXISTS idx_staging_stage_unlocked
    ON pipelines.artifact_staging(status) WHERE locked_by IS NULL;

-- Cleanup finds stale locks
CREATE INDEX IF NOT EXISTS idx_staging_stale_locks
    ON pipelines.artifact_staging(locked_at) WHERE locked_by IS NOT NULL;

CREATE TABLE IF NOT EXISTS pipelines.allowed_domains(
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    domain_base_url TEXT NOT NULL UNIQUE,
    allowed BOOLEAN NOT NULL, -- this has to be decided at runtime
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);


-- Cron Job for clearing up Stale Locks
SELECT cron.schedule(
    'clear-stale-locks',
    '0 0 * * *', -- runs at midnight every day (before the job runs during the day)
    $$
        UPDATE pipelines.artifact_staging
        SET locked_by = NULL, locked_at = NULL, retry_attempts = retry_attempts + 1
        WHERE locked_by IS NOT NULL
        AND locked_at < now() - interval '30 minutes'
    $$
);
