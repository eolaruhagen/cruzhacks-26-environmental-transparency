/**
 * Pure parsing helpers for the Congress.gov bulk-export CSV.
 *
 * Extracted from supabase/functions/csv-parser/index.ts so the new
 * csv-bill-source can share the same parsing semantics. The edge function
 * imports these too — single source of truth.
 *
 * The CSV format Congress.gov produces:
 *   row 1-3: metadata (search params, date)
 *   row 4:   column headers ("Legislation Number", "Congress", ...)
 *   row 5+:  data
 *
 * Bill types in the CSV are dot-prefixed ("H.R.", "S.", "H.J.Res.") which
 * does NOT match the `legislation_type` Postgres enum (HR, S, HJRES). Use
 * `normalizeCsvBillType` to bridge.
 */

import { LegislationTypeEnum } from "./bill-write.ts";

export type LegislationType = z.infer<typeof LegislationTypeEnum>;
import type { z } from "zod";

/**
 * Parse a single CSV line, honoring double-quoted fields. Doesn't handle
 * embedded escaped quotes (`""`) — Congress.gov's export doesn't use them.
 */
export function parseCSVLine(line: string): string[] {
    const result: string[] = [];
    let current = "";
    let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
        const char = line[i];
        if (char === '"') {
            inQuotes = !inQuotes;
        } else if (char === "," && !inQuotes) {
            result.push(current);
            current = "";
        } else {
            current += char;
        }
    }
    result.push(current);
    return result;
}

/**
 * Parse "Legislation Number" column.
 *   "H.R. 5861"     → { billType: "H.R.",   billNumber: "5861" }
 *   "S. 1234"       → { billType: "S.",     billNumber: "1234" }
 *   "H.J.Res. 138"  → { billType: "H.J.Res.", billNumber: "138" }
 *
 * Returns null when the input doesn't match the expected shape (empty
 * cell, malformed row).
 */
export function parseLegislationNumber(
    legNum: string,
): { billType: string; billNumber: string } | null {
    if (!legNum) return null;
    const match = legNum.match(/^([A-Z][A-Za-z.]*\.(?:\s*[A-Za-z]+\.)*)\s*(\d+)$/i);
    if (!match) return null;
    return { billType: match[1].trim(), billNumber: match[2] };
}

/**
 * Parse the "Congress" column to its integer congress number.
 *   "113th Congress (2013-2014)" → "113"
 */
export function parseCongressNumber(congress: string): string | null {
    if (!congress) return null;
    const match = congress.match(/^(\d+)/);
    return match ? match[1] : null;
}

// Map dot-prefixed CSV bill types to the legislation_type enum used by
// house_bills_2.bill_type. Case-insensitive on input. Returns null for
// shapes outside the enum (rare; logged + skipped by callers).
const CSV_BILL_TYPE_MAP: Record<string, LegislationType> = {
    "H.R.": "HR",
    "S.": "S",
    "H.J.Res.": "HJRES",
    "S.J.Res.": "SJRES",
    "H.Con.Res.": "HCONRES",
    "S.Con.Res.": "SCONRES",
    "H.Res.": "HRES",
    "S.Res.": "SRES",
};

/**
 * Convert a CSV bill type string ("H.R.", "S.J.Res.", ...) to its
 * legislation_type enum value ("HR", "SJRES", ...). Returns null if the
 * input doesn't match a known type.
 */
export function normalizeCsvBillType(csvBillType: string): LegislationType | null {
    if (!csvBillType) return null;
    // Look up case-insensitively against the keys.
    const trimmed = csvBillType.trim();
    for (const [key, value] of Object.entries(CSV_BILL_TYPE_MAP)) {
        if (key.toLowerCase() === trimmed.toLowerCase()) return value;
    }
    return null;
}
