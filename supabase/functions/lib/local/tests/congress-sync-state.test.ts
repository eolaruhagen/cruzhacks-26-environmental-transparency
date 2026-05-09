import { assertEquals, assertRejects } from "jsr:@std/assert@1";
import {
    CongressSyncStateClient,
    type CongressSyncStateBackend,
} from "../congress-sync-state.ts";

// Recording fake — every read/update is captured for assertions, and the
// canned response is whatever `nextRead` / `nextUpdate` is set to. Letting
// tests bias the response per-case (vs. one fixture for the whole file)
// keeps each case self-contained.
function makeBackend(): {
    backend: CongressSyncStateBackend;
    calls: { method: "read" | "update"; patch?: Record<string, unknown> }[];
    nextRead: { data: unknown; error: { message: string } | null };
    nextUpdate: { data: unknown; error: { message: string } | null };
} {
    const calls: { method: "read" | "update"; patch?: Record<string, unknown> }[] = [];
    const state = {
        nextRead: { data: null, error: null } as {
            data: unknown;
            error: { message: string } | null;
        },
        nextUpdate: { data: null, error: null } as {
            data: unknown;
            error: { message: string } | null;
        },
    };
    const backend: CongressSyncStateBackend = {
        read: () => {
            calls.push({ method: "read" });
            return Promise.resolve(state.nextRead);
        },
        update: (patch) => {
            calls.push({ method: "update", patch });
            return Promise.resolve(state.nextUpdate);
        },
    };
    return {
        backend,
        calls,
        get nextRead() {
            return state.nextRead;
        },
        set nextRead(v) {
            state.nextRead = v;
        },
        get nextUpdate() {
            return state.nextUpdate;
        },
        set nextUpdate(v) {
            state.nextUpdate = v;
        },
    };
}

const validRow = {
    id: 1 as const,
    last_sync_at: "2026-05-07T12:00:00.000+00:00",
    api_rate_limit_reset_at: null,
    last_error: null,
    created_at: "2026-05-01T00:00:00.000+00:00",
    updated_at: "2026-05-07T12:00:00.000+00:00",
};

// ---------------------------------------------------------------------------
// read()
// ---------------------------------------------------------------------------

Deno.test("read() returns the validated row on happy path", async () => {
    const fake = makeBackend();
    fake.nextRead = { data: validRow, error: null };
    const client = new CongressSyncStateClient(fake.backend);

    const result = await client.read();

    assertEquals(result, validRow);
    assertEquals(fake.calls, [{ method: "read" }]);
});

Deno.test("read() throws with context on backend error", async () => {
    const fake = makeBackend();
    fake.nextRead = { data: null, error: { message: "connection reset" } };
    const client = new CongressSyncStateClient(fake.backend);

    await assertRejects(
        () => client.read(),
        Error,
        "connection reset",
    );
});

Deno.test("read() throws when row is missing required fields", async () => {
    const fake = makeBackend();
    fake.nextRead = {
        data: { id: 1, last_sync_at: null }, // missing created_at / updated_at / etc.
        error: null,
    };
    const client = new CongressSyncStateClient(fake.backend);

    // Substring chosen so a stub `throw new Error("not implemented")` fails;
    // the real impl wraps Zod errors with a contextual prefix.
    await assertRejects(() => client.read(), Error, "CongressSyncStateClient.read");
});

Deno.test("read() throws when id is not the singleton 1", async () => {
    const fake = makeBackend();
    fake.nextRead = { data: { ...validRow, id: 2 }, error: null };
    const client = new CongressSyncStateClient(fake.backend);

    await assertRejects(() => client.read(), Error, "CongressSyncStateClient.read");
});

// ---------------------------------------------------------------------------
// update()
// ---------------------------------------------------------------------------

Deno.test("update() forwards the patch and returns the validated row", async () => {
    const fake = makeBackend();
    fake.nextUpdate = {
        data: { ...validRow, last_error: "rate limited" },
        error: null,
    };
    const client = new CongressSyncStateClient(fake.backend);

    const result = await client.update({ last_error: "rate limited" });

    assertEquals(result.last_error, "rate limited");
    assertEquals(fake.calls, [
        { method: "update", patch: { last_error: "rate limited" } },
    ]);
});

Deno.test("update() rejects an empty patch before hitting the backend", async () => {
    const fake = makeBackend();
    const client = new CongressSyncStateClient(fake.backend);

    await assertRejects(
        () => client.update({}),
        Error,
        "CongressSyncStateClient.update",
    );
    assertEquals(fake.calls, []); // no round-trip happened
});

Deno.test("update() rejects unknown keys (typo guard)", async () => {
    const fake = makeBackend();
    const client = new CongressSyncStateClient(fake.backend);

    await assertRejects(
        // @ts-expect-error — purposely passing a typo'd key
        () => client.update({ last_sync_time: "2026-05-07T00:00:00Z" }),
        Error,
        "CongressSyncStateClient.update",
    );
    assertEquals(fake.calls, []);
});

Deno.test("update() throws with context on backend error", async () => {
    const fake = makeBackend();
    fake.nextUpdate = { data: null, error: { message: "permission denied" } };
    const client = new CongressSyncStateClient(fake.backend);

    await assertRejects(
        () => client.update({ last_sync_at: "2026-05-07T00:00:00Z" }),
        Error,
        "permission denied",
    );
});

Deno.test("update() throws when returned row is invalid", async () => {
    const fake = makeBackend();
    fake.nextUpdate = {
        data: { id: 1 }, // invalid — missing required fields
        error: null,
    };
    const client = new CongressSyncStateClient(fake.backend);

    await assertRejects(
        () => client.update({ last_sync_at: "2026-05-07T00:00:00Z" }),
        Error,
        "CongressSyncStateClient.update",
    );
});
