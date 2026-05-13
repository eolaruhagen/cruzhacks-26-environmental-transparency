import { test, expect } from "bun:test";
import {
    buildClassifyPrompt,
    buildEmbedText,
    ClassifyResultSchema,
    computeSubcategoryScores,
    cosineSimilarity,
} from "../bill-enrich.ts";
import type { SubcategoryEmbeddingRow } from "../bill-fetch.ts";

// ---------------------------------------------------------------------------
// ClassifyResultSchema
// ---------------------------------------------------------------------------

test("ClassifyResultSchema: parses classified result", () => {
    const result = ClassifyResultSchema.safeParse({
        kind: "classified",
        category: "energy_and_resources",
        reasoning: "Bill explicitly addresses renewable energy incentives.",
    });
    expect(result.success).toEqual(true);
    if (result.success && result.data.kind === "classified") {
        expect(result.data.category).toEqual("energy_and_resources");
    }
});

test("ClassifyResultSchema: parses insufficient_info result", () => {
    const result = ClassifyResultSchema.safeParse({
        kind: "insufficient_info",
        reason: "Title only; no summary or subject terms.",
    });
    expect(result.success).toEqual(true);
});

test("ClassifyResultSchema: rejects classified missing category", () => {
    const result = ClassifyResultSchema.safeParse({
        kind: "classified",
        reasoning: "x",
    });
    expect(result.success).toEqual(false);
});

test("ClassifyResultSchema: rejects unknown kind value", () => {
    const result = ClassifyResultSchema.safeParse({
        kind: "maybe",
        category: "energy_and_resources",
        reasoning: "x",
    });
    expect(result.success).toEqual(false);
});

test("ClassifyResultSchema: rejects reasoning > 500 chars", () => {
    const result = ClassifyResultSchema.safeParse({
        kind: "classified",
        category: "energy_and_resources",
        reasoning: "x".repeat(501),
    });
    expect(result.success).toEqual(false);
});

// ---------------------------------------------------------------------------
// buildClassifyPrompt
// ---------------------------------------------------------------------------

test("buildClassifyPrompt: renders all fields when present", () => {
    const out = buildClassifyPrompt({
        title: "Clean Air Act Amendments",
        latest_summary: "Amends emissions standards.",
        subject_terms: ["Air", "Environment"],
        bill_policy_area: "Environmental Protection",
    });
    expect(out).toEqual(
        "Title: Clean Air Act Amendments\n\n" +
            "Summary: Amends emissions standards.\n\n" +
            "Subject terms: Air, Environment\n\n" +
            "Policy area: Environmental Protection",
    );
});

test("buildClassifyPrompt: renders (none) placeholders for missing fields", () => {
    const out = buildClassifyPrompt({
        title: "Some Bill",
        latest_summary: null,
        subject_terms: [],
        bill_policy_area: null,
    });
    expect(out).toEqual(
        "Title: Some Bill\n\n" +
            "Summary: (none)\n\n" +
            "Subject terms: (none)\n\n" +
            "Policy area: (none)",
    );
});

test("buildClassifyPrompt: no leading or trailing whitespace", () => {
    const out = buildClassifyPrompt({
        title: "A",
        latest_summary: "B",
        subject_terms: ["C"],
        bill_policy_area: "D",
    });
    expect(out).toEqual(out.trim());
});

// ---------------------------------------------------------------------------
// buildEmbedText
// ---------------------------------------------------------------------------

test("buildEmbedText: skips null/empty fields entirely", () => {
    const out = buildEmbedText({
        title: "Only Title",
        latest_summary: null,
        subject_terms: [],
        bill_policy_area: null,
        bill_text: null,
    });
    expect(out).toEqual("Only Title");
    expect(out.includes("(none)")).toEqual(false);
});

