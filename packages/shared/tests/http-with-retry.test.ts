import { expect, test } from "bun:test";
import { HttpResponseError } from "../src/utils/http/error.ts";
import { type HttpResult, isHttpSuccess } from "../src/utils/http/result.ts";
import { type RetryLogger, isRetryableStatus, withRetry } from "../src/utils/http/with-retry.ts";

// ---------------------------------------------------------------------------
// isRetryableStatus
// ---------------------------------------------------------------------------

test("isRetryableStatus: 5xx is retryable", () => {
    expect(isRetryableStatus(500)).toBe(true);
    expect(isRetryableStatus(502)).toBe(true);
    expect(isRetryableStatus(503)).toBe(true);
    expect(isRetryableStatus(504)).toBe(true);
});

test("isRetryableStatus: 429 is NOT retryable (caller cools down)", () => {
    expect(isRetryableStatus(429)).toBe(false);
});

test("isRetryableStatus: other 4xx not retryable", () => {
    expect(isRetryableStatus(400)).toBe(false);
    expect(isRetryableStatus(401)).toBe(false);
    expect(isRetryableStatus(403)).toBe(false);
    expect(isRetryableStatus(404)).toBe(false);
});

test("isRetryableStatus: 2xx never retried (it's success)", () => {
    expect(isRetryableStatus(200)).toBe(false);
    expect(isRetryableStatus(204)).toBe(false);
});

// ---------------------------------------------------------------------------
// withRetry — happy paths
// ---------------------------------------------------------------------------

const noSleep = (_ms: number) => Promise.resolve();
const fixedRng = () => 0; // jitter = 0 for deterministic timing

test("withRetry: succeeds on first attempt → no retry", async () => {
    let attempts = 0;
    const op = (_signal: AbortSignal): Promise<HttpResult<string>> => {
        attempts++;
        return Promise.resolve({ kind: "ok", status: 200, data: "hi" });
    };
    const result = await withRetry(op, { sleep: noSleep, rng: fixedRng });
    expect(attempts).toBe(1);
    expect(isHttpSuccess(result)).toBe(true);
});

test("withRetry: retries on 502, succeeds on attempt 2", async () => {
    let attempts = 0;
    const op = (_signal: AbortSignal): Promise<HttpResult<string>> => {
        attempts++;
        if (attempts === 1) return Promise.resolve(new HttpResponseError(502, "/x"));
        return Promise.resolve({ kind: "ok", status: 200, data: "ok" });
    };
    const result = await withRetry(op, { sleep: noSleep, rng: fixedRng });
    expect(attempts).toBe(2);
    expect(isHttpSuccess(result)).toBe(true);
});

test("withRetry: gives up after maxAttempts of 5xx, returns last error", async () => {
    let attempts = 0;
    const op = (_signal: AbortSignal): Promise<HttpResult<string>> => {
        attempts++;
        return Promise.resolve(new HttpResponseError(503, "/x"));
    };
    const result = await withRetry(op, {
        maxAttempts: 3,
        sleep: noSleep,
        rng: fixedRng,
    });
    expect(attempts).toBe(3);
    expect(result instanceof HttpResponseError).toBe(true);
    if (result instanceof HttpResponseError) expect(result.status).toBe(503);
});

// ---------------------------------------------------------------------------
// withRetry — non-retryable statuses bail immediately
// ---------------------------------------------------------------------------

test("withRetry: 429 bails after attempt 1 (NEVER retried)", async () => {
    let attempts = 0;
    const op = (_signal: AbortSignal): Promise<HttpResult<string>> => {
        attempts++;
        return Promise.resolve(new HttpResponseError(429, "/x"));
    };
    const result = await withRetry(op, { sleep: noSleep, rng: fixedRng });
    expect(attempts).toBe(1);
    expect(result instanceof HttpResponseError).toBe(true);
    if (result instanceof HttpResponseError) expect(result.status).toBe(429);
});

test("withRetry: 404 bails after attempt 1", async () => {
    let attempts = 0;
    const op = (_signal: AbortSignal): Promise<HttpResult<string>> => {
        attempts++;
        return Promise.resolve(new HttpResponseError(404, "/x"));
    };
    await withRetry(op, { sleep: noSleep, rng: fixedRng });
    expect(attempts).toBe(1);
});

