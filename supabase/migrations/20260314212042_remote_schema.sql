
SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;
CREATE EXTENSION IF NOT EXISTS "pg_cron" WITH SCHEMA "pg_catalog";
CREATE EXTENSION IF NOT EXISTS "pg_net" WITH SCHEMA "extensions";
COMMENT ON SCHEMA "public" IS 'standard public schema';

CREATE EXTENSION IF NOT EXISTS "pg_graphql" WITH SCHEMA "graphql";
CREATE EXTENSION IF NOT EXISTS "pg_stat_statements" WITH SCHEMA "extensions";
CREATE EXTENSION IF NOT EXISTS "pgcrypto" WITH SCHEMA "extensions";
CREATE EXTENSION IF NOT EXISTS "pgmq";
CREATE EXTENSION IF NOT EXISTS "supabase_vault" WITH SCHEMA "vault";
CREATE EXTENSION IF NOT EXISTS "uuid-ossp" WITH SCHEMA "extensions";
CREATE EXTENSION IF NOT EXISTS "vector" WITH SCHEMA "extensions";
CREATE TYPE "public"."bill_type" AS ENUM (
    'air_and_atmosphere',
    'water_resources',
    'waste_and_toxics',
    'energy_and_resources',
    'land_and_conservation',
    'disaster_and_emergency',
    'climate_and_emissions',
    'justice_and_environment'
);
ALTER TYPE "public"."bill_type" OWNER TO "postgres";
COMMENT ON TYPE "public"."bill_type" IS 'type for a bill or online article to be tied to';

CREATE OR REPLACE FUNCTION "public"."check_and_reset_daily_limit"() RETURNS "void"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
    UPDATE congress_sync_state
    SET daily_request_count = 0,
        last_request_reset = NOW()
    WHERE last_request_reset < CURRENT_DATE;
END;
$$;
ALTER FUNCTION "public"."check_and_reset_daily_limit"() OWNER TO "postgres";

SET default_tablespace = '';

SET default_table_access_method = "heap";
CREATE TABLE IF NOT EXISTS "public"."congress_sync_state" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "current_congress" integer,
    "last_sync_date" timestamp with time zone,
    "status" "text" DEFAULT 'idle'::"text",
    "pipeline_stage" "text",
    "last_null_count" integer DEFAULT 0,
    "stagnant_cycles" integer DEFAULT 0,
    "last_error" "text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "daily_request_count" integer DEFAULT 0,
    "last_request_reset" timestamp with time zone DEFAULT "now"(),
    "collector_status" "text" DEFAULT 'idle'::"text",
    "fetcher_status" "text" DEFAULT 'idle'::"text"
);
ALTER TABLE "public"."congress_sync_state" OWNER TO "postgres";
CREATE OR REPLACE FUNCTION "public"."get_current_sync_state"() RETURNS "public"."congress_sync_state"
    LANGUAGE "sql"
    AS $$
  SELECT * FROM congress_sync_state ORDER BY updated_at DESC LIMIT 1;
$$;
ALTER FUNCTION "public"."get_current_sync_state"() OWNER TO "postgres";
CREATE OR REPLACE FUNCTION "public"."increment_api_request_count"("p_increment" integer) RETURNS "void"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
    PERFORM check_and_reset_daily_limit();
    UPDATE congress_sync_state
    SET daily_request_count = daily_request_count + p_increment,
        updated_at = NOW()
    WHERE id = (SELECT id FROM congress_sync_state ORDER BY updated_at DESC LIMIT 1);
END;
$$;
ALTER FUNCTION "public"."increment_api_request_count"("p_increment" integer) OWNER TO "postgres";
CREATE OR REPLACE FUNCTION "public"."pgmq_archive"("queue_name" "text", "msg_id" bigint) RETURNS boolean
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pgmq'
    AS $$
BEGIN
    RETURN pgmq.archive(queue_name, msg_id);
END;
$$;
ALTER FUNCTION "public"."pgmq_archive"("queue_name" "text", "msg_id" bigint) OWNER TO "postgres";
CREATE OR REPLACE FUNCTION "public"."pgmq_metrics"("queue_name" "text") RETURNS TABLE("queue_length" bigint, "newest_msg_age_sec" integer, "oldest_msg_age_sec" integer, "total_messages" bigint)
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pgmq'
    AS $$
