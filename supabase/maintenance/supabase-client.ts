import { createClient } from "@supabase/supabase-js";
import type { Database } from "../functions/database.types";

const args = process.argv.slice(2);
const env = args.includes("--env") ? args[args.indexOf("--env") + 1] : "local";

if (!env || (env !== "local" && env !== "prod")) {
    console.error("Invalid env flag. Use --env local or --env prod");
    process.exit(1);
}


export const supabase = createClient<Database>(
    env === "local" ? "http://127.0.0.1:54321" : process.env.SUPABASE_API_URL!,
    env === "local" ? process.env.LOCAL_SERVICE_ROLE_KEY! : process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

/// Map of column type to the sentinel we write when a script can't compute
/// the real value for a row. `text` covers most NOT NULL string columns;
/// `uuid` uses the nil UUID since Postgres rejects arbitrary strings on uuid
/// columns. Numeric / nullable columns should just stay NULL — no sentinel.
export const FAILED_SENTINELS = {
    text: "FAILED",
    uuid: "00000000-0000-0000-0000-000000000000",
} as const;

export type FailedSentinelKind = keyof typeof FAILED_SENTINELS;

type TableName = keyof Database["public"]["Tables"];

/**
 * Write a failure sentinel into one column of one row. After the script
 * finishes, call `reportFailedRows` to surface how many got marked.
 *
 * Defaults: `kind: "text"`, `idColumn: "id"` — covers the common case.
 */
export async function markColumnFailed<T extends TableName>(opts: {
    table: T;
    column: string;
    idValue: string | number;
    idColumn?: string;
    kind?: FailedSentinelKind;
}): Promise<void> {
    const sentinel = FAILED_SENTINELS[opts.kind ?? "text"];
    const { error } = await supabase
        .from(opts.table)
        .update({ [opts.column]: sentinel } as never)
        .eq((opts.idColumn ?? "id") as never, opts.idValue as never);
    if (error) {
        console.error(
            `  ✗ ${opts.idValue}: failed to mark ${String(opts.table)}.${opts.column} as ${sentinel}:`,
            error,
        );
    }
}

/**
 * Count rows where a column equals the sentinel, log a summary line +
 * a SELECT hint, and return the count.
 */
export async function reportFailedRows<T extends TableName>(opts: {
    table: T;
    column: string;
    kind?: FailedSentinelKind;
}): Promise<number> {
    const sentinel = FAILED_SENTINELS[opts.kind ?? "text"];
    const { count } = await supabase
        .from(opts.table)
        .select("*", { count: "exact", head: true })
        .eq(opts.column as never, sentinel as never);

    if (count && count > 0) {
        console.warn(
            `⚠ ${count} rows marked as ${sentinel} in ${String(opts.table)}.${opts.column} (permanent failures — inspect manually).`,
        );
        console.warn(
            `  Find them with: SELECT * FROM ${String(opts.table)} WHERE ${opts.column} = '${sentinel}';`,
        );
    }
    return count ?? 0;
}