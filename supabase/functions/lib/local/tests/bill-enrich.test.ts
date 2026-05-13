import { assert, assertEquals, assertThrows } from "jsr:@std/assert@1";
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

Deno.test("ClassifyResultSchema: parses classified result", () => {
    const result = ClassifyResultSchema.safeParse({
        kind: "classified",
        category: "energy_and_resources",
        reasoning: "Bill explicitly addresses renewable energy incentives.",
    });
    assert(result.success);
    if (result.success && result.data.kind === "classified") {
        assertEquals(result.data.category, "energy_and_resources");
    }
});

Deno.test("ClassifyResultSchema: parses insufficient_info result", () => {
    const result = ClassifyResultSchema.safeParse({
        kind: "insufficient_info",
        reason: "Title only; no summary or subject terms.",
    });
    assert(result.success);
});

Deno.test("ClassifyResultSchema: rejects classified missing category", () => {
    const result = ClassifyResultSchema.safeParse({
        kind: "classified",
        reasoning: "x",
    });
    assertEquals(result.success, false);
});

Deno.test("ClassifyResultSchema: rejects unknown kind value", () => {
    const result = ClassifyResultSchema.safeParse({
        kind: "maybe",
        category: "energy_and_resources",
        reasoning: "x",
    });
    assertEquals(result.success, false);
});

Deno.test("ClassifyResultSchema: rejects reasoning > 500 chars", () => {
    const result = ClassifyResultSchema.safeParse({
        kind: "classified",
        category: "energy_and_resources",
        reasoning: "x".repeat(501),
    });
    assertEquals(result.success, false);
});

// ---------------------------------------------------------------------------
// buildClassifyPrompt
// ---------------------------------------------------------------------------

Deno.test("buildClassifyPrompt: renders all fields when present", () => {
    const out = buildClassifyPrompt({
        title: "Clean Air Act Amendments",
        latest_summary: "Amends emissions standards.",
        subject_terms: ["Air", "Environment"],
        bill_policy_area: "Environmental Protection",
    });
    assertEquals(
        out,
        "Title: Clean Air Act Amendments\n\n" +
            "Summary: Amends emissions standards.\n\n" +
            "Subject terms: Air, Environment\n\n" +
            "Policy area: Environmental Protection",
    );
});

Deno.test("buildClassifyPrompt: renders (none) placeholders for missing fields", () => {
    const out = buildClassifyPrompt({
        title: "Some Bill",
        latest_summary: null,
        subject_terms: [],
        bill_policy_area: null,
    });
    assertEquals(
        out,
        "Title: Some Bill\n\n" +
            "Summary: (none)\n\n" +
            "Subject terms: (none)\n\n" +
            "Policy area: (none)",
    );
});

Deno.test("buildClassifyPrompt: no leading or trailing whitespace", () => {
    const out = buildClassifyPrompt({
        title: "A",
        latest_summary: "B",
        subject_terms: ["C"],
        bill_policy_area: "D",
    });
    assertEquals(out, out.trim());
});

// ---------------------------------------------------------------------------
// buildEmbedText
// ---------------------------------------------------------------------------

Deno.test("buildEmbedText: skips null/empty fields entirely", () => {
    const out = buildEmbedText({
        title: "Only Title",
        latest_summary: null,
        subject_terms: [],
        bill_policy_area: null,
        bill_text: null,
    });
    assertEquals(out, "Only Title");
    assertEquals(out.includes("(none)"), false);
});

Deno.test("buildEmbedText: truncates bill_text at maxBillTextChars", () => {
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
    assertEquals(out, "T\n\nabcdefghij");
});

Deno.test("buildEmbedText: includes everything when all present", () => {
    const out = buildEmbedText({
        title: "Clean Air Act",
        latest_summary: "Amends emissions standards.",
        subject_terms: ["Air", "Environment"],
        bill_policy_area: "Environmental Protection",
        bill_text: "SECTION 1...",
    });
    assertEquals(
        out,
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

Deno.test("cosineSimilarity: 1.0 for identical vectors", () => {
    assertEquals(cosineSimilarity([1, 2, 3], [1, 2, 3]), 1);
});

Deno.test("cosineSimilarity: -1.0 for opposite vectors", () => {
    assertEquals(cosineSimilarity([1, 2, 3], [-1, -2, -3]), -1);
});

Deno.test("cosineSimilarity: 0.0 for orthogonal vectors", () => {
    assertEquals(cosineSimilarity([1, 0], [0, 1]), 0);
});

Deno.test("cosineSimilarity: 0.0 for zero-magnitude vector", () => {
    assertEquals(cosineSimilarity([0, 0, 0], [1, 2, 3]), 0);
    assertEquals(cosineSimilarity([1, 2, 3], [0, 0, 0]), 0);
});

Deno.test("cosineSimilarity: throws on dimension mismatch", () => {
    assertThrows(
        () => cosineSimilarity([1, 2], [1, 2, 3]),
        Error,
        "cosineSimilarity: dimension mismatch (a=2, b=3)",
    );
});

// ---------------------------------------------------------------------------
// computeSubcategoryScores
// ---------------------------------------------------------------------------

Deno.test("computeSubcategoryScores: empty rows → empty record", () => {
    assertEquals(computeSubcategoryScores([1, 0, 0], []), {});
});

Deno.test("computeSubcategoryScores: exact match → 1.0", () => {
    const rows: SubcategoryEmbeddingRow[] = [
        {
            subcategory: "renewable",
            embedding: Array.from({ length: 1536 }, (_, i) => i / 1536),
        },
    ];
    const bill = Array.from({ length: 1536 }, (_, i) => i / 1536);
    const scores = computeSubcategoryScores(bill, rows);
    assertEquals(scores.renewable, 1);
});

Deno.test("computeSubcategoryScores: opposite vectors → 0.0", () => {
    const rows: SubcategoryEmbeddingRow[] = [
        {
            subcategory: "fossil",
            embedding: Array.from({ length: 1536 }, (_, i) => -((i + 1) / 1536)),
        },
    ];
    const bill = Array.from({ length: 1536 }, (_, i) => (i + 1) / 1536);
    const scores = computeSubcategoryScores(bill, rows);
    assertEquals(scores.fossil, 0);
});

Deno.test("computeSubcategoryScores: returns Record<string, number> keyed by subcategory", () => {
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
    assertEquals(Object.keys(scores).sort(), ["fossil", "renewable"]);
    assertEquals(typeof scores.renewable, "number");
    assertEquals(typeof scores.fossil, "number");
});
