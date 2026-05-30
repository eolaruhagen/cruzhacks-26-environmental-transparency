import { describe, expect, test } from "bun:test";
import type { SubprocessResult, SubprocessRunner } from "@cruzhacks/shared";
import { extractReferences } from "../extract.ts";
import type { ExtractInput, ExtractedReference } from "../types.ts";

// ---------------------------------------------------------------------------
// Test fixtures
// ---------------------------------------------------------------------------

// UUIDv4 fixtures (version nibble = 4, variant nibble = 8/9/a/b). Zod v4's
// uuid validator is stricter than the v0–3 regexes and rejects all-zero
// IDs except the canonical nil/max forms.
const ID_1 = "11111111-1111-4111-8111-111111111111";
const ID_2 = "22222222-2222-4222-9222-222222222222";
const ID_3 = "33333333-3333-4333-a333-333333333333";
const ID_UNKNOWN = "99999999-9999-4999-b999-999999999999";

function sampleBill(
    id: string,
    overrides: Partial<ExtractInput> = {},
): ExtractInput {
    return {
        bill_id: id,
        legislation_number: "H.R. 6782 (119)",
        source: "summary",
        text: "Amends the Clean Air Act to add new air-quality monitoring.",
        ...overrides,
    };
}

function sampleNamedLawRef(name: string): ExtractedReference {
    const normalized = name.toLowerCase().replace(/^the\s+/, "").trim();
    return {
        kind: "named_law",
        raw: name,
        normalized_key: `named:${normalized}`,
        normalized: {},
        context: null,
        span_start: null,
        span_end: null,
        is_self_ref: false,
    };
}

function fakeRunner(
    stdout: string,
    opts: { stderr?: string; exitCode?: number | null } = {},
): SubprocessRunner & { callCount: () => number; lastInput: () => string | undefined } {
    let calls = 0;
    let lastInput: string | undefined;
    const result: SubprocessResult = {
        stdout,
        stderr: opts.stderr ?? "",
        exitCode: opts.exitCode ?? 0,
    };
    return {
        async run(input: string) {
            calls += 1;
            lastInput = input;
            return result;
        },
        callCount: () => calls,
        lastInput: () => lastInput,
    };
}

function captureLogger(): { warn: (msg: string) => void; error: (msg: string) => void; warns: string[]; errors: string[] } {
    const warns: string[] = [];
    const errors: string[] = [];
    return {
        warn: (m) => warns.push(m),
        error: (m) => errors.push(m),
        warns,
        errors,
    };
}

// ---------------------------------------------------------------------------
// Happy path
// ---------------------------------------------------------------------------

describe("extractReferences — happy paths", () => {
    test("3 bills in → 3 results out, every input bill present in the map", async () => {
        const bills = [sampleBill(ID_1), sampleBill(ID_2), sampleBill(ID_3)];
        const stdout = bills
            .map((b) =>
                JSON.stringify({
                    bill_id: b.bill_id,
                    references: [sampleNamedLawRef("the Clean Air Act")],
                    error: null,
                }),
            )
            .join("\n");

        const result = await extractReferences(bills, fakeRunner(stdout));

        expect(result.size).toBe(3);
        for (const b of bills) {
            const r = result.get(b.bill_id);
            expect(r).toBeDefined();
            expect(r!.error).toBeNull();
            expect(r!.references).toHaveLength(1);
            expect(r!.references[0]!.normalized_key).toBe("named:clean air act");
        }
    });

    test("empty input returns empty map and does NOT spawn the subprocess", async () => {
        const runner = fakeRunner("");
        const result = await extractReferences([], runner);
        expect(result.size).toBe(0);
        expect(runner.callCount()).toBe(0);
    });

    test("stdin payload to subprocess is one JSON object per line", async () => {
        const bills = [sampleBill(ID_1), sampleBill(ID_2)];
        const stdout = bills
            .map((b) =>
                JSON.stringify({ bill_id: b.bill_id, references: [], error: null }),
            )
            .join("\n");
        const runner = fakeRunner(stdout);

        await extractReferences(bills, runner);

        const sent = runner.lastInput()!;
        const lines = sent.split("\n").filter((l) => l.length > 0);
        expect(lines).toHaveLength(2);
        for (const [i, l] of lines.entries()) {
            const parsed = JSON.parse(l);
            expect(parsed.bill_id).toBe(bills[i]!.bill_id);
            expect(parsed.source).toBe("summary");
        }
    });
});

