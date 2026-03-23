/**
 * Normalize Embeddings Edge Function
 *
 * Purpose: L2 normalize all embeddings from house_bills and store in modified_embeddings column.
 * This is needed for data visualizations that require unit-length vectors.
 *
 * Process:
 * 1. Fetch all rows with non-null embeddings
 * 2. L2 normalize each embedding (divide by Euclidean length)
 * 3. Store in modified_embeddings column (original embedding stays untouched)
 *
 * L2 Normalization: vector / ||vector||
 * Where ||vector|| = sqrt(sum of squared components)
 *
 * Environment Variables:
 * - SUPABASE_URL (auto-provided)
 * - SUPABASE_SERVICE_ROLE_KEY (auto-provided)
 */

import "@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "@supabase/supabase-js";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const BATCH_SIZE = 100;

/**
 * L2 normalize a vector (divide by Euclidean length)
 * Returns unit vector with magnitude 1
 */
function l2Normalize(vector: number[]): number[] {
  // Calculate L2 norm (Euclidean length)
  const sumSquares = vector.reduce((sum, val) => sum + val * val, 0);
  const l2Norm = Math.sqrt(sumSquares);

  // Avoid division by zero
  if (l2Norm === 0) {
    return vector;
  }

  // Divide each component by the L2 norm
  return vector.map(val => val / l2Norm);
}

/**
 * Parse embedding from DB format (could be string or array)
 */
function parseEmbedding(embedding: unknown): number[] | null {
  if (!embedding) return null;

  if (Array.isArray(embedding)) {
    return embedding as number[];
  }

  if (typeof embedding === "string") {
    try {
      // Handle PostgreSQL array format: [0.1,0.2,0.3]
      const parsed = JSON.parse(embedding);
      if (Array.isArray(parsed)) {
        return parsed as number[];
      }
    } catch {
      // Try parsing as PostgreSQL vector format: {0.1,0.2,0.3}
      try {
        const cleaned = embedding.replace(/[{}]/g, "");
        return cleaned.split(",").map(s => parseFloat(s.trim()));
      } catch {
        return null;
      }
    }
  }

  return null;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  const startTime = Date.now();

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Parse optional parameters
    const body = await req.json().catch(() => ({}));
    const dryRun = body.dryRun === true;
    const batchSize = typeof body.batchSize === "number" ? body.batchSize : BATCH_SIZE;

    // Count total rows with embeddings
    const { count: totalCount } = await supabase
      .from("house_bills")
      .select("*", { count: "exact", head: true })
      .not("embedding", "is", null);

    console.log("Found " + totalCount + " rows with embeddings to normalize");

    if (!totalCount || totalCount === 0) {
      return new Response(
        JSON.stringify({ message: "No rows with embeddings found" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    let processed = 0;
    let updated = 0;
    let errors = 0;
    const errorDetails: { id: string; error: string }[] = [];

    // Process in batches using pagination
    let lastId: string | null = null;

    while (processed < totalCount) {
      // Fetch batch
      let query = supabase
        .from("house_bills")
        .select("id, embedding")
        .not("embedding", "is", null)
        .order("id", { ascending: true })
        .limit(batchSize);

      if (lastId) {
        query = query.gt("id", lastId);
      }

      const { data: rows, error: fetchError } = await query;

      if (fetchError) {
        throw new Error("Fetch error: " + fetchError.message);
      }

      if (!rows || rows.length === 0) {
        break;
      }

      console.log("Processing batch: " + rows.length + " rows (total processed: " + processed + ")");

      // Process each row
      for (const row of rows) {
        const embedding = parseEmbedding(row.embedding);

        if (!embedding) {
          errors++;
          errorDetails.push({ id: row.id, error: "Could not parse embedding" });
          continue;
        }

        // L2 normalize
        const normalized = l2Normalize(embedding);

        if (!dryRun) {
          // Update the modified_embeddings column
          const { error: updateError } = await supabase
            .from("house_bills")
            .update({ modified_embeddings: JSON.stringify(normalized) })
            .eq("id", row.id);

          if (updateError) {
            errors++;
            errorDetails.push({ id: row.id, error: updateError.message });
          } else {
            updated++;
          }
        } else {
          updated++;
        }
      }

      processed += rows.length;
      lastId = rows[rows.length - 1].id;
    }

    const totalTime = Date.now() - startTime;

    console.log("=== NORMALIZATION COMPLETE ===");
    console.log("Processed: " + processed + ", Updated: " + updated + ", Errors: " + errors);
    console.log("Total time: " + totalTime + "ms");

    return new Response(
      JSON.stringify({
        summary: {
          totalRows: totalCount,
          processed,
          updated,
          errors,
          totalTimeMs: totalTime,
          dryRun,
        },
        errorDetails: errorDetails.slice(0, 50),
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
