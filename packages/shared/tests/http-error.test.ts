import { expect, test } from "bun:test";
import { HttpResponseError } from "../src/utils/http/error.ts";

test("HttpResponseError carries status, target, body", () => {
    const e = new HttpResponseError(429, "/v3/bill", "rate limited");
    expect(e.status).toBe(429);
    expect(e.target).toBe("/v3/bill");
    expect(e.body).toBe("rate limited");
});

test("HttpResponseError.kind is the literal 'err' (for discriminated union)", () => {
    const e = new HttpResponseError(404, "/missing");
    expect(e.kind).toBe("err");
});

test("HttpResponseError extends Error and has a useful message", () => {
    const e = new HttpResponseError(500, "/v3/bill/119/hr/1", "internal");
    expect(e instanceof Error).toBe(true);
    expect(e instanceof HttpResponseError).toBe(true);
    expect(e.message).toContain("500");
    expect(e.message).toContain("/v3/bill/119/hr/1");
    expect(e.message).toContain("internal");
});

test("HttpResponseError.name is set so stack traces are readable", () => {
    const e = new HttpResponseError(503, "/x");
    expect(e.name).toBe("HttpResponseError");
});

test("HttpResponseError truncates very long bodies in the message", () => {
    const longBody = "x".repeat(5_000);
    const e = new HttpResponseError(500, "/x", longBody);
    expect(e.message.length).toBeLessThan(longBody.length);
    expect(e.body).toBe(longBody); // raw body preserved on the field
});

test("HttpResponseError handles missing body gracefully", () => {
    const e = new HttpResponseError(404, "/missing");
    expect(e.body).toBeUndefined();
    expect(e.message).toContain("404");
    expect(e.message).toContain("/missing");
});