// ---------------------------------------------------------------------------
// Python-reported per-bill errors
// ---------------------------------------------------------------------------

describe("extractReferences — python-reported errors", () => {
    test("a single bill error preserves the error string and keeps the rest succeeding", async () => {
        const bills = [sampleBill(ID_1), sampleBill(ID_2)];
        const stdout = [
            JSON.stringify({
                bill_id: bills[0]!.bill_id,
                references: [],
                error: "spaCy model failed to load",
            }),
            JSON.stringify({
                bill_id: bills[1]!.bill_id,
                references: [sampleNamedLawRef("the Clean Water Act")],
                error: null,
            }),
        ].join("\n");

        const result = await extractReferences(bills, fakeRunner(stdout));

        expect(result.size).toBe(2);
        expect(result.get(bills[0]!.bill_id)!.error).toBe(
            "spaCy model failed to load",
        );
        expect(result.get(bills[0]!.bill_id)!.references).toHaveLength(0);
        expect(result.get(bills[1]!.bill_id)!.error).toBeNull();
        expect(result.get(bills[1]!.bill_id)!.references).toHaveLength(1);
    });
});

// ---------------------------------------------------------------------------
// Malformed stdout handling
// ---------------------------------------------------------------------------

describe("extractReferences — malformed stdout", () => {
    test("JSONL parse failure logs at warn and gap-fills the missing bill with a no-result error", async () => {
        const bills = [sampleBill(ID_1), sampleBill(ID_2)];
        const stdout = [
            "this line is not valid json",
            JSON.stringify({
                bill_id: bills[1]!.bill_id,
                references: [sampleNamedLawRef("the Clean Air Act")],
                error: null,
            }),
        ].join("\n");
        const log = captureLogger();

        const result = await extractReferences(bills, fakeRunner(stdout), log);

        expect(result.size).toBe(2);
        expect(result.get(bills[0]!.bill_id)!.error).toMatch(/no result returned/);
        expect(result.get(bills[1]!.bill_id)!.error).toBeNull();
        expect(log.warns.some((w) => w.includes("JSON parse failed"))).toBe(true);
    });

    test("schema-invalid line with a recoverable bill_id marks THAT bill failed and continues", async () => {
        const bills = [sampleBill(ID_1)];
        const stdout = JSON.stringify({
            bill_id: bills[0]!.bill_id,
            references: [
                // kind is invalid — schema rejects
                {
                    kind: "not_a_real_kind",
                    raw: "x",
                    normalized_key: "x",
                },
            ],
            error: null,
        });

        const result = await extractReferences(bills, fakeRunner(stdout));

        expect(result.size).toBe(1);
        expect(result.get(bills[0]!.bill_id)!.error).toMatch(/schema validation failed/);
        expect(result.get(bills[0]!.bill_id)!.references).toHaveLength(0);
    });

    test("schema-invalid line WITHOUT a recoverable bill_id is logged and dropped (gap-filled later)", async () => {
        const bills = [sampleBill(ID_1)];
        // bill_id is missing entirely; recovery is impossible
        const stdout = JSON.stringify({ references: [], error: null });
        const log = captureLogger();

        const result = await extractReferences(bills, fakeRunner(stdout), log);

        expect(result.size).toBe(1);
        expect(result.get(bills[0]!.bill_id)!.error).toMatch(/no result returned/);
        expect(
            log.warns.some((w) =>
                w.includes("no recoverable bill_id"),
            ),
        ).toBe(true);
    });
});

