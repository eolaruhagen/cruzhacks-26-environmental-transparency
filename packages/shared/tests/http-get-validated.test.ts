import { expect, test } from "bun:test";
import { z } from "zod";
import { HttpResponseError } from "../src/utils/http/error.ts";
import {
    type FetchLike,
    type FetchResponseLike,
    getValidated,
} from "../src/utils/http/get-validated.ts";
import { isHttpSuccess } from "../src/utils/http/result.ts";

function fakeOk(body: unknown): FetchResponseLike {
    return {
        ok: true,
        status: 200,
        json: () => Promise.resolve(body),
        text: () => Promise.resolve(JSON.stringify(body)),
    };
}

function fakeErr(status: number, body = ""): FetchResponseLike {
    return {
        ok: false,
        status,
        json: () => Promise.resolve({}),
        text: () => Promise.resolve(body),
    };
}

const TestSchema = z.object({ id: z.number(), name: z.string() });

test("getValidated returns HttpSuccess on 2xx + valid schema", async () => {
    const fetch: FetchLike = () => Promise.resolve(fakeOk({ id: 1, name: "ok" }));
    const result = await getValidated(fetch, "/x", TestSchema);
    expect(isHttpSuccess(result)).toBe(true);
    if (isHttpSuccess(result)) {
        expect(result.status).toBe(200);
        expect(result.data).toEqual({ id: 1, name: "ok" });
    }
});

test("getValidated returns HttpResponseError on non-2xx", async () => {
    const fetch: FetchLike = () => Promise.resolve(fakeErr(503, "Service Unavailable"));
    const result = await getValidated(fetch, "/x", TestSchema);
    expect(result instanceof HttpResponseError).toBe(true);
    if (result instanceof HttpResponseError) {
        expect(result.status).toBe(503);
        expect(result.target).toBe("/x");
        expect(result.body).toBe("Service Unavailable");
    }
});

test("getValidated returns HttpResponseError on 429 (no retry decision here)", async () => {
    // getValidated itself doesn't retry; it just reports. The retry layer above
    // decides whether to retry based on status (and skips 429).
    const fetch: FetchLike = () => Promise.resolve(fakeErr(429));
    const result = await getValidated(fetch, "/x", TestSchema);
    expect(result instanceof HttpResponseError).toBe(true);
    if (result instanceof HttpResponseError) expect(result.status).toBe(429);
});

test("getValidated throws (does NOT return Result) on schema-validation failure", async () => {
    // Schema mismatch is a contract bug, not a transport issue. Throwing keeps
    // it out of the retry path (which retries Result errors).
    const fetch: FetchLike = () => Promise.resolve(fakeOk({ id: "wrong-type", name: 7 }));
    await expect(getValidated(fetch, "/x", TestSchema)).rejects.toThrow();
});

test("getValidated propagates fetch network errors as throws (not Result errors)", async () => {
    // A thrown fetch is a transport-level surprise; propagating it lets the
    // retry decorator catch + retry. getValidated itself doesn't try/catch.
    const fetch: FetchLike = () => Promise.reject(new Error("ECONNREFUSED"));
    await expect(getValidated(fetch, "/x", TestSchema)).rejects.toThrow("ECONNREFUSED");
});

test("getValidated body capture on error tolerates text() failures", async () => {
    // Some fetch impls (Bun, Deno) reject text() on already-consumed bodies.
    // We must not let a body-read failure mask the original status.
    const fetch: FetchLike = () =>
        Promise.resolve({
            ok: false,
            status: 500,
            json: () => Promise.resolve({}),
            text: () => Promise.reject(new Error("body already consumed")),
        });
    const result = await getValidated(fetch, "/x", TestSchema);
    expect(result instanceof HttpResponseError).toBe(true);
    if (result instanceof HttpResponseError) {
        expect(result.status).toBe(500);
        // body unavailable but error still surfaces
        expect(result.body === undefined || typeof result.body === "string").toBe(true);
    }
});
