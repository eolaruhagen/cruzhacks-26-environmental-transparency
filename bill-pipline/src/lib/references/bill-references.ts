import { z } from "zod";
import {
    type ExtractedReference,
    ReferenceKindSchema,
    ReferenceSourceSchema,
} from "./types.ts";

// ---------------------------------------------------------------------------
// Schemas
// ---------------------------------------------------------------------------

export const CandidateBillRowSchema = z.strictObject({
    id: z.uuid(),
    congress: z.number().int(),
    bill_type: z.string(),
    bill_number: z.number().int(),
    title: z.string(),
    bill_text: z.string().nullable(),
    latest_summary: z.string().nullable(),
});
export type CandidateBillRow = z.infer<typeof CandidateBillRowSchema>;

export const CitedReferenceUpsertSchema = z.strictObject({
    kind: ReferenceKindSchema,
    normalized_key: z.string().min(1),
    normalized: z.record(z.string(), z.unknown()),
});
export type CitedReferenceUpsert = z.infer<typeof CitedReferenceUpsertSchema>;

export const BillReferenceInsertSchema = z.strictObject({
    reference_id: z.uuid(),
    raw: z.string().min(1),
    context: z.string().nullable(),
    span_start: z.number().int().nonnegative().nullable(),
    span_end: z.number().int().nonnegative().nullable(),
    source: ReferenceSourceSchema,
    is_self_ref: z.boolean(),
});
export type BillReferenceInsert = z.infer<typeof BillReferenceInsertSchema>;

// ---------------------------------------------------------------------------
// Backend port
// ---------------------------------------------------------------------------

export interface ReferencesBackend {
    fetchCandidates(batchSize: number): Promise<{
        data: CandidateBillRow[] | null;
        error: { message: string } | null;
    }>;

    upsertCitedReferences(rows: CitedReferenceUpsert[]): Promise<{
        data:
            | {
                id: string;
                kind: CitedReferenceUpsert["kind"];
                normalized_key: string;
            }[]
            | null;
        error: { message: string } | null;
    }>;

    deleteBillReferences(billId: string): Promise<{
        error: { message: string } | null;
    }>;

    insertBillReferences(
        billId: string,
        rows: BillReferenceInsert[],
    ): Promise<{ error: { message: string } | null }>;

    markExtracted(
        billId: string,
    ): Promise<{ error: { message: string } | null }>;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export async function fetchReferenceCandidates(
    backend: ReferencesBackend,
    batchSize: number,
): Promise<CandidateBillRow[]> {
    if (batchSize <= 0) return [];

    const { data, error } = await backend.fetchCandidates(batchSize);
    if (error) {
        throw new Error(
            `fetchReferenceCandidates: backend error: ${error.message}`,
        );
    }

    const rows = data ?? [];
    const validated: CandidateBillRow[] = [];
    for (const [i, row] of rows.entries()) {
        const parsed = CandidateBillRowSchema.safeParse(row);
        if (!parsed.success) {
            throw new Error(
                `fetchReferenceCandidates: invalid row at index ${i}: ${parsed.error.message}`,
            );
        }
        validated.push(parsed.data);
    }
    return validated;
}

/**
 * De-duplicates rows by (kind, normalized_key) before sending to the backend.
 * Returns a Map keyed by the composite `${kind}:${normalized_key}` so callers
 * can disambiguate the (rare but legal) case where the same normalized_key
 * appears under two different kinds — the DB's unique constraint is on the
 * pair, so both rows coexist with distinct ids.
 */
export async function upsertCitedReferences(
    backend: ReferencesBackend,
    refs: ExtractedReference[],
): Promise<Map<string, string>> {
    if (refs.length === 0) return new Map();

    const dedupedByKey = new Map<string, CitedReferenceUpsert>();
    for (const ref of refs) {
        const composite = `${ref.kind}:${ref.normalized_key}`;
        if (!dedupedByKey.has(composite)) {
            dedupedByKey.set(composite, {
                kind: ref.kind,
                normalized_key: ref.normalized_key,
                normalized: ref.normalized,
            });
        }
    }
    const dedupedRows = Array.from(dedupedByKey.values());

    const { data, error } = await backend.upsertCitedReferences(dedupedRows);
    if (error) {
        throw new Error(
            `upsertCitedReferences: backend error (count=${dedupedRows.length}): ${error.message}`,
        );
    }

    const returned = data ?? [];
    const keyToId = new Map<string, string>();
    for (const row of returned) {
        keyToId.set(`${row.kind}:${row.normalized_key}`, row.id);
    }

    const result = new Map<string, string>();
    for (const ref of refs) {
        const composite = `${ref.kind}:${ref.normalized_key}`;
        const id = keyToId.get(composite);
        if (id === undefined) {
            throw new Error(
                `upsertCitedReferences: backend returned no id for ${composite}`,
            );
        }
        result.set(composite, id);
    }
    return result;
}

export async function replaceBillReferences(
    backend: ReferencesBackend,
    billId: unknown,
    rows: BillReferenceInsert[],
): Promise<void> {
    if (typeof billId !== "string" || billId.length === 0) {
        throw new Error(
            `replaceBillReferences: invalid billId: expected non-empty string`,
        );
    }

    // Validate BEFORE the delete — a bad row mid-list would otherwise leave the
    // bill with zero references and no marker that the write failed.
    for (const [i, row] of rows.entries()) {
        const parsed = BillReferenceInsertSchema.safeParse(row);
        if (!parsed.success) {
            throw new Error(
                `replaceBillReferences: invalid row at index ${i} (bill_id=${billId}): ${parsed.error.message}`,
            );
        }
    }

    const { error: deleteError } = await backend.deleteBillReferences(billId);
    if (deleteError) {
        throw new Error(
            `replaceBillReferences: backend error (bill_id=${billId}): ${deleteError.message}`,
        );
    }

    if (rows.length === 0) return;

    const { error: insertError } = await backend.insertBillReferences(
        billId,
        rows,
    );
    if (insertError) {
        throw new Error(
            `replaceBillReferences: backend error (bill_id=${billId}): ${insertError.message}`,
        );
    }
}

export async function markExtracted(
    backend: ReferencesBackend,
    billId: unknown,
): Promise<void> {
    if (typeof billId !== "string" || billId.length === 0) {
        throw new Error(
            `markExtracted: invalid billId: expected non-empty string`,
        );
    }
    const { error } = await backend.markExtracted(billId);
    if (error) {
        throw new Error(
            `markExtracted: backend error (bill_id=${billId}): ${error.message}`,
        );
    }
}
