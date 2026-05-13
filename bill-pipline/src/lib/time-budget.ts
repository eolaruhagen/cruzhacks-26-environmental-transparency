/**
 * Pure helper to bound a worker's wall-clock so it exits cleanly before the
 * next cron tick fires. Each worker sizes `budgetMs` to be comfortably under
 * its cron interval; on hitting it the loop exits and we trust the next tick
 * to pick up where we left off.
 *
 * Tests inject `now` to exercise edge cases without mocking time.
 */
export function isRunningLow(
    startedAt: number,
    budgetMs: number = 120_000,
    now: number = Date.now(),
): boolean {
    const elapsed = now - startedAt;
    if (elapsed < 0) return false;
    return elapsed >= budgetMs;
}

export function getTimeBudgetMs(envValue: string | undefined): number {
    if (!envValue) return 120_000;
    const n = Number(envValue);
    if (!Number.isFinite(n) || n <= 0) return 120_000;
    return n;
}
