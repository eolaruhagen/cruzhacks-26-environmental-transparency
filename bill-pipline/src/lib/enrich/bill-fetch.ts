import { z } from "zod";

// ---------------------------------------------------------------------------
// Schemas
// ---------------------------------------------------------------------------

export const BillCategoryEnum = z.enum([
    "air_and_atmosphere",
    "water_resources",
    "waste_and_toxics",
    "energy_and_resources",
    "land_and_conservation",
    "disaster_and_emergency",
    "climate_and_emissions",
    "justice_and_environment",
]);

export const BillFetchRowSchema = z.strictObject({
    id: z.uuid(),
    congress: z.number().int(),
    bill_type: z.string(),
    bill_number: z.number().int(),
    title: z.string(),
    latest_summary: z.string().nullable(),
    subject_terms: z.array(z.string()),
    bill_policy_area: z.string().nullable(),
    bill_text: z.string().nullable(),
});
export type BillFetchRow = z.infer<typeof BillFetchRowSchema>;

export const BillEnrichmentWriteSchema = z.strictObject({
    category: BillCategoryEnum.nullable().optional(),
    embedding: z.array(z.number()).length(1536).optional(),
    subcategory_scores: z.record(z.string(), z.number()).nullable().optional(),
});
export type BillEnrichmentWrite = z.infer<typeof BillEnrichmentWriteSchema>;

export const SubcategoryEmbeddingRowSchema = z.strictObject({
    subcategory: z.string().min(1),
    embedding: z.array(z.number()).length(1536),
});
export type SubcategoryEmbeddingRow = z.infer<
    typeof SubcategoryEmbeddingRowSchema
>;

// ---------------------------------------------------------------------------
// Backend port
// ---------------------------------------------------------------------------

export interface BillFetchBackend {
    fetchUnenrichedBills(
        batchSize: number,
    ): Promise<
        { data: BillFetchRow[] | null; error: { message: string } | null }
    >;
    fetchCorpusMean(
        artifactType: string,
    ): Promise<
        { data: number[] | null; error: { message: string } | null }
    >;
    writeEnrichment(
        id: string,
        payload: BillEnrichmentWrite,
    ): Promise<{ error: { message: string } | null }>;
    markInsufficientInfo(
        id: string,
        reason: string,
    ): Promise<{ error: { message: string } | null }>;
    fetchSubcategoryEmbeddings(
        billType: string,
    ): Promise<
        {
            data: SubcategoryEmbeddingRow[] | null;
            error: { message: string } | null;
        }
    >;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export async function fetchUnenrichedBills(
    backend: BillFetchBackend,
    batchSize: number,
): Promise<BillFetchRow[]> {
    if (batchSize <= 0) return [];

    const { data, error } = await backend.fetchUnenrichedBills(batchSize);
    if (error) {
        throw new Error(
            `fetchUnenrichedBills: backend error: ${error.message}`,
        );
    }

    const rows = data ?? [];
    const validated: BillFetchRow[] = [];
    for (const [i, row] of rows.entries()) {
        const parsed = BillFetchRowSchema.safeParse(row);
        if (!parsed.success) {
            throw new Error(
                `fetchUnenrichedBills: invalid row at index ${i}: ${parsed.error.message}`,
            );
        }
        validated.push(parsed.data);
    }
    return validated;
}

/** Returns null on cold start (RPC returns NULL when no row for the type). */
export async function fetchCorpusMean(
    backend: BillFetchBackend,
    artifactType: string,
): Promise<number[] | null> {
    const { data, error } = await backend.fetchCorpusMean(artifactType);
    if (error) {
        throw new Error(`fetchCorpusMean: backend error: ${error.message}`);
    }
    if (data === null) return null;

    if (!Array.isArray(data) || data.length !== 1536) {
        throw new Error(
            `fetchCorpusMean: invalid mean vector length ${
                Array.isArray(data) ? data.length : "(not-array)"
            }, expected 1536`,
        );
    }
    return data;
}

/** `embedding` must already be mean-reduced; halfvec serialisation is the backend's job. */
export async function writeEnrichment(
    backend: BillFetchBackend,
    id: unknown,
    payload: unknown,
): Promise<void> {
    if (typeof id !== "string" || id.length === 0) {
        throw new Error(
            `writeEnrichment: invalid id: expected non-empty string`,
        );
    }
    const parsed = BillEnrichmentWriteSchema.safeParse(payload);
    if (!parsed.success) {
        throw new Error(
            `writeEnrichment: invalid payload: ${parsed.error.message}`,
        );
    }
    const { error } = await backend.writeEnrichment(id, parsed.data);
    if (error) {
        throw new Error(
            `writeEnrichment: backend error (id=${id}): ${error.message}`,
        );
    }
}

export async function markInsufficientInfo(
    backend: BillFetchBackend,
    id: unknown,
    reason: unknown,
): Promise<void> {
    if (typeof id !== "string" || id.length === 0) {
        throw new Error(
            `markInsufficientInfo: invalid id: expected non-empty string`,
        );
    }
    if (typeof reason !== "string" || reason.length === 0) {
        throw new Error(
            `markInsufficientInfo: invalid reason: expected non-empty string`,
        );
    }
    const { error } = await backend.markInsufficientInfo(id, reason);
    if (error) {
        throw new Error(
            `markInsufficientInfo: backend error (id=${id}): ${error.message}`,
        );
    }
}

export async function fetchSubcategoryEmbeddings(
    backend: BillFetchBackend,
    billType: string,
): Promise<SubcategoryEmbeddingRow[]> {
    const { data, error } = await backend.fetchSubcategoryEmbeddings(billType);
    if (error) {
        throw new Error(
            `fetchSubcategoryEmbeddings: backend error: ${error.message}`,
        );
    }

    const rows = data ?? [];
    const validated: SubcategoryEmbeddingRow[] = [];
    for (const [i, row] of rows.entries()) {
        const parsed = SubcategoryEmbeddingRowSchema.safeParse(row);
        if (!parsed.success) {
            throw new Error(
                `fetchSubcategoryEmbeddings: invalid row at index ${i}: ${parsed.error.message}`,
            );
        }
        validated.push(parsed.data);
    }
    return validated;
}
