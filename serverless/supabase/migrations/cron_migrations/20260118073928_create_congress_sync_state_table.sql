-- Migration: create_congress_sync_state_table
-- Purpose: Track the state of the Congress bill sync pipeline
-- Applied: 2026-01-18

CREATE TABLE IF NOT EXISTS congress_sync_state (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  -- Current congress being synced
  current_congress INTEGER,
  
  -- Last successful sync timestamp
  last_sync_date TIMESTAMPTZ,
  
  -- Pipeline status: 'idle', 'syncing', 'failed'
  status TEXT DEFAULT 'idle',
  
  -- Current stage in pipeline (for debugging)
  pipeline_stage TEXT, -- 'fetch_congress', 'fetch_bills', 'fetch_subjects', 'fetch_details', 'embedding', 'categorization'
  
  -- For plateau detection in categorization
  last_null_count INTEGER DEFAULT 0,
  stagnant_cycles INTEGER DEFAULT 0,
  
  -- Error tracking
  last_error TEXT,
  
  -- List of bills that couldn't be fully processed
  incomplete_bills JSONB, -- Array of {legislation_number, missing_fields[]}
  
  -- Rate limit tracking (added in later migration)
  daily_request_count INTEGER DEFAULT 0,
  last_request_reset TIMESTAMPTZ DEFAULT NOW(),
  
  -- Worker status tracking
  collector_status TEXT DEFAULT 'idle',
  fetcher_status TEXT DEFAULT 'idle',
  
  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for quick status lookups
CREATE INDEX idx_sync_state_status ON congress_sync_state(status);
CREATE INDEX idx_sync_state_stage ON congress_sync_state(pipeline_stage);

-- Insert initial row so pipeline has a starting point
INSERT INTO congress_sync_state (status, collector_status, fetcher_status)
VALUES ('idle', 'idle', 'idle');
