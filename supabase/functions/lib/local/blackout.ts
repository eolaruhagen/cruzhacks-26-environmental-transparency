/**
 * Time-window blackout helpers.
 *
 * Cron-driven workers occasionally need to skip work during certain wall-clock
 * windows (e.g. don't hit the Congress API while another pipeline is running).
 * Windows are interpreted in Pacific Time so they survive DST automatically.
 *
 * A window is `{ startPt: "HH:MM", endPt: "HH:MM" }`. Half-open: a minute is
 * inside the window iff `start <= now < end` for non-wrapping windows. For
 * windows that cross midnight (`start > end`, e.g. 22:00 → 02:00) the predicate
 * unions [start, midnight) ∪ [midnight, end).
 */

export interface TimeWindow {
    startPt: string;
    endPt: string;
}

/**
 * Pure: is `nowMinutesPt` (0..1439) inside any of the windows?
 *
 * Exported separately from `isInBlackout` so tests can pin the time without
 * mocking `Date` / `Intl.DateTimeFormat`.
 */
export function isMinuteInAnyWindow(
    nowMinutesPt: number,
    windows: readonly TimeWindow[],
): boolean {
    if (windows.length === 0) return false;
    return windows.some((w) => {
        const startMin = parseHHMM(w.startPt);
        const endMin = parseHHMM(w.endPt);
        if (startMin <= endMin) {
            // Normal half-open window [start, end).
            return nowMinutesPt >= startMin && nowMinutesPt < endMin;
        }
        // Window wraps midnight: [start, 24:00) ∪ [00:00, end).
        return nowMinutesPt >= startMin || nowMinutesPt < endMin;
    });
}

function parseHHMM(s: string): number {
    const [h, m] = s.split(":").map(Number);
    return h * 60 + m;
}

/**
 * Wall-clock convenience: PT now → minute-of-day → window check.
 * Uses `Intl.DateTimeFormat` with `America/Los_Angeles`, which is DST-correct.
 */
export function isInBlackout(windows: readonly TimeWindow[]): boolean {
    const fmt = new Intl.DateTimeFormat("en-US", {
        timeZone: "America/Los_Angeles",
        hour12: false,
        hour: "2-digit",
        minute: "2-digit",
    }).format(new Date());
    const [hh, mm] = fmt.split(":").map(Number);
    return isMinuteInAnyWindow(hh * 60 + mm, windows);
}