// ---------------------------------------------------------------------------
// withRetry — thrown errors are retried, then surfaced
// ---------------------------------------------------------------------------

test("withRetry: thrown network error retried, succeeds eventually", async () => {
    let attempts = 0;
    const op = (_signal: AbortSignal): Promise<HttpResult<string>> => {
        attempts++;
        if (attempts < 2) return Promise.reject(new Error("ECONNRESET"));
        return Promise.resolve({ kind: "ok", status: 200, data: "ok" });
    };
    const result = await withRetry(op, { sleep: noSleep, rng: fixedRng });
    expect(attempts).toBe(2);
    expect(isHttpSuccess(result)).toBe(true);
});

test("withRetry: throws if all attempts throw", async () => {
    let attempts = 0;
    const op = (_signal: AbortSignal): Promise<HttpResult<string>> => {
        attempts++;
        return Promise.reject(new Error("ECONNREFUSED"));
    };
    await expect(
        withRetry(op, { maxAttempts: 3, sleep: noSleep, rng: fixedRng }),
    ).rejects.toThrow("ECONNREFUSED");
    expect(attempts).toBe(3);
});

// ---------------------------------------------------------------------------
// withRetry — timeout via AbortSignal
// ---------------------------------------------------------------------------

test("withRetry: signal aborts when timeoutMs elapses", async () => {
    let abortedCount = 0;
    let attempts = 0;
    const op = (signal: AbortSignal): Promise<HttpResult<string>> => {
        attempts++;
        return new Promise((_resolve, reject) => {
            signal.addEventListener("abort", () => {
                abortedCount++;
                reject(new DOMException("aborted", "AbortError"));
            });
            // Never resolves on its own — only the abort path completes.
        });
    };

    // Use a real sleep but tiny timeoutMs so the test runs in ~few ms total.
    const result = await withRetry(op, {
        maxAttempts: 2,
        timeoutMs: 5,
        sleep: noSleep,
        rng: fixedRng,
    }).catch((e) => e);

    // Both attempts triggered an abort.
    expect(attempts).toBe(2);
    expect(abortedCount).toBe(2);
    // Final outcome is the thrown abort surfacing.
    expect(result instanceof Error).toBe(true);
});

// ---------------------------------------------------------------------------
// withRetry — backoff sleeps grow exponentially
// ---------------------------------------------------------------------------

test("withRetry: backoff grows base, base*factor between attempts", async () => {
    const sleeps: number[] = [];
    const sleep = (ms: number) => {
        sleeps.push(ms);
        return Promise.resolve();
    };
    const op = (_s: AbortSignal): Promise<HttpResult<string>> =>
        Promise.resolve(new HttpResponseError(502, "/x"));
    await withRetry(op, {
        maxAttempts: 3,
        baseBackoffMs: 100,
        backoffFactor: 2,
        jitterMs: 0, // deterministic
        sleep,
        rng: fixedRng,
    });
    // 2 sleeps between 3 attempts: 100, 200
    expect(sleeps).toEqual([100, 200]);
});

test("withRetry: backoff capped at maxBackoffMs", async () => {
    const sleeps: number[] = [];
    const sleep = (ms: number) => {
        sleeps.push(ms);
        return Promise.resolve();
    };
    const op = (_s: AbortSignal): Promise<HttpResult<string>> =>
        Promise.resolve(new HttpResponseError(502, "/x"));
    await withRetry(op, {
        maxAttempts: 5,
        baseBackoffMs: 1000,
        backoffFactor: 10,
        jitterMs: 0,
        maxBackoffMs: 1500,
        sleep,
        rng: fixedRng,
    });
    // Without cap: 1000, 10000, 100000, 1000000. With cap: 1000, 1500, 1500, 1500.
    expect(sleeps).toEqual([1000, 1500, 1500, 1500]);
});

