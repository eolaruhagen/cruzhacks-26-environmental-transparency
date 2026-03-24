-- Fix mutable search_path security warning on pipeline functions.
-- Setting search_path = '' forces all table/function references inside
-- the function body to be fully schema-qualified, preventing search path injection.

CREATE OR REPLACE FUNCTION "public"."check_and_reset_daily_limit"() RETURNS "void"
    LANGUAGE "plpgsql"
    SET search_path = ''
    AS $$
BEGIN
    UPDATE public.congress_sync_state
    SET daily_request_count = 0,
        last_request_reset = NOW()
    WHERE last_request_reset < CURRENT_DATE;
END;
$$;

CREATE OR REPLACE FUNCTION "public"."increment_api_request_count"("p_increment" integer) RETURNS "void"
    LANGUAGE "plpgsql"
    SET search_path = ''
    AS $$
BEGIN
    PERFORM public.check_and_reset_daily_limit();
    UPDATE public.congress_sync_state
    SET daily_request_count = daily_request_count + p_increment,
        updated_at = NOW()
    WHERE id = (SELECT id FROM public.congress_sync_state ORDER BY updated_at DESC LIMIT 1);
END;
$$;

CREATE OR REPLACE FUNCTION "public"."get_current_sync_state"() RETURNS "public"."congress_sync_state"
    LANGUAGE "sql"
    SET search_path = ''
    AS $$
    SELECT * FROM public.congress_sync_state ORDER BY updated_at DESC LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION "public"."update_sync_state"(
    "p_status" "text",
    "p_stage" "text" DEFAULT NULL,
    "p_error" "text" DEFAULT NULL,
    "p_last_null_count" integer DEFAULT NULL,
    "p_stagnant_cycles" integer DEFAULT NULL
) RETURNS "void"
    LANGUAGE "sql"
    SET search_path = ''
    AS $$
    UPDATE public.congress_sync_state
    SET status = p_status,
        pipeline_stage = COALESCE(p_stage, pipeline_stage),
        last_error = p_error,
        last_null_count = COALESCE(p_last_null_count, last_null_count),
        stagnant_cycles = COALESCE(p_stagnant_cycles, stagnant_cycles),
        updated_at = NOW()
    WHERE id = (SELECT id FROM public.congress_sync_state ORDER BY updated_at DESC LIMIT 1);
$$;
