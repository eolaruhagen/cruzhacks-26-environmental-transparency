import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "../../../packages/shared/src/database.types.ts";

export function makeSupabase(): SupabaseClient<Database> {
    const url = process.env.SUPABASE_URL;
    const key = process.env.SECRET_API_KEY;
    if (!url) throw new Error("Missing SUPABASE_URL");
    if (!key) throw new Error("Missing SECRET_API_KEY");
    return createClient<Database>(url, key);
}

export type SupabaseDb = SupabaseClient<Database>;
