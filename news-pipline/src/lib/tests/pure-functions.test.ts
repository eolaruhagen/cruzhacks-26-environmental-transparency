import { describe, test, expect } from "bun:test";
import { ensureParsed, toStringArray, isRetryablePgError } from "../parse-utils";
import { computeRunningAverage, formatEmbedding } from "../story-clustering";


// ── ensureParsed ────────────────────────────────────────────────────

describe("ensureParsed", () => {
    test("returns object as-is if already parsed", () => {
        const obj = { title: "test", description: "desc" };
        expect(ensureParsed(obj)).toBe(obj); // same reference
    });

    test("parses valid JSON string into object", () => {
        const json = '{"title":"test","count":42}';
        const result = ensureParsed<{ title: string; count: number }>(json);
        expect(result.title).toBe("test");
        expect(result.count).toBe(42);
    });

    test("parses JSON array string", () => {
        const json = '["a","b","c"]';
        const result = ensureParsed<string[]>(json);
        expect(result).toEqual(["a", "b", "c"]);
    });

    test("THROWS on invalid JSON string", () => {
        expect(() => ensureParsed<{ title: string }>("{title: bad json}")).toThrow();
    });

    test("THROWS on '[object Object]' corruption", () => {
        expect(() => ensureParsed<{ title: string }>("[object Object]")).toThrow();
    });

    test("THROWS on empty string", () => {
        expect(() => ensureParsed<{ title: string }>("")).toThrow();
    });

    test("handles null (non-string passthrough)", () => {
        expect(ensureParsed(null)).toBeNull();
    });

    test("handles number (non-string passthrough)", () => {
        expect(ensureParsed(42)).toBe(42);
    });
});


describe("toStringArray", () => {
    test("passes through string array", () => {
        expect(toStringArray(["a", "b"])).toEqual(["a", "b"]);
    });

    test("returns empty array for empty array", () => {
        expect(toStringArray([])).toEqual([]);
    });

    test("coerces numbers in array to strings", () => {
        expect(toStringArray([1, 2, 3])).toEqual(["1", "2", "3"]);
    });

    test("coerces booleans in array to strings", () => {
        expect(toStringArray([true, false])).toEqual(["true", "false"]);
    });

    test("filters null and undefined from arrays", () => {
        expect(toStringArray(["a", null, "b", undefined, "c"])).toEqual(["a", "b", "c"]);
    });

    test("coerces numbers and filters nulls in mixed array", () => {
        expect(toStringArray([1, null, "valid"])).toEqual(["1", "valid"]);
    });

    test("wraps non-empty string in array", () => {
        expect(toStringArray("hello")).toEqual(["hello"]);
    });

    test("splits comma separated string into array", () => {
        expect(toStringArray("a,b,c")).toEqual(["a", "b", "c"]);
    });

    test("drops trailing commas in comma separated string", () => {
        expect(toStringArray("a,b,c,")).toEqual(["a", "b", "c"]);
    });

    test("drops leading commas in comma separated string", () => {
        expect(toStringArray(",a,b,c")).toEqual(["a", "b", "c"]);
    });

    test("drops midline commas in comma separated string", () => {
        expect(toStringArray("a,,b,c")).toEqual(["a", "b", "c"]);
    });

    test("returns empty array for empty string", () => {
        expect(toStringArray("")).toEqual([]);
    });

    test("returns empty array for null", () => {
        expect(toStringArray(null)).toEqual([]);
    });

    test("returns empty array for undefined", () => {
        expect(toStringArray(undefined)).toEqual([]);
    });

    test("THROWS for number (not recoverable to string[])", () => {
        expect(() => toStringArray(42)).toThrow(/cannot convert/i);
    });

    test("THROWS for plain object", () => {
        expect(() => toStringArray({ key: "value" })).toThrow(/cannot convert/i);
    });

    test("THROWS for array containing objects", () => {
        expect(() => toStringArray(["a", { nested: true }])).toThrow(/unexpected element type/i);
    });
});


