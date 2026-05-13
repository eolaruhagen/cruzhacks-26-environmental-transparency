import { test, expect } from "bun:test";
import { getTimeBudgetMs, isRunningLow } from "../time-budget.ts";

// All tests inject `now` explicitly so they don't depend on the wall clock.
// Pretend startedAt = 0 throughout — elapsed time equals the `now` value.

test("returns false at t=0 (just started)", () => {
    expect(isRunningLow(0, 120_000, 0)).toEqual(false);
});

test("returns false just under default 120s budget", () => {
    expect(isRunningLow(0, 120_000, 119_999)).toEqual(false);
});

test("returns true exactly at the budget boundary", () => {
    // Boundary semantics: ">=" not ">". When elapsed hits the budget, we want
    // to exit and let the next cron tick pick up rather than risk a cross-tick overrun.
    expect(isRunningLow(0, 120_000, 120_000)).toEqual(true);
});

test("returns true past the budget", () => {
    expect(isRunningLow(0, 120_000, 121_000)).toEqual(true);
});

test("respects a custom (smaller) budget", () => {
    expect(isRunningLow(0, 5_000, 4_999)).toEqual(false);
    expect(isRunningLow(0, 5_000, 5_000)).toEqual(true);
    expect(isRunningLow(0, 5_000, 6_000)).toEqual(true);
});

test("works with a non-zero startedAt (real epoch values)", () => {
    const startedAt = 1_715_000_000_000; // arbitrary epoch
    expect(isRunningLow(startedAt, 1_000, startedAt + 999)).toEqual(false);
    expect(isRunningLow(startedAt, 1_000, startedAt + 1_000)).toEqual(true);
});

test("returns false if now < startedAt (clock skew safety)", () => {
    // If the caller's `now` is somehow earlier than startedAt (clock skew,
    // monotonic vs. wall confusion), elapsed is negative — should not trip.
    expect(isRunningLow(1000, 100, 500)).toEqual(false);
});

// ---------------------------------------------------------------------------
// getTimeBudgetMs — env-var resolution
// ---------------------------------------------------------------------------

test("getTimeBudgetMs: undefined env returns 120s default", () => {
    expect(getTimeBudgetMs(undefined)).toEqual(120_000);
});

test("getTimeBudgetMs: empty string returns default", () => {
    expect(getTimeBudgetMs("")).toEqual(120_000);
});

test("getTimeBudgetMs: valid integer string is honored", () => {
    expect(getTimeBudgetMs("20000")).toEqual(20_000);
});

test("getTimeBudgetMs: malformed env returns default (fail-safe)", () => {
    // A typo'd env var must not silently uncap the budget — we fall back
    // to the production-safe 120s default.
    expect(getTimeBudgetMs("not-a-number")).toEqual(120_000);
});

test("getTimeBudgetMs: zero / negative env returns default", () => {
    expect(getTimeBudgetMs("0")).toEqual(120_000);
    expect(getTimeBudgetMs("-5000")).toEqual(120_000);
});
