/**
 * Calculate Subcategory Scores Edge Function
 * 
 * Purpose: Pre-compute cosine similarity scores between bill embeddings and
 * subcategory embeddings, storing results in a JSONB column for fast client access.
 * 
 * Process:
 * 1. Fetch all subcategories with embeddings from categories_embeddings
 * 2. Group subcategories by bill_type (category)
 * 3. Fetch bills (in batches) that have embeddings and category set
 * 4. For each bill, compute cosine similarity against its category's subcategories
 * 5. Store result as JSONB in subcategory_scores column
 * 
 * Parameters:
 * - batchSize: Number of bills to process per DB update batch (default: 100)
 * - maxBills: Maximum total bills to process per invocation (default: 500, keep low to avoid WORKER_LIMIT)
 * - offset: Starting offset for pagination (default: 0) - use to manually paginate through bills
 * - dryRun: If true, compute but don't update DB
 * - onlyMissing: If true, only process bills where subcategory_scores IS NULL
 * 
 * Invoke via Postman:
 * POST https://<project>.supabase.co/functions/v1/calculate-subcategory-scores
 * Headers: Authorization: Bearer <anon-key>
 * Body: { "batchSize": 100, "maxBills": 5000 }
 */

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Default settings
const DEFAULT_BATCH_SIZE = 100;
const DEFAULT_MAX_BILLS = 500;

interface Subcategory {
    subcategory: string;
    bill_type: string;
    embedding: number[];
}

interface Bill {
    id: string;
    legislation_number: string;
    category: string;
    embedding: number[];
}

/**
 * Parse embedding from string or array format
 */
function parseEmbedding(embedding: string | number[] | null): number[] {
    if (!embedding) return [];
    if (Array.isArray(embedding)) return embedding;
    if (typeof embedding === "string") {
        try {
            return JSON.parse(embedding);
        } catch {
            return [];
        }
    }
    return [];
}

/**
 * Compute cosine similarity between two vectors
 * Returns value normalized to [0, 1] range
 */
function cosineSimilarity(vec1: number[], vec2: number[]): number {
    if (vec1.length !== vec2.length || vec1.length === 0) return 0;

    let dotProduct = 0;
    let norm1 = 0;
    let norm2 = 0;

    for (let i = 0; i < vec1.length; i++) {
        dotProduct += vec1[i] * vec2[i];
        norm1 += vec1[i] * vec1[i];
        norm2 += vec2[i] * vec2[i];
    }

    const magnitude = Math.sqrt(norm1) * Math.sqrt(norm2);
    if (magnitude === 0) return 0;

    const similarity = dotProduct / magnitude;
    // Normalize from [-1, 1] to [0, 1]
    return (similarity + 1) / 2;
}

/**
 * Calculate subcategory scores for a bill
 */
function calculateScores(
    billEmbedding: number[],
    subcategories: Subcategory[]
): Record<string, number> {
    const scores: Record<string, number> = {};

    for (const subcat of subcategories) {
        const subcatEmbedding = parseEmbedding(subcat.embedding);
        if (subcatEmbedding.length > 0) {
            scores[subcat.subcategory] = cosineSimilarity(billEmbedding, subcatEmbedding);
        }
    }

    return scores;
}

