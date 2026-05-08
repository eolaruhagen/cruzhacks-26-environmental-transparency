import { assertEquals, assertRejects } from "jsr:@std/assert@1";
import { mapConcurrent } from "./concurrency.ts";

// Tiny deferred helper — lets each test resolve tasks on demand to inspect
// concurrency behavior. Without this you can only observe finished state.
function deferred<T>() {
    let resolve!: (v: T) => void;
    let reject!: (e: unknown) => void;
    const promise = new Promise<T>((res, rej) => {
        resolve = res;
        reject = rej;
    });
    return { promise, resolve, reject };
}

Deno.test("empty input → empty output, fn never called", async () => {
    let calls = 0;
    const result = await mapConcurrent([], 5, () => {
        calls++;
        return Promise.resolve("nope");
    });
    assertEquals(result, []);
    assertEquals(calls, 0);
});

Deno.test("limit >= length behaves like Promise.allSettled", async () => {
    const result = await mapConcurrent([1, 2, 3], 10, (n) => Promise.resolve(n * 2));
    assertEquals(result, [
        { status: "fulfilled", value: 2 },
        { status: "fulfilled", value: 4 },
        { status: "fulfilled", value: 6 },
    ]);
});

Deno.test("results are in input order, not completion order", async () => {
    // Tasks complete in reverse order (3 first, then 2, then 1) but the
    // returned array must be ordered by input index.
    const completionOrder = [50, 30, 10]; // ms
    const result = await mapConcurrent([1, 2, 3], 5, (n, i) => {
        return new Promise<number>((resolve) =>
            setTimeout(() => resolve(n * 100), completionOrder[i])
        );
    });
    assertEquals(result, [
        { status: "fulfilled", value: 100 },
        { status: "fulfilled", value: 200 },
        { status: "fulfilled", value: 300 },
    ]);
});

Deno.test("failures surface as rejected results without aborting siblings", async () => {
    const result = await mapConcurrent([1, 2, 3, 4], 2, (n) => {
        if (n === 2) return Promise.reject(new Error("boom on 2"));
        return Promise.resolve(`ok ${n}`);
    });
    assertEquals(result.length, 4);
    assertEquals(result[0], { status: "fulfilled", value: "ok 1" });
    assertEquals(result[1].status, "rejected");
    assertEquals((result[1] as PromiseRejectedResult).reason instanceof Error, true);
    assertEquals(result[2], { status: "fulfilled", value: "ok 3" });
    assertEquals(result[3], { status: "fulfilled", value: "ok 4" });
});

Deno.test("never exceeds the configured concurrency limit", async () => {
    // 6 tasks, limit 2. Hold each task open via a deferred; track how many
    // are in-flight at any moment.
    const deferreds = [
        deferred<number>(),
        deferred<number>(),
        deferred<number>(),
        deferred<number>(),
        deferred<number>(),
        deferred<number>(),
    ];
    let inFlight = 0;
    let maxInFlight = 0;

    const promise = mapConcurrent([0, 1, 2, 3, 4, 5], 2, async (_n, i) => {
        inFlight++;
        if (inFlight > maxInFlight) maxInFlight = inFlight;
        try {
            return await deferreds[i].promise;
        } finally {
            inFlight--;
        }
    });

    // Let the first wave start.
    await Promise.resolve();
    await Promise.resolve();
    assertEquals(inFlight, 2);

    // Resolve one — second wave should start, still capped at 2.
    deferreds[0].resolve(0);
    await Promise.resolve();
    await Promise.resolve();
    assertEquals(inFlight <= 2, true);

    // Drain the rest.
    deferreds[1].resolve(1);
    deferreds[2].resolve(2);
    deferreds[3].resolve(3);
    deferreds[4].resolve(4);
    deferreds[5].resolve(5);

    const result = await promise;
    assertEquals(result.length, 6);
    assertEquals(maxInFlight, 2);
});

Deno.test("rejects when limit < 1 (caller bug)", async () => {
    await assertRejects(
        () => mapConcurrent([1, 2], 0, (n) => Promise.resolve(n)),
        Error,
        "mapConcurrent",
    );
    await assertRejects(
        () => mapConcurrent([1, 2], -1, (n) => Promise.resolve(n)),
        Error,
        "mapConcurrent",
    );
});

Deno.test("limit larger than items still works", async () => {
    const result = await mapConcurrent([1], 100, (n) => Promise.resolve(n));
    assertEquals(result, [{ status: "fulfilled", value: 1 }]);
});
