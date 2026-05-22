import { markColumnFailed, reportFailedRows, supabase } from "../supabase-client.js";
import { extractCongressNumber, mapLegislationType } from "./fix-urls-lib.js";

// YOU MUST SPECIFY THE ENV FILE TO BE .env ON REPO ROOT BEFORE USING THIS.
// Run: bun --env-file=../../.env run fix-urls.ts --env local

const dropValues = process.argv.includes("--drop-values");

if (!process.env.CONGRESS_API_KEY) {
    console.error("CONGRESS_API_KEY not found in .env");
    process.exit(1);
}


/// CONFIG

const BATCH_SIZE = 1000;
const RATE_LIMIT_WAIT_MS = 70 * 60 * 1000;
const NIL_UUID = "00000000-0000-0000-0000-000000000000";

const sleep = (ms: number) => new Promise<void>(r => setTimeout(r, ms));


/// Types

interface BillForUrl {
    bill: { legislationUrl: string };
}

class RateLimitError extends Error {
    constructor() { super("Congress API rate limit hit (HTTP 429)"); }
}


async function fetchBillUrl(bill: { id: string; legislation_number: string; congress: string }): Promise<string | null> {
    const congress_number = extractCongressNumber(bill.congress);
    if (!congress_number) {
        console.error(`  ✗ ${bill.id}: could not extract congress number from "${bill.congress}"`);
        return null;
    }

    let legislation_type: { type: string; number: number };
    try {
        legislation_type = mapLegislationType(bill.legislation_number);
    } catch {
        console.error(`  ✗ ${bill.id}: could not map legislation type from "${bill.legislation_number}"`);
        return null;
    }

    const apiUrl = `https://api.congress.gov/v3/bill/${congress_number}/${legislation_type.type}/${legislation_type.number}?api_key=${process.env.CONGRESS_API_KEY}&format=json`;

    const response = await fetch(apiUrl);
    if (response.status === 429) throw new RateLimitError();
    if (!response.ok) {
        console.error(`  ✗ ${bill.id}: API returned ${response.status} for ${bill.legislation_number}`);
        return null;
    }

    const data = await response.json() as BillForUrl;
    return data.bill?.legislationUrl ?? null;
}

async function wipeAllUrls(): Promise<number> {
    console.log("→ Wiping all URLs to empty string...");
    const { count, error } = await supabase
        .from("house_bills")
        .update({ url: "" }, { count: "exact" })
        .neq("id", NIL_UUID);

    if (error) throw new Error(`Failed to wipe URLs: ${error.message}`);
    console.log(`  ✓ Wiped ${count} rows.`);
    return count ?? 0;
}

async function processBatch(): Promise<number> {
    const { data: bills, error } = await supabase
        .from("house_bills")
        .select("url, id, legislation_number, congress")
        .eq("url", "")
        .limit(BATCH_SIZE);

    if (error) throw error;
    if (!bills || bills.length === 0) return 0;

    console.log(`→ Processing batch of ${bills.length}...`);

    for (const bill of bills) {
        let fixedUrl: string | null = null;

        // retry loop: only re-runs on rate limit, otherwise breaks immediately
        while (true) {
            try {
                fixedUrl = await fetchBillUrl(bill);
                break;
            } catch (e) {
                if (e instanceof RateLimitError) {
                    const resumeAt = new Date(Date.now() + RATE_LIMIT_WAIT_MS).toISOString();
                    console.warn(`  ⏸  Rate limited. Sleeping until ${resumeAt}, then retrying ${bill.legislation_number}...`);
                    await sleep(RATE_LIMIT_WAIT_MS);
                    continue;
                }
                throw e;
            }
        }

        if (!fixedUrl) {
            await markColumnFailed({ table: "house_bills", column: "url", idValue: bill.id });
            continue;
        }

        const { count, error: updateError } = await supabase
            .from("house_bills")
            .update({ url: fixedUrl }, { count: "exact" })
            .eq("id", bill.id);

        if (updateError) {
            console.error(`  ✗ ${bill.id}: update failed:`, updateError);
            continue;
        }

        if (!count) {
            console.warn(`  🖕 no rows updated for ${bill.id} — likely RLS (using anon key instead of service_role?)`);
            continue;
        }

        console.log(` ✓ ${bill.legislation_number} → ${fixedUrl}`);
    }

    return bills.length;
}

async function main() {
    if (dropValues) {
        await wipeAllUrls();
    }

    let totalProcessed = 0;
    let batchNum = 0;

    while (true) {
        batchNum++;
        const processed = await processBatch();
        if (processed === 0) {
            console.log(`\n✓ Done. No more rows with empty URL. Total processed across ${batchNum - 1} batches: ${totalProcessed}`);
            break;
        }
        totalProcessed += processed;
        console.log(`  (batch ${batchNum} done — ${totalProcessed} total processed so far)\n`);
    }

    await reportFailedRows({ table: "house_bills", column: "url" });
}

main();
