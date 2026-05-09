import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import type { Database } from "../../database.types.ts";

// ---------------------------------------------------------------------------
// Schemas — single source of truth for what the table looks like to the app
// ---------------------------------------------------------------------------
// Timestamps are kept as plain strings rather than z.string().datetime() because
// Postgres `timestamptz` returns values like "2026-05-07T20:00:00.123+00:00"
// whose offset suffix sometimes trips Zod's RFC3339 datetime check across
// versions. Validity is already enforced by the column type at the DB.

export const CongressSyncStateSchema = z.object({
    id: z.literal(1),
    last_sync_at: z.string().nullable(),
    api_rate_limit_reset_at: z.string().nullable(),
    last_error: z.string().nullable(),
    created_at: z.string(),
    updated_at: z.string(),
});
export type CongressSyncState = z.infer<typeof CongressSyncStateSchema>;

// Only fields the pipeline writes. id/created_at/updated_at are not patchable
// (id is fixed at 1, created_at is set on insert, updated_at fires off the
// trigger). All fields optional so callers can update one at a time.
export const CongressSyncStateUpdateSchema = z.strictObject({
    last_sync_at: z.string().nullable().optional(),
    api_rate_limit_reset_at: z.string().nullable().optional(),
    last_error: z.string().nullable().optional(),
});
export type CongressSyncStateUpdate = z.infer<typeof CongressSyncStateUpdateSchema>;

// ---------------------------------------------------------------------------
// Backend port — the only surface the class needs from Supabase
// ---------------------------------------------------------------------------
// Tests inject a fake that records calls and returns canned data. Production
// wires through the real SupabaseClient via fromSupabase().
//
// Both methods return a Postgrest-style envelope: { data, error }. data is
// `unknown` because the class is what runs Zod over it — the backend doesn't
// know or care about the row shape.
//
// `update`'s patch type matches the Database Update row exactly, not a wider
// `Record<string, unknown>`. supabase-js v2 uses `RejectExcessProperties`
// which refuses index-signatured objects, so passing a wider type would not
// type-check at the supabase boundary inside the adapter. Aligning the port
// with the table's Update type keeps the adapter cast-free.

type SyncStateUpdateRow = Database["public"]["Tables"]["congress_sync_state_new"]["Update"];

export interface CongressSyncStateBackend {
    read(): Promise<{ data: unknown; error: { message: string } | null }>;
    update(
        patch: SyncStateUpdateRow,
    ): Promise<{ data: unknown; error: { message: string } | null }>;
}

// ---------------------------------------------------------------------------
// Client
// ---------------------------------------------------------------------------

export class CongressSyncStateClient {
    constructor(private readonly backend: CongressSyncStateBackend) {}

    /**
     * Read the singleton state row. Validates the response against
     * CongressSyncStateSchema; throws on backend error or schema mismatch.
     */
    async read(): Promise<CongressSyncState> {
        const { data, error } = await this.backend.read();
        if (error) {
            throw new Error(`CongressSyncStateClient.read failed: ${error.message}`);
        }
        const parsed = CongressSyncStateSchema.safeParse(data);
        if (!parsed.success) {
            throw new Error(
                `CongressSyncStateClient.read returned invalid row: ${parsed.error.message}`,
            );
        }
        return parsed.data;
    }

    /**
     * Apply a partial update to the singleton row and return the updated row.
     * The patch is validated against CongressSyncStateUpdateSchema first
     * (rejects unknown keys, enforces nullable shape). Throws on empty patch,
     * backend error, or schema mismatch on the returned row.
     */
    async update(patch: CongressSyncStateUpdate): Promise<CongressSyncState> {
        const parsedPatch = CongressSyncStateUpdateSchema.safeParse(patch);
        if (!parsedPatch.success) {
            throw new Error(
                `CongressSyncStateClient.update rejected invalid patch: ${parsedPatch.error.message}`,
            );
        }
        if (Object.keys(parsedPatch.data).length === 0) {
            throw new Error(
                "CongressSyncStateClient.update called with empty patch — refusing to round-trip",
            );
        }
        const { data, error } = await this.backend.update(parsedPatch.data);
        if (error) {
            throw new Error(`CongressSyncStateClient.update failed: ${error.message}`);
        }
        const parsed = CongressSyncStateSchema.safeParse(data);
        if (!parsed.success) {
            throw new Error(
                `CongressSyncStateClient.update returned invalid row: ${parsed.error.message}`,
            );
        }
        return parsed.data;
    }

    /**
     * Wire a client up to a real SupabaseClient. Single-row select/update
     * targeting id=1, with .single() so a missing row is an error rather than
     * a silent empty array. The data API hits the public schema, so RLS on
     * congress_sync_state_new must permit the calling role — in our setup the
     * service-role / secret-API-keyed client bypasses RLS, so this is fine
     * in edge functions.
     */
    static fromSupabase(supabase: SupabaseClient<Database>): CongressSyncStateClient {
        const backend: CongressSyncStateBackend = {
            read: async () =>
                await supabase
                    .from("congress_sync_state_new")
                    .select("*")
                    .eq("id", 1)
                    .single(),
            update: async (patch) =>
                await supabase
                    .from("congress_sync_state_new")
                    .update(patch)
                    .eq("id", 1)
                    .select("*")
                    .single(),
        };
        return new CongressSyncStateClient(backend);
    }
}
