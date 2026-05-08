import type { HouseBillQueueMessage } from "./pgmq-interactions.ts";
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
 * The CSV layout (3 metadata rows, header on row 4, data after) is the same
 * one parsed by supabase/functions/csv-parser/index.ts; both share the helpers
 * in lib/local/csv-parse.ts.
 *
 * Rows with unparseable legislation numbers, unknown bill types, or missing
 * congress numbers are silently skipped — the producer logs a count of
 * skipped rows but doesn't surface each one.
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

    // Header is row 4 (index 3). If the file is too short, no data to yield.
    if (lines.length < 5) return;

    const header = parseCSVLine(lines[3]);
    const legNumIdx = header.indexOf("Legislation Number");
    const congressIdx = header.indexOf("Congress");
    if (legNumIdx === -1 || congressIdx === -1) return;

    for (let i = 4; i < lines.length; i++) {
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
