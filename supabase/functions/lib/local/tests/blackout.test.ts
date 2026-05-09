import { assertEquals } from "jsr:@std/assert@1";
import { isMinuteInAnyWindow, type TimeWindow } from "../blackout.ts";

const min = (h: number, m: number) => h * 60 + m;

// ---------------------------------------------------------------------------
// Empty / no windows
// ---------------------------------------------------------------------------

Deno.test("returns false when no windows configured", () => {
    assertEquals(isMinuteInAnyWindow(min(12, 0), []), false);
});

// ---------------------------------------------------------------------------
// Normal (non-wrapping) windows: start <= end
// ---------------------------------------------------------------------------

const morning: TimeWindow = { startPt: "06:30", endPt: "09:00" };

Deno.test("normal window: inside (06:40)", () => {
    assertEquals(isMinuteInAnyWindow(min(6, 40), [morning]), true);
});

Deno.test("normal window: just before start (05:00)", () => {
    assertEquals(isMinuteInAnyWindow(min(5, 0), [morning]), false);
});

Deno.test("normal window: just after end (09:01)", () => {
    assertEquals(isMinuteInAnyWindow(min(9, 1), [morning]), false);
});

Deno.test("normal window: exact start is inclusive", () => {
    assertEquals(isMinuteInAnyWindow(min(6, 30), [morning]), true);
});

Deno.test("normal window: exact end is exclusive (half-open)", () => {
    // [start, end) — a worker at exactly 09:00 should run, not be blocked.
    assertEquals(isMinuteInAnyWindow(min(9, 0), [morning]), false);
});

// ---------------------------------------------------------------------------
// Midnight-wrapping windows: start > end
// ---------------------------------------------------------------------------

const overnight: TimeWindow = { startPt: "22:00", endPt: "02:00" };

Deno.test("wrap window: 23:00 is inside (the bug being fixed)", () => {
    assertEquals(isMinuteInAnyWindow(min(23, 0), [overnight]), true);
});

Deno.test("wrap window: 01:00 is inside (post-midnight side)", () => {
    assertEquals(isMinuteInAnyWindow(min(1, 0), [overnight]), true);
});

Deno.test("wrap window: 12:00 is outside (middle of day)", () => {
    assertEquals(isMinuteInAnyWindow(min(12, 0), [overnight]), false);
});

Deno.test("wrap window: 22:00 exact start is inclusive", () => {
    assertEquals(isMinuteInAnyWindow(min(22, 0), [overnight]), true);
});

Deno.test("wrap window: 02:00 exact end is exclusive", () => {
    assertEquals(isMinuteInAnyWindow(min(2, 0), [overnight]), false);
});

Deno.test("wrap window: 21:59 just before start is outside", () => {
    assertEquals(isMinuteInAnyWindow(min(21, 59), [overnight]), false);
});

Deno.test("wrap window: 02:01 just after end is outside", () => {
    assertEquals(isMinuteInAnyWindow(min(2, 1), [overnight]), false);
});

// ---------------------------------------------------------------------------
// Multiple windows: any match wins
// ---------------------------------------------------------------------------

Deno.test("multiple windows: hits the first one", () => {
    const windows = [
        { startPt: "06:30", endPt: "09:00" },
        { startPt: "15:30", endPt: "18:30" },
    ];
    assertEquals(isMinuteInAnyWindow(min(7, 0), windows), true);
    assertEquals(isMinuteInAnyWindow(min(16, 0), windows), true);
});

Deno.test("multiple windows: gap between them is not blocked", () => {
    const windows = [
        { startPt: "06:30", endPt: "09:00" },
        { startPt: "15:30", endPt: "18:30" },
    ];
    assertEquals(isMinuteInAnyWindow(min(12, 0), windows), false);
});

Deno.test("multiple windows: mixed normal + wrap", () => {
    const windows = [
        { startPt: "06:30", endPt: "09:00" },
        { startPt: "22:00", endPt: "02:00" },
    ];
    assertEquals(isMinuteInAnyWindow(min(23, 30), windows), true); // wrap branch
    assertEquals(isMinuteInAnyWindow(min(7, 0), windows), true); // normal branch
    assertEquals(isMinuteInAnyWindow(min(13, 0), windows), false);
});

// ---------------------------------------------------------------------------
// Edge cases
// ---------------------------------------------------------------------------

Deno.test("zero-width window (start == end) matches nothing", () => {
    // start <= end branch with start === end: nowMin >= start && nowMin < end
    // is always false.
    const zero: TimeWindow = { startPt: "12:00", endPt: "12:00" };
    assertEquals(isMinuteInAnyWindow(min(12, 0), [zero]), false);
    assertEquals(isMinuteInAnyWindow(min(11, 59), [zero]), false);
});

Deno.test("full-day wrap window (00:01 → 00:00) covers everything", () => {
    // Pathological wrap: starts at 00:01, ends at 00:00 next day. start > end
    // so it's the wrap branch: in window iff (nowMin >= 1 || nowMin < 0).
    // nowMin < 0 is never true, so effectively [00:01, 24:00) — covers
    // everything except minute 0. Still useful for sanity-checking the wrap math.
    const allDay: TimeWindow = { startPt: "00:01", endPt: "00:00" };
    assertEquals(isMinuteInAnyWindow(min(0, 0), [allDay]), false);
    assertEquals(isMinuteInAnyWindow(min(0, 1), [allDay]), true);
    assertEquals(isMinuteInAnyWindow(min(12, 0), [allDay]), true);
    assertEquals(isMinuteInAnyWindow(min(23, 59), [allDay]), true);
});
