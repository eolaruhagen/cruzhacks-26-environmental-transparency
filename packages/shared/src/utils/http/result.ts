import type { HttpResponseError } from "./error.ts";

/**
 * Successful HTTP response wrapper. Carries the parsed body plus the
 * status code (sometimes useful for distinguishing 200 vs. 201 etc.).
 *
 * Pairs with HttpResponseError via the `kind` discriminator:
 *
 *     if (result.kind === "ok") { ... result.data ... }
 *     else                       { ... result.status, result.target ... }
 */
export interface HttpSuccess<T> {
    readonly kind: "ok";
    readonly status: number;
    readonly data: T;
}

/**
 * Result of an HTTP operation: success with parsed body, or typed error.
 * Used by low-level primitives (getValidated, withRetry) so the retry
 * layer can inspect status without try/catch noise. High-level API
 * surfaces (e.g. CongressClient methods) typically re-throw the error
 * arm for ergonomics.
 */
export type HttpResult<T> = HttpSuccess<T> | HttpResponseError;

/** Convenience predicate. */
export function isHttpSuccess<T>(r: HttpResult<T>): r is HttpSuccess<T> {
    return r.kind === "ok";
}
