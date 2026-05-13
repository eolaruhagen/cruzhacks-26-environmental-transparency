import { test, expect } from "bun:test";
import {
    normalizeCsvBillType,
    parseCSVLine,
    parseCongressNumber,
    parseLegislationNumber,
} from "../csv-parse.ts";

// ---------------------------------------------------------------------------
// parseCSVLine
// ---------------------------------------------------------------------------

test("parseCSVLine: simple unquoted fields", () => {
    expect(parseCSVLine("a,b,c")).toEqual(["a", "b", "c"]);
});

test("parseCSVLine: empty fields", () => {
    expect(parseCSVLine("a,,c")).toEqual(["a", "", "c"]);
});

test("parseCSVLine: quoted field with comma inside", () => {
    expect(parseCSVLine('"Eshoo, Anna G.",CA,House')).toEqual(
        ["Eshoo, Anna G.", "CA", "House"],
    );
});

test("parseCSVLine: trailing empty field", () => {
    expect(parseCSVLine("a,b,")).toEqual(["a", "b", ""]);
});

test("parseCSVLine: empty line returns one empty cell", () => {
    expect(parseCSVLine("")).toEqual([""]);
});

// ---------------------------------------------------------------------------
// parseLegislationNumber
// ---------------------------------------------------------------------------

test("parseLegislationNumber: H.R. format", () => {
    expect(parseLegislationNumber("H.R. 5861")).toEqual({
        billType: "H.R.",
        billNumber: "5861",
    });
});

test("parseLegislationNumber: S. format", () => {
    expect(parseLegislationNumber("S. 1234")).toEqual({
        billType: "S.",
        billNumber: "1234",
    });
});

test("parseLegislationNumber: H.J.Res. format", () => {
    expect(parseLegislationNumber("H.J.Res. 138")).toEqual({
        billType: "H.J.Res.",
        billNumber: "138",
    });
});

test("parseLegislationNumber: empty string returns null", () => {
    expect(parseLegislationNumber("")).toEqual(null);
});

test("parseLegislationNumber: garbage returns null", () => {
    expect(parseLegislationNumber("not-a-bill")).toEqual(null);
});

// ---------------------------------------------------------------------------
// parseCongressNumber
// ---------------------------------------------------------------------------

test("parseCongressNumber: standard format", () => {
    expect(parseCongressNumber("113th Congress (2013-2014)")).toEqual("113");
});

test("parseCongressNumber: 119th", () => {
    expect(parseCongressNumber("119th Congress (2025-2027)")).toEqual("119");
});

test("parseCongressNumber: empty returns null", () => {
    expect(parseCongressNumber("")).toEqual(null);
});

test("parseCongressNumber: no leading number returns null", () => {
    expect(parseCongressNumber("not a congress string")).toEqual(null);
});

// ---------------------------------------------------------------------------
// normalizeCsvBillType — bridges CSV "H.R." → enum "HR"
// ---------------------------------------------------------------------------

test("normalizeCsvBillType: H.R. → HR", () => {
    expect(normalizeCsvBillType("H.R.")).toEqual("HR");
});

test("normalizeCsvBillType: S. → S", () => {
    expect(normalizeCsvBillType("S.")).toEqual("S");
});

test("normalizeCsvBillType: H.J.Res. → HJRES", () => {
    expect(normalizeCsvBillType("H.J.Res.")).toEqual("HJRES");
});

test("normalizeCsvBillType: S.J.Res. → SJRES", () => {
    expect(normalizeCsvBillType("S.J.Res.")).toEqual("SJRES");
});

test("normalizeCsvBillType: H.Con.Res. → HCONRES", () => {
    expect(normalizeCsvBillType("H.Con.Res.")).toEqual("HCONRES");
});

test("normalizeCsvBillType: S.Con.Res. → SCONRES", () => {
    expect(normalizeCsvBillType("S.Con.Res.")).toEqual("SCONRES");
});

test("normalizeCsvBillType: H.Res. → HRES", () => {
    expect(normalizeCsvBillType("H.Res.")).toEqual("HRES");
});

test("normalizeCsvBillType: S.Res. → SRES", () => {
    expect(normalizeCsvBillType("S.Res.")).toEqual("SRES");
});

test("normalizeCsvBillType: case-insensitive on input", () => {
    expect(normalizeCsvBillType("h.r.")).toEqual("HR");
    expect(normalizeCsvBillType("h.j.res.")).toEqual("HJRES");
});

test("normalizeCsvBillType: trims surrounding whitespace", () => {
    expect(normalizeCsvBillType("  H.R.  ")).toEqual("HR");
});

test("normalizeCsvBillType: unknown returns null", () => {
    expect(normalizeCsvBillType("X.Y.Z.")).toEqual(null);
});

test("normalizeCsvBillType: empty string returns null", () => {
    expect(normalizeCsvBillType("")).toEqual(null);
});
