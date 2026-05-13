import type { BillWriteBackend } from "./bill-write.ts";
import type { SupabaseDb } from "./supabase-client.ts";

export function makeBillWriteBackend(supabase: SupabaseDb): BillWriteBackend {
    return {
        upsertRepresentatives: async (reps) => {
            const result = await supabase
                .from("representatives")
                .upsert(reps, { onConflict: "bioguide_id" });
            return { error: result.error };
        },
        upsertHouseBill: async (bill) => {
            const result = await supabase
                .from("house_bills_2")
                .upsert(bill, { onConflict: "congress,bill_type,bill_number" });
            return { error: result.error };
        },
    };
}
