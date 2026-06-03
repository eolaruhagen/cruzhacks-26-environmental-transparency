-- When Congress pushes a content update to a bill (signalled by a change in
-- congress_update_date_including_text), the previously extracted references
-- become stale: amended text may mention new laws or drop old ones. Null
-- references_extracted_at so the worker re-eligibilises the row on its next
-- poll.
--
-- The worker deletes pre-existing bill_references rows for the bill before
-- inserting new ones — the trigger only handles the "this row is dirty
-- again" signal, not the cleanup itself.
--
-- Separate function/trigger from reset_categorization_on_congress_update to
-- keep the concerns independent.

CREATE OR REPLACE FUNCTION public.reset_references_on_congress_update()
    RETURNS TRIGGER
    LANGUAGE plpgsql
AS $$
BEGIN
    IF NEW.congress_update_date_including_text IS DISTINCT FROM OLD.congress_update_date_including_text THEN
        NEW.references_extracted_at := NULL;
    END IF;
    RETURN NEW;
END;
$$;

CREATE TRIGGER trg_house_bills_2_reset_references
    BEFORE UPDATE ON public.house_bills_2
    FOR EACH ROW
    EXECUTE FUNCTION public.reset_references_on_congress_update();
