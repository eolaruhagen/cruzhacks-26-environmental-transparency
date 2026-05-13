-- When Congress pushes new content for a bill (congress_update_date_including_text
-- advances), clear last_categorization_attempt_at + reason so the row becomes a
-- candidate for the enrich-worker poll again. Encodes the re-eligibility rule
-- in the DB so the worker's filter stays a trivial column-to-NULL check.
--
-- search_path pinned so any future tightening of the table's RLS owner can't
-- silently shadow `public` references inside the trigger body.

CREATE OR REPLACE FUNCTION public.reset_categorization_on_congress_update()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $$
BEGIN
    IF NEW.congress_update_date_including_text IS DISTINCT FROM OLD.congress_update_date_including_text THEN
        NEW.last_categorization_attempt_at := NULL;
        NEW.last_categorization_reason := NULL;
    END IF;
    RETURN NEW;
END
$$;

DROP TRIGGER IF EXISTS trg_house_bills_2_reset_categorization
    ON public.house_bills_2;

CREATE TRIGGER trg_house_bills_2_reset_categorization
    BEFORE UPDATE ON public.house_bills_2
    FOR EACH ROW
    EXECUTE FUNCTION public.reset_categorization_on_congress_update();
