/**
 * Build a URL querystring from a flat key/value map.
 *
 *   buildQuery({ page: 2, limit: 50 })           → "?page=2&limit=50"
 *   buildQuery({ q: "hello world" })             → "?q=hello%20world"
 *   buildQuery({ a: 1, b: undefined, c: null })  → "?a=1"
 *   buildQuery({})                               → ""
 *   buildQuery({ a: "" })                        → ""
 *
 * Accepts strings, numbers, booleans, null, and undefined as values.
 * `null` / `undefined` / empty-string values are dropped (never emit
 * `?key=` or `?key=null`). Insertion order is preserved.
 *
 * Returns the leading `?` so callers concatenate cleanly:
 *   `${baseUrl}/bill${buildQuery(params)}`
 *
 * For empty input or all-skipped values, returns `""` so the same
 * concatenation produces `${baseUrl}/bill` without a trailing `?`.
 */
/**
 * Param type uses bare `object` rather than `Record<string, string|number|boolean>`
 * so a strictly-typed input (e.g. `{ fromDateTime?: string; limit?: number }`)
 * is assignable without a cast — `Record<string, ...>` requires an explicit
 * index signature that typed object literals don't carry, even when their
 * values structurally fit. The runtime filter below keeps the emitted
 * querystring safe (drops non-primitives, null/undefined/"").
 */
export function buildQuery(params: object): string {
    const entries: Array<[string, string | number | boolean]> = [];
    for (const [k, v] of Object.entries(params)) {
        if (v === undefined || v === null || v === "") continue;
        const t = typeof v;
        if (t !== "string" && t !== "number" && t !== "boolean") continue;
        entries.push([k, v as string | number | boolean]);
    }
    if (entries.length === 0) return "";
    const qs = entries
        .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`)
        .join("&");
    return `?${qs}`;
}
