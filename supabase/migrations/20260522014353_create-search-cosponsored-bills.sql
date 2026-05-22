-- Captures public.search_cosponsored_bills, which has lived only in prod
-- (created via the Studio SQL editor). Regenerating types --local was
-- silently dropping it from packages/shared/src/database.types.ts and
-- breaking client/src/app/representatives/MyRepClient.tsx at tsc time.
-- Definition copied verbatim from prod via pg_get_functiondef.

CREATE OR REPLACE FUNCTION public.search_cosponsored_bills(
  cosponsor_name text,
  max_results    integer DEFAULT 25
)
RETURNS SETOF public.house_bills
LANGUAGE sql
STABLE
AS $function$
  SELECT *
  FROM public.house_bills
  WHERE cosponsors::text ILIKE '%' || cosponsor_name || '%'
  ORDER BY date_of_introduction DESC NULLS LAST
  LIMIT max_results;
$function$;