BEGIN
    RETURN QUERY SELECT m.queue_length, m.newest_msg_age_sec, m.oldest_msg_age_sec, m.total_messages 
    FROM pgmq.metrics(queue_name) m;
END;
$$;
ALTER FUNCTION "public"."pgmq_metrics"("queue_name" "text") OWNER TO "postgres";
CREATE OR REPLACE FUNCTION "public"."pgmq_read_batch"("queue_name" "text", "batch_size" integer DEFAULT 10, "visibility_timeout" integer DEFAULT 30) RETURNS TABLE("msg_id" bigint, "read_ct" integer, "enqueued_at" timestamp with time zone, "vt" timestamp with time zone, "message" "jsonb", "headers" "jsonb")
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pgmq'
    AS $$
BEGIN
  RETURN QUERY SELECT * FROM pgmq.read(queue_name, visibility_timeout, batch_size);
END;
$$;
ALTER FUNCTION "public"."pgmq_read_batch"("queue_name" "text", "batch_size" integer, "visibility_timeout" integer) OWNER TO "postgres";
CREATE OR REPLACE FUNCTION "public"."pgmq_send_batch"("queue_name" "text", "msgs" "jsonb"[]) RETURNS SETOF bigint
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pgmq'
    AS $$
DECLARE
    msg JSONB;
    msg_id BIGINT;
BEGIN
    FOREACH msg IN ARRAY msgs
    LOOP
        SELECT pgmq.send(queue_name, msg) INTO msg_id;
        RETURN NEXT msg_id;
    END LOOP;
    RETURN;
END;
$$;
ALTER FUNCTION "public"."pgmq_send_batch"("queue_name" "text", "msgs" "jsonb"[]) OWNER TO "postgres";
CREATE OR REPLACE FUNCTION "public"."trigger_next_step_internal"("p_project_url" "text", "p_service_role_key" "text", "p_function_name" "text", "p_payload" "jsonb" DEFAULT '{}'::"jsonb") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'net'
    AS $$
BEGIN
  -- net.http_post signature: url, body, params, headers, timeout_milliseconds
  PERFORM net.http_post(
    p_project_url || '/functions/v1/' || p_function_name,  -- url
    p_payload,  -- body
    '{}'::jsonb,  -- params (empty)
    jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || p_service_role_key
    ),  -- headers
    5000  -- timeout_milliseconds
  );
END;
$$;
ALTER FUNCTION "public"."trigger_next_step_internal"("p_project_url" "text", "p_service_role_key" "text", "p_function_name" "text", "p_payload" "jsonb") OWNER TO "postgres";
CREATE OR REPLACE FUNCTION "public"."update_sync_state"("p_status" "text", "p_stage" "text" DEFAULT NULL::"text", "p_error" "text" DEFAULT NULL::"text", "p_last_null_count" integer DEFAULT NULL::integer, "p_stagnant_cycles" integer DEFAULT NULL::integer) RETURNS "void"
    LANGUAGE "sql"
    AS $$
  UPDATE congress_sync_state
  SET status = p_status,
      pipeline_stage = COALESCE(p_stage, pipeline_stage),
      last_error = p_error,
      last_null_count = COALESCE(p_last_null_count, last_null_count),
      stagnant_cycles = COALESCE(p_stagnant_cycles, stagnant_cycles),
      updated_at = NOW()
  WHERE id = (SELECT id FROM congress_sync_state ORDER BY updated_at DESC LIMIT 1);
$$;
ALTER FUNCTION "public"."update_sync_state"("p_status" "text", "p_stage" "text", "p_error" "text", "p_last_null_count" integer, "p_stagnant_cycles" integer) OWNER TO "postgres";
CREATE TABLE IF NOT EXISTS "public"."categories_embeddings" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "subcategory" "text" NOT NULL,
    "description" "text" NOT NULL,
    "bill_type" "public"."bill_type" NOT NULL,
    "embedding" "extensions"."halfvec"(1536),
    "created_at" timestamp with time zone DEFAULT "now"()
);
ALTER TABLE "public"."categories_embeddings" OWNER TO "postgres";
COMMENT ON TABLE "public"."categories_embeddings" IS 'Embeddings for environmental policy subcategories, grouped by bill_type parent category';