test("withRetry: jitter adds up to jitterMs to each backoff", async () => {
    const sleeps: number[] = [];
    const sleep = (ms: number) => {
        sleeps.push(ms);
        return Promise.resolve();
    };
    const op = (_s: AbortSignal): Promise<HttpResult<string>> =>
        Promise.resolve(new HttpResponseError(502, "/x"));
    await withRetry(op, {
        maxAttempts: 3,
        baseBackoffMs: 100,
        backoffFactor: 2,
        jitterMs: 50,
        sleep,
        rng: () => 0.5, // half-jitter every time
    });
    // base + 0.5 * jitter = 100 + 25, 200 + 25
    expect(sleeps).toEqual([125, 225]);
});

// ---------------------------------------------------------------------------
// withRetry — logger breadcrumbs
// ---------------------------------------------------------------------------

function makeLogger(): { logger: RetryLogger; calls: Array<{ obj: object; msg: string }> } {
    const calls: Array<{ obj: object; msg: string }> = [];
    const logger: RetryLogger = { debug: (obj, msg) => calls.push({ obj, msg }) };
    return { logger, calls };
}

test("withRetry: logger records retryable-status attempt, backoff, and ok attempt", async () => {
    const { logger, calls } = makeLogger();
    let attempts = 0;
    const op = (_signal: AbortSignal): Promise<HttpResult<string>> => {
        attempts++;
        if (attempts === 1) return Promise.resolve(new HttpResponseError(503, "/x"));
        return Promise.resolve({ kind: "ok", status: 200, data: "ok" });
    };
    const result = await withRetry(op, { sleep: noSleep, rng: fixedRng, logger });
    expect(isHttpSuccess(result)).toBe(true);

    const attemptCalls = calls.filter((c) => c.msg === "http attempt");
    const backoffCalls = calls.filter((c) => c.msg === "http retry backoff");
    expect(attemptCalls.length).toBe(2);
    expect(backoffCalls.length).toBe(1);

    const first = attemptCalls[0]!.obj as Record<string, unknown>;
    expect(first.outcome).toBe("retryable-status");
    expect(first.status).toBe(503);
    expect(first.attempt).toBe(1);

    const second = attemptCalls[1]!.obj as Record<string, unknown>;
    expect(second.outcome).toBe("ok");
    expect(second.attempt).toBe(2);
});

test("withRetry: logger records aborted outcome on AbortError", async () => {
    const { logger, calls } = makeLogger();
    let attempts = 0;
    const op = (signal: AbortSignal): Promise<HttpResult<string>> => {
        attempts++;
        return new Promise((_resolve, reject) => {
            signal.addEventListener("abort", () => {
                reject(new DOMException("aborted", "AbortError"));
            });
        });
    };
    await withRetry(op, {
        maxAttempts: 1,
        timeoutMs: 5,
        sleep: noSleep,
        rng: fixedRng,
        logger,
    }).catch(() => {});

    expect(attempts).toBe(1);
    const attemptCalls = calls.filter((c) => c.msg === "http attempt");
    expect(attemptCalls.length).toBe(1);
    const logged = attemptCalls[0]!.obj as Record<string, unknown>;
    expect(logged.outcome).toBe("aborted");
});

test("withRetry: logger records the label in logged objects", async () => {
    const { logger, calls } = makeLogger();
    const op = (_signal: AbortSignal): Promise<HttpResult<string>> =>
        Promise.resolve({ kind: "ok", status: 200, data: "ok" });
    await withRetry(op, { sleep: noSleep, rng: fixedRng, logger, label: "api.congress.gov/v3/bill" });

    const attemptCalls = calls.filter((c) => c.msg === "http attempt");
    expect(attemptCalls.length).toBeGreaterThan(0);
    const logged = attemptCalls[0]!.obj as Record<string, unknown>;
    expect(logged.label).toBe("api.congress.gov/v3/bill");
});

test("withRetry: omitting logger does not throw and does not alter outcomes", async () => {
    let attempts = 0;
    const op = (_signal: AbortSignal): Promise<HttpResult<string>> => {
        attempts++;
        if (attempts === 1) return Promise.resolve(new HttpResponseError(503, "/x"));
        return Promise.resolve({ kind: "ok", status: 200, data: "ok" });
    };
    // No logger — must behave identically to the base retry behaviour.
    const result = await withRetry(op, { sleep: noSleep, rng: fixedRng });
    expect(attempts).toBe(2);
    expect(isHttpSuccess(result)).toBe(true);
});
