-- Migration: fix_trigger_next_step_function
-- Applied: 2026-01-18
-- Purpose: Fix argument order for net.http_post in trigger_next_step_internal
--
-- The original function used named parameters which caused issues.
-- net.http_post expects positional arguments: (url, body, params, headers, timeout_milliseconds)

-- Drop and recreate with correct argument order
CREATE OR REPLACE FUNCTION trigger_next_step_internal(
  p_project_url TEXT,
  p_service_role_key TEXT,
  p_function_name TEXT,
  p_payload JSONB DEFAULT '{}'::jsonb
)
RETURNS void AS $$
BEGIN
  -- net.http_post signature: url, body, params, headers, timeout_milliseconds
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
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Ensure service_role can execute
GRANT EXECUTE ON FUNCTION public.trigger_next_step_internal(TEXT, TEXT, TEXT, JSONB) TO service_role;
