import { expect, test } from "bun:test";
import { mapConcurrent } from "../src/utils/concurrency.ts";

function deferred<T>() {
    let resolve!: (v: T) => void;
    let reject!: (e: unknown) => void;
    const promise = new Promise<T>((res, rej) => {
        resolve = res;
        reject = rej;
    });
    return { promise, resolve, reject };
}

test("mapConcurrent: empty input → empty output", async () => {
    let calls = 0;
    const result = await mapConcurrent([], 5, () => {
        calls++;
        return Promise.resolve("nope");
    });
    expect(result).toEqual([]);
    expect(calls).toBe(0);
});

test("mapConcurrent: limit >= length behaves like Promise.allSettled", async () => {
    const result = await mapConcurrent([1, 2, 3], 10, (n) => Promise.resolve(n * 2));
    expect(result).toEqual([
        { status: "fulfilled", value: 2 },
        { status: "fulfilled", value: 4 },
        { status: "fulfilled", value: 6 },
    ]);
});

test("mapConcurrent: results ordered by input index, not completion", async () => {
    const completionOrder = [50, 30, 10];
    const result = await mapConcurrent([1, 2, 3], 5, (n, i) =>
        new Promise<number>((resolve) => setTimeout(() => resolve(n * 100), completionOrder[i])),
    );
    expect(result).toEqual([
        { status: "fulfilled", value: 100 },
        { status: "fulfilled", value: 200 },
        { status: "fulfilled", value: 300 },
    ]);
});

test("mapConcurrent: failures surface as rejected, siblings continue", async () => {
    const result = await mapConcurrent([1, 2, 3, 4], 2, (n) => {
        if (n === 2) return Promise.reject(new Error("boom"));
        return Promise.resolve(`ok ${n}`);
    });
    expect(result.length).toBe(4);
    expect(result[0]).toEqual({ status: "fulfilled", value: "ok 1" });
    expect(result[1].status).toBe("rejected");
    expect(result[2]).toEqual({ status: "fulfilled", value: "ok 3" });
    expect(result[3]).toEqual({ status: "fulfilled", value: "ok 4" });
});

test("mapConcurrent: never exceeds the limit", async () => {
    const ds = Array.from({ length: 6 }, () => deferred<number>());
    let inFlight = 0;
    let max = 0;

    const promise = mapConcurrent([0, 1, 2, 3, 4, 5], 2, async (_n, i) => {
        inFlight++;
        if (inFlight > max) max = inFlight;
        try {
            return await ds[i].promise;
        } finally {
            inFlight--;
        }
    });

    await Promise.resolve();
    await Promise.resolve();
    expect(inFlight).toBe(2);

    ds[0].resolve(0);
    await Promise.resolve();
    await Promise.resolve();
    expect(inFlight <= 2).toBe(true);

    for (let i = 1; i < 6; i++) ds[i].resolve(i);
    await promise;
    expect(max).toBe(2);
});

test("mapConcurrent: rejects when limit < 1", () => {
    expect(mapConcurrent([1], 0, (n) => Promise.resolve(n))).rejects.toThrow("mapConcurrent");
    expect(mapConcurrent([1], -1, (n) => Promise.resolve(n))).rejects.toThrow("mapConcurrent");
});
