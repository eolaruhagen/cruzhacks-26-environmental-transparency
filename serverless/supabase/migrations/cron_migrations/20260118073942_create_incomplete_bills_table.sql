-- Migration: create_incomplete_bills_table
-- Purpose: "Morgue" table for bills that failed processing after max retries
-- Applied: 2026-01-18

CREATE TABLE IF NOT EXISTS incomplete_bills (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  -- Bill identifier (unique constraint for upsert)
  legislation_number TEXT NOT NULL UNIQUE,
  
  -- Bill components for retry if needed
  congress TEXT NOT NULL,
  bill_type TEXT NOT NULL,
  bill_number TEXT NOT NULL,
  
  -- What went wrong
  missing_fields TEXT[], -- ['sponsor', 'committees', 'cosponsors', 'embedding', 'category', 'fetch_failed']
  error_context TEXT,    -- Actual error message
  
  -- When it failed
  sync_date TIMESTAMPTZ DEFAULT NOW(),
  
  -- Manual resolution flag
  resolved BOOLEAN DEFAULT FALSE,
  
  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for querying incomplete bills
CREATE INDEX idx_incomplete_bills_legislation ON incomplete_bills(legislation_number);
CREATE INDEX idx_incomplete_bills_resolved ON incomplete_bills(resolved);
CREATE INDEX idx_incomplete_bills_sync_date ON incomplete_bills(sync_date);
