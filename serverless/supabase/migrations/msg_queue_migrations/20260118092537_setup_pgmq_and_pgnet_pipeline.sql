-- Migration: setup_pgmq_and_pgnet_pipeline
-- Purpose: Enable PGMQ (Postgres Message Queue) and pg_net for async function chaining
-- Applied: 2026-01-18

-- 1. Enable Extensions
-- pg_net: Allows making HTTP requests from SQL (for async function triggering)
CREATE EXTENSION IF NOT EXISTS pg_net;

-- pgmq: Postgres Message Queue for reliable job processing
-- CASCADE will install any dependencies (like pgcrypto)
CREATE EXTENSION IF NOT EXISTS pgmq CASCADE;

-- 2. Create the Queue
-- This creates the underlying tables: pgmq.q_raw_bills_queue and pgmq.a_raw_bills_queue (archive)
SELECT pgmq.create('raw_bills_queue');

-- Queue stores messages like:
-- {
--   "congress": 119,
--   "bill_type": "HR",
--   "bill_number": 1234
-- }
--
-- Message lifecycle:
-- 1. Producer calls pgmq.send('raw_bills_queue', '{"congress":119,...}')
-- 2. Consumer calls pgmq.read('raw_bills_queue', visibility_timeout, batch_size)
--    - Message becomes "invisible" for visibility_timeout seconds
--    - If not archived, it becomes visible again for retry
-- 3. On success, consumer calls pgmq.archive('raw_bills_queue', msg_id)
-- 4. On permanent failure, move to incomplete_bills table and archive
