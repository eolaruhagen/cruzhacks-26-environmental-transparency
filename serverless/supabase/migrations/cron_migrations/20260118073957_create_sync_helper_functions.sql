-- Migration: create_sync_helper_functions
-- Purpose: SQL helper functions for state management called by Edge Functions
-- Applied: 2026-01-18

-- Get the current sync state (most recent row)
CREATE OR REPLACE FUNCTION get_current_sync_state()
RETURNS congress_sync_state AS $$
  SELECT * FROM congress_sync_state ORDER BY updated_at DESC LIMIT 1;
$$ LANGUAGE SQL;

-- Update sync state with new status/stage/error
CREATE OR REPLACE FUNCTION update_sync_state(
  p_status TEXT,
  p_stage TEXT DEFAULT NULL,
  p_error TEXT DEFAULT NULL,
  p_last_null_count INTEGER DEFAULT NULL,
  p_stagnant_cycles INTEGER DEFAULT NULL
)
RETURNS void AS $$
  UPDATE congress_sync_state
  SET status = p_status,
      pipeline_stage = p_stage,
      last_error = p_error,
      last_null_count = COALESCE(p_last_null_count, last_null_count),
      stagnant_cycles = COALESCE(p_stagnant_cycles, stagnant_cycles),
      updated_at = NOW()
  WHERE id = (SELECT id FROM congress_sync_state ORDER BY updated_at DESC LIMIT 1);
$$ LANGUAGE SQL;

-- Record a bill that failed processing
CREATE OR REPLACE FUNCTION record_incomplete_bill(
  p_legislation_number TEXT,
  p_congress TEXT,
  p_bill_type TEXT,
  p_bill_number TEXT,
  p_missing_fields TEXT[],
  p_error_context TEXT DEFAULT NULL
)
RETURNS void AS $$
  INSERT INTO incomplete_bills (
    legislation_number, congress, bill_type, bill_number,
    missing_fields, error_context
  ) VALUES (
    p_legislation_number, p_congress, p_bill_type, p_bill_number,
    p_missing_fields, p_error_context
  )
  ON CONFLICT (legislation_number) DO UPDATE SET
    missing_fields = p_missing_fields,
    error_context = p_error_context,
    resolved = FALSE,
    updated_at = NOW();
$$ LANGUAGE SQL;

-- Check and reset daily request count if it's a new day
CREATE OR REPLACE FUNCTION check_and_reset_daily_limit()
RETURNS void AS $$
BEGIN
    UPDATE congress_sync_state
    SET daily_request_count = 0,
        last_request_reset = NOW()
    WHERE last_request_reset < CURRENT_DATE;
END;
$$ LANGUAGE plpgsql;

-- Increment API request count (for rate limiting)
CREATE OR REPLACE FUNCTION increment_api_request_count(p_increment INTEGER)
RETURNS void AS $$
BEGIN
    PERFORM check_and_reset_daily_limit();
    UPDATE congress_sync_state
    SET daily_request_count = daily_request_count + p_increment,
        updated_at = NOW()
    WHERE id = (SELECT id FROM congress_sync_state ORDER BY updated_at DESC LIMIT 1);
END;
$$ LANGUAGE plpgsql;
