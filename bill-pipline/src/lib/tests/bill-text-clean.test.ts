import { test, expect } from "bun:test";
import { cleanBillText } from "../bill-text-clean.ts";

test("returns null for null/undefined/empty", () => {
    expect(cleanBillText(null)).toEqual(null);
    expect(cleanBillText(undefined)).toEqual(null);
    expect(cleanBillText("")).toEqual(null);
    expect(cleanBillText("   \n\n   ")).toEqual(null);
});

test("strips <html><body><pre> wrapper and trailing markers", () => {
    const input =
        "<html><body><pre>\n" +
        "[Congressional Bills 119th Congress]\n" +
        "[From the U.S. Government Publishing Office]\n" +
        "[H.R. 6204 Introduced in House (IH)]\n" +
        "\n" +
        "&lt;DOC&gt;\n" +
        "\n" +
        "A BILL\n" +
        "Be it enacted...\n" +
        "                                 &lt;all&gt;\n" +
        "</pre></body></html>\n";

    const cleaned = cleanBillText(input);
    expect(cleaned).toEqual("A BILL\nBe it enacted...");
});

test("decodes HTML entities (&lt; &gt; &amp; &quot; &#39; &nbsp;)", () => {
    const input =
        "<html><body><pre>\n" +
        "section &amp; subsection\n" +
        "Tom &#39;the man&#39; said &quot;hi&quot;\n" +
        "non&nbsp;breaking\n" +
        "less &lt; greater &gt; than\n" +
        "</pre></body></html>";
    const cleaned = cleanBillText(input);
    expect(cleaned).toEqual(
        "section & subsection\nTom 'the man' said \"hi\"\nnon breaking\nless < greater > than",
    );
});

test("drops <DOC> and <all> sentinel lines (post-decode form)", () => {
    // Already-decoded input — should also be cleaned.
    const input = "<DOC>\n\nSEC. 1.\nText.\n<all>";
    expect(cleanBillText(input)).toEqual("SEC. 1.\nText.");
});

test("only drops sentinel when it's on its own line", () => {
    // Defensive: the strings "<all>" or "<DOC>" embedded mid-line in a
    // statute (unlikely but possible) must NOT be stripped.
    const input = "Section 1. Reference to <all> below.\n";
    expect(cleanBillText(input)).toEqual("Section 1. Reference to <all> below.");
});

test("prelude stripping stops at first real line", () => {
    // Bracketed lines appearing AFTER bill content begins are real content
    // (e.g. a sub-section reference), so we don't strip them.
    const input =
        "[Congressional Bills 119th Congress]\n" +
        "First real line.\n" +
        "[A bracketed reference inside the bill]\n" +
        "More text.\n";
    expect(cleanBillText(input)).toEqual(
        "First real line.\n[A bracketed reference inside the bill]\nMore text.",
    );
});

test("collapses 3+ blank lines into a single blank", () => {
    const input = "Line 1.\n\n\n\n\nLine 2.\n\nLine 3.";
    expect(cleanBillText(input)).toEqual("Line 1.\n\nLine 2.\n\nLine 3.");
});

test("missing wrapper still cleans correctly", () => {
    // If congress.gov ever changes the wrapping (or someone hands us the
    // raw <pre> contents directly), we still apply the rest of the pipeline.
    const input = "[Congressional Bills 119]\n\n<DOC>\n\nA BILL\n\n<all>";
    expect(cleanBillText(input)).toEqual("A BILL");
});

test("real sample (truncated) from house_bills_2.HR.6204", () => {
    // Verbatim shape observed in production after the text-fetch fix landed.
    const input =
        "<html><body><pre>\n" +
        "[Congressional Bills 119th Congress]\n" +
        "[From the U.S. Government Publishing Office]\n" +
        "[H.R. 6204 Introduced in House (IH)]\n" +
        "\n" +
        "&lt;DOC&gt;\n" +
        "\n" +
        "\n" +
        "\n" +
        "\n" +
        "\n" +
        "\n" +
        "119th CONGRESS\n" +
        "  1st Session\n" +
        "                                H. R. 6204\n" +
        "\n" +
        "    Be it enacted by the Senate and House of Representatives of the \n" +
        "United States of America in Congress assembled,\n" +
        "                                 &lt;all&gt;\n" +
        "</pre></body></html>\n";

    const cleaned = cleanBillText(input);
    // First/last lines of result; we don't pin every byte so future
    // tightening of whitespace doesn't constantly break this.
    expect(cleaned?.startsWith("119th CONGRESS")).toEqual(true);
    expect(cleaned?.endsWith("Congress assembled,")).toEqual(true);
    expect(cleaned?.includes("<DOC>")).toEqual(false);
    expect(cleaned?.includes("<all>")).toEqual(false);
    expect(cleaned?.includes("&lt;")).toEqual(false);
    expect(cleaned?.includes("[Congressional Bills")).toEqual(false);
});
