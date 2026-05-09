import { assertEquals } from "jsr:@std/assert@1";
import { isRunningLow } from "../time-budget.ts";

// All tests inject `now` explicitly so they don't depend on the wall clock.
// Pretend startedAt = 0 throughout — elapsed time equals the `now` value.

Deno.test("returns false at t=0 (just started)", () => {
    assertEquals(isRunningLow(0, 120_000, 0), false);
});

Deno.test("returns false just under default 120s budget", () => {
    assertEquals(isRunningLow(0, 120_000, 119_999), false);
});

Deno.test("returns true exactly at the budget boundary", () => {
    // Boundary semantics: ">=" not ">". When elapsed hits the budget, we want
    // to self-chain rather than risk a cross-tick overrun.
    assertEquals(isRunningLow(0, 120_000, 120_000), true);
});

Deno.test("returns true past the budget", () => {
    assertEquals(isRunningLow(0, 120_000, 121_000), true);
});

Deno.test("respects a custom (smaller) budget", () => {
    assertEquals(isRunningLow(0, 5_000, 4_999), false);
    assertEquals(isRunningLow(0, 5_000, 5_000), true);
    assertEquals(isRunningLow(0, 5_000, 6_000), true);
});

Deno.test("works with a non-zero startedAt (real epoch values)", () => {
    const startedAt = 1_715_000_000_000; // arbitrary epoch
    assertEquals(isRunningLow(startedAt, 1_000, startedAt + 999), false);
    assertEquals(isRunningLow(startedAt, 1_000, startedAt + 1_000), true);
});

Deno.test("returns false if now < startedAt (clock skew safety)", () => {
    // If the caller's `now` is somehow earlier than startedAt (clock skew,
    // monotonic vs. wall confusion), elapsed is negative — should not trip.
    assertEquals(isRunningLow(1000, 100, 500), false);
});
