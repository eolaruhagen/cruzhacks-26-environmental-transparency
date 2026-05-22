/**
 * Typed HTTP error for non-2xx responses. Pairs with `HttpSuccess<T>` to
 * form `HttpResult<T>` — a discriminated union via the `kind` field.
 *
 * Carries the status code, the request target, and (optionally) the body.
 * Consumers do `err instanceof HttpResponseError && err.status === 429`
 * instead of substring-matching error messages — refactor-safe.
 *
 * Extends `Error` so it can also be `throw`n in higher-level wrappers
 * (e.g. CongressClient method surfaces). The `name` is set so stack
 * traces in production logs show `HttpResponseError: ...` and not
 * `Error: ...`.
 */
export class HttpResponseError extends Error {
    readonly kind = "err" as const;

    constructor(
        public readonly status: number,
        public readonly target: string,
        public readonly body?: string,
    ) {
        super(
            `HTTP ${status} for ${target}${body ? `: ${truncate(body, 200)}` : ""}`,
        );
        this.name = "HttpResponseError";
    }
}

function truncate(s: string, max: number): string {
    return s.length <= max ? s : `${s.slice(0, max)}…`;
}
