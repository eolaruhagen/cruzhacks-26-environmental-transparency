import { test, expect } from "bun:test";
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

test("read() returns the validated row on happy path", async () => {
    const fake = makeBackend();
    fake.nextRead = { data: validRow, error: null };
    const client = new CongressSyncStateClient(fake.backend);

    const result = await client.read();

    expect(result).toEqual(validRow);
    expect(fake.calls).toEqual([{ method: "read" }]);
});

test("read() throws with context on backend error", async () => {
    const fake = makeBackend();
    fake.nextRead = { data: null, error: { message: "connection reset" } };
    const client = new CongressSyncStateClient(fake.backend);

    await expect(client.read()).rejects.toThrow("connection reset");
});

test("read() throws when row is missing required fields", async () => {
    const fake = makeBackend();
    fake.nextRead = {
        data: { id: 1, last_sync_at: null }, // missing created_at / updated_at / etc.
        error: null,
    };
    const client = new CongressSyncStateClient(fake.backend);

    // Substring chosen so a stub `throw new Error("not implemented")` fails;
    // the real impl wraps Zod errors with a contextual prefix.
    await expect(client.read()).rejects.toThrow("CongressSyncStateClient.read");
});

test("read() throws when id is not the singleton 1", async () => {
    const fake = makeBackend();
    fake.nextRead = { data: { ...validRow, id: 2 }, error: null };
    const client = new CongressSyncStateClient(fake.backend);

    await expect(client.read()).rejects.toThrow("CongressSyncStateClient.read");
});

// ---------------------------------------------------------------------------
// update()
// ---------------------------------------------------------------------------

test("update() forwards the patch and returns the validated row", async () => {
    const fake = makeBackend();
    fake.nextUpdate = {
        data: { ...validRow, last_error: "rate limited" },
        error: null,
    };
    const client = new CongressSyncStateClient(fake.backend);

    const result = await client.update({ last_error: "rate limited" });

    expect(result.last_error).toEqual("rate limited");
    expect(fake.calls).toEqual([
        { method: "update", patch: { last_error: "rate limited" } },
    ]);
});

test("update() rejects an empty patch before hitting the backend", async () => {
    const fake = makeBackend();
    const client = new CongressSyncStateClient(fake.backend);

    await expect(client.update({})).rejects.toThrow("CongressSyncStateClient.update");
    expect(fake.calls).toEqual([]); // no round-trip happened
});

test("update() rejects unknown keys (typo guard)", async () => {
    const fake = makeBackend();
    const client = new CongressSyncStateClient(fake.backend);

    await expect(
        // @ts-expect-error — purposely passing a typo'd key
        client.update({ last_sync_time: "2026-05-07T00:00:00Z" }),
    ).rejects.toThrow("CongressSyncStateClient.update");
    expect(fake.calls).toEqual([]);
});

test("update() throws with context on backend error", async () => {
    const fake = makeBackend();
    fake.nextUpdate = { data: null, error: { message: "permission denied" } };
    const client = new CongressSyncStateClient(fake.backend);

    await expect(
        client.update({ last_sync_at: "2026-05-07T00:00:00Z" }),
    ).rejects.toThrow("permission denied");
});

test("update() throws when returned row is invalid", async () => {
    const fake = makeBackend();
    fake.nextUpdate = {
        data: { id: 1 }, // invalid — missing required fields
        error: null,
    };
    const client = new CongressSyncStateClient(fake.backend);

    await expect(
        client.update({ last_sync_at: "2026-05-07T00:00:00Z" }),
    ).rejects.toThrow("CongressSyncStateClient.update");
});
