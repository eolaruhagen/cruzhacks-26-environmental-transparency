-- Move vector extension from public schema to extensions schema
ALTER EXTENSION vector SET SCHEMA extensions;

-- Enable RLS on congress_sync_state
-- Edge functions use service_role (bypasses RLS), anon can read pipeline status
ALTER TABLE "public"."congress_sync_state" ENABLE ROW LEVEL SECURITY;

CREATE POLICY "anon can read sync state"
  ON "public"."congress_sync_state"
  FOR SELECT
  TO anon
  USING (true);

-- Enable RLS on incomplete_bills
-- Edge functions use service_role (bypasses RLS), anon can read failed bills
ALTER TABLE "public"."incomplete_bills" ENABLE ROW LEVEL SECURITY;

CREATE POLICY "anon can read incomplete bills"
  ON "public"."incomplete_bills"
  FOR SELECT
  TO anon
  USING (true);
