ALTER TABLE pipelines.artifact_staging
    ADD COLUMN IF NOT EXISTS enrichment JSONB;


DO $$
BEGIN
  IF NOT EXISTS (
    SELECT FROM pg_constraint 
    WHERE conrelid = 'pipelines.artifact_staging'::regclass 
    AND conname = 'ck_enrichment_jsonb_when_enriched'
  ) THEN
    ALTER TABLE pipelines.artifact_staging 
    ADD CONSTRAINT ck_enrichment_jsonb_when_enriched CHECK (
        status != 'enriched' OR enrichment IS NOT NULL
    );
  END IF;
END $$;