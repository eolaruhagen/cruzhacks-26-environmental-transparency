import type { z } from "zod";
import { HttpResponseError } from "./error.ts";
import type { HttpResult } from "./result.ts";

/**
 * Narrow contract for what getValidated needs from a fetch-like function.
 * Avoids depending on the runtime's full `typeof fetch`, which varies between
 * environments (Bun's `@types/bun` adds `preconnect`, etc.).
 *
 * `init` is intentionally narrow — only `signal` is honored, matching the
 * standard fetch shape so retry/timeout decoration via AbortController works
 * out of the box. Implementations that ignore `init` are still compatible.
 */
export interface FetchResponseLike {
    readonly ok: boolean;
    readonly status: number;
    json(): Promise<unknown>;
    text(): Promise<string>;
}
export type FetchLike = (
    url: string,
    init?: { signal?: AbortSignal },
) => Promise<FetchResponseLike>;

/**
 * Fetch a URL and validate the response body against a Zod schema.
 *
 * Result-based — never throws on transport-level errors:
 *   - On non-2xx, returns an HttpResponseError carrying status + body.
 *   - On 2xx with valid JSON+schema, returns HttpSuccess with parsed data.
 *
 * Schema-validation failures DO throw, because they indicate either a
 * server contract change or a caller bug — not a transient transport
 * issue, and not something the retry layer should retry. Callers wrap
 * accordingly if they want unified error handling.
 */
export async function getValidated<T>(
    fetchImpl: FetchLike,
    url: string,
    schema: z.ZodType<T>,
    init?: { signal?: AbortSignal },
): Promise<HttpResult<T>> {
    const response = await fetchImpl(url, init);
    if (!response.ok) {
        // Best-effort body capture. Some fetch impls reject text() on
        // already-consumed bodies — we never let that mask the original
        // status code.
        let body: string | undefined;
        try {
            body = await response.text();
        } catch {
            body = undefined;
        }
        return new HttpResponseError(response.status, url, body);
    }
    const raw = await response.json();
    return { kind: "ok", status: response.status, data: schema.parse(raw) };
}

// Re-export so callers don't need a second import.
export { HttpResponseError };
