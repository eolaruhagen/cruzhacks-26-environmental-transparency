import { describe, expect, test } from "bun:test";
import { callOrTrip, createCoordinatedGroup } from "../src/utils/coordinated-group.ts";

class MyRetryError extends Error {
    constructor(public readonly ctx: string) {
        super(`retry: ${ctx}`);
        this.name = "MyRetryError";
    }

    fuckYou() {
        return "hEllo"
    }
}


const stubStrategy = {
    shouldTrip: (err: unknown) => err instanceof Error && err.message === "TRIP_ME",
    retryError: (ctx: string) => new MyRetryError(ctx),
};

test("fresh group: tripped=false, signal not aborted", () => {
    const g = createCoordinatedGroup(stubStrategy);
    expect(g.tripped).toBe(false);
    expect(g.signal.aborted).toBe(false);
});

test("trip(): flips tripped=true and aborts the signal", () => {
    const g = createCoordinatedGroup(stubStrategy);
    g.trip();
    expect(g.tripped).toBe(true);
    expect(g.signal.aborted).toBe(true);
});

test("trip(): idempotent (safe to call repeatedly)", () => {
    const g = createCoordinatedGroup(stubStrategy);
    g.trip();
    g.trip();
    g.trip();
    expect(g.tripped).toBe(true);
    expect(g.signal.aborted).toBe(true);
});

test("shouldTripOn: delegates to strategy.shouldTrip", () => {
    const g = createCoordinatedGroup(stubStrategy);
    expect(g.shouldTripOn(new Error("TRIP_ME"))).toBe(true);
    expect(g.shouldTripOn(new Error("benign"))).toBe(false);
    expect(g.shouldTripOn("not an Error")).toBe(false);
});

test("retryError: delegates to strategy.retryError, returning the typed instance", () => {
    const g = createCoordinatedGroup(stubStrategy);
    const e = g.retryError("bill HR-1");
    expect(e).toBeInstanceOf(MyRetryError);
    expect(e.ctx).toBe("bill HR-1");
    expect(e.message).toBe("retry: bill HR-1");
});

test("two groups built from the same strategy are independent", () => {
    // Important: `createCoordinatedGroup` must produce a fresh AbortController
    // per call, so tripping one group does not affect another.
    const a = createCoordinatedGroup(stubStrategy);
    const b = createCoordinatedGroup(stubStrategy);
    a.trip();
    expect(a.tripped).toBe(true);
    expect(b.tripped).toBe(false);
    expect(a.signal.aborted).toBe(true);
    expect(b.signal.aborted).toBe(false);
});

test("signal is observable via standard AbortSignal API (event listeners)", async () => {
    // Sanity check that we expose a real AbortSignal — fetch / addEventListener
    // / signal-aware libraries should all work without adapters.
    const g = createCoordinatedGroup(stubStrategy);
    let aborted = false;
    g.signal.addEventListener("abort", () => {
        aborted = true;
    });
    g.trip();
    // Microtask drain — abort listeners fire synchronously in modern runtimes,
    // but await once to be defensive across implementations.
    await Promise.resolve();
    expect(aborted).toBe(true);
});

test("integration shape: shouldTripOn → trip → retryError flow", () => {
    // The canonical caller pattern: catch, classify, trip, throw retry.
    const g = createCoordinatedGroup(stubStrategy);
    const offendingError = new Error("TRIP_ME");

    // Caller's catch block:
    let thrown: unknown;
    try {
        if (g.shouldTripOn(offendingError)) {
            g.trip();
            throw g.retryError("ctx-A");
        }
        throw offendingError;
    } catch (e) {
        thrown = e;
    }

    expect(thrown).toBeInstanceOf(MyRetryError);
    expect(g.tripped).toBe(true);
    expect(g.signal.aborted).toBe(true);
});

// ---------------------------------------------------------------------------
// Spy test — proves the strategy is CALLED (not bypassed via caching / inlining)
// ---------------------------------------------------------------------------

