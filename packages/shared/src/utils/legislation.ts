import type { Database } from "../database.types.ts";

type LegislationType = Database["public"]["Enums"]["legislation_type"];

const BILL_TYPE_DISPLAY: Record<LegislationType, string> = {
    HR: "H.R.",
    S: "S.",
    HJRES: "H.J.Res.",
    SJRES: "S.J.Res.",
    HCONRES: "H.Con.Res.",
    SCONRES: "S.Con.Res.",
    HRES: "H.Res.",
    SRES: "S.Res.",
};

/**
 * Canonical display form of a bill's legislation number, e.g. "H.R. 6782 (119)".
 * house_bills_2 stores the structured parts (bill_type/bill_number/congress),
 * not the formatted string the legacy house_bills.legislation_number column
 * carried — so anything rendering a house_bills_2 bill formats it here.
 * Unknown bill types fall back to the raw enum value rather than throwing.
 */
export function formatLegislationNumber(
    billType: string,
    billNumber: number,
    congress: number,
): string {
    const display = BILL_TYPE_DISPLAY[billType as LegislationType] ?? billType;
    return `${display} ${billNumber} (${congress})`;
}