// ---------------------------------------------------------------------------
// Mid-batch python crash
// ---------------------------------------------------------------------------

describe("extractReferences — mid-batch python crash", () => {
    test("missing bills get gap-filled with exit code + stderr tail in the error message", async () => {
        const bills = [sampleBill(ID_1), sampleBill(ID_2), sampleBill(ID_3)];
        const stdout = JSON.stringify({
            bill_id: bills[0]!.bill_id,
            references: [sampleNamedLawRef("the Clean Air Act")],
            error: null,
        });

        const result = await extractReferences(
            bills,
            fakeRunner(stdout, {
                exitCode: 1,
                stderr: "Traceback (most recent call last):\n  ...\nKeyError: 'text'\n",
            }),
        );

        expect(result.size).toBe(3);
        expect(result.get(bills[0]!.bill_id)!.error).toBeNull();
        const err1 = result.get(bills[1]!.bill_id)!.error!;
        const err2 = result.get(bills[2]!.bill_id)!.error!;
        expect(err1).toMatch(/no result returned/);
        expect(err1).toMatch(/python exit code 1/);
        expect(err1).toMatch(/KeyError: 'text'/);
        expect(err2).toMatch(/no result returned/);
    });

    test("non-zero exit with no stderr still produces a useful error", async () => {
        const bills = [sampleBill(ID_1)];
        const result = await extractReferences(
            bills,
            fakeRunner("", { exitCode: 137, stderr: "" }),
        );
        const err = result.get(bills[0]!.bill_id)!.error!;
        expect(err).toMatch(/no result returned/);
        expect(err).toMatch(/python exit code 137/);
        expect(err).not.toMatch(/stderr:/); // empty stderr omits the suffix
    });
});

// ---------------------------------------------------------------------------
// Unknown bill_id from python
// ---------------------------------------------------------------------------

describe("extractReferences — unknown bill_id from python", () => {
    test("python output for a bill we didn't send is logged at warn and ignored", async () => {
        const bills = [sampleBill(ID_1)];
        const stdout = [
            JSON.stringify({
                bill_id: bills[0]!.bill_id,
                references: [sampleNamedLawRef("the Clean Air Act")],
                error: null,
            }),
            JSON.stringify({
                bill_id: ID_UNKNOWN,
                references: [sampleNamedLawRef("the Clean Water Act")],
                error: null,
            }),
        ].join("\n");
        const log = captureLogger();

        const result = await extractReferences(bills, fakeRunner(stdout), log);

        expect(result.size).toBe(1);
        expect(result.get(bills[0]!.bill_id)).toBeDefined();
        expect(result.has(ID_UNKNOWN)).toBe(false);
        expect(log.warns.some((w) => w.includes("unknown bill_id"))).toBe(true);
    });
});

// ---------------------------------------------------------------------------
// Input validation
// ---------------------------------------------------------------------------

describe("extractReferences — input validation", () => {
    test("invalid input throws synchronously and does NOT spawn the subprocess", async () => {
        const runner = fakeRunner("");
        const badInput = {
            bill_id: "not-a-uuid",
            legislation_number: "X",
            source: "summary",
            text: "abc",
        } as unknown as ExtractInput;

        await expect(extractReferences([badInput], runner)).rejects.toThrow(
            /invalid input at index 0/,
        );
        expect(runner.callCount()).toBe(0);
    });

    test("partial-batch validity is rejected: if ANY input is bad the whole call throws", async () => {
        const runner = fakeRunner("");
        const inputs: ExtractInput[] = [
            sampleBill(ID_1),
            { ...sampleBill(ID_2), text: "" } as ExtractInput, // empty text → schema rejects
            sampleBill(ID_3),
        ];

        await expect(extractReferences(inputs, runner)).rejects.toThrow(
            /invalid input at index 1/,
        );
        expect(runner.callCount()).toBe(0);
    });
});
