import { test } from "node:test";
import assert from "node:assert";
import { parseLegislation, extractCongressNumber } from "./fix-urls-lib";

test("extractCongressNumber", () => {
    assert.strictEqual(extractCongressNumber("118th Congress"), 118);
    assert.strictEqual(extractCongressNumber("119th Congress"), 119);
    assert.strictEqual(extractCongressNumber("120th Congress"), 120);
    assert.strictEqual(extractCongressNumber(" 121TH  congress"), 121);
    assert.strictEqual(extractCongressNumber("1th Congress"), 1);
    assert.strictEqual(extractCongressNumber("121th Congress"), 121);
    assert.strictEqual(extractCongressNumber("118 th Congress"), 118);
    assert.strictEqual(extractCongressNumber("102th congress"), 102);
    assert.strictEqual(extractCongressNumber("102th house"), 102);
    assert.strictEqual(extractCongressNumber("102th senate"), 102);
    assert.strictEqual(extractCongressNumber("11th house"), 11);
    assert.strictEqual(extractCongressNumber("11th"), 11);


    // null test cases
    assert.strictEqual(extractCongressNumber("test"), null);
    assert.strictEqual(extractCongressNumber(""), null);
    assert.strictEqual(extractCongressNumber("121"), null);
    assert.strictEqual(extractCongressNumber("121st Congress"), null);
    assert.strictEqual(extractCongressNumber("121st house"), null);
    assert.strictEqual(extractCongressNumber("121st senate"), null);
    assert.strictEqual(extractCongressNumber("121 Congress"), null);
    assert.strictEqual(extractCongressNumber("th Congress"), null);
});



test("parseLegislation", () => {
    // real-data shape: "<TYPE> <NUMBER> (<CONGRESS>)"
    assert.deepStrictEqual(parseLegislation("H.R. 123 (118)"), { type: "H.R.", billNumber: 123 });
    assert.deepStrictEqual(parseLegislation("S. 456 (119)"), { type: "S.", billNumber: 456 });
    assert.deepStrictEqual(parseLegislation("H.J.Res. 789 (120)"), { type: "H.J.Res.", billNumber: 789 });
    assert.deepStrictEqual(parseLegislation("S.J.Res. 1011 (121)"), { type: "S.J.Res.", billNumber: 1011 });
    assert.deepStrictEqual(parseLegislation("H.Con.Res. 113 (117)"), { type: "H.Con.Res.", billNumber: 113 });
    assert.deepStrictEqual(parseLegislation("S.Con.Res. 1313 (123)"), { type: "S.Con.Res.", billNumber: 1313 });
    assert.deepStrictEqual(parseLegislation("H.Res. 14 (124)"), { type: "H.Res.", billNumber: 14 });
    assert.deepStrictEqual(parseLegislation("S.Res. 1515 (125)"), { type: "S.Res.", billNumber: 1515 });

    // whitespace tolerance
    assert.deepStrictEqual(parseLegislation("  H.R.   42  ( 118 )  "), { type: "H.R.", billNumber: 42 });

    // null test cases
    assert.strictEqual(parseLegislation(""), null);
    assert.strictEqual(parseLegislation("some string"), null);
    assert.strictEqual(parseLegislation("H.R. test"), null);
    assert.strictEqual(parseLegislation("H.R. 123"), null);            // missing parens
    assert.strictEqual(parseLegislation("H.R. (118)"), null);          // missing number
    assert.strictEqual(parseLegislation("H.R. 123 (abc)"), null);      // non-numeric congress
});