-- Migration: remove_unused_incomplete_bills_references
-- Purpose: Remove obsolete incomplete_bills JSONB column from congress_sync_state
-- Applied: 2026-02-01

-- Remove the incomplete_bills JSONB column from congress_sync_state
-- This was used for tracking bills that couldn't be processed, but we now use
-- the incomplete_bills table directly instead
ALTER TABLE congress_sync_state DROP COLUMN IF EXISTS incomplete_bills;
