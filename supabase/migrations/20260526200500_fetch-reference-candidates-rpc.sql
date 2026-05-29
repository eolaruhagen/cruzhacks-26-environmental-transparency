-- supabase-js .order() doesn't accept random(), so the references worker
-- can't shuffle candidates client-side. This RPC does the random pick
-- server-side over the partial candidate index from
-- 20260526172633_house-bills-2-references-state.sql.
--
-- SECURITY INVOKER (the default): service_role is the only caller and
-- already has SELECT on house_bills_2 + bypasses RLS, so DEFINER would
-- only widen blast radius without unlocking anything.
--
-- SET search_path = '' silences the Supabase advisor's
-- function_search_path_mutable lint. All references in the body are
-- fully qualified (public.house_bills_2, public.legislation_type),
-- and random() resolves via pg_catalog (always implicitly first).
--
-- Returns the minimal column set the worker needs. legislation_number is
-- assembled TS-side from (bill_type, bill_number, congress) so the wire
-- format isn't baked into the database contract.

CREATE OR REPLACE FUNCTION public.fetch_reference_candidates(batch_size integer)
RETURNS TABLE (
    id                 uuid,
    congress           integer,
    bill_type          public.legislation_type,
    bill_number        integer,
    title              text,
    bill_text          text,
    latest_summary     text
)
LANGUAGE sql
STABLE
SET search_path = ''
AS $$
    SELECT id, congress, bill_type, bill_number, title, bill_text, latest_summary
    FROM public.house_bills_2
    WHERE references_extracted_at IS NULL
      AND (bill_text IS NOT NULL OR latest_summary IS NOT NULL)
    ORDER BY random()
    LIMIT batch_size;
$$;

REVOKE ALL ON FUNCTION public.fetch_reference_candidates(integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.fetch_reference_candidates(integer) TO service_role;
