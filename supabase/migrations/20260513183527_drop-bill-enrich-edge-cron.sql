-- Tear down the bill-enrich-worker cron entry. Enrichment moves out of
-- Supabase Edge (CPU caps too tight for batch LLM work) and into a Bun
-- service scheduled by GitHub Actions. Idempotent.

DO $$
BEGIN
    PERFORM cron.unschedule('bill-enrich-worker');
EXCEPTION WHEN OTHERS THEN
    -- not scheduled, nothing to do
END $$;
