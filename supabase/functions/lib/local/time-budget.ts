/**
 * Pure helper for "is this edge function approaching its hard timeout?"
 *
 * Supabase edge functions have a hard ~150s wall-clock limit in production.
 * with 30s of hard cpu limit
 * We aim to self-chain
 *
 * Both arguments are millisecond epochs. `now` defaults to Date.now() so
 * the call site reads naturally (`isRunningLow(startedAt)`) but tests can
 * inject any clock value to exercise edge cases without mocking time.
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

/**
 * Resolve the wall-clock budget from `TIME_BUDGET_MS` env, falling back
 * to 120_000 (120s — the production setting). Pass to `isRunningLow` as
 * the `budgetMs` argument.
 */
export function getTimeBudgetMs(envValue: string | undefined): number {
    if (!envValue) return 120_000;
    const n = Number(envValue);
    if (!Number.isFinite(n) || n <= 0) return 120_000;
    return n;
}
