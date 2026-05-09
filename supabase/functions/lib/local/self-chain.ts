/**
 * Re-invoke an edge function from inside itself with a new body.
 *
 * **Fire-and-forget.** The chained invocation runs in a fresh container
 * with its own ~150s budget; the original invocation must NOT wait for
 * its response. Awaiting would cause the original's wall-clock budget to
 * be held until the chain returns — and the chain might also self-chain,
 * compounding into a tower of awaits that eventually times out the cron
 * initiator and kills the whole sequence.
 *
 * Failures of the chained call (non-2xx, network errors) cannot be
 * propagated up to the caller because we don't wait for them. They are
 * logged via console.warn and otherwise swallowed. If you need to know
 * the chain succeeded, observe its session via Discord/observability —
 * that's the cross-invocation visibility layer.
 *
 * Synchronous (sync) errors: caller-bug guards (empty supabaseUrl,
 * empty fnName) still throw — those happen before the fetch is fired
 * and indicate a programming mistake worth surfacing.
 *
 * Where supported (Supabase edge runtime exposes `EdgeRuntime.waitUntil`),
 * the fetch promise is registered with the runtime so the worker stays
 * alive long enough for the request to actually leave the box. In
 * environments without it (tests, local Deno), the promise is just
 * detached — the underlying fetch initiates synchronously, which is
 * enough for tests to verify it was called.
 */
export type FetchLike = (
    url: string,
    init?: RequestInit,
) => Promise<{ ok: boolean; status: number; text(): Promise<string> }>;

// Optional Supabase edge runtime global. Declared loose so this file
// type-checks under Deno where the global isn't part of any built-in type.
declare const EdgeRuntime: { waitUntil?(p: Promise<unknown>): void } | undefined;

export function selfInvoke(opts: {
    fnName: string;
    body: unknown;
    secretApiKey: string;
    supabaseUrl: string;
    fetch?: FetchLike;
}): void {
    if (!opts.supabaseUrl) {
        throw new Error("selfInvoke: supabaseUrl is required");
    }
    if (!opts.fnName) {
        throw new Error("selfInvoke: fnName is required");
    }

    const base = opts.supabaseUrl.replace(/\/$/, "");
    const url = `${base}/functions/v1/${opts.fnName}`;
    const fetchImpl: FetchLike = opts.fetch ?? (globalThis.fetch as unknown as FetchLike);

    // Initiate the request synchronously, attach a .catch logger so
    // unhandled rejections don't crash the runtime, but DO NOT await.
    const chainPromise: Promise<unknown> = fetchImpl(url, {
        method: "POST",
        headers: {
            "Authorization": `Bearer ${opts.secretApiKey}`,
            "Content-Type": "application/json",
        },
        body: JSON.stringify(opts.body),
    })
        .then((response) => {
            if (!response.ok) {
                return response
                    .text()
                    .catch(() => "<unreadable body>")
                    .then((text) => {
                        console.warn(
                            `[selfInvoke] ${opts.fnName} chain HTTP ${response.status}: ${text}`,
                        );
                    });
            }
            return undefined;
        })
        .catch((err: unknown) => {
            const detail = err instanceof Error ? err.message : String(err);
            console.warn(`[selfInvoke] ${opts.fnName} chain network error: ${detail}`);
        });

    // ensure that the fetch request is sent by waiting until sync execution finishes
    if (typeof EdgeRuntime !== "undefined" && EdgeRuntime?.waitUntil) {
        EdgeRuntime.waitUntil(chainPromise);
    }
}
