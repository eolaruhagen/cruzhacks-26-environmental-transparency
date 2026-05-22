import { HttpResponseError } from "./error.ts";
import type { HttpResult } from "./result.ts";

/**
 * Retry policy for `withRetry`. Defaults are tuned for a per-cron-tick
 * worker — worst-case 3-attempt failure for one HTTP call is ~16s, leaving
 * room for many batches per invocation before the time budget runs out.
 *
 *   timeoutMs:     5_000   → per-attempt timeout via AbortController
 *   maxAttempts:   3       → initial + up to 2 retries
 *   baseBackoffMs: 250     → backoff before retry 2
 *   backoffFactor: 2       → exponential (250, 500)
 *   jitterMs:      250     → +random(0..jitterMs) on each backoff
 *   maxBackoffMs:  1_500   → hard ceiling on a single backoff wait
 */
export interface RetryOptions {
    timeoutMs?: number;
    maxAttempts?: number;
    baseBackoffMs?: number;
    backoffFactor?: number;
    jitterMs?: number;
    maxBackoffMs?: number;
    /**
     * Inject for tests so timing assertions are deterministic.
     * Defaults to globalThis.setTimeout / Math.random.
     */
    sleep?: (ms: number) => Promise<void>;
    rng?: () => number;
}

export const DEFAULT_RETRY_OPTIONS: Required<RetryOptions> = {
    timeoutMs: 5_000,
    maxAttempts: 3,
    baseBackoffMs: 250,
    backoffFactor: 2,
    jitterMs: 250,
    maxBackoffMs: 1_500,
    sleep: (ms) => new Promise((r) => setTimeout(r, ms)),
    rng: Math.random,
};

/**
 * Wrap an HTTP operation with timeout + retry semantics.
 *
 * Retries on:
 *   - 5xx responses
 *   - The op itself throwing (network errors, AbortError from our timeout)
 *
 * Does NOT retry on:
 *   - 429 (caller is responsible for setting a cooldown timestamp)
 *   - Other 4xx (logical / data errors — retry won't help)
 *
 * `op` receives an AbortSignal that fires when timeoutMs elapses for the
 * current attempt. Implementations MUST pass this to fetch/AbortController
 * so the in-flight request actually cancels rather than just being ignored.
 *
 * Returns the final HttpResult — either the last success, or the last
 * HttpResponseError if every attempt failed.
 */
export async function withRetry<T>(
    op: (signal: AbortSignal) => Promise<HttpResult<T>>,
    opts?: RetryOptions,
): Promise<HttpResult<T>> {
    const cfg = { ...DEFAULT_RETRY_OPTIONS, ...opts };
    let lastError: HttpResponseError | undefined;
    let lastThrown: unknown;

    for (let attempt = 1; attempt <= cfg.maxAttempts; attempt++) {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), cfg.timeoutMs);
        let result: HttpResult<T> | undefined;
        try {
            result = await op(controller.signal);
            lastThrown = undefined;
        } catch (err) {
            lastThrown = err;
        } finally {
            clearTimeout(timer);
        }

        if (result && result.kind === "ok") return result;
        if (result instanceof HttpResponseError) {
            // Non-retryable status: bail immediately, don't sleep.
            if (!isRetryableStatus(result.status)) return result;
            lastError = result;
        }

        // Decide whether to attempt again. After the last attempt we exit
        // the loop without sleeping.
        if (attempt >= cfg.maxAttempts) break;

        // Exponential backoff with optional jitter, capped.
        const exp = cfg.baseBackoffMs * Math.pow(cfg.backoffFactor, attempt - 1);
        const cappedBase = Math.min(exp, cfg.maxBackoffMs);
        const jitter = Math.floor(cfg.rng() * cfg.jitterMs);
        const wait = cappedBase + jitter;
        await cfg.sleep(wait);
    }

    // Exhausted all attempts. If the last attempt threw, propagate it
    // (transport surprise — caller likely wants to see it). Otherwise
    // return the last HttpResponseError.
    if (lastThrown !== undefined) throw lastThrown;
    if (lastError) return lastError;
    // Defensive: shouldn't reach here unless maxAttempts < 1, which is
    // already nonsensical. Return a synthetic error so the caller still
    // sees a typed result.
    return new HttpResponseError(0, "<no-attempt>", "withRetry: no attempts ran");
}

/**
 * Internal: should this status code trigger a retry? Exported for testing.
 */
export function isRetryableStatus(status: number): boolean {
    return status >= 500 && status < 600;
}
