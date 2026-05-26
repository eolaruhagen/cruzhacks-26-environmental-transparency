import type { Database } from "@cruzhacks/shared";
import type { SupabaseDb } from "../runtime/supabase-client.ts";
import type {
    CandidateBillRow,
    CitedReferenceUpsert,
    ReferencesBackend,
} from "./bill-references.ts";

type CitedReferenceInsert =
    Database["public"]["Tables"]["cited_references"]["Insert"];

export function makeReferencesBackend(supabase: SupabaseDb): ReferencesBackend {
    return {
        fetchCandidates: async (batchSize) => {
            // RPC isn't in the regenerated Database types yet (migration not
            // applied at code-gen time). Cast erases the strict RPC-name union
            // until `gen types` is rerun post-migration.
            const { data, error } = await (supabase.rpc as unknown as (
                name: string,
                args: Record<string, unknown>,
            ) => Promise<{
                data: CandidateBillRow[] | null;
                error: { message: string } | null;
            }>)("fetch_reference_candidates", { batch_size: batchSize });
            return {
                data: data ?? null,
                error: error ? { message: error.message } : null,
            };
        },
        upsertCitedReferences: async (rows) => {
            // CitedReferenceUpsert.normalized is Record<string, unknown>, which is structurally
            // a subset of the generated Json recursive type but TS can't prove it. Safe at
            // runtime because Python only emits primitives + nested dicts/arrays.
            const payload = rows as unknown as CitedReferenceInsert[];
            const { data, error } = await supabase
                .from("cited_references")
                .upsert(payload, { onConflict: "kind,normalized_key" })
                .select("id, kind, normalized_key");
            return {
                data:
                    (data as
                        | {
                            id: string;
                            kind: CitedReferenceUpsert["kind"];
                            normalized_key: string;
                        }[]
                        | null) ?? null,
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
