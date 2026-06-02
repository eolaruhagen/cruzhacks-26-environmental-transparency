import { z } from "zod";
import { BillCategoryEnum, type SubcategoryEmbeddingRow } from "./bill-fetch.ts";

// ---------------------------------------------------------------------------
// Schemas
// ---------------------------------------------------------------------------

export const ClassifyResultSchema = z.discriminatedUnion("kind", [
    z.object({
        kind: z.literal("classified"),
        category: BillCategoryEnum,
        reasoning: z.string().min(1).transform((s) => s.slice(0, 500)),
    }),
    z.object({
        kind: z.literal("insufficient_info"),
        reason: z.string().min(1).transform((s) => s.slice(0, 500)),
    }),
]);
export type ClassifyResult = z.infer<typeof ClassifyResultSchema>;

// ---------------------------------------------------------------------------
// Prompt builders
// ---------------------------------------------------------------------------

export function buildClassifyPrompt(row: {
    title: string;
    latest_summary: string | null;
    subject_terms: string[];
    bill_policy_area: string | null;
}): string {
    const summary = row.latest_summary && row.latest_summary.length > 0
        ? row.latest_summary
        : "(none)";
    const subjects = row.subject_terms.length > 0
        ? row.subject_terms.join(", ")
        : "(none)";
    const policy = row.bill_policy_area && row.bill_policy_area.length > 0
        ? row.bill_policy_area
        : "(none)";

    return [
        `Title: ${row.title}`,
        `Summary: ${summary}`,
        `Subject terms: ${subjects}`,
        `Policy area: ${policy}`,
    ].join("\n\n");
}

export function buildEmbedText(
    row: {
        title: string;
        latest_summary: string | null;
        subject_terms: string[];
        bill_policy_area: string | null;
        bill_text: string | null;
    },
    options?: { maxBillTextChars?: number; maxTotalChars?: number },
): string {
    const maxBillTextChars = options?.maxBillTextChars ?? 4000;
    const maxTotalChars = options?.maxTotalChars ?? 20_000;
    const parts: string[] = [];

    if (row.title.length > 0) parts.push(row.title);
    if (row.latest_summary && row.latest_summary.length > 0) {
        parts.push(row.latest_summary);
    }
    if (row.subject_terms.length > 0) {
        parts.push(`Subjects: ${row.subject_terms.join(", ")}`);
    }
    if (row.bill_policy_area && row.bill_policy_area.length > 0) {
        parts.push(`Policy area: ${row.bill_policy_area}`);
    }
    if (row.bill_text && row.bill_text.length > 0) {
        parts.push(row.bill_text.slice(0, maxBillTextChars));
    }

    return parts.join("\n\n").slice(0, maxTotalChars);
}

// ---------------------------------------------------------------------------
// Vector math
// ---------------------------------------------------------------------------

export function cosineSimilarity(a: number[], b: number[]): number {
    if (a.length !== b.length) {
        throw new Error(
            `cosineSimilarity: dimension mismatch (a=${a.length}, b=${b.length})`,
        );
    }
    let dot = 0;
    let normA = 0;
    let normB = 0;
    for (let i = 0; i < a.length; i++) {
        dot += a[i] * b[i];
        normA += a[i] * a[i];
        normB += b[i] * b[i];
    }
    if (normA === 0 || normB === 0) return 0;
    return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}

export function computeSubcategoryScores(
    billEmbedding: number[],
    subcategoryRows: SubcategoryEmbeddingRow[],
): Record<string, number> {
    const scores: Record<string, number> = {};
    for (const row of subcategoryRows) {
        const cos = cosineSimilarity(billEmbedding, row.embedding);
        scores[row.subcategory] = (cos + 1) / 2;
    }
    return scores;
}