test("buildEmbedText: truncates bill_text at maxBillTextChars", () => {
    const out = buildEmbedText(
        {
            title: "T",
            latest_summary: null,
            subject_terms: [],
            bill_policy_area: null,
            bill_text: "abcdefghijklmnopqrstuvwxyz",
        },
        { maxBillTextChars: 10 },
    );
    expect(out).toEqual("T\n\nabcdefghij");
});

test("buildEmbedText: includes everything when all present", () => {
    const out = buildEmbedText({
        title: "Clean Air Act",
        latest_summary: "Amends emissions standards.",
        subject_terms: ["Air", "Environment"],
        bill_policy_area: "Environmental Protection",
        bill_text: "SECTION 1...",
    });
    expect(out).toEqual(
        "Clean Air Act\n\n" +
            "Amends emissions standards.\n\n" +
            "Subjects: Air, Environment\n\n" +
            "Policy area: Environmental Protection\n\n" +
            "SECTION 1...",
    );
});

// ---------------------------------------------------------------------------
// cosineSimilarity
// ---------------------------------------------------------------------------

test("cosineSimilarity: 1.0 for identical vectors", () => {
    expect(cosineSimilarity([1, 2, 3], [1, 2, 3])).toEqual(1);
});

test("cosineSimilarity: -1.0 for opposite vectors", () => {
    expect(cosineSimilarity([1, 2, 3], [-1, -2, -3])).toEqual(-1);
});

test("cosineSimilarity: 0.0 for orthogonal vectors", () => {
    expect(cosineSimilarity([1, 0], [0, 1])).toEqual(0);
});

test("cosineSimilarity: 0.0 for zero-magnitude vector", () => {
    expect(cosineSimilarity([0, 0, 0], [1, 2, 3])).toEqual(0);
    expect(cosineSimilarity([1, 2, 3], [0, 0, 0])).toEqual(0);
});

test("cosineSimilarity: throws on dimension mismatch", () => {
    expect(() => cosineSimilarity([1, 2], [1, 2, 3])).toThrow(
        "cosineSimilarity: dimension mismatch (a=2, b=3)",
    );
});

// ---------------------------------------------------------------------------
// computeSubcategoryScores
// ---------------------------------------------------------------------------

test("computeSubcategoryScores: empty rows → empty record", () => {
    expect(computeSubcategoryScores([1, 0, 0], [])).toEqual({});
});

test("computeSubcategoryScores: exact match → 1.0", () => {
    const rows: SubcategoryEmbeddingRow[] = [
        {
            subcategory: "renewable",
            embedding: Array.from({ length: 1536 }, (_, i) => i / 1536),
        },
    ];
    const bill = Array.from({ length: 1536 }, (_, i) => i / 1536);
    const scores = computeSubcategoryScores(bill, rows);
    expect(scores.renewable).toEqual(1);
});

test("computeSubcategoryScores: opposite vectors → 0.0", () => {
    const rows: SubcategoryEmbeddingRow[] = [
        {
            subcategory: "fossil",
            embedding: Array.from({ length: 1536 }, (_, i) => -((i + 1) / 1536)),
        },
    ];
    const bill = Array.from({ length: 1536 }, (_, i) => (i + 1) / 1536);
    const scores = computeSubcategoryScores(bill, rows);
    expect(scores.fossil).toEqual(0);
});

test("computeSubcategoryScores: returns Record<string, number> keyed by subcategory", () => {
    const rows: SubcategoryEmbeddingRow[] = [
        {
            subcategory: "renewable",
            embedding: Array.from({ length: 1536 }, () => 1),
        },
        {
            subcategory: "fossil",
            embedding: Array.from({ length: 1536 }, () => 1),
        },
    ];
    const bill = Array.from({ length: 1536 }, () => 1);
    const scores = computeSubcategoryScores(bill, rows);
    expect(Object.keys(scores).sort()).toEqual(["fossil", "renewable"]);
    expect(typeof scores.renewable).toEqual("number");
    expect(typeof scores.fossil).toEqual("number");
});
