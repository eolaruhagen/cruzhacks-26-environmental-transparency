import { expect, test } from "bun:test";
import { HttpResponseError, isHttpStatus } from "../src/utils/http/error.ts";

test("isHttpStatus: matches HttpResponseError with the exact status", () => {
    const err = new HttpResponseError(429, "/x");
    expect(isHttpStatus(err, 429)).toBe(true);
});

test("isHttpStatus: false for HttpResponseError with a different status", () => {
    const err = new HttpResponseError(500, "/x");
    expect(isHttpStatus(err, 429)).toBe(false);
});

test("isHttpStatus: false for plain Error", () => {
    expect(isHttpStatus(new Error("not http"), 429)).toBe(false);
});

test("isHttpStatus: false for non-Error values", () => {
    expect(isHttpStatus(undefined, 429)).toBe(false);
    expect(isHttpStatus(null, 429)).toBe(false);
    expect(isHttpStatus("HTTP 429", 429)).toBe(false);
    expect(isHttpStatus({ status: 429 }, 429)).toBe(false);
});

test("isHttpStatus: narrows the type within the guard branch", () => {
    const err: unknown = new HttpResponseError(429, "/x", "rate limited");
    if (isHttpStatus(err, 429)) {
        // Inside the branch, err is typed as HttpResponseError.
        expect(err.status).toBe(429);
        expect(err.target).toBe("/x");
        expect(err.body).toBe("rate limited");
    } else {
        throw new Error("guard should have matched");
    }
});
