import { expect, test } from "bun:test";
import { buildQuery } from "../src/utils/http/query.ts";

test("buildQuery: returns empty string for empty params", () => {
    expect(buildQuery({})).toBe("");
});

test("buildQuery: serializes string and number values", () => {
    expect(buildQuery({ page: 2, q: "hello" })).toBe("?page=2&q=hello");
});

test("buildQuery: prepends a single ? and joins with &", () => {
    const result = buildQuery({ a: 1, b: 2, c: 3 });
    expect(result.startsWith("?")).toBe(true);
    expect(result.split("&").length).toBe(3);
});

test("buildQuery: percent-encodes special characters", () => {
    expect(buildQuery({ q: "hello world" })).toBe("?q=hello%20world");
    expect(buildQuery({ q: "a&b=c" })).toBe("?q=a%26b%3Dc");
});

test("buildQuery: drops undefined values", () => {
    expect(buildQuery({ a: 1, b: undefined })).toBe("?a=1");
});

test("buildQuery: drops null values", () => {
    expect(buildQuery({ a: 1, b: null })).toBe("?a=1");
});

test("buildQuery: drops empty-string values (avoids `?key=`)", () => {
    expect(buildQuery({ a: "", b: "x" })).toBe("?b=x");
});

test("buildQuery: returns empty string when every value is dropped", () => {
    expect(buildQuery({ a: undefined, b: null, c: "" })).toBe("");
});

test("buildQuery: serializes booleans as 'true' / 'false'", () => {
    expect(buildQuery({ strict: true, fast: false })).toBe("?strict=true&fast=false");
});

test("buildQuery: preserves insertion order", () => {
    expect(buildQuery({ z: 1, a: 2, m: 3 })).toBe("?z=1&a=2&m=3");
});

test("buildQuery: serializes 0 (not treated as missing)", () => {
    // Falsy but not undefined/null/"". 0 is a real value.
    expect(buildQuery({ offset: 0, limit: 50 })).toBe("?offset=0&limit=50");
});

test("buildQuery: percent-encodes the key as well as the value", () => {
    // Most keys are simple identifiers, but a key with `&` or `=` would
    // corrupt the querystring if it weren't encoded — verify defense.
    expect(buildQuery({ "weird key": "x" })).toBe("?weird%20key=x");
});

test("buildQuery: typical Congress API params", () => {
    const result = buildQuery({
        fromDateTime: "2024-01-01T00:00:00Z",
        limit: 250,
        sort: "updateDate+asc",
    });
    expect(result).toContain("fromDateTime=2024-01-01T00%3A00%3A00Z");
    expect(result).toContain("limit=250");
    // The `+` in sort literally means the literal char; encodeURIComponent
    // emits %2B rather than `+`, which is correct behavior (encodeURIComponent
    // does NOT treat `+` as space).
    expect(result).toContain("sort=updateDate%2Basc");
});
