import { assertEquals } from "jsr:@std/assert@1";
import {
    normalizeCsvBillType,
    parseCSVLine,
    parseCongressNumber,
    parseLegislationNumber,
} from "./csv-parse.ts";

// ---------------------------------------------------------------------------
// parseCSVLine
// ---------------------------------------------------------------------------

Deno.test("parseCSVLine: simple unquoted fields", () => {
    assertEquals(parseCSVLine("a,b,c"), ["a", "b", "c"]);
});

Deno.test("parseCSVLine: empty fields", () => {
    assertEquals(parseCSVLine("a,,c"), ["a", "", "c"]);
});

Deno.test("parseCSVLine: quoted field with comma inside", () => {
    assertEquals(
        parseCSVLine('"Eshoo, Anna G.",CA,House'),
        ["Eshoo, Anna G.", "CA", "House"],
    );
});

Deno.test("parseCSVLine: trailing empty field", () => {
    assertEquals(parseCSVLine("a,b,"), ["a", "b", ""]);
});

Deno.test("parseCSVLine: empty line returns one empty cell", () => {
    assertEquals(parseCSVLine(""), [""]);
});

// ---------------------------------------------------------------------------
// parseLegislationNumber
// ---------------------------------------------------------------------------

Deno.test("parseLegislationNumber: H.R. format", () => {
    assertEquals(parseLegislationNumber("H.R. 5861"), {
        billType: "H.R.",
        billNumber: "5861",
    });
});

Deno.test("parseLegislationNumber: S. format", () => {
    assertEquals(parseLegislationNumber("S. 1234"), {
        billType: "S.",
        billNumber: "1234",
    });
});

Deno.test("parseLegislationNumber: H.J.Res. format", () => {
    assertEquals(parseLegislationNumber("H.J.Res. 138"), {
        billType: "H.J.Res.",
        billNumber: "138",
    });
});

Deno.test("parseLegislationNumber: empty string returns null", () => {
    assertEquals(parseLegislationNumber(""), null);
});

Deno.test("parseLegislationNumber: garbage returns null", () => {
    assertEquals(parseLegislationNumber("not-a-bill"), null);
});

// ---------------------------------------------------------------------------
// parseCongressNumber
// ---------------------------------------------------------------------------

Deno.test("parseCongressNumber: standard format", () => {
    assertEquals(parseCongressNumber("113th Congress (2013-2014)"), "113");
});

Deno.test("parseCongressNumber: 119th", () => {
    assertEquals(parseCongressNumber("119th Congress (2025-2027)"), "119");
});

Deno.test("parseCongressNumber: empty returns null", () => {
    assertEquals(parseCongressNumber(""), null);
});

Deno.test("parseCongressNumber: no leading number returns null", () => {
    assertEquals(parseCongressNumber("not a congress string"), null);
});

// ---------------------------------------------------------------------------
// normalizeCsvBillType — bridges CSV "H.R." → enum "HR"
// ---------------------------------------------------------------------------

Deno.test("normalizeCsvBillType: H.R. → HR", () => {
    assertEquals(normalizeCsvBillType("H.R."), "HR");
});

Deno.test("normalizeCsvBillType: S. → S", () => {
    assertEquals(normalizeCsvBillType("S."), "S");
});

Deno.test("normalizeCsvBillType: H.J.Res. → HJRES", () => {
    assertEquals(normalizeCsvBillType("H.J.Res."), "HJRES");
});

Deno.test("normalizeCsvBillType: S.J.Res. → SJRES", () => {
    assertEquals(normalizeCsvBillType("S.J.Res."), "SJRES");
});

Deno.test("normalizeCsvBillType: H.Con.Res. → HCONRES", () => {
    assertEquals(normalizeCsvBillType("H.Con.Res."), "HCONRES");
});

Deno.test("normalizeCsvBillType: S.Con.Res. → SCONRES", () => {
    assertEquals(normalizeCsvBillType("S.Con.Res."), "SCONRES");
});

Deno.test("normalizeCsvBillType: H.Res. → HRES", () => {
    assertEquals(normalizeCsvBillType("H.Res."), "HRES");
});

Deno.test("normalizeCsvBillType: S.Res. → SRES", () => {
    assertEquals(normalizeCsvBillType("S.Res."), "SRES");
});

Deno.test("normalizeCsvBillType: case-insensitive on input", () => {
    assertEquals(normalizeCsvBillType("h.r."), "HR");
    assertEquals(normalizeCsvBillType("h.j.res."), "HJRES");
});

Deno.test("normalizeCsvBillType: trims surrounding whitespace", () => {
    assertEquals(normalizeCsvBillType("  H.R.  "), "HR");
});

Deno.test("normalizeCsvBillType: unknown returns null", () => {
    assertEquals(normalizeCsvBillType("X.Y.Z."), null);
});

Deno.test("normalizeCsvBillType: empty string returns null", () => {
    assertEquals(normalizeCsvBillType(""), null);
});
