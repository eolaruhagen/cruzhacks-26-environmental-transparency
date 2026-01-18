-- Migration: add_pipeline_helpers
-- Purpose: Helper functions for batch operations and async function triggering
-- Applied: 2026-01-18
-- Updated: 2026-01-18 - Fixed net.http_post argument order

-- Grant access to net schema for pg_net functions
GRANT USAGE ON SCHEMA net TO service_role;

-- Trigger next Edge Function asynchronously via pg_net
-- This is the "fire and forget" pattern - caller exits immediately
-- IMPORTANT: net.http_post signature is (url, body, params, headers, timeout_milliseconds)
CREATE OR REPLACE FUNCTION public.trigger_next_step_internal(
  p_project_url TEXT,
  p_service_role_key TEXT,
  p_function_name TEXT,
  p_payload JSONB DEFAULT '{}'::JSONB
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, net
AS $$
BEGIN
  -- pg_net.http_post is async - it returns immediately
  -- The HTTP request is made in the background by a pg_net worker
  -- Signature: http_post(url, body, params, headers, timeout_milliseconds)
  PERFORM net.http_post(
    p_project_url || '/functions/v1/' || p_function_name,  -- url
    p_payload,  -- body
    '{}'::jsonb,  -- params (empty)
    jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || p_service_role_key
    ),  -- headers
    5000  -- timeout_milliseconds
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.trigger_next_step_internal(TEXT, TEXT, TEXT, JSONB) TO service_role;

-- Example usage from Edge Function:
-- await supabase.rpc("trigger_next_step_internal", {
--   p_project_url: "https://xxx.supabase.co",
--   p_service_role_key: "eyJ...",
--   p_function_name: "bill-data-fetcher"
-- });
