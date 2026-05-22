-- Full-text search support for house_bills_2.
--
-- Layout:
--   1. An IMMUTABLE SQL function `house_bills_search_vector(...)` that
--      composes the per-row tsvector with weighted importance:
--          A (highest)  title
--          B            latest_summary
--          C            subject_terms (joined), bill_policy_area, committees (joined)
--          D (lowest)   bill_text
--   2. A STORED generated column `search_vector` that calls that function
--      with the row's columns.
--   3. A GIN index on the generated column.
--
-- Why a wrapper function: Postgres' generated-column / expression-index
-- machinery requires expressions to be IMMUTABLE. The functions involved
-- (to_tsvector, setweight, array_to_string, ||, coalesce) look immutable
-- but at least one is catalogued as STABLE in PG 17, so a bare expression
-- is rejected ("generation expression is not immutable"). Wrapping the
-- chain in our own SQL function lets us assert IMMUTABLE ourselves — a
-- standard Postgres workaround. The assertion is sound for our usage:
-- we never reload text-search dictionaries at runtime.
--
-- Why a generated column instead of an expression index: queries become
-- `WHERE search_vector @@ q` instead of restating the 6-arg function on
-- every reference (which the planner only matches if byte-identical to
-- the index expression). Ranked search (`ts_rank(search_vector, q)`)
-- reads the materialized vector directly — no per-row recomputation.
-- Disk cost: a few KB of tsvector per row, negligible at our scale.
--
-- Always pass 'english' as the regconfig literal (the no-config form of
-- to_tsvector depends on a session GUC and is non-immutable).

BEGIN;

CREATE OR REPLACE FUNCTION public.house_bills_search_vector(
    p_title text,
    p_latest_summary text,
    p_subject_terms text[],
    p_bill_policy_area text,
    p_committees text[],
    p_bill_text text
)
RETURNS tsvector
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
AS $$
    SELECT
        setweight(to_tsvector('english', coalesce(p_title, '')), 'A') ||
        setweight(to_tsvector('english', coalesce(p_latest_summary, '')), 'B') ||
        setweight(
            to_tsvector(
                'english',
                coalesce(array_to_string(p_subject_terms, ' '), '') || ' ' ||
                coalesce(p_bill_policy_area, '') || ' ' ||
                coalesce(array_to_string(p_committees, ' '), '')
            ),
            'C'
        ) ||
        setweight(to_tsvector('english', coalesce(p_bill_text, '')), 'D')
$$;

COMMENT ON FUNCTION public.house_bills_search_vector(
    text, text, text[], text, text[], text
) IS
    'Per-row tsvector for house_bills_2 search. Weights: A=title, '
    'B=latest_summary, C=subject_terms+bill_policy_area+committees, D=bill_text. '
    'IMMUTABLE assertion is sound because we never reload text-search dictionaries.';

ALTER TABLE public.house_bills_2
    ADD COLUMN search_vector tsvector
        GENERATED ALWAYS AS (
            public.house_bills_search_vector(
                title,
                latest_summary,
                subject_terms,
                bill_policy_area,
                committees,
                bill_text
            )
        ) STORED;

CREATE INDEX house_bills_2_search_vector_idx
    ON public.house_bills_2
    USING gin (search_vector);

COMMENT ON COLUMN public.house_bills_2.search_vector IS
    'Auto-maintained tsvector for full-text search. See '
    'house_bills_search_vector() for the weighting scheme. '
    'Use websearch_to_tsquery + ts_rank for ranked results.';

COMMIT;
