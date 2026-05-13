ALTER TABLE public.house_bills_2
    ADD COLUMN IF NOT EXISTS last_categorization_attempt_at timestamptz NULL,
    ADD COLUMN IF NOT EXISTS last_categorization_reason text NULL;

-- Partial index supports the enrich-worker poll filter:
--   WHERE category IS NULL
--     AND (last_categorization_attempt_at IS NULL
--          OR last_categorization_attempt_at < congress_update_date_including_text)
-- The `category IS NULL` partial predicate keeps the index tiny — only
-- unenriched rows live in it.
CREATE INDEX IF NOT EXISTS house_bills_2_categorize_candidates_idx
    ON public.house_bills_2 (congress_update_date_including_text)
    WHERE category IS NULL;
