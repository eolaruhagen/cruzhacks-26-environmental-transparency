import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "../shared/database.types.ts";

// Secret-API-key-backed singleton. Bypasses RLS — only safe inside edge
// functions that the project trusts (i.e. invoked by cron or by trusted
// internal traffic guarded by the secret API key).
// Never expose this client to a request-routed surface that takes user input.
//
// `SECRET_API_KEY` is the function-secret name set via `supabase secrets set`.
// Replaces the legacy SERVICE_ROLE_KEY — same authority, new naming.

const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
const SECRET_API_KEY = Deno.env.get("SECRET_API_KEY");

if (!SUPABASE_URL) throw new Error("[supabase-client] Missing SUPABASE_URL env var");
if (!SECRET_API_KEY) throw new Error("[supabase-client] Missing SECRET_API_KEY env var");

console.log(`[supabase-client] initializing for ${SUPABASE_URL}`);

export const supabase: SupabaseClient<Database> = createClient<Database>(
    SUPABASE_URL,
    SECRET_API_KEY,
);
