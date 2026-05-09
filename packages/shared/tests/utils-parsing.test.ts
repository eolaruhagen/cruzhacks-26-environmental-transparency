import { describe, expect, test } from "bun:test";
import {
    ensureParsed,
    formatEmbedding,
    toStringArray,
} from "../src/utils/parsing.ts";

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

// ── toStringArray ───────────────────────────────────────────────────

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

// ── formatEmbedding ─────────────────────────────────────────────────

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
