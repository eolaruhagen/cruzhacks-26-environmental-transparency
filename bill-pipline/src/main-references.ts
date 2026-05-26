import pino from "pino";
import {
    makeBunSubprocessRunner,
    mapConcurrent,
} from "@cruzhacks/shared";
import {
    fetchReferenceCandidates,
    markExtracted,
    replaceBillReferences,
    upsertCitedReferences,
} from "./lib/references/bill-references.ts";
import { extractReferences } from "./lib/references/extract.ts";
import { makeReferencesBackend } from "./lib/references/make-references-backend.ts";
import type {
    BillReferenceInsert,
    CandidateBillRow,
} from "./lib/references/bill-references.ts";
import type {
    ExtractInput,
    ReferenceSource,
} from "./lib/references/types.ts";
import { makeObservability } from "./lib/runtime/observability.ts";
import { makeSupabase } from "./lib/runtime/supabase-client.ts";
import { getTimeBudgetMs, isRunningLow } from "./lib/runtime/time-budget.ts";

const logger = pino({ name: "bill-references" });

const BATCH_SIZE = Number(process.env.BATCH_SIZE ?? "50");
const PER_BATCH_CONCURRENCY = Number(process.env.PER_BATCH_CONCURRENCY ?? "5");
const PYTHON_PATH = process.env.PYTHON_PATH ?? "python3";
const EXTRACTOR_SCRIPT = process.env.EXTRACTOR_SCRIPT ?? "./python/extractor.py";

// Display legislation_number as "H.R. 6782 (119)". The DB stores
// bill_type as a public.legislation_type enum (HR, S, HJRES, SJRES,
// HCONRES, SCONRES, HRES, SRES); we format it for the Python extractor
// and for log/observability messages. The Python script accepts the
// value for API symmetry but ignores it in Stage 1.
const BILL_TYPE_DISPLAY: Record<string, string> = {
    HR: "H.R.",
    S: "S.",
    HJRES: "H.J.Res.",
    SJRES: "S.J.Res.",
    HCONRES: "H.Con.Res.",
    SCONRES: "S.Con.Res.",
    HRES: "H.Res.",
    SRES: "S.Res.",
};

function formatLegislationNumber(row: CandidateBillRow): string {
    const display = BILL_TYPE_DISPLAY[row.bill_type] ?? row.bill_type;
    return `${display} ${row.bill_number} (${row.congress})`;
}

function pickSource(row: CandidateBillRow): {
    text: string;
    source: ReferenceSource;
} {
    if (row.bill_text && row.bill_text.length > 0) {
        return { text: row.bill_text, source: "bill_text" };
    }
    return { text: row.latest_summary ?? "", source: "summary" };
}

async function run(): Promise<void> {
    const startedAt = Date.now();
    const budgetMs = getTimeBudgetMs(process.env.TIME_BUDGET_MS);
    const supabase = makeSupabase();
    const backend = makeReferencesBackend(supabase);
    const runner = makeBunSubprocessRunner([PYTHON_PATH, EXTRACTOR_SCRIPT]);
    const obs = makeObservability("bill-references");

    await obs.withSession("bill-references", async (session) => {
        let totalProcessed = 0;
        let totalFailed = 0;
        let totalReferences = 0;
        let totalBatches = 0;

        while (true) {
            if (isRunningLow(startedAt, budgetMs)) {
                session.set("stopped_early", "time_budget");
                logger.info("time budget exhausted; next run picks up");
                break;
            }

            session.stage(`fetch-batch-${totalBatches + 1}`);
            const candidates = await fetchReferenceCandidates(backend, BATCH_SIZE);
            if (candidates.length === 0) {
                if (totalBatches === 0) session.set("queue_empty", "true");
                break;
            }

            const inputs: ExtractInput[] = candidates.map((row) => {
                const { text, source } = pickSource(row);
                return {
                    bill_id: row.id,
                    legislation_number: formatLegislationNumber(row),
                    source,
                    text,
                };
            });

            session.stage(`extract-${inputs.length}`);
            const results = await extractReferences(inputs, runner, {
                warn: (msg) => logger.warn(msg),
                error: (msg) => logger.error(msg),
            });

            session.stage(`write-${candidates.length}`);
            const writeResults = await mapConcurrent(
                candidates,
                PER_BATCH_CONCURRENCY,
                async (row, i) => {
                    const input = inputs[i]!;
                    const result = results.get(row.id);

                    if (!result || result.error) {
                        const reason = result?.error ?? "no extractor result";
                        logger.warn(
                            { billId: row.id, legNum: input.legislation_number, reason },
                            "references extract failed; marking and skipping",
                        );
                        await markExtracted(backend, row.id);
                        return { kind: "failed" as const };
                    }

                    const keyToId = await upsertCitedReferences(
                        backend,
                        result.references,
                    );

                    const linkRows: BillReferenceInsert[] = result.references.map(
                        (ref) => ({
                            reference_id: keyToId.get(
                                `${ref.kind}:${ref.normalized_key}`,
                            )!,
                            raw: ref.raw,
                            context: ref.context,
                            span_start: ref.span_start,
                            span_end: ref.span_end,
                            source: input.source,
                            is_self_ref: ref.is_self_ref,
                        }),
                    );

                    await replaceBillReferences(backend, row.id, linkRows);
                    await markExtracted(backend, row.id);
                    return {
                        kind: "processed" as const,
                        refCount: linkRows.length,
                    };
                },
            );

            for (let i = 0; i < writeResults.length; i++) {
                const r = writeResults[i]!;
                const row = candidates[i]!;
                if (r.status === "fulfilled") {
                    if (r.value.kind === "processed") {
                        totalProcessed += 1;
                        totalReferences += r.value.refCount;
                    } else {
                        totalFailed += 1;
                    }
                } else {
                    const reason = r.reason instanceof Error
                        ? r.reason.message
                        : String(r.reason);
                    logger.warn(
                        { billId: row.id, reason },
                        "write step threw",
                    );
                    totalFailed += 1;
                }
            }

            totalBatches += 1;
        }

        session.set("batches", String(totalBatches));
        session.set("processed", String(totalProcessed));
        session.set("failed", String(totalFailed));
        session.set("references_written", String(totalReferences));

        logger.info(
            {
                batches: totalBatches,
                processed: totalProcessed,
                failed: totalFailed,
                referencesWritten: totalReferences,
            },
            "run complete",
        );
    });
}

run().catch((err) => {
    logger.fatal({ err }, "fatal");
    process.exit(1);
});
