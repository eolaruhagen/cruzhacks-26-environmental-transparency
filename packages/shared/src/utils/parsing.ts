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

/**
 * Convert a number array (vector) to a string for Supabase.
 */
export function formatEmbedding(embedding: number[], dims?: number): string {
    if (dims !== undefined && embedding.length !== dims) {
        throw new Error(`formatEmbedding: expected ${dims} dimensions, got ${embedding.length}`);
    }
    return `[${embedding.join(",")}]`;
}

function cleanHtml(text: string): string {
    if (!text) return "";
    return text.replace(/<[^>]*>/g, "").replace(/&nbsp;/g, " ").replace(/&amp;/g, "&")
        .replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"')
        .replace(/&#39;/g, "'").replace(/\s+/g, " ").trim();
}
