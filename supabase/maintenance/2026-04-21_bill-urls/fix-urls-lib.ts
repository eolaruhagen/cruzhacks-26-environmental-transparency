export type ParsedLegislation = { type: string; billNumber: number };

// stored as "<TYPE> <NUMBER> (<CONGRESS>)" e.g. "H.Con.Res. 113 (117)"
// tolerates surrounding whitespace and extra spaces between parts
export function parseLegislation(legislation_number: string): ParsedLegislation | null {
    const match = legislation_number.match(/^\s*([A-Z][A-Z.]*\.)\s+(\d+)\s*\(\s*\d+\s*\)\s*$/i);
    if (!match) return null;
    if (!match[1] || !match[2]) return null;
    return { type: match[1], billNumber: parseInt(match[2]) };
}

const reverseTypeMap: Record<string, string> = {
    "H.R.": "HR", "S.": "S", "H.J.Res.": "HJRES", "S.J.Res.": "SJRES",
    "H.Con.Res.": "HCONRES", "S.Con.Res.": "SCONRES", "H.Res.": "HRES", "S.Res.": "SRES",
};

export function mapLegislationType(legislation_number: string): { type: string, number: number } {
    const parsed = parseLegislation(legislation_number);
    if (!parsed) {
        throw new Error(`Invalid legislation number: ${legislation_number}`);
    }
    const mapped_type = reverseTypeMap[parsed.type];
    if (!mapped_type) {
        throw new Error(`Invalid legislation type: ${parsed.type}`);
    }
    return { type: mapped_type.toLowerCase(), number: parsed.billNumber };
}

// formatted in col as "xxxth congress"
export function extractCongressNumber(congress_col: string): number | null {
    const match = congress_col.match(/(\d+)\s*th/i);
    if (match) {
        if (!match[1]) return null;
        return parseInt(match[1]);
    }
    return null;
}