Deno.serve(async (req: Request) => {
    if (req.method === "OPTIONS") {
        return new Response("ok", { headers: corsHeaders });
    }

    const startTime = Date.now();

    try {
        const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
        const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";

        if (!supabaseUrl || !supabaseKey) {
            return new Response(
                JSON.stringify({ error: "Supabase credentials not configured" }),
                { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
            );
        }

        const supabase = createClient(supabaseUrl, supabaseKey);
        const body = await req.json().catch(() => ({}));

        const batchSize = typeof body.batchSize === "number" ? body.batchSize : DEFAULT_BATCH_SIZE;
        const maxBills = typeof body.maxBills === "number" ? body.maxBills : DEFAULT_MAX_BILLS;
        const offset = typeof body.offset === "number" ? body.offset : 0;
        const dryRun = body.dryRun === true;
        const onlyMissing = body.onlyMissing !== false; // Default to true

        console.log(`Starting subcategory score calculation (batchSize: ${batchSize}, maxBills: ${maxBills}, offset: ${offset}, dryRun: ${dryRun}, onlyMissing: ${onlyMissing})`);

        // 1. Fetch all subcategories with embeddings
        const { data: subcatData, error: subcatError } = await supabase
            .from("categories_embeddings")
            .select("subcategory, bill_type, embedding");

        if (subcatError) {
            throw new Error("Failed to fetch subcategories: " + subcatError.message);
        }

        if (!subcatData || subcatData.length === 0) {
            return new Response(
                JSON.stringify({ error: "No subcategories found in categories_embeddings" }),
                { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
            );
        }

        // Parse embeddings and group by category
        const subcatsByCategory: Record<string, Subcategory[]> = {};
        for (const subcat of subcatData) {
            const parsed: Subcategory = {
                subcategory: subcat.subcategory,
                bill_type: subcat.bill_type,
                embedding: parseEmbedding(subcat.embedding),
            };

            if (!subcatsByCategory[subcat.bill_type]) {
                subcatsByCategory[subcat.bill_type] = [];
            }
            subcatsByCategory[subcat.bill_type].push(parsed);
        }

        console.log(`Loaded ${subcatData.length} subcategories across ${Object.keys(subcatsByCategory).length} categories`);

        // 2. Build query for bills
        let query = supabase
            .from("house_bills")
            .select("id, legislation_number, category, embedding")
            .not("category", "is", null)
            .not("embedding", "is", null);

        if (onlyMissing) {
            query = query.is("subcategory_scores", null);
        }

        // Apply offset and limit using .range()
        query = query.range(offset, offset + maxBills - 1);

        const { data: billsData, error: billsError } = await query;

        if (billsError) {
            throw new Error("Failed to fetch bills: " + billsError.message);
        }

        if (!billsData || billsData.length === 0) {
            return new Response(
                JSON.stringify({
                    message: "No bills to process",
                    note: onlyMissing ? "All bills already have subcategory_scores" : "No bills found"
                }),
                { headers: { ...corsHeaders, "Content-Type": "application/json" } }
            );
        }

        console.log(`Processing ${billsData.length} bills...`);

        // 3. Process bills in batches
        let processed = 0;
        let updated = 0;
        let skipped = 0;
        let errors = 0;
        const errorDetails: { legNum: string; error: string }[] = [];

        for (let i = 0; i < billsData.length; i += batchSize) {
            const batch = billsData.slice(i, i + batchSize);
            const updates: { id: string; subcategory_scores: Record<string, number> }[] = [];

            for (const bill of batch) {
                processed++;

                const billEmbedding = parseEmbedding(bill.embedding);
                if (billEmbedding.length === 0) {
                    skipped++;
                    continue;
                }

                const categorySubcats = subcatsByCategory[bill.category];
                if (!categorySubcats || categorySubcats.length === 0) {
                    skipped++;
                    continue;
                }

                const scores = calculateScores(billEmbedding, categorySubcats);
                updates.push({ id: bill.id, subcategory_scores: scores });
            }

            // Batch update to DB
            if (!dryRun && updates.length > 0) {
                for (const update of updates) {
                    const { error: updateError } = await supabase
                        .from("house_bills")
                        .update({ subcategory_scores: update.subcategory_scores })
                        .eq("id", update.id);

                    if (updateError) {
                        errors++;
                        if (errorDetails.length < 20) {
                            errorDetails.push({ legNum: update.id, error: updateError.message });
                        }
                    } else {
                        updated++;
                    }
                }
            } else if (dryRun) {
                updated += updates.length;
            }

            // Progress log every 500 bills
            if (processed % 500 === 0) {
                console.log(`Progress: ${processed}/${billsData.length} bills processed`);
            }
        }

        // Get count of remaining bills with NULL subcategory_scores
        const { count: remainingNulls } = await supabase
            .from("house_bills")
            .select("*", { count: "exact", head: true })
            .not("category", "is", null)
            .not("embedding", "is", null)
            .is("subcategory_scores", null);

        const totalTime = Date.now() - startTime;

        console.log(`=== SUBCATEGORY SCORE CALCULATION COMPLETE ===`);
        console.log(`Processed: ${processed}, Updated: ${updated}, Skipped: ${skipped}, Errors: ${errors}`);
        console.log(`Remaining NULL subcategory_scores: ${remainingNulls}`);
        console.log(`Total time: ${totalTime}ms`);

        return new Response(
            JSON.stringify({
                summary: {
                    totalProcessed: processed,
                    totalUpdated: updated,
                    totalSkipped: skipped,
                    totalErrors: errors,
                    offset: offset,
                    nextOffset: offset + maxBills,
                    remainingNulls: remainingNulls ?? 0,
                    totalTimeMs: totalTime,
                    dryRun,
                    onlyMissing,
                },
                categoryCounts: Object.fromEntries(
                    Object.entries(subcatsByCategory).map(([cat, subs]) => [cat, subs.length])
                ),
                errors: errorDetails,
            }),
            { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );

    } catch (error) {
        const errorMessage = error instanceof Error ? error.message : "Unknown error";
        console.error("Fatal error:", errorMessage);
        return new Response(
            JSON.stringify({ error: errorMessage }),
            { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
    }
});
