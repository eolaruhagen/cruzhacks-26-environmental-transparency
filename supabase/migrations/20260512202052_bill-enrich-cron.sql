DO $$
BEGIN
    PERFORM cron.unschedule('bill-enrich-worker');
EXCEPTION WHEN OTHERS THEN
END $$;

-- Offset from bill-pipeline-worker's */20 so the two never collide on cron
-- start times. Same blackout windows so the daytime/evening pauses match.
SELECT cron.schedule(
    'bill-enrich-worker',
    '10,30,50 * * * *',
    $cmd$
    SELECT net.http_post(
        url := (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'project_url')
               || '/functions/v1/bill-enrich-worker',
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
