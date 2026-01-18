/**
 * Calculate Subcategory Scores Edge Function
 * 
 * Purpose: Computes cosine similarity scores between bill embeddings and
 * subcategory embeddings, storing results in subcategory_scores JSONB column.
 * 
 * Pipeline Position: After generate-bill-embeddings, before pipeline complete.
 * 
 * Flow:
 * 1. Fetch subcategories from categories_embeddings (grouped by bill_type).
 * 2. Query house_bills WHERE subcategory_scores IS NULL AND embedding IS NOT NULL AND category IS NOT NULL.
 * 3. For each bill, compute cosine similarity against its category's subcategories.
 * 4. Store result as JSONB in subcategory_scores column.
 * 5. If more NULL subcategory_scores exist -> trigger self via pg_net.
 * 6. If done -> send pipeline complete Discord notification.
 * 
 * NOTE: verify_jwt is FALSE because this function is called internally
 * by pg_net from other Edge Functions. It is NOT meant to be called
 * directly by end users.
 */

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const BATCH_SIZE = 50; // Process 50 bills per invocation

interface Subcategory {
  subcategory: string;
  bill_type: string;
  embedding: number[];
}

interface BillForScoring {
  id: string;
  legislation_number: string;
  category: string;
  embedding: number[];
}

type SupabaseClient = ReturnType<typeof createClient>;

type NotificationType = "progress" | "pipeline_complete" | "error";

async function sendDiscordNotification(
  webhookUrl: string,
  type: NotificationType,
  data: {
    processed?: number;
    scored?: number;
    skipped?: number;
    remaining?: number;
    error?: string;
    stage?: string;
  }
): Promise<void> {
  let embed;
  
  switch (type) {
    case "progress":
      embed = {
        title: "📊 Subcategory Scorer Progress",
        color: 3447003, // Blue
        fields: [
          { name: "Processed", value: `${data.processed} bills`, inline: true },
          { name: "Scored", value: `${data.scored} bills`, inline: true },
          { name: "Skipped", value: `${data.skipped} (no matching subcats)`, inline: true },
          { name: "Remaining", value: `${data.remaining} without scores`, inline: true },
        ],
        timestamp: new Date().toISOString(),
      };
      break;
    case "pipeline_complete":
      embed = {
        title: "✅ Daily Bill Sync Complete",
        color: 5763719, // Green
        fields: [
          { name: "Status", value: "All bills processed, categorized, embedded, and scored", inline: false },
          { name: "Pipeline", value: "Collector → Data Fetcher → Categorizer → Embedder → Subcategory Scorer ✓", inline: false },
        ],
        footer: {
          text: "Pipeline will run again at next scheduled time",
        },
        timestamp: new Date().toISOString(),
      };
      break;
    case "error":
      embed = {
        title: "🚨 Subcategory Scorer Error",
        color: 15158332, // Red
        fields: [
          { name: "Stage", value: data.stage || "unknown", inline: true },
          { name: "Error", value: (data.error || "Unknown").substring(0, 1000), inline: false },
        ],
        timestamp: new Date().toISOString(),
      };
      break;
  }

  await fetch(webhookUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ embeds: [embed] }),
  }).catch(console.error);
}

async function triggerNextStep(supabase: SupabaseClient, functionName: string): Promise<void> {
  const projectUrl = Deno.env.get("SUPABASE_URL") ?? "";
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  
  await supabase.rpc("trigger_next_step_internal", {
    p_project_url: projectUrl,
    p_service_role_key: serviceRoleKey,
    p_function_name: functionName,
  });
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
    if (subcat.embedding.length > 0) {
      scores[subcat.subcategory] = cosineSimilarity(billEmbedding, subcat.embedding);
    }
  }

  return scores;
}