describe("isRetryablePgError", () => {
    // ── Retryable: transient PG error classes ───────────────────────

    test("retries class 08 (connection exception)", () => {
        expect(isRetryablePgError({ code: "08006" })).toBe(true);
    });

    test("retries class 40 (transaction rollback / deadlock)", () => {
        expect(isRetryablePgError({ code: "40001" })).toBe(true);
    });

    test("retries class 53 (insufficient resources)", () => {
        expect(isRetryablePgError({ code: "53300" })).toBe(true);
    });

    test("retries class 57 (operator intervention)", () => {
        expect(isRetryablePgError({ code: "57014" })).toBe(true);
    });

    // ── Retryable: postgres.js ConnectionError codes ────────────────

    test("retries CONNECTION_DESTROYED", () => {
        expect(isRetryablePgError({ code: "CONNECTION_DESTROYED" })).toBe(true);
    });

    test("retries CONNECT_TIMEOUT", () => {
        expect(isRetryablePgError({ code: "CONNECT_TIMEOUT" })).toBe(true);
    });

    test("retries CONNECTION_CLOSED", () => {
        expect(isRetryablePgError({ code: "CONNECTION_CLOSED" })).toBe(true);
    });

    test("retries CONNECTION_ENDED", () => {
        expect(isRetryablePgError({ code: "CONNECTION_ENDED" })).toBe(true);
    });

    // ── Non-retryable: permanent PG error classes ───────────────────

    test("does NOT retry class 23 (integrity constraint violation)", () => {
        expect(isRetryablePgError({ code: "23505" })).toBe(false);
    });

    test("does NOT retry class 22 (data exception)", () => {
        expect(isRetryablePgError({ code: "22P02" })).toBe(false);
    });

    test("does NOT retry class 42 (syntax error / access rule)", () => {
        expect(isRetryablePgError({ code: "42601" })).toBe(false);
    });

    // ── Non-retryable: other postgres.js error codes ────────────────

    test("does NOT retry NOT_TAGGED_CALL", () => {
        expect(isRetryablePgError({ code: "NOT_TAGGED_CALL" })).toBe(false);
    });

    test("does NOT retry UNSAFE_TRANSACTION", () => {
        expect(isRetryablePgError({ code: "UNSAFE_TRANSACTION" })).toBe(false);
    });

    // ── Non-retryable: non-postgres errors (bugs) ───────────────────
    // These are the key behavior changes: non-PG errors are NOT retried.

    test("does NOT retry plain Error (no .code — likely a bug)", () => {
        expect(isRetryablePgError(new Error("something broke"))).toBe(false);
    });

    test("does NOT retry TypeError (would have caused retry loops before)", () => {
        expect(isRetryablePgError(new TypeError("Cannot read properties of undefined"))).toBe(false);
    });

    test("does NOT retry null", () => {
        expect(isRetryablePgError(null)).toBe(false);
    });

    test("does NOT retry undefined", () => {
        expect(isRetryablePgError(undefined)).toBe(false);
    });

    test("does NOT retry string", () => {
        expect(isRetryablePgError("some error string")).toBe(false);
    });

    test("does NOT retry numeric code (not a string)", () => {
        expect(isRetryablePgError({ code: 23505 })).toBe(false);
    });
});


describe("computeRunningAverage", () => {
    test("computes correct average for 2D vectors", () => {
        const result = computeRunningAverage([0.6, 0.4], 3, [0.9, 0.1], 4);
        expect(result[0]).toBeCloseTo(0.675);
        expect(result[1]).toBeCloseTo(0.325);
    });

    test("first article added to a story (oldCount=0)", () => {
        const result = computeRunningAverage([0, 0, 0], 0, [0.5, 0.3, 0.8], 1);
        expect(result).toEqual([0.5, 0.3, 0.8]);
    });

    test("identical embeddings produce same centroid", () => {
        const embedding = [0.1, 0.2, 0.3];
        const result = computeRunningAverage(embedding, 5, embedding, 6);
        result.forEach((v, i) => expect(v).toBeCloseTo(embedding[i]!));
    });

    test("handles negative values", () => {
        const result = computeRunningAverage([-0.5, 0.5], 1, [0.5, -0.5], 2);
        expect(result[0]).toBeCloseTo(0.0);
        expect(result[1]).toBeCloseTo(0.0);
    });

    test("handles high-dimensional vectors (1536-dim)", () => {
        const old = new Array(1536).fill(0.5);
        const newEmb = new Array(1536).fill(1.0);
        const result = computeRunningAverage(old, 9, newEmb, 10);
        expect(result).toHaveLength(1536);
        expect(result[0]).toBeCloseTo(0.55);
        expect(result[1535]).toBeCloseTo(0.55);
    });
});


describe("formatEmbedding", () => {
    test("formats number array to pgvector string", () => {
        expect(formatEmbedding([0.1, 0.2, 0.3])).toBe("[0.1,0.2,0.3]");
    });

    test("formats empty array", () => {
        expect(formatEmbedding([])).toBe("[]");
    });

    test("formats single element", () => {
        expect(formatEmbedding([0.5])).toBe("[0.5]");
    });

    test("preserves negative values", () => {
        expect(formatEmbedding([-0.1, 0.2, -0.3])).toBe("[-0.1,0.2,-0.3]");
    });

    test("preserves high precision", () => {
        const val = 0.123456789012345;
        const result = formatEmbedding([val]);
        expect(result).toBe(`[${val}]`);
    });

    // ── Dimension validation ────────────────────────────────────────

    test("passes when dims match", () => {
        expect(formatEmbedding([0.1, 0.2, 0.3], 3)).toBe("[0.1,0.2,0.3]");
    });

    test("THROWS when dims don't match (too few)", () => {
        expect(() => formatEmbedding([0.1, 0.2], 3)).toThrow(/expected 3.*got 2/i);
    });

    test("THROWS when dims don't match (too many)", () => {
        expect(() => formatEmbedding([0.1, 0.2, 0.3, 0.4], 3)).toThrow(/expected 3.*got 4/i);
    });

    test("skips validation when dims not provided", () => {
        expect(formatEmbedding([0.1])).toBe("[0.1]"); // no throw
    });
});
