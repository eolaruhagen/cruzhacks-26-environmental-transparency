import {
    callOrTrip,
    CongressClient,
    type CoordinatedRequestGroup,
} from "@cruzhacks/shared";
import { cleanBillText } from "./bill-text-clean.ts";

export async function tryFetchBillText(opts: {
    url: string | undefined;
    congressClient: CongressClient;
    group?: CoordinatedRequestGroup;
    billRef: string;
}): Promise<string | null> {
    const { url, congressClient, group, billRef } = opts;
    if (!url) return null;
    const raw = await callOrTrip(
        (signal) => congressClient.fetchBillText(url, signal),
        group,
        billRef,
    );
    return cleanBillText(raw);
}
