import { assertEquals, assertThrows } from "jsr:@std/assert@1";
import { type FetchLike, selfInvoke } from "../self-chain.ts";

interface RecordedCall {
    url: string;
    init?: RequestInit;
}

function makeFetch(
    response: { ok: boolean; status: number; body?: string },
): { fetch: FetchLike; calls: RecordedCall[] } {
    const calls: RecordedCall[] = [];
    const fetch: FetchLike = (url, init) => {
        calls.push({ url, init });
        return Promise.resolve({
            ok: response.ok,
            status: response.status,
            text: () => Promise.resolve(response.body ?? ""),
        });
    };
    return { fetch, calls };
}

Deno.test("posts to the right URL with Bearer auth and JSON body", () => {
    const { fetch, calls } = makeFetch({ ok: true, status: 200 });
    selfInvoke({
        fnName: "sync-bills-new",
        body: { kind: "scheduled", nextUrl: "https://api.congress.gov/v3/bill?offset=250" },
        secretApiKey: "secret-key-abc",
        supabaseUrl: "http://kong:8000",
        fetch,
    });

    assertEquals(calls.length, 1);
    assertEquals(calls[0].url, "http://kong:8000/functions/v1/sync-bills-new");
    assertEquals(calls[0].init?.method, "POST");

    const headers = calls[0].init?.headers as Record<string, string>;
    assertEquals(headers["Authorization"], "Bearer secret-key-abc");
    assertEquals(headers["Content-Type"], "application/json");

    const sent = JSON.parse(calls[0].init?.body as string);
    assertEquals(sent, {
        kind: "scheduled",
        nextUrl: "https://api.congress.gov/v3/bill?offset=250",
    });
});

Deno.test("strips trailing slash from supabaseUrl", () => {
    const { fetch, calls } = makeFetch({ ok: true, status: 200 });
    selfInvoke({
        fnName: "bill-pipeline-worker",
        body: {},
        secretApiKey: "k",
        supabaseUrl: "http://kong:8000/",
        fetch,
    });
    assertEquals(calls[0].url, "http://kong:8000/functions/v1/bill-pipeline-worker");
});

Deno.test(
    "does NOT throw on non-2xx from the chained invocation (fire-and-forget swallows)",
    async () => {
        // The chain is independent. We can't await its response without
        // chaining wall-clock budgets, so failures of the chain can only
        // be discovered out-of-band (logs, observability sink).
        // selfInvoke must complete normally regardless.
        const { fetch } = makeFetch({ ok: false, status: 500, body: "boom" });
        selfInvoke({
            fnName: "sync-bills-new",
            body: {},
            secretApiKey: "k",
            supabaseUrl: "http://kong:8000",
            fetch,
        });
        // Reaching here is the assertion — no throw. Yield once so the
        // attached .catch handler runs and the test runtime doesn't flag
        // an unhandled rejection.
        await new Promise((r) => setTimeout(r, 10));
    },
);

Deno.test("throws synchronously when supabaseUrl is empty (caller bug)", () => {
    // Caller bugs are programming mistakes that should surface loudly.
    // These guards run before the fetch is fired, so they're synchronous.
    const { fetch } = makeFetch({ ok: true, status: 200 });
    assertThrows(
        () =>
            selfInvoke({
                fnName: "sync-bills-new",
                body: {},
                secretApiKey: "k",
                supabaseUrl: "",
                fetch,
            }),
        Error,
        "selfInvoke",
    );
});

Deno.test("throws synchronously when fnName is empty (caller bug)", () => {
    const { fetch } = makeFetch({ ok: true, status: 200 });
    assertThrows(
        () =>
            selfInvoke({
                fnName: "",
                body: {},
                secretApiKey: "k",
                supabaseUrl: "http://kong:8000",
                fetch,
            }),
        Error,
        "selfInvoke",
    );
});

Deno.test(
    "does NOT throw on a fetch-level network error (fire-and-forget swallows)",
    async () => {
        // ECONNREFUSED, DNS failure, etc. happen out-of-band of selfInvoke's
        // own call. The .catch handler logs them; selfInvoke itself returns
        // cleanly so the caller's session isn't tainted by a chain reach
        // failure.
        const fetch: FetchLike = () => Promise.reject(new Error("ECONNREFUSED"));
        selfInvoke({
            fnName: "sync-bills-new",
            body: {},
            secretApiKey: "k",
            supabaseUrl: "http://kong:8000",
            fetch,
        });
        // Yield to let the .catch handler run.
        await new Promise((r) => setTimeout(r, 10));
    },
);

// ---------------------------------------------------------------------------
// Fire-and-forget contract
// ---------------------------------------------------------------------------
// selfInvoke MUST NOT wait for the chained invocation's response. The chain
// is the whole point of self-invocation — if we awaited, the original
// invocation's wall-clock budget would be held until the chain returns,
// defeating the budget escape and cascading timeouts up the chain.
//
// Concretely: the next invocation can take up to 150s (full edge runtime
// budget). If we awaited, our own invocation's 150s budget would be eaten
// while we sit on the response. Cron timeout, observability stuck open,
// chain collapses.

Deno.test(
    "selfInvoke returns before the chained invocation responds (fire-and-forget)",
    {
        // The chained fetch never resolves on purpose, so a leaked promise
        // is part of the design. Disable the leak guards for this test only.
        sanitizeOps: false,
        sanitizeResources: false,
    },
    async () => {
        // Slow fetch that never resolves. If the original implementation
        // awaited it, the promise inside Promise.race below never resolves
        // and the timeout wins.
        const slowFetch: FetchLike = () => new Promise(() => {/* hangs */});

        const TIMED_OUT = Symbol("timed-out");
        const RETURNED = Symbol("returned");

        // Wrap the (now sync) call in a Promise so the race semantics work.
        // If selfInvoke is sync-and-fast, the wrapping promise resolves
        // immediately. If anyone re-introduces an `await` inside selfInvoke
        // for the fetch, this wrapper never resolves and the race fails.
        const callPromise = (async () => {
            selfInvoke({
                fnName: "sync-bills-new",
                body: { kind: "scheduled" },
                secretApiKey: "k",
                supabaseUrl: "http://kong:8000",
                fetch: slowFetch,
            });
            return RETURNED;
        })();

        const result = await Promise.race([
            callPromise,
            new Promise<symbol>((resolve) =>
                setTimeout(() => resolve(TIMED_OUT), 100)
            ),
        ]);

        assertEquals(
            result,
            RETURNED,
            "selfInvoke must NOT await the chained invocation's response. " +
                "Awaiting causes the original invocation's wall-clock budget " +
                "to be held until the chain responds — chain timeouts compound.",
        );
    },
);

Deno.test(
    "selfInvoke initiates the request before returning (fetch is called synchronously w.r.t. await)",
    {
        // Same dangling-promise dance as above — the fetch never resolves.
        sanitizeOps: false,
        sanitizeResources: false,
    },
    () => {
        // Fire-and-forget still has to actually FIRE — the request has to
        // hit the wire (or at least be scheduled). If we just dropped the
        // fetch on the floor, the chain wouldn't run.
        let called = false;
        const fetch: FetchLike = () => {
            called = true;
            return new Promise(() => {/* never resolves */});
        };
        selfInvoke({
            fnName: "sync-bills-new",
            body: {},
            secretApiKey: "k",
            supabaseUrl: "http://kong:8000",
            fetch,
        });
        assertEquals(called, true);
    },
);
