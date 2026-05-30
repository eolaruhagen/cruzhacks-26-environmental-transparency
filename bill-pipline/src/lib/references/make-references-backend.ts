import type { SupabaseDb } from "../runtime/supabase-client.ts";
import type { ReferencesBackend } from "./bill-references.ts";

export function makeReferencesBackend(supabase: SupabaseDb): ReferencesBackend {
    return {
        fetchCandidates: async (batchSize) => {
            const { data, error } = await supabase.rpc(
                "fetch_reference_candidates",
                { batch_size: batchSize },
            );
            return {
                data: data ?? null,
                error: error ? { message: error.message } : null,
            };
        },
        upsertCitedReferences: async (rows) => {
            const { data, error } = await supabase
                .from("cited_references")
                .upsert(rows, { onConflict: "kind,normalized_key" })
                .select("id, kind, normalized_key");
            return {
                data: data ?? null,
                error: error ? { message: error.message } : null,
            };
        },
        deleteBillReferences: async (billId) => {
            const { error } = await supabase
                .from("bill_references")
                .delete()
                .eq("bill_id", billId);
            return { error: error ? { message: error.message } : null };
        },
        insertBillReferences: async (billId, rows) => {
            const payload = rows.map((r) => ({ bill_id: billId, ...r }));
            const { error } = await supabase
                .from("bill_references")
                .insert(payload);
            return { error: error ? { message: error.message } : null };
        },
        markExtracted: async (billId) => {
            const { error } = await supabase
                .from("house_bills_2")
                .update({ references_extracted_at: new Date().toISOString() })
                .eq("id", billId);
            return { error: error ? { message: error.message } : null };
        },
    };
}
