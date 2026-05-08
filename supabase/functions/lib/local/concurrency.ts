/**
 * Bounded-concurrency map. Like Promise.allSettled, but never has more than
 * `limit` tasks in-flight at once.
 *
 * Why settled (not rejecting): the bills worker processes N items per batch
 * and we want a single bill failure to leave its message in-queue for retry
 * while siblings continue. With Promise.all, one rejection aborts the whole
 * batch and we'd lose visibility into which items succeeded.
 *
 * Returns results in INPUT order (by index), regardless of completion order,
 * so callers can correlate results back to the message they popped.
 */
export async function mapConcurrent<T, R>(
    items: readonly T[],
    limit: number,
    fn: (item: T, index: number) => Promise<R>,
): Promise<PromiseSettledResult<R>[]> {
    if (!Number.isFinite(limit) || limit < 1) {
        throw new Error(`mapConcurrent: limit must be >= 1, got ${limit}`);
    }
    if (items.length === 0) return [];

    const results = new Array<PromiseSettledResult<R>>(items.length);
    let cursor = 0;
    const workerCount = Math.min(limit, items.length);

    async function worker() {
        while (true) {
            const i = cursor++;
            if (i >= items.length) return;
            try {
                const value = await fn(items[i], i);
                results[i] = { status: "fulfilled", value };
            } catch (reason) {
                results[i] = { status: "rejected", reason };
            }
        }
    }

    await Promise.all(Array.from({ length: workerCount }, () => worker()));
    return results;
}
