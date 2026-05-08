-- New pgmq queue + cron schedules for the rebuild pipeline.
--
-- Two scheduled jobs land here:
--   sync-bills-new-daily     — fires once a day; the producer that walks
--                              Congress.gov / the seed CSV and enqueues bills
--                              into house_bills_queue_new.
--   bill-pipeline-worker     — fires every 20 minutes; the per-bill consumer
--                              that pops from the queue, fetches bill data
--                              via CongressClient, and writes house_bills_2.
--
-- Blackout windows for the worker are NOT expressed in the cron schedule
-- (pg_cron has no native blackout primitive). They're passed in the JSON
-- body of each scheduled invocation; the function checks them in PT
-- (America/Los_Angeles) so the constraint follows DST automatically.
--
-- Secrets (project URL + service role key) come from Vault. If you haven't
-- seeded them yet, run these in the SQL editor on the target environment
-- BEFORE applying this migration:
--
--   SELECT vault.create_secret(
--       'https://<your-ref>.supabase.co', 'project_url',     'Project URL');
--   SELECT vault.create_secret(
--       '<your-service-role-key>',        'service_role_key','Service role key');
--
-- For local dev, the equivalents are 'http://kong:8000' (the kong gateway
-- inside the supabase docker network) and the local service role key.

BEGIN;

CREATE EXTENSION IF NOT EXISTS pgmq;
CREATE SCHEMA IF NOT EXISTS pgmq;

-- pgmq.create() writes to pgmq.meta, which the supabase migration role
-- doesn't have INSERT on out of the box. Grant before invoking, otherwise
-- the migration aborts with "permission denied for table meta".
GRANT INSERT, UPDATE, DELETE ON pgmq.meta TO postgres;

SELECT pgmq.create('house_bills_queue_new');

-- ---------------------------------------------------------------------------
-- congress_sync_state_new
-- ---------------------------------------------------------------------------
-- Singleton state row tracking the new pipeline's relationship with the
-- Congress API rate limit. Both the worker and the producer read this before
-- making API calls.
--
-- The Congress API (via api.data.gov) returns these headers on every response:
--     X-RateLimit-Limit, X-RateLimit-Remaining
-- On 429 it MAY include Retry-After (seconds). When neither header is
-- usable, fall back to `now() + interval '1 hour'` since the documented
-- limit window is rolling-hourly.
--
-- Worker pre-check (pseudocode):
--     SELECT api_rate_limit_reset_at, api_rate_limit_remaining
--     FROM congress_sync_state_new WHERE id = 1;
--     IF reset_at > now() THEN skip;          -- still in cooldown
--     IF remaining IS NOT NULL AND remaining < threshold THEN skip;
--
-- Singleton pattern: id INTEGER PK with a CHECK constraint so only one row
-- ever exists. Seeded on migration apply with INSERT ... ON CONFLICT.

CREATE TABLE IF NOT EXISTS public.congress_sync_state_new (
    id                            integer     PRIMARY KEY CHECK (id = 1),
    last_sync_at                  timestamptz,
    api_rate_limit_reset_at       timestamptz,
    last_error                    text,
    created_at                    timestamptz NOT NULL DEFAULT now(),
    updated_at                    timestamptz NOT NULL DEFAULT now()
);

INSERT INTO public.congress_sync_state_new (id) VALUES (1)
ON CONFLICT (id) DO NOTHING;

CREATE TRIGGER trg_congress_sync_state_new_set_updated_at
    BEFORE UPDATE ON public.congress_sync_state_new
    FOR EACH ROW
    EXECUTE FUNCTION public.set_updated_at();

-- Internal pipeline state — no anon/authenticated read or write. Only the
-- secret-API-keyed supabase client (which bypasses RLS) and direct DB admin
-- queries reach this table. RLS enabled with zero policies = deny-by-default
-- for non-bypass roles.
ALTER TABLE public.congress_sync_state_new ENABLE ROW LEVEL SECURITY;


CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;


-- 16:00 UTC = 8am PST (winter) / 9am PDT (summer). Accept the 1-hour drift;
-- a daily job doesn't care which side of DST it lands on.
SELECT cron.schedule(
    'sync-bills-new-daily',
    '0 16 * * *',
    $$
    SELECT net.http_post(
        url := (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'project_url')
               || '/functions/v1/sync-bills-new',
        headers := jsonb_build_object(
            'Content-Type',  'application/json',
            'Authorization', 'Bearer ' || (
                SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'service_role_key'
            )
        ),
        body := jsonb_build_object(
            'kind', 'scheduled'
        )
    ) AS request_id;
    $$
);

-- ---------------------------------------------------------------------------
-- bill-pipeline-worker — per-bill consumer, every 20 min
-- ---------------------------------------------------------------------------
-- invalidTimeWindows is interpreted in PT inside the function. Format is
-- "HH:MM" (24-hour). Blackouts here cover:
--   06:30 – 09:00 PT  → straddles the daily sync-bills-new fire time
--   15:30 – 18:30 PT  → existing prod data pipeline's heavy window
SELECT cron.schedule(
    'bill-pipeline-worker',
    '*/20 * * * *',
    $$
    SELECT net.http_post(
        url := (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'project_url')
               || '/functions/v1/bill-pipeline-worker',
        headers := jsonb_build_object(
            'Content-Type',  'application/json',
            'Authorization', 'Bearer ' || (
                SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'service_role_key'
            )
        ),
        body := jsonb_build_object(
            'kind', 'scheduled',
            'invalidTimeWindows', jsonb_build_array(
                jsonb_build_object('startPt', '06:30', 'endPt', '09:00'),
                jsonb_build_object('startPt', '15:30', 'endPt', '18:30')
            )
        )
    ) AS request_id;
    $$
);

COMMIT;
