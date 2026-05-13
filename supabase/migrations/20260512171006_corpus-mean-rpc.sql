-- SECURITY DEFINER wrapper because `pipelines` is outside db.schemas, so
-- PostgREST can't reach corpus_mean directly. search_path is pinned so a
-- caller can't shadow `corpus_mean` via a temp schema (definer escalation).

ALTER TYPE public.artifact_type ADD VALUE IF NOT EXISTS 'bill';

CREATE OR REPLACE FUNCTION public.get_corpus_mean(p_type public.artifact_type)
RETURNS float4[]
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public, pipelines
AS $$
    SELECT embedding::float4[]
    FROM pipelines.corpus_mean
    WHERE artifact_type = p_type
    LIMIT 1
$$;

REVOKE ALL ON FUNCTION public.get_corpus_mean(public.artifact_type) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_corpus_mean(public.artifact_type) TO service_role;
