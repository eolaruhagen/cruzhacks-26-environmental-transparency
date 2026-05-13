import type { Database } from "../../../packages/shared/src/database.types.ts";
import type {
    BillEnrichmentWrite,
    BillFetchBackend,
    SubcategoryEmbeddingRow,
} from "./bill-fetch.ts";
import type { SupabaseDb } from "./supabase-client.ts";

function serializeHalfvec(v: number[]): string {
    return `[${v.join(",")}]`;
}

function parseHalfvecText(s: string): number[] {
    const inner = s.startsWith("[") && s.endsWith("]") ? s.slice(1, -1) : s;
    if (inner.length === 0) return [];
    return inner.split(",").map((x) => parseFloat(x));
}

export function makeBillFetchBackend(supabase: SupabaseDb): BillFetchBackend {
    return {
        fetchUnenrichedBills: async (batchSize) => {
            const { data, error } = await supabase
                .from("house_bills_2")
                .select(
                    "id, congress, bill_type, bill_number, title, latest_summary, subject_terms, bill_policy_area, bill_text",
                )
                .is("category", null)
                .is("last_categorization_attempt_at", null)
                .order("created_at")
                .limit(batchSize);
            return {
                data: data ?? null,
                error: error ? { message: error.message } : null,
            };
        },
        fetchCorpusMean: async (artifactType) => {
            const { data, error } = await supabase.rpc("get_corpus_mean", {
                p_type: artifactType as Database["public"]["Enums"]["artifact_type"],
            });
            return {
                data: (data as number[] | null) ?? null,
                error: error ? { message: error.message } : null,
            };
        },
        writeEnrichment: async (id, payload: BillEnrichmentWrite) => {
            const update: Database["public"]["Tables"]["house_bills_2"]["Update"] = {};
            if (payload.category !== undefined) update.category = payload.category;
            if (payload.embedding !== undefined) {
                update.embedding = serializeHalfvec(payload.embedding) as unknown as Database["public"]["Tables"]["house_bills_2"]["Update"]["embedding"];
            }
            if (payload.subcategory_scores !== undefined) {
                update.subcategory_scores = payload.subcategory_scores;
            }
            const { error } = await supabase
                .from("house_bills_2")
                .update(update)
                .eq("id", id);
            return { error: error ? { message: error.message } : null };
        },
        markInsufficientInfo: async (id, reason) => {
            const { error } = await supabase
                .from("house_bills_2")
                .update({
                    last_categorization_attempt_at: new Date().toISOString(),
                    last_categorization_reason: reason,
                })
                .eq("id", id);
            return { error: error ? { message: error.message } : null };
        },
        fetchSubcategoryEmbeddings: async (billType) => {
            const { data, error } = await supabase
                .from("categories_embeddings")
                .select("subcategory, embedding")
                .eq("bill_type", billType as Database["public"]["Enums"]["bill_type"]);
            if (error) {
                return { data: null, error: { message: error.message } };
            }
            const parsed: SubcategoryEmbeddingRow[] = (data ?? []).map(
                (row) => ({
                    subcategory: row.subcategory,
                    embedding: parseHalfvecText(row.embedding as string),
                }),
            );
            return { data: parsed, error: null };
        },
    };
}
