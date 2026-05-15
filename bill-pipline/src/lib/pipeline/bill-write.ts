import { z } from "zod";
import { BillTypeSchema, ChamberSchema } from "@cruzhacks/shared";

// ---------------------------------------------------------------------------
// Schemas
// ---------------------------------------------------------------------------
// Mirror the column shapes in supabase/migrations/20260507044126_*.sql. Only
// columns the worker writes are listed; ML-enrichment columns (category,
// embedding, subcategory_scores) and audit columns (created_at, updated_at)
// are managed elsewhere or by triggers.

// Local-only: Congress returns `party` as a raw string; we normalise to this
// 3-value enum for our DB column. Not shared because the Congress-side type
// in @cruzhacks/shared is just `string`.
const PartyEnum = z.enum(["Democrat", "Republican", "Independent"]);

export const RepresentativeUpsertSchema = z.strictObject({
    bioguide_id: z.string().min(1),
    first_name: z.string().nullable().optional(),
    middle_name: z.string().nullable().optional(),
    last_name: z.string().nullable().optional(),
    party: PartyEnum.nullable().optional(),
    state: z.string().nullable().optional(),
    district: z.number().int().nullable().optional(),
    role: ChamberSchema,
    url: z.string().nullable().optional(),
    last_seen_in_congress: z.number().int().nullable().optional(),
});
export type RepresentativeUpsert = z.infer<typeof RepresentativeUpsertSchema>;

export const HouseBillUpsertSchema = z.strictObject({
    congress: z.number().int(),
    bill_type: BillTypeSchema,
    bill_number: z.number().int(),
    title: z.string().min(1),
    url: z.string().nullable().optional(),
    bill_text: z.string().nullable().optional(),
    origin_chamber: ChamberSchema,
    date_of_introduction: z.string().nullable().optional(),
    congress_start_year: z.number().int(),
    congress_end_year: z.number().int(),
    congress_update_date: z.string().nullable().optional(),
    congress_update_date_including_text: z.string().nullable().optional(),
    sponsor_bioguide_id: z.string().nullable().optional(),
    cosponsor_bioguide_ids: z.array(z.string()).default([]),
    num_cosponsors: z.number().int().default(0),
    latest_action: z.string().nullable().optional(),
    latest_action_date: z.string().nullable().optional(),
    latest_action_code: z.string().nullable().optional(),
    latest_action_type: z.string().nullable().optional(),
    is_law: z.boolean().default(false),
    law_type: z.string().nullable().optional(),
    law_number: z.string().nullable().optional(),
    subject_terms: z.array(z.string()).default([]),
    bill_policy_area: z.string().nullable().optional(),
    latest_summary: z.string().nullable().optional(),
    committees: z.array(z.string()).default([]),
});
export type HouseBillUpsert = z.infer<typeof HouseBillUpsertSchema>;

// ---------------------------------------------------------------------------
// Backend port
// ---------------------------------------------------------------------------
// Same pattern as CongressSyncStateBackend: tests inject a fake; production
// wires through SupabaseClient via fromSupabase(). The port is intentionally
// thin — it takes already-validated payloads and returns a Postgrest-shaped
// envelope.

export interface BillWriteBackend {
    upsertRepresentatives(
        reps: RepresentativeUpsert[],
    ): Promise<{ error: { message: string } | null }>;
    upsertHouseBill(
        bill: HouseBillUpsert,
    ): Promise<{ error: { message: string } | null }>;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Bulk upsert sponsor + cosponsor representatives by bioguide_id. Empty input
 * is a no-op (no backend round-trip). Duplicate bioguide_ids in the input are
 * deduped (last write wins) before sending — this is common because a bill's
 * sponsor often appears in its own cosponsor list.
 */
export async function upsertRepresentatives(
    backend: BillWriteBackend,
    reps: unknown[],
): Promise<void> {
    if (reps.length === 0) return;

    const validated: RepresentativeUpsert[] = [];
    for (const [i, rep] of reps.entries()) {
        const parsed = RepresentativeUpsertSchema.safeParse(rep);
        if (!parsed.success) {
            throw new Error(
                `upsertRepresentatives: invalid rep at index ${i}: ${parsed.error.message}`,
            );
        }
        validated.push(parsed.data);
    }

    // Dedupe by bioguide_id — sponsor often appears in own cosponsor list,
    // and Postgres ON CONFLICT cannot affect the same row twice in one statement.
    const byId = new Map<string, RepresentativeUpsert>();
    for (const r of validated) byId.set(r.bioguide_id, r);
    // Sort by bioguide_id so concurrent processBill workers acquire row locks
    // in the same order — eliminates the deadlock cycle on shared cosponsors.
    const deduped = Array.from(byId.values())
        .sort((a, b) => a.bioguide_id.localeCompare(b.bioguide_id));

    const { error } = await backend.upsertRepresentatives(deduped);
    if (error) {
        throw new Error(
            `upsertRepresentatives: backend error (count=${deduped.length}): ${error.message}`,
        );
    }
}

/**
 * Upsert a single bill by its (congress, bill_type, bill_number) natural key.
 * Caller supplies the FK sponsor_bioguide_id; bill ↔ rep referential
 * integrity is the caller's responsibility (upsertRepresentatives must run
 * first).
 */
export async function upsertHouseBill(
    backend: BillWriteBackend,
    bill: unknown,
): Promise<void> {
    const parsed = HouseBillUpsertSchema.safeParse(bill);
    if (!parsed.success) {
        throw new Error(
            `upsertHouseBill: invalid bill: ${parsed.error.message}`,
        );
    }
    const { error } = await backend.upsertHouseBill(parsed.data);
    if (error) {
        throw new Error(
            `upsertHouseBill: backend error (${parsed.data.bill_type}${parsed.data.bill_number}/${parsed.data.congress}): ${error.message}`,
        );
    }
}
