/**
 * Parse a value that may be a JSON string or already an object.
 * Throws on invalid JSON — callers must handle corrupted data explicitly.
 */
export function ensureParsed<T>(value: T | string): T {
    if (typeof value === "string") {
        return JSON.parse(value);
    }
    return value;
}

/** Normalize a value that should be string[] but might be string, null, or undefined */
export function toStringArray(value: unknown): string[] {
    if (value == null) return [];
    if (typeof value === "string") {
        if (value.length === 0) return [];
        return value.includes(",") ? value.split(",").map(s => s.trim()).filter(Boolean) : [value];
    }
    if (Array.isArray(value)) {
        return value
            .filter((v): v is NonNullable<typeof v> => v != null)
            .map(v => {
                if (typeof v === "string") return v;
                if (typeof v === "number" || typeof v === "boolean") return String(v);
                throw new Error(`toStringArray: unexpected element type ${typeof v} in array`);
            });
    }
    throw new Error(`toStringArray: cannot convert ${typeof value} to string[]`);
}

/** Postgres error code classes that are transient and worth retrying */
const RETRYABLE_PG_ERROR_CLASSES = new Set([
    "08", // connection exception
    "40", // transaction rollback (deadlock, serialization)
    "53", // insufficient resources (too many connections)
    "57", // operator intervention (admin shutdown)
]);

/**
 * Check if a caught error is transient (retry-worthy) or permanent (fail immediately).
 * Postgres errors with data/constraint/syntax codes should not be retried.
 */
export function isRetryablePgError(error: unknown): boolean {
    if (!(error && typeof error === "object" && "code" in error)) {
        return false;
    }

    const { code } = error as { code: unknown };
    if (typeof code !== "string") return false;

    const connectionCodes = new Set(["CONNECTION_DESTROYED", "CONNECT_TIMEOUT", "CONNECTION_CLOSED", "CONNECTION_ENDED"]);
    if (connectionCodes.has(code)) return true;

    if (code.length === 5) {
        const errorClass = code.substring(0, 2);
        return RETRYABLE_PG_ERROR_CLASSES.has(errorClass);
    }
    // for other non pg errors
    return false;
}


export function formatEmbedding(embedding: number[], dims?: number): string {
    if (dims !== undefined && embedding.length !== dims) {
        throw new Error(`formatEmbedding: expected ${dims} dimensions, got ${embedding.length}`);
    }
    return `[${embedding.join(",")}]`;
}
