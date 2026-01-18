-- Migration: add_pgmq_helper_functions
-- Purpose: Wrapper functions for PGMQ operations callable from Edge Functions via RPC
-- Applied: 2026-01-18
-- Updated: 2026-01-18 - Added SECURITY DEFINER to fix permission issues

-- Grant permissions on pgmq schema to service_role
GRANT USAGE ON SCHEMA pgmq TO service_role, authenticated;
GRANT ALL ON ALL TABLES IN SCHEMA pgmq TO service_role;
GRANT ALL ON ALL SEQUENCES IN SCHEMA pgmq TO service_role;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA pgmq TO service_role;

-- Read multiple messages from queue
-- Returns messages that become "invisible" for visibility_timeout seconds
-- If not archived within timeout, they become visible again (retry)
-- SECURITY DEFINER allows this to run with owner privileges (bypasses RLS)
-- NOTE: Must include all 6 columns from pgmq.message_record type
CREATE OR REPLACE FUNCTION public.pgmq_read_batch(
  queue_name TEXT,
  batch_size INTEGER DEFAULT 10,
  visibility_timeout INTEGER DEFAULT 30
)
RETURNS TABLE(msg_id BIGINT, read_ct INTEGER, enqueued_at TIMESTAMPTZ, vt TIMESTAMPTZ, message JSONB, headers JSONB)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pgmq
AS $$
BEGIN
  RETURN QUERY SELECT * FROM pgmq.read(queue_name, visibility_timeout, batch_size);
END;
$$;

GRANT EXECUTE ON FUNCTION public.pgmq_read_batch(TEXT, INTEGER, INTEGER) TO service_role;

-- Example usage:
-- const { data: messages } = await supabase.rpc("pgmq_read_batch", {
--   queue_name: "raw_bills_queue",
--   batch_size: 20,
--   visibility_timeout: 300  // 5 minutes
-- });
-- 
-- Returns:
-- [
--   { msg_id: 1, read_ct: 1, message: { congress: 119, bill_type: "HR", bill_number: 1 } },
--   { msg_id: 2, read_ct: 1, message: { congress: 119, bill_type: "HR", bill_number: 2 } }
-- ]
--
-- read_ct = how many times this message has been read (for retry tracking)

-- Archive (permanently remove) a processed message
-- Call this after successfully processing a bill
CREATE OR REPLACE FUNCTION public.pgmq_archive(queue_name TEXT, msg_id BIGINT)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pgmq
AS $$
BEGIN
  RETURN pgmq.archive(queue_name, msg_id);
END;
$$;

GRANT EXECUTE ON FUNCTION public.pgmq_archive(TEXT, BIGINT) TO service_role;

-- Example usage:
-- await supabase.rpc("pgmq_archive", { 
--   queue_name: "raw_bills_queue", 
--   msg_id: 123 
-- });

-- Get queue statistics
-- Useful for monitoring and deciding whether to trigger next step
CREATE OR REPLACE FUNCTION public.pgmq_metrics(queue_name TEXT)
RETURNS TABLE(
  queue_length BIGINT, 
  newest_msg_age_sec INTEGER, 
  oldest_msg_age_sec INTEGER, 
  total_messages BIGINT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pgmq
AS $$
BEGIN
  RETURN QUERY SELECT m.queue_length, m.newest_msg_age_sec, m.oldest_msg_age_sec, m.total_messages 
    FROM pgmq.metrics(queue_name) m;
END;
$$;

GRANT EXECUTE ON FUNCTION public.pgmq_metrics(TEXT) TO service_role;

-- Example usage:
-- const { data: stats } = await supabase.rpc("pgmq_metrics", { 
--   queue_name: "raw_bills_queue" 
-- });
-- 
-- Returns:
-- [{ queue_length: 150, newest_msg_age_sec: 5, oldest_msg_age_sec: 120, total_messages: 500 }]

-- Send batch of messages to queue
CREATE OR REPLACE FUNCTION public.pgmq_send_batch(
    queue_name TEXT,
    msgs JSONB[]
)
RETURNS SETOF BIGINT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pgmq
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

GRANT EXECUTE ON FUNCTION public.pgmq_send_batch(TEXT, JSONB[]) TO service_role;

-- Example usage:
-- await supabase.rpc("pgmq_send_batch", {
--   queue_name: "raw_bills_queue",
--   msgs: [
--     { congress: 119, bill_type: "HR", bill_number: 1 },
--     { congress: 119, bill_type: "HR", bill_number: 2 }
--   ]
-- });
