-- Migration: create search_cosponsored_bills RPC function
-- Purpose: Search house_bills by cosponsor last name using text cast + ilike
-- The Supabase JS client cannot do ::text casts in filters,
-- so we expose this as an RPC function.

CREATE OR REPLACE FUNCTION search_cosponsored_bills(
  cosponsor_name TEXT,
  max_results INT DEFAULT 25
)
RETURNS SETOF house_bills
LANGUAGE sql
STABLE
AS $$
  SELECT *
  FROM house_bills
  WHERE cosponsors::text ILIKE '%' || cosponsor_name || '%'
  ORDER BY date_of_introduction DESC NULLS LAST
  LIMIT max_results;
$$;
