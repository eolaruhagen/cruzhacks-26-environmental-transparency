-- Migration: Update house_bills schema to match CSV analysis
-- Date: 2026-01-17

-- Drop old columns (keeping id and embedding)
ALTER TABLE house_bills 
  DROP COLUMN IF EXISTS name,
  DROP COLUMN IF EXISTS short_decrip,
  DROP COLUMN IF EXISTS status,
  DROP COLUMN IF EXISTS created_at;

-- Add new columns based on CSV analysis (99.7% filled = NOT NULL)
ALTER TABLE house_bills
  ADD COLUMN legislation_number TEXT NOT NULL DEFAULT '',
  ADD COLUMN url TEXT NOT NULL DEFAULT '',
  ADD COLUMN congress TEXT NOT NULL DEFAULT '',
  ADD COLUMN title TEXT NOT NULL DEFAULT '',
  ADD COLUMN sponsor TEXT NOT NULL DEFAULT '',
  ADD COLUMN party_of_sponsor TEXT NOT NULL DEFAULT '',
  ADD COLUMN date_of_introduction DATE,
  ADD COLUMN committees TEXT,
  ADD COLUMN latest_action TEXT NOT NULL DEFAULT '',
  ADD COLUMN latest_action_date DATE,
  ADD COLUMN latest_tracker_stage TEXT NOT NULL DEFAULT '',
  -- Cosponsors (89% of bills have them)
  ADD COLUMN cosponsors TEXT[],
  ADD COLUMN num_cosponsors INTEGER DEFAULT 0,
  -- Subject terms (83% of bills have them - great for categorization)
  ADD COLUMN subject_terms TEXT[],
  -- Nullable fields (~48% filled)
  ADD COLUMN bill_policy_area TEXT,
  ADD COLUMN latest_summary TEXT,
  -- Timestamps
  ADD COLUMN created_at TIMESTAMPTZ DEFAULT NOW(),
  ADD COLUMN updated_at TIMESTAMPTZ DEFAULT NOW();

-- Remove default values after migration (for NOT NULL columns)
ALTER TABLE house_bills
  ALTER COLUMN legislation_number DROP DEFAULT,
  ALTER COLUMN url DROP DEFAULT,
  ALTER COLUMN congress DROP DEFAULT,
  ALTER COLUMN title DROP DEFAULT,
  ALTER COLUMN sponsor DROP DEFAULT,
  ALTER COLUMN party_of_sponsor DROP DEFAULT,
  ALTER COLUMN latest_action DROP DEFAULT,
  ALTER COLUMN latest_tracker_stage DROP DEFAULT;

-- Create index on legislation_number for fast lookups
CREATE UNIQUE INDEX IF NOT EXISTS idx_house_bills_legislation_number ON house_bills(legislation_number);

-- Create index on congress for filtering
CREATE INDEX IF NOT EXISTS idx_house_bills_congress ON house_bills(congress);

-- Create index on party for analytics
CREATE INDEX IF NOT EXISTS idx_house_bills_party ON house_bills(party_of_sponsor);

-- Create GIN index on subject_terms for array searches
CREATE INDEX IF NOT EXISTS idx_house_bills_subject_terms ON house_bills USING GIN(subject_terms);

-- Add comment for documentation
COMMENT ON TABLE house_bills IS 'Environmental legislation bills from Congress.gov. Subject terms and cosponsors stored as arrays.';
