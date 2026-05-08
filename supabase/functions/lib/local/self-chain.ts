/**
 * Re-invoke an edge function from inside itself with a new body.
 *
 * Used by both the producer and the worker to break their work into multiple
 * invocations when the wall-clock budget runs low (`isRunningLow` returns
 * true). The chained invocation runs in a fresh container with its own 150s
 * budget; the original invocation completes its observability session and
 * returns normally.
 *
 * Mechanics: HTTP POST to `<supabaseUrl>/functions/v1/<fnName>` with
 * Authorization: Bearer <secretApiKey> so the chained call passes the same
 * authenticateRequest gate that the cron uses. The body is the next step's
 * invocation payload (e.g. `{kind:"scheduled", nextUrl:"..."}`).
 *
 * The fetch is injectable so tests assert URL / headers / body without
 * touching the network. Throws on non-2xx response so callers (which are
 * already inside an observability session) surface failures.
 */
export type FetchLike = (
    url: string,
    init?: RequestInit,
) => Promise<{ ok: boolean; status: number; text(): Promise<string> }>;

export async function selfInvoke(opts: {
    fnName: string;
    body: unknown;
    secretApiKey: string;
    supabaseUrl: string;
    fetch?: FetchLike;
}): Promise<void> {
    if (!opts.supabaseUrl) {
        throw new Error("selfInvoke: supabaseUrl is required");
    }
    if (!opts.fnName) {
        throw new Error("selfInvoke: fnName is required");
    }

    const base = opts.supabaseUrl.replace(/\/$/, "");
    const url = `${base}/functions/v1/${opts.fnName}`;
    const fetchImpl: FetchLike = opts.fetch ?? (globalThis.fetch as unknown as FetchLike);

    let response;
    try {
        response = await fetchImpl(url, {
            method: "POST",
            headers: {
                "Authorization": `Bearer ${opts.secretApiKey}`,
                "Content-Type": "application/json",
            },
            body: JSON.stringify(opts.body),
        });
    } catch (err) {
        const detail = err instanceof Error ? err.message : String(err);
        throw new Error(`selfInvoke(${opts.fnName}) network error: ${detail}`);
    }

    if (!response.ok) {
        const text = await response.text().catch(() => "<unreadable body>");
        throw new Error(
            `selfInvoke(${opts.fnName}) failed: HTTP ${response.status} ${text}`,
        );
    }
}
