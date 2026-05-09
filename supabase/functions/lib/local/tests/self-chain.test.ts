import { assertEquals, assertRejects } from "jsr:@std/assert@1";
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

Deno.test("posts to the right URL with Bearer auth and JSON body", async () => {
    const { fetch, calls } = makeFetch({ ok: true, status: 200 });
    await selfInvoke({
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

Deno.test("strips trailing slash from supabaseUrl", async () => {
    const { fetch, calls } = makeFetch({ ok: true, status: 200 });
    await selfInvoke({
        fnName: "bill-pipeline-worker",
        body: {},
        secretApiKey: "k",
        supabaseUrl: "http://kong:8000/",
        fetch,
    });
    assertEquals(calls[0].url, "http://kong:8000/functions/v1/bill-pipeline-worker");
});

Deno.test("throws with status + body on non-2xx response", async () => {
    const { fetch } = makeFetch({ ok: false, status: 500, body: "boom" });
    await assertRejects(
        () =>
            selfInvoke({
                fnName: "sync-bills-new",
                body: {},
                secretApiKey: "k",
                supabaseUrl: "http://kong:8000",
                fetch,
            }),
        Error,
        "selfInvoke",
    );
});

Deno.test("throws when supabaseUrl is empty (caller bug)", async () => {
    const { fetch } = makeFetch({ ok: true, status: 200 });
    await assertRejects(
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

Deno.test("throws when fnName is empty (caller bug)", async () => {
    const { fetch } = makeFetch({ ok: true, status: 200 });
    await assertRejects(
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

Deno.test("propagates fetch network error", async () => {
    const fetch: FetchLike = () => Promise.reject(new Error("ECONNREFUSED"));
    await assertRejects(
        () =>
            selfInvoke({
                fnName: "sync-bills-new",
                body: {},
                secretApiKey: "k",
                supabaseUrl: "http://kong:8000",
                fetch,
            }),
        Error,
        "selfInvoke",
    );
});