CREATE TABLE IF NOT EXISTS "public"."house_bills" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "embedding" "extensions"."halfvec",
    "legislation_number" "text" NOT NULL,
    "url" "text" NOT NULL,
    "congress" "text" NOT NULL,
    "title" "text" NOT NULL,
    "sponsor" "text" NOT NULL,
    "party_of_sponsor" "text" NOT NULL,
    "date_of_introduction" "date",
    "committees" "text",
    "latest_action" "text" NOT NULL,
    "latest_action_date" "date",
    "latest_tracker_stage" "text" NOT NULL,
    "cosponsors" "text"[],
    "num_cosponsors" integer DEFAULT 0,
    "subject_terms" "text"[],
    "bill_policy_area" "text",
    "latest_summary" "text",
    "category" "public"."bill_type",
    "updated_category" "public"."bill_type",
    "subcategory_scores" "jsonb"
);
ALTER TABLE "public"."house_bills" OWNER TO "postgres";
COMMENT ON TABLE "public"."house_bills" IS 'Environmental legislation bills from Congress.gov. Subject terms and cosponsors stored as arrays.';

CREATE TABLE IF NOT EXISTS "public"."incomplete_bills" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "legislation_number" "text" NOT NULL,
    "congress" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "url" "text",
    "title" "text",
    "sponsor" "text",
    "party_of_sponsor" "text",
    "date_of_introduction" "date",
    "committees" "text",
    "latest_action" "text",
    "latest_action_date" "date",
    "latest_tracker_stage" "text",
    "cosponsors" "text"[],
    "num_cosponsors" integer DEFAULT 0,
    "subject_terms" "text"[],
    "bill_policy_area" "text",
    "latest_summary" "text"
);
ALTER TABLE "public"."incomplete_bills" OWNER TO "postgres";
COMMENT ON TABLE "public"."incomplete_bills" IS 'Stores bills that could not be categorized due to insufficient info. Contains complete bill snapshot matching house_bills schema for diffing and migration when Congress.gov updates bill data.';

ALTER TABLE ONLY "public"."categories_embeddings"
    ADD CONSTRAINT "categories_embeddings_pkey" PRIMARY KEY ("id");

ALTER TABLE ONLY "public"."categories_embeddings"
    ADD CONSTRAINT "categories_embeddings_subcategory_key" UNIQUE ("subcategory");

ALTER TABLE ONLY "public"."congress_sync_state"
    ADD CONSTRAINT "congress_sync_state_pkey" PRIMARY KEY ("id");

ALTER TABLE ONLY "public"."house_bills"
    ADD CONSTRAINT "house_bills_pkey" PRIMARY KEY ("id");

ALTER TABLE ONLY "public"."incomplete_bills"
    ADD CONSTRAINT "incomplete_bills_legislation_number_key" UNIQUE ("legislation_number");

ALTER TABLE ONLY "public"."incomplete_bills"
    ADD CONSTRAINT "incomplete_bills_pkey" PRIMARY KEY ("id");

CREATE INDEX "idx_categories_embeddings_bill_type" ON "public"."categories_embeddings" USING "btree" ("bill_type");

CREATE INDEX "idx_house_bills_congress" ON "public"."house_bills" USING "btree" ("congress");

CREATE UNIQUE INDEX "idx_house_bills_legislation_number" ON "public"."house_bills" USING "btree" ("legislation_number");

CREATE INDEX "idx_house_bills_party" ON "public"."house_bills" USING "btree" ("party_of_sponsor");

CREATE INDEX "idx_incomplete_bills_legislation" ON "public"."incomplete_bills" USING "btree" ("legislation_number");

CREATE INDEX "idx_sync_state_stage" ON "public"."congress_sync_state" USING "btree" ("pipeline_stage");

CREATE INDEX "idx_sync_state_status" ON "public"."congress_sync_state" USING "btree" ("status");

CREATE POLICY "Allow read access" ON "public"."categories_embeddings" FOR SELECT USING (true);

CREATE POLICY "Enable read access for all users" ON "public"."house_bills" FOR SELECT USING (true);

ALTER TABLE "public"."categories_embeddings" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."house_bills" ENABLE ROW LEVEL SECURITY;
ALTER PUBLICATION "supabase_realtime" OWNER TO "postgres";
GRANT USAGE ON SCHEMA "public" TO "postgres";
GRANT USAGE ON SCHEMA "public" TO "anon";
GRANT USAGE ON SCHEMA "public" TO "authenticated";
GRANT USAGE ON SCHEMA "public" TO "service_role";
GRANT ALL ON FUNCTION "public"."check_and_reset_daily_limit"() TO "anon";
GRANT ALL ON FUNCTION "public"."check_and_reset_daily_limit"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."check_and_reset_daily_limit"() TO "service_role";
GRANT ALL ON TABLE "public"."congress_sync_state" TO "anon";
GRANT ALL ON TABLE "public"."congress_sync_state" TO "authenticated";
GRANT ALL ON TABLE "public"."congress_sync_state" TO "service_role";

