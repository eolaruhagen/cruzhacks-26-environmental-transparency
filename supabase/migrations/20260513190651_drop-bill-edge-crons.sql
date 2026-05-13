-- Tear down the remaining Edge-based crons. All bill-pipeline work now runs
-- as Bun services on GitHub Actions. Idempotent.

DO $$
BEGIN
    PERFORM cron.unschedule('sync-bills-new-daily');
EXCEPTION WHEN OTHERS THEN
END $$;

DO $$
BEGIN
    PERFORM cron.unschedule('bill-pipeline-worker');
EXCEPTION WHEN OTHERS THEN
END $$;
