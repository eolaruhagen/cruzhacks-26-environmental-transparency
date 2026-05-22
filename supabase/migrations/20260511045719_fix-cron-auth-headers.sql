-- Update cron-triggered HTTP calls to use the `apikey` header + our custom
-- SECRET_API_KEY instead of `Authorization: Bearer <service_role_key>`.
--
-- Why this change:
--   Newer Supabase versions reserve `Authorization` for end-user JWT sessions
--   and Kong's request-transformer plugin strips any `Authorization: Bearer sb_`
--   header it sees on inbound /functions/v1/* requests. Our service-to-service
--   cron calls now have to identify themselves through `apikey: <secret>` and
--   the edge function's `authenticateRequest` reads that header directly.
--
-- Required out-of-band setup (Vault secret):
--   This migration references vault.decrypted_secrets WHERE name = 'worker_secret_key'.
--   That secret must hold the SAME value the deployed function sees as the
--   SECRET_API_KEY env var. Set it once via Studio or:
--     SELECT vault.create_secret('your-secret-value', 'worker_secret_key');
--   The cron jobs will be inert (401s in `net._http_response`) until it exists.
--
-- Idempotent: unschedules-if-exists before scheduling, so reruns are safe.

DO $$
BEGIN
    PERFORM cron.unschedule('sync-bills-new-daily');
EXCEPTION WHEN OTHERS THEN
    -- Job didn't exist; nothing to unschedule.
END $$;

DO $$
BEGIN
    PERFORM cron.unschedule('bill-pipeline-worker');
EXCEPTION WHEN OTHERS THEN
    -- Job didn't exist; nothing to unschedule.
END $$;

-- ---------------------------------------------------------------------------
-- sync-bills-new-daily — producer, fires once a day at 16:00 UTC.
-- ---------------------------------------------------------------------------
SELECT cron.schedule(
    'sync-bills-new-daily',
    '0 16 * * *',
    $cmd$
    SELECT net.http_post(
        url := (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'project_url')
               || '/functions/v1/sync-bills-new',
        headers := jsonb_build_object(
            'Content-Type', 'application/json',
            'apikey', (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'worker_secret_key')
        ),
        body := jsonb_build_object(
            'kind', 'scheduled'
        )
    ) AS request_id;
    $cmd$
);

-- ---------------------------------------------------------------------------
-- bill-pipeline-worker — per-bill consumer, every 20 minutes.
-- Blackout windows match the original migration: 06:30–09:00 PT and
-- 15:30–18:30 PT (interpreted by the worker via Intl.DateTimeFormat).
-- ---------------------------------------------------------------------------
SELECT cron.schedule(
    'bill-pipeline-worker',
    '*/20 * * * *',
    $cmd$
    SELECT net.http_post(
        url := (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'project_url')
               || '/functions/v1/bill-pipeline-worker',
        headers := jsonb_build_object(
            'Content-Type', 'application/json',
            'apikey', (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'worker_secret_key')
        ),
        body := jsonb_build_object(
            'kind', 'scheduled',
            'invalidTimeWindows', jsonb_build_array(
                jsonb_build_object('startPt', '06:30', 'endPt', '09:00'),
                jsonb_build_object('startPt', '15:30', 'endPt', '18:30')
            )
        )
    ) AS request_id;
    $cmd$
);
