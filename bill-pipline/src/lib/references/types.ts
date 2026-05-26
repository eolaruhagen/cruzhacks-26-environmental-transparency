import { z } from "zod";

// ---------------------------------------------------------------------------
// Reference kinds
// ---------------------------------------------------------------------------
// Mirrors the Postgres enum public.reference_kind. Adding a new kind here
// must come with a migration to ALTER TYPE; the DB write will reject
// otherwise.

export const ReferenceKindSchema = z.enum([
    "named_law",
    "public_law",
    "usc",
    "usc_et_seq",
    "cfr",
    "fed_reg",
    "executive_order",
    "treaty",
    "stat_at_large",
]);
export type ReferenceKind = z.infer<typeof ReferenceKindSchema>;

export const ReferenceSourceSchema = z.enum(["bill_text", "summary"]);
export type ReferenceSource = z.infer<typeof ReferenceSourceSchema>;

// ---------------------------------------------------------------------------
// Subprocess IPC schemas
// ---------------------------------------------------------------------------
// The TS worker spawns python3 once per tick and exchanges JSONL: one
// ExtractInput per line on stdin, one ExtractOutput per line on stdout.
// Schemas validate both ends — Python misbehaviour surfaces as a typed
// per-bill error rather than a silent ingestion of garbage.

export const ExtractInputSchema = z.strictObject({
    bill_id: z.uuid(),
    legislation_number: z.string().min(1),
    source: ReferenceSourceSchema,
    text: z.string().min(1),
});
export type ExtractInput = z.infer<typeof ExtractInputSchema>;

// One reference Python emits per bill. The schema doubles as the upsert
// payload for cited_references (kind + normalized_key + normalized jsonb)
// joined with the per-mention bill_references columns (raw + context +
// span_* + is_self_ref). `normalized_key` is namespaced by kind so cross-
// kind queries dedupe cheaply (e.g. "usc:42:7401", "named:clean air act",
// "pl:117-58").
export const ExtractedReferenceSchema = z.strictObject({
    kind: ReferenceKindSchema,
    raw: z.string().min(1),
    normalized_key: z.string().min(1),
    normalized: z.record(z.string(), z.unknown()).default({}),
    context: z.string().nullable().default(null),
    span_start: z.number().int().nonnegative().nullable().default(null),
    span_end: z.number().int().nonnegative().nullable().default(null),
    is_self_ref: z.boolean().default(false),
});
export type ExtractedReference = z.infer<typeof ExtractedReferenceSchema>;

// One result per bill. `error` is non-null when extraction failed for that
// bill specifically. The worker still stamps references_extracted_at on a
// failed bill so it doesn't retry next tick; the failure detail surfaces
// via logs/Discord, not via a column on house_bills_2.
export const ExtractOutputSchema = z.strictObject({
    bill_id: z.uuid(),
    references: z.array(ExtractedReferenceSchema).default([]),
    error: z.string().nullable().default(null),
});
export type ExtractOutput = z.infer<typeof ExtractOutputSchema>;
