/**
 * Bounded-concurrency map. Like Promise.allSettled, but never has more than
 * `limit` tasks in-flight at once.
 *
 * Why settled (not rejecting): callers commonly process N items per batch
 * and want a single failure to leave the others' results visible. With
 * Promise.all, one rejection aborts the whole batch.
 *
 * Returns results in INPUT order (by index), regardless of completion order,
 * so callers can correlate results back to their input items.
 *
 * Generic in `T` and `R`; nothing about HTTP, fetch, or any specific async
 * domain leaks in. Callers wire whatever async operation they need —
 * including operations that return HttpResult<T> if they want the union.
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

    const worker = async () => {
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
    };

    await Promise.all(Array.from({ length: workerCount }, () => worker()));
    return results;
}
