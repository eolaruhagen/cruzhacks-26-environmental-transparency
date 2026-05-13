/**
 * Coordinated request group — the JS equivalent of Go's `errgroup.Group` /
 * .NET's coordinated `CancellationTokenSource`. N concurrent units of work
 * share one cancellation signal; if any unit hits a trip-worthy error,
 * the others abort cooperatively.
 */
export interface TripStrategy<RetryErr extends Error = Error> {
    /** Returns true iff the given error should trip the group. */
    shouldTrip(err: unknown): boolean;
    /**
     * Returns the error to throw from each affected unit of work to signal
     * "leave this for retry, don't treat it as a permanent failure". `context`
     * is a caller-provided string (typically a domain identifier) so the
     * thrown error can be self-describing.
     */
    retryError(context: string): RetryErr;
}

export interface CoordinatedRequestGroup<RetryErr extends Error = Error> {
    /** Pass to fetch() or any AbortSignal-aware async op. */
    readonly signal: AbortSignal;
    /** True iff some sibling has tripped the group. */
    readonly tripped: boolean;

    /**
     * Idempotent. Sets `tripped = true` and aborts the controller. Subsequent
     * calls are no-ops. Safe to call from anywhere (the original failure
     * handler, or callers that detect the trip via their own logic).
     */
    trip(): void;

    /** Convenience: `strategy.shouldTrip(err)`. */
    shouldTripOn(err: unknown): boolean;

    /** Convenience: `strategy.retryError(context)`. */
    retryError(context: string): RetryErr;
}

/**
 * Construct a fresh coordinated request group bound to the given strategy.
 * Each call returns a new group with its own AbortController — groups are
 * not reusable once tripped (the underlying controller can't be un-aborted).
 */
export function createCoordinatedGroup<RetryErr extends Error>(
    strategy: TripStrategy<RetryErr>,
): CoordinatedRequestGroup<RetryErr> {
    const controller = new AbortController();
    let tripped = false;

    return {
        signal: controller.signal,
        get tripped() {
            return tripped;
        },
        trip() {
            if (tripped) return; // idempotent
            tripped = true;
            controller.abort();
        },
        shouldTripOn(err) {
            // Fail-safe: a misbehaving strategy MUST NOT silently disable the
            // group. If `shouldTrip` itself throws, we treat the error as
            // non-trip (returns false) and log a warn — the caller's catch
            // proceeds down the "rethrow original err" branch, the group
            // stays untripped, and the surface bug is visible in logs.
            try {
                return strategy.shouldTrip(err);
            } catch (strategyErr) {
                const detail = strategyErr instanceof Error
                    ? strategyErr.message
                    : String(strategyErr);
                console.warn(
                    `[coordinated-group] strategy.shouldTrip threw (${detail}); ` +
                    `treating as non-trip. Fix the strategy.`,
                );
                return false;
            }
        },
        retryError(context) {
            return strategy.retryError(context);
        },
    };
}

/**
 * Run `op` under the supervision of an optional coordinated group. If the
 * group is already tripped on entry, `op` is not invoked. Errors are
 * classified via the group's strategy: trip-worthy errors trip the group
 * and surface as the strategy's retry error; an in-flight sibling abort
 * (signal aborted but the error itself isn't trip-worthy) also surfaces
 * as retry; everything else rethrows unchanged.
 */
export async function callOrTrip<T, E extends Error>(
    op: (signal: AbortSignal | undefined) => Promise<T>,
    group: CoordinatedRequestGroup<E> | undefined,
    context: string,
): Promise<T> {
    if (group?.tripped) throw group.retryError(context);
    try {
        return await op(group?.signal);
    } catch (err) {
        if (group?.shouldTripOn(err)) {
            group.trip();
            throw group.retryError(context);
        }
        if (group?.signal.aborted) throw group.retryError(context);
        throw err;
    }
}
