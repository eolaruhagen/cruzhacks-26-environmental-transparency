import {
    CongressClient,
    type CoordinatedRequestGroup,
} from "../shared/index.ts";
import { cleanBillText } from "./bill-text-clean.ts";

/**
 * Fetch + clean the most-recent bill text for a single bill, with optional
 * cooperative cancellation via a `CoordinatedRequestGroup`.
 *
 * Behavior:
 *   - No textUrl: returns null (the bill simply has no text version).
 *   - Group already tripped: throws the group's retry error (a sibling in
 *     this batch already hit a trip-worthy failure; back off).
 *   - Fetch succeeds: returns cleaned text, or null if cleaning empties it.
 *   - Fetch error matches `group.shouldTripOn`: trip the group + throw retry.
 *   - Fetch was aborted by a sibling's trip: throw retry (silent — the
 *     original tripper already logged).
 *   - Other errors propagate up so the caller can decide (network blip,
 *     5xx, etc. — usually want to retry the whole bill at the queue level).
 *
 * The catch block is mechanical and domain-free: all policy lives in the
 * injected group strategy.
 */
export async function tryFetchBillText(opts: {
    url: string | undefined;
    congressClient: CongressClient;
    group?: CoordinatedRequestGroup;
    /** Used by the group's retryError() so the thrown sentinel is self-describing. */
    billRef: string;
}): Promise<string | null> {
    const { url, congressClient, group, billRef } = opts;
    if (!url) return null;

    if (group?.tripped) throw group.retryError(billRef);

    try {
        const raw = await congressClient.fetchBillText(url, group?.signal);
        return cleanBillText(raw);
    } catch (err) {
        if (group?.shouldTripOn(err)) {
            group.trip();
            console.warn(
                `[tryFetchBillText] trip-worthy error on ${billRef}; ` +
                `aborting in-flight siblings and disabling for rest of group`,
            );
            throw group.retryError(billRef);
        }
        // Robust abort detection — runtimes vary on AbortError shape, so we
        // check the signal's own state instead of err.name. If a sibling
        // tripped while our fetch was in-flight, our error came from the abort.
        if (group?.signal.aborted) throw group.retryError(billRef);
        throw err;
    }
}
