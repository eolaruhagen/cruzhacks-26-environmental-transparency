import type { SubprocessRunner } from "@cruzhacks/shared";
import {
    ExtractInputSchema,
    ExtractOutputSchema,
    type ExtractInput,
    type ExtractOutput,
} from "./types.ts";

// ---------------------------------------------------------------------------
// extractReferences
// ---------------------------------------------------------------------------
// Functional interface the worker calls. The subprocess port itself lives
// in @cruzhacks/shared (`SubprocessRunner`, `makeBunSubprocessRunner`) so
// the news pipeline can adopt it later without a refactor. This module
// owns only the extraction-specific framing on top of that port: input
// validation, JSONL writing, JSONL parsing, schema validation, gap-fill
// for missing results.

export interface ExtractLogger {
    warn(msg: string): void;
    error(msg: string): void;
}

/**
 * Extract references from a batch of bills via the python subprocess.
 *
 * Contract:
 * - Validates every input synchronously; throws BEFORE the subprocess runs
 *   if any bill is malformed. Whole-batch rejection on a bad input — the
 *   worker shouldn't be passing junk and a partial-batch swallow would
 *   hide bugs.
 * - Empty input is a no-op: returns an empty Map without invoking the
 *   runner.
 * - The returned Map is keyed by bill_id and is guaranteed to contain an
 *   entry for every input bill. A bill with no matching python output is
 *   filled with `error: "no result returned..."` so the caller can stamp
 *   references_extracted_at = now() (we still consider it "attempted") and
 *   move on without writing references.
 * - JSONL parse failure on a single output line is logged and skipped (the
 *   bill gets gap-filled). Schema-validation failure on a parseable line
 *   marks that bill failed (recovering the bill_id from the raw object if
 *   possible).
 * - bill_ids the python script emits but we didn't send are logged at warn
 *   and dropped.
 */
export async function extractReferences(
    bills: ExtractInput[],
    runner: SubprocessRunner,
    logger?: ExtractLogger,
): Promise<Map<string, ExtractOutput>> {
    for (const [i, b] of bills.entries()) {
        const parsed = ExtractInputSchema.safeParse(b);
        if (!parsed.success) {
            throw new Error(
                `extractReferences: invalid input at index ${i}: ${parsed.error.message}`,
            );
        }
    }

    const results = new Map<string, ExtractOutput>();
    if (bills.length === 0) return results;

    const stdin = bills.map((b) => JSON.stringify(b)).join("\n") + "\n";
    const { stdout, stderr, exitCode } = await runner.run(stdin);

    const expectedIds = new Set(bills.map((b) => b.bill_id));
    const lines = stdout.split("\n").filter((l) => l.trim().length > 0);

    for (const [i, line] of lines.entries()) {
        let raw: unknown;
        try {
            raw = JSON.parse(line);
        } catch (parseErr) {
            logger?.warn(
                `extractReferences: JSON parse failed on stdout line ${i}: ${String(parseErr)}`,
            );
            continue;
        }

        const parsed = ExtractOutputSchema.safeParse(raw);
        if (!parsed.success) {
            // Recover the bill_id if the malformed payload still contained
            // a valid one — better to mark that bill failed than to lose
            // it to gap-fill (which produces a more generic error).
            const billId = (raw as { bill_id?: unknown })?.bill_id;
            if (typeof billId === "string" && expectedIds.has(billId)) {
                results.set(billId, {
                    bill_id: billId,
                    references: [],
                    error: `schema validation failed: ${parsed.error.message}`,
                });
            } else {
                logger?.warn(
                    `extractReferences: schema validation failed on stdout line ${i} with no recoverable bill_id`,
                );
            }
            continue;
        }

        if (!expectedIds.has(parsed.data.bill_id)) {
            logger?.warn(
                `extractReferences: python emitted unknown bill_id ${parsed.data.bill_id}, ignoring`,
            );
            continue;
        }

        results.set(parsed.data.bill_id, parsed.data);
    }

    // Gap-fill: any bill we sent that didn't come back gets a no-result
    // error including stderr tail + exit code for diagnostics.
    for (const bill of bills) {
        if (results.has(bill.bill_id)) continue;
        const trimmedStderr = stderr.slice(-500).trim();
        const stderrSuffix = trimmedStderr.length > 0
            ? ` (stderr: ${trimmedStderr})`
            : "";
        const exitSuffix = exitCode !== 0
            ? ` (python exit code ${exitCode})`
            : "";
        results.set(bill.bill_id, {
            bill_id: bill.bill_id,
            references: [],
            error: `no result returned from extractor${exitSuffix}${stderrSuffix}`,
        });
    }

    return results;
}