GRANT ALL ON FUNCTION "public"."get_current_sync_state"() TO "anon";
GRANT ALL ON FUNCTION "public"."get_current_sync_state"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_current_sync_state"() TO "service_role";

GRANT ALL ON FUNCTION "public"."increment_api_request_count"("p_increment" integer) TO "anon";
GRANT ALL ON FUNCTION "public"."increment_api_request_count"("p_increment" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."increment_api_request_count"("p_increment" integer) TO "service_role";

GRANT ALL ON FUNCTION "public"."pgmq_archive"("queue_name" "text", "msg_id" bigint) TO "anon";
GRANT ALL ON FUNCTION "public"."pgmq_archive"("queue_name" "text", "msg_id" bigint) TO "authenticated";
GRANT ALL ON FUNCTION "public"."pgmq_archive"("queue_name" "text", "msg_id" bigint) TO "service_role";

GRANT ALL ON FUNCTION "public"."pgmq_metrics"("queue_name" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."pgmq_metrics"("queue_name" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."pgmq_metrics"("queue_name" "text") TO "service_role";

GRANT ALL ON FUNCTION "public"."pgmq_read_batch"("queue_name" "text", "batch_size" integer, "visibility_timeout" integer) TO "anon";
GRANT ALL ON FUNCTION "public"."pgmq_read_batch"("queue_name" "text", "batch_size" integer, "visibility_timeout" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."pgmq_read_batch"("queue_name" "text", "batch_size" integer, "visibility_timeout" integer) TO "service_role";

GRANT ALL ON FUNCTION "public"."pgmq_send_batch"("queue_name" "text", "msgs" "jsonb"[]) TO "anon";
GRANT ALL ON FUNCTION "public"."pgmq_send_batch"("queue_name" "text", "msgs" "jsonb"[]) TO "authenticated";
GRANT ALL ON FUNCTION "public"."pgmq_send_batch"("queue_name" "text", "msgs" "jsonb"[]) TO "service_role";
GRANT ALL ON FUNCTION "public"."trigger_next_step_internal"("p_project_url" "text", "p_service_role_key" "text", "p_function_name" "text", "p_payload" "jsonb") TO "anon";
GRANT ALL ON FUNCTION "public"."trigger_next_step_internal"("p_project_url" "text", "p_service_role_key" "text", "p_function_name" "text", "p_payload" "jsonb") TO "authenticated";
GRANT ALL ON FUNCTION "public"."trigger_next_step_internal"("p_project_url" "text", "p_service_role_key" "text", "p_function_name" "text", "p_payload" "jsonb") TO "service_role";

GRANT ALL ON FUNCTION "public"."update_sync_state"("p_status" "text", "p_stage" "text", "p_error" "text", "p_last_null_count" integer, "p_stagnant_cycles" integer) TO "anon";
GRANT ALL ON FUNCTION "public"."update_sync_state"("p_status" "text", "p_stage" "text", "p_error" "text", "p_last_null_count" integer, "p_stagnant_cycles" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."update_sync_state"("p_status" "text", "p_stage" "text", "p_error" "text", "p_last_null_count" integer, "p_stagnant_cycles" integer) TO "service_role";

GRANT ALL ON TABLE "public"."categories_embeddings" TO "anon";
GRANT ALL ON TABLE "public"."categories_embeddings" TO "authenticated";
GRANT ALL ON TABLE "public"."categories_embeddings" TO "service_role";

GRANT ALL ON TABLE "public"."house_bills" TO "anon";
GRANT ALL ON TABLE "public"."house_bills" TO "authenticated";
GRANT ALL ON TABLE "public"."house_bills" TO "service_role";

GRANT ALL ON TABLE "public"."incomplete_bills" TO "anon";
GRANT ALL ON TABLE "public"."incomplete_bills" TO "authenticated";
GRANT ALL ON TABLE "public"."incomplete_bills" TO "service_role";

ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "service_role";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "service_role";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "service_role";