test("strategy is invoked on every shouldTripOn / retryError call (spy)", () => {
    // A spy is a test double that records every interaction. Unlike a stub
    // (which just returns canned values), a spy lets us assert "the group
    // actually consulted the strategy with these exact args" — catching
    // any refactor that bypasses or memoizes the strategy by mistake.
    const shouldTripCalls: unknown[] = [];
    const retryErrorCalls: string[] = [];
    const spy = {
        shouldTrip(err: unknown) {
            shouldTripCalls.push(err);
            return false;
        },
        retryError(ctx: string) {
            retryErrorCalls.push(ctx);
            return new MyRetryError(ctx);
        },
    };
    const g = createCoordinatedGroup(spy);

    const sentinel1 = new Error("a");
    const sentinel2 = new Error("b");
    g.shouldTripOn(sentinel1);
    g.shouldTripOn(sentinel2);
    g.retryError("HR-1");
    g.retryError("HR-2");

    // Strict-equality check — the strategy must see the SAME instances we
    // passed in, in the SAME order. Catches accidental wrapping/cloning too.
    expect(shouldTripCalls).toEqual([sentinel1, sentinel2]);
    expect(retryErrorCalls).toEqual(["HR-1", "HR-2"]);
});

// ---------------------------------------------------------------------------
// Real abort propagation — replaces the listener-only test with one that
// proves an in-flight, signal-aware async op actually cancels mid-flight.
// ---------------------------------------------------------------------------

test("trip() cancels an in-flight async op wired to the signal", async () => {
    // Stands in for `fetch(url, { signal })`: a setTimeout-based promise
    // that resolves after 100ms, but rejects immediately when the signal
    // aborts. This is the production usage shape — `tryFetchBillText` does
    // exactly this via globalThis.fetch.
    const g = createCoordinatedGroup(stubStrategy);

    const slowOp = new Promise<string>((resolve, reject) => {
        const timer = setTimeout(() => resolve("completed"), 100);
        g.signal.addEventListener("abort", () => {
            clearTimeout(timer);
            reject(new DOMException("aborted by group", "AbortError"));
        });
    });

    // Fire trip well before the timeout would resolve — proves cancellation
    // wins the race, not the natural completion.
    setTimeout(() => g.trip(), 10);

    let thrown: unknown;
    try {
        await slowOp;
    } catch (e) {
        thrown = e;
    }
    expect(thrown).toBeInstanceOf(DOMException);
    expect((thrown as DOMException).name).toBe("AbortError");
});

// ---------------------------------------------------------------------------
// Fail-safe contract — a strategy that throws inside shouldTrip MUST NOT
// silently disable the group's trip detection.
// ---------------------------------------------------------------------------

test("shouldTripOn is fail-safe: strategy throwing returns false (no propagation)", () => {
    // Without the try/catch in shouldTripOn, a thrown strategy would
    // propagate up through the caller's catch and skip past `group.trip()`,
    // leaving the group permanently untripped while siblings keep failing.
    // The fail-safe path: swallow, warn, return false. The caller's catch
    // proceeds to "rethrow original err" — same as if shouldTrip returned
    // false directly. The strategy bug surfaces via console.warn.
    const throwingStrategy = {
        shouldTrip: (_err: unknown): boolean => {
            throw new Error("strategy is buggy: cannot read property 'status' of null");
        },
        retryError: (ctx: string) => new MyRetryError(ctx),
    };
    const g = createCoordinatedGroup(throwingStrategy);

    // The call returns false instead of throwing.
    let returned: boolean | undefined;
    expect(() => {
        returned = g.shouldTripOn(new Error("anything"));
    }).not.toThrow();
    expect(returned).toBe(false);

    // Group stays in the "not tripped" state — caller will fall through
    // their catch's else branch and rethrow the original error.
    expect(g.tripped).toBe(false);
    expect(g.signal.aborted).toBe(false);
});

// ---------------------------------------------------------------------------
// callOrTrip
// ---------------------------------------------------------------------------

function makeStrategy() {
    return {
        shouldTrip: (err: unknown) =>
            err instanceof Error && /trip/i.test(err.message),
        retryError: (ctx: string) => new Error("RETRY:" + ctx),
    };
}

