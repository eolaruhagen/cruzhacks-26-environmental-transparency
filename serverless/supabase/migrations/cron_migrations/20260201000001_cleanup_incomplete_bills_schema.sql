-- Migration: cleanup_incomplete_bills_schema
-- Purpose: Remove unnecessary columns, keep only fields needed for diffing and migration
-- Applied: 2026-02-01

-- Drop unnecessary columns that aren't needed for bill snapshot/diffing
ALTER TABLE incomplete_bills DROP COLUMN IF EXISTS missing_fields;
ALTER TABLE incomplete_bills DROP COLUMN IF EXISTS error_context;
ALTER TABLE incomplete_bills DROP COLUMN IF EXISTS sync_date;
ALTER TABLE incomplete_bills DROP COLUMN IF EXISTS resolved;
ALTER TABLE incomplete_bills DROP COLUMN IF EXISTS bill_type;
ALTER TABLE incomplete_bills DROP COLUMN IF EXISTS bill_number;

-- Drop indexes that are no longer needed
DROP INDEX IF EXISTS idx_incomplete_bills_resolved;
DROP INDEX IF EXISTS idx_incomplete_bills_sync_date;

-- Drop the old helper function that references removed columns
DROP FUNCTION IF EXISTS record_incomplete_bill(TEXT, TEXT, TEXT, TEXT, TEXT[], TEXT);

-- Update comment
COMMENT ON TABLE incomplete_bills IS 'Stores bills that could not be categorized due to insufficient info. Contains complete bill snapshot matching house_bills schema for diffing and migration when Congress.gov updates bill data.';
