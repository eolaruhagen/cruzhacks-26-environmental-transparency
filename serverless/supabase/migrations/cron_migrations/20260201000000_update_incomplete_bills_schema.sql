-- Migration: update_incomplete_bills_schema
-- Purpose: Update incomplete_bills table to store complete bill snapshot for diffing
-- Applied: 2026-02-01

-- 1. Wipe existing data as requested
TRUNCATE TABLE incomplete_bills;

-- 2. Add columns to match house_bills schema (complete snapshot for diffing)
-- These fields match the BillData interface from bill-data-fetcher
-- Note: PostgreSQL requires separate ALTER TABLE statements when using IF NOT EXISTS
ALTER TABLE incomplete_bills ADD COLUMN IF NOT EXISTS url TEXT;
ALTER TABLE incomplete_bills ADD COLUMN IF NOT EXISTS title TEXT;
ALTER TABLE incomplete_bills ADD COLUMN IF NOT EXISTS sponsor TEXT;
ALTER TABLE incomplete_bills ADD COLUMN IF NOT EXISTS party_of_sponsor TEXT;
ALTER TABLE incomplete_bills ADD COLUMN IF NOT EXISTS date_of_introduction DATE;
ALTER TABLE incomplete_bills ADD COLUMN IF NOT EXISTS committees TEXT;
ALTER TABLE incomplete_bills ADD COLUMN IF NOT EXISTS latest_action TEXT;
ALTER TABLE incomplete_bills ADD COLUMN IF NOT EXISTS latest_action_date DATE;
ALTER TABLE incomplete_bills ADD COLUMN IF NOT EXISTS latest_tracker_stage TEXT;
ALTER TABLE incomplete_bills ADD COLUMN IF NOT EXISTS cosponsors TEXT[];
ALTER TABLE incomplete_bills ADD COLUMN IF NOT EXISTS num_cosponsors INTEGER DEFAULT 0;
ALTER TABLE incomplete_bills ADD COLUMN IF NOT EXISTS subject_terms TEXT[];
ALTER TABLE incomplete_bills ADD COLUMN IF NOT EXISTS bill_policy_area TEXT;
ALTER TABLE incomplete_bills ADD COLUMN IF NOT EXISTS latest_summary TEXT;

-- 3. Update comment
COMMENT ON TABLE incomplete_bills IS 'Stores bills that could not be categorized due to insufficient info. Contains complete bill snapshot for diffing to detect when Congress.gov updates the bill data.';
