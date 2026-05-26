-- Track extraction state on house_bills_2. Single column:
-- references_extracted_at IS NULL → candidate. references_extracted_at IS
-- NOT NULL → we've run extraction.
--
-- No reason column — `IS NULL` is the only signal the worker needs. When
-- Congress pushes a content update, the companion trigger nulls this column
-- and the worker re-extracts (deleting old bill_references rows for the
-- bill before inserting new ones).
--
-- Errors per-bill are surfaced via worker logs / Discord embeds at run
-- time, not persisted on the row. If we ever need persistent error state
-- we can add it later without breaking this contract.

ALTER TABLE public.house_bills_2
    ADD COLUMN references_extracted_at timestamptz NULL;

-- Partial index narrows the candidate set: rows we haven't processed AND
-- that have something extractable. Bills with neither bill_text nor
-- latest_summary are never picked up.
CREATE INDEX house_bills_2_references_candidates_idx
    ON public.house_bills_2 (created_at)
    WHERE references_extracted_at IS NULL
      AND (bill_text IS NOT NULL OR latest_summary IS NOT NULL);