describe("callOrTrip", () => {
    test("happy path: returns op value, group untouched", async () => {
        const g = createCoordinatedGroup(makeStrategy());
        const result = await callOrTrip(async () => 42, g, "ctx");
        expect(result).toBe(42);
        expect(g.tripped).toBe(false);
        expect(g.signal.aborted).toBe(false);
    });

    test("no group: error from op rethrows untouched", async () => {
        const original = new Error("anything");
        let thrown: unknown;
        try {
            await callOrTrip(async () => {
                throw original;
            }, undefined, "ctx");
        } catch (e) {
            thrown = e;
        }
        expect(thrown).toBe(original);
    });

    test("pre-check: tripped group short-circuits without invoking op", async () => {
        const g = createCoordinatedGroup(makeStrategy());
        g.trip();
        let tripCalls = 0;
        const wrapped = {
            ...g,
            trip() {
                tripCalls++;
                g.trip();
            },
            get tripped() {
                return g.tripped;
            },
            shouldTripOn: g.shouldTripOn.bind(g),
            retryError: g.retryError.bind(g),
            signal: g.signal,
        };
        let opCalls = 0;
        let thrown: unknown;
        try {
            await callOrTrip(async () => {
                opCalls++;
                return "nope";
            }, wrapped, "ctx-A");
        } catch (e) {
            thrown = e;
        }
        expect(opCalls).toBe(0);
        expect(thrown).toBeInstanceOf(Error);
        expect((thrown as Error).message).toBe("RETRY:ctx-A");
        expect(g.tripped).toBe(true);
        expect(tripCalls).toBe(0);
    });

    test("trip-on-error: trips group exactly once and throws retryError", async () => {
        const g = createCoordinatedGroup(makeStrategy());
        let tripCalls = 0;
        const wrapped: typeof g = {
            signal: g.signal,
            get tripped() {
                return g.tripped;
            },
            trip() {
                tripCalls++;
                g.trip();
            },
            shouldTripOn: (err) => g.shouldTripOn(err),
            retryError: (ctx) => g.retryError(ctx),
        };

        let opCalls = 0;
        let thrown: unknown;
        try {
            await callOrTrip(async () => {
                opCalls++;
                throw new Error("please trip");
            }, wrapped, "ctx-T");
        } catch (e) {
            thrown = e;
        }

        expect(opCalls).toBe(1);
        expect(tripCalls).toBe(1);
        expect(g.tripped).toBe(true);
        expect(thrown).toBeInstanceOf(Error);
        expect((thrown as Error).message).toBe("RETRY:ctx-T");
    });

    test("sibling-abort: signal.aborted surfaces as retryError even on non-trip err", async () => {
        const g = createCoordinatedGroup(makeStrategy());
        let thrown: unknown;
        try {
            await callOrTrip(async () => {
                g.trip(); // simulate sibling tripping mid-flight
                throw new Error("AbortError");
            }, g, "ctx-S");
        } catch (e) {
            thrown = e;
        }
        expect(thrown).toBeInstanceOf(Error);
        expect((thrown as Error).message).toBe("RETRY:ctx-S");
        expect(g.tripped).toBe(true);
    });

    test("non-trip error with no abort: rethrows original, group untripped", async () => {
        const g = createCoordinatedGroup(makeStrategy());
        const original = new Error("benign network blip");
        let thrown: unknown;
        try {
            await callOrTrip(async () => {
                throw original;
            }, g, "ctx-N");
        } catch (e) {
            thrown = e;
        }
        expect(thrown).toBe(original);
        expect(g.tripped).toBe(false);
        expect(g.signal.aborted).toBe(false);
    });

    test("signal threading: op receives group.signal, or undefined when no group", async () => {
        const g = createCoordinatedGroup(makeStrategy());
        const seen: (AbortSignal | undefined)[] = [];
        await callOrTrip(async (signal) => {
            seen.push(signal);
            return 1;
        }, g, "ctx");
        expect(seen[0]).toBe(g.signal);

        await callOrTrip(async (signal) => {
            seen.push(signal);
            return 2;
        }, undefined, "ctx");
        expect(seen[1]).toBeUndefined();
    });
});
