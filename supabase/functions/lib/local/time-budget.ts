/**
 * Pure helper for "is this edge function approaching its hard timeout?"
 *
 * Supabase edge functions have a hard ~150s wall-clock limit. We aim to
 * self-chain (re-invoke ourselves with the next cursor) before crossing
 * 120s so there's runway for the chained invocation to be queued and
 * for the current one to complete its session/cleanup work cleanly.
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
