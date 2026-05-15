import type { HouseBillQueueMessage } from "../runtime/pgmq-interactions.ts";
import {
    normalizeCsvBillType,
    parseCSVLine,
    parseCongressNumber,
    parseLegislationNumber,
} from "./csv-parse.ts";

/**
 * Stream every well-formed bill row from the Congress.gov bulk-export CSV
 * as a HouseBillQueueMessage ready to enqueue.
 *
 * Header row is auto-detected within the first 10 lines so we work on both
 * layouts seen in the wild:
 *   - Congress.gov bulk export: 3 metadata rows + header at index 3
 *   - Advanced-search subset export: header at index 0
 *
 * Rows with unparseable legislation numbers, unknown bill types, or missing
 * congress numbers are silently skipped.
 *
 * The CsvSource port lets tests inject in-memory CSV text without touching
 * Supabase Storage. Production wires through `supabase.storage.from(bucket).download(file)`.
 */
export interface CsvSource {
    readText(): Promise<string>;
}

/**
 * Async generator that yields one HouseBillQueueMessage per valid CSV row.
 * Caller can break out at any time (e.g. when buffering 250 messages for a
 * sendBatch).
 */
export async function* csvBillSource(
    source: CsvSource,
): AsyncGenerator<HouseBillQueueMessage> {
    const text = await source.readText();
    const lines = text.split("\n");

    // Auto-detect the header row by scanning for the "Legislation Number" +
    // "Congress" columns within the first 10 lines. Handles both the bulk
    // export (header at index 3) and the advanced-search export (header at
    // index 0) without a config flag.
    let headerIdx = -1;
    let legNumIdx = -1;
    let congressIdx = -1;
    const scanLimit = Math.min(10, lines.length);
    for (let i = 0; i < scanLimit; i++) {
        const cells = parseCSVLine(lines[i]);
        const ln = cells.indexOf("Legislation Number");
        const cg = cells.indexOf("Congress");
        if (ln !== -1 && cg !== -1) {
            headerIdx = i;
            legNumIdx = ln;
            congressIdx = cg;
            break;
        }
    }
    if (headerIdx === -1) return;

    for (let i = headerIdx + 1; i < lines.length; i++) {
        const line = lines[i];
        if (!line.trim()) continue;

        const cells = parseCSVLine(line);
        const legNum = parseLegislationNumber(cells[legNumIdx]?.trim() ?? "");
        const congressStr = parseCongressNumber(cells[congressIdx]?.trim() ?? "");
        if (!legNum || !congressStr) continue;

        const billType = normalizeCsvBillType(legNum.billType);
        const congressNum = parseInt(congressStr, 10);
        if (!billType || !Number.isFinite(congressNum)) continue;

        yield {
            congress: congressNum,
            bill_type: billType,
            bill_number: legNum.billNumber,
        };
    }
}