Deno.serve(async (_req: Request) => {
  let currentStage = "init";
  let discordUrl = "";

  try {
    // Stage: Initialize
    currentStage = "init_env_vars";
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    discordUrl = Deno.env.get("DISCORD_WEBHOOK_URL") ?? "";

    if (!supabaseUrl || !supabaseKey) {
      throw new Error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY env vars");
    }

    currentStage = "init_supabase_client";
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Stage: Fetch all subcategories with embeddings
    currentStage = "fetch_subcategories";
    const { data: subcatData, error: subcatError } = await supabase
      .from("categories_embeddings")
      .select("subcategory, bill_type, embedding");

    if (subcatError) {
      throw new Error("Failed to fetch subcategories: " + subcatError.message);
    }

    if (!subcatData || subcatData.length === 0) {
      console.log("No subcategories found in categories_embeddings. Skipping scoring.");
      
      if (discordUrl) {
        await sendDiscordNotification(discordUrl, "pipeline_complete", {});
      }
      
      return new Response(JSON.stringify({
        success: true,
        message: "No subcategories to score against - pipeline complete",
      }), { headers: { "Content-Type": "application/json" } });
    }

    // Parse embeddings and group by category (bill_type)
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

    console.log("=== SUBCATEGORY SCORER ===" );
    console.log("Loaded " + subcatData.length + " subcategories across " + Object.keys(subcatsByCategory).length + " categories");

    // Stage: Fetch bills with NULL subcategory_scores
    currentStage = "fetch_unscored_bills";
    const { data: bills, error: billsError } = await supabase
      .from("house_bills")
      .select("id, legislation_number, category, embedding")
      .is("subcategory_scores", null)
      .not("embedding", "is", null)
      .not("category", "is", null)
      .limit(BATCH_SIZE);

    if (billsError) {
      throw new Error("Failed to fetch bills: " + billsError.message);
    }

    if (!bills || bills.length === 0) {
      console.log("No bills to score. Pipeline complete!");
      
      if (discordUrl) {
        await sendDiscordNotification(discordUrl, "pipeline_complete", {});
      }
      
      return new Response(JSON.stringify({
        success: true,
        message: "Pipeline complete - all bills scored",
      }), { headers: { "Content-Type": "application/json" } });
    }

    console.log("Processing " + bills.length + " bills...");
    console.log("Bills to score:");
    for (const b of bills) {
      console.log("  - " + b.legislation_number + " (category: " + b.category + ")");
    }

    // Stage: Calculate scores and update database
    currentStage = "calculate_and_update_scores";
    let scored = 0;
    let skipped = 0;

    for (const bill of bills) {
      const billEmbedding = parseEmbedding(bill.embedding);
      
      if (billEmbedding.length === 0) {
        console.warn("Bill " + bill.legislation_number + " has invalid embedding, skipping");
        skipped++;
        continue;
      }

      const categorySubcats = subcatsByCategory[bill.category];
      
      if (!categorySubcats || categorySubcats.length === 0) {
        console.warn("No subcategories found for category: " + bill.category + " (bill: " + bill.legislation_number + ")");
        // Set empty scores so we don't keep retrying
        const { error: updateError } = await supabase
          .from("house_bills")
          .update({ subcategory_scores: {} })
          .eq("id", bill.id);
        
        if (updateError) {
          console.error("Failed to update bill " + bill.legislation_number + ": " + updateError.message);
        }
        skipped++;
        continue;
      }

      const scores = calculateScores(billEmbedding, categorySubcats);
      
      const { error: updateError } = await supabase
        .from("house_bills")
        .update({ subcategory_scores: scores })
        .eq("id", bill.id);

      if (updateError) {
        console.error("Failed to update bill " + bill.legislation_number + ": " + updateError.message);
      } else {
        console.log("✅ Scored: " + bill.legislation_number + " -> " + Object.keys(scores).length + " subcategories");
        scored++;
      }
    }

    console.log("=== BATCH RESULTS ===");
    console.log("Scored: " + scored);
    console.log("Skipped: " + skipped);
    console.log("=== END RESULTS ===");

    // Stage: Check remaining work
    currentStage = "count_remaining_unscored";
    const { count, error: countError } = await supabase
      .from("house_bills")
      .select("*", { count: "exact", head: true })
      .is("subcategory_scores", null)
      .not("embedding", "is", null)
      .not("category", "is", null);

    if (countError) {
      throw new Error("Failed to count remaining bills: " + countError.message);
    }

    const remaining = count || 0;

    // Stage: Send Discord notification and trigger next step
    currentStage = "send_notification_and_trigger";
    if (remaining > 0) {
      console.log(remaining + " bills still need scoring. Triggering self.");
      
      if (discordUrl) {
        await sendDiscordNotification(discordUrl, "progress", {
          processed: bills.length,
          scored,
          skipped,
          remaining,
        });
      }
      
      await triggerNextStep(supabase, "calculate-subcategory-scores");
    } else {
      console.log("All bills scored. Pipeline complete!");
      
      if (discordUrl) {
        await sendDiscordNotification(discordUrl, "pipeline_complete", {});
      }
    }

    return new Response(JSON.stringify({
      success: true,
      processed: bills.length,
      scored,
      skipped,
      remaining,
    }), { headers: { "Content-Type": "application/json" } });

  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    const fullError = "[" + currentStage + "] " + errorMsg;
    console.error("Subcategory Scorer error:", fullError);
    
    if (discordUrl) {
      await sendDiscordNotification(discordUrl, "error", { 
        error: errorMsg,
        stage: currentStage,
      });
    }

    return new Response(JSON.stringify({ 
      error: errorMsg,
      stage: currentStage,
      function: "calculate-subcategory-scores"
    }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
});
