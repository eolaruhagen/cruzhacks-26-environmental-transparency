import { test, expect } from "bun:test";
import { isMinuteInAnyWindow, type TimeWindow } from "../blackout.ts";

const min = (h: number, m: number) => h * 60 + m;

// ---------------------------------------------------------------------------
// Empty / no windows
// ---------------------------------------------------------------------------

test("returns false when no windows configured", () => {
    expect(isMinuteInAnyWindow(min(12, 0), [])).toEqual(false);
});

// ---------------------------------------------------------------------------
// Normal (non-wrapping) windows: start <= end
// ---------------------------------------------------------------------------

const morning: TimeWindow = { startPt: "06:30", endPt: "09:00" };

test("normal window: inside (06:40)", () => {
    expect(isMinuteInAnyWindow(min(6, 40), [morning])).toEqual(true);
});

test("normal window: just before start (05:00)", () => {
    expect(isMinuteInAnyWindow(min(5, 0), [morning])).toEqual(false);
});

test("normal window: just after end (09:01)", () => {
    expect(isMinuteInAnyWindow(min(9, 1), [morning])).toEqual(false);
});

test("normal window: exact start is inclusive", () => {
    expect(isMinuteInAnyWindow(min(6, 30), [morning])).toEqual(true);
});

test("normal window: exact end is exclusive (half-open)", () => {
    // [start, end) — a worker at exactly 09:00 should run, not be blocked.
    expect(isMinuteInAnyWindow(min(9, 0), [morning])).toEqual(false);
});

// ---------------------------------------------------------------------------
// Midnight-wrapping windows: start > end
// ---------------------------------------------------------------------------

const overnight: TimeWindow = { startPt: "22:00", endPt: "02:00" };

test("wrap window: 23:00 is inside (the bug being fixed)", () => {
    expect(isMinuteInAnyWindow(min(23, 0), [overnight])).toEqual(true);
});

test("wrap window: 01:00 is inside (post-midnight side)", () => {
    expect(isMinuteInAnyWindow(min(1, 0), [overnight])).toEqual(true);
});

test("wrap window: 12:00 is outside (middle of day)", () => {
    expect(isMinuteInAnyWindow(min(12, 0), [overnight])).toEqual(false);
});

test("wrap window: 22:00 exact start is inclusive", () => {
    expect(isMinuteInAnyWindow(min(22, 0), [overnight])).toEqual(true);
});

test("wrap window: 02:00 exact end is exclusive", () => {
    expect(isMinuteInAnyWindow(min(2, 0), [overnight])).toEqual(false);
});

test("wrap window: 21:59 just before start is outside", () => {
    expect(isMinuteInAnyWindow(min(21, 59), [overnight])).toEqual(false);
});

test("wrap window: 02:01 just after end is outside", () => {
    expect(isMinuteInAnyWindow(min(2, 1), [overnight])).toEqual(false);
});

// ---------------------------------------------------------------------------
// Multiple windows: any match wins
// ---------------------------------------------------------------------------

test("multiple windows: hits the first one", () => {
    const windows = [
        { startPt: "06:30", endPt: "09:00" },
        { startPt: "15:30", endPt: "18:30" },
    ];
    expect(isMinuteInAnyWindow(min(7, 0), windows)).toEqual(true);
    expect(isMinuteInAnyWindow(min(16, 0), windows)).toEqual(true);
});

test("multiple windows: gap between them is not blocked", () => {
    const windows = [
        { startPt: "06:30", endPt: "09:00" },
        { startPt: "15:30", endPt: "18:30" },
    ];
    expect(isMinuteInAnyWindow(min(12, 0), windows)).toEqual(false);
});

test("multiple windows: mixed normal + wrap", () => {
    const windows = [
        { startPt: "06:30", endPt: "09:00" },
        { startPt: "22:00", endPt: "02:00" },
    ];
    expect(isMinuteInAnyWindow(min(23, 30), windows)).toEqual(true); // wrap branch
    expect(isMinuteInAnyWindow(min(7, 0), windows)).toEqual(true); // normal branch
    expect(isMinuteInAnyWindow(min(13, 0), windows)).toEqual(false);
});

// ---------------------------------------------------------------------------
// Edge cases
// ---------------------------------------------------------------------------

test("zero-width window (start == end) matches nothing", () => {
    // start <= end branch with start === end: nowMin >= start && nowMin < end
    // is always false.
    const zero: TimeWindow = { startPt: "12:00", endPt: "12:00" };
    expect(isMinuteInAnyWindow(min(12, 0), [zero])).toEqual(false);
    expect(isMinuteInAnyWindow(min(11, 59), [zero])).toEqual(false);
});

test("full-day wrap window (00:01 → 00:00) covers everything", () => {
    // Pathological wrap: starts at 00:01, ends at 00:00 next day. start > end
    // so it's the wrap branch: in window iff (nowMin >= 1 || nowMin < 0).
    // nowMin < 0 is never true, so effectively [00:01, 24:00) — covers
    // everything except minute 0. Still useful for sanity-checking the wrap math.
    const allDay: TimeWindow = { startPt: "00:01", endPt: "00:00" };
    expect(isMinuteInAnyWindow(min(0, 0), [allDay])).toEqual(false);
    expect(isMinuteInAnyWindow(min(0, 1), [allDay])).toEqual(true);
    expect(isMinuteInAnyWindow(min(12, 0), [allDay])).toEqual(true);
    expect(isMinuteInAnyWindow(min(23, 59), [allDay])).toEqual(true);
});
