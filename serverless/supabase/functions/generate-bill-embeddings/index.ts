/**
 * Generate Bill Embeddings Edge Function
 * 
 * Purpose: Finds bills with NULL embedding (and non-NULL category),
 * generates embeddings via OpenRouter, and updates the database.
 * 
 * Flow:
 * 1. Query house_bills WHERE embedding IS NULL AND category IS NOT NULL.
 * 2. Generate embeddings via OpenRouter.
 * 3. Update the embedding column.
 * 4. If more NULL embeddings exist -> trigger self via pg_net.
 * 5. If done -> send pipeline complete Discord notification.
 */

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const OPENROUTER_API_URL = "https://openrouter.ai/api/v1/embeddings";
const EMBEDDING_MODEL = "openai/text-embedding-3-small";
const EMBEDDING_DIMENSIONS = 1536;
const BATCH_SIZE = 20;

interface BillForEmbedding {
  id: number;
  legislation_number: string;
  title: string;
  committees: string | null;
  latest_summary: string | null;
}

type SupabaseClient = ReturnType<typeof createClient>;

type NotificationType = "progress" | "pipeline_complete" | "error";

async function sendDiscordNotification(
  webhookUrl: string,
  type: NotificationType,
  data: {
    processed?: number;
    embedded?: number;
    remaining?: number;
    error?: string;
    stage?: string;
  }
): Promise<void> {
  let embed;
  
  switch (type) {
    case "progress":
      embed = {
        title: "🧮 Embedder Progress",
        color: 3447003, // Blue
        fields: [
          { name: "Processed", value: `${data.processed} bills`, inline: true },
          { name: "Embedded", value: `${data.embedded} bills`, inline: true },
          { name: "Remaining", value: `${data.remaining} without embeddings`, inline: true },
        ],
        timestamp: new Date().toISOString(),
      };
      break;
    case "pipeline_complete":
      embed = {
        title: "✅ Daily Bill Sync Complete",
        color: 5763719, // Green
        fields: [
          { name: "Status", value: "All bills processed, categorized, and embedded", inline: false },
          { name: "Pipeline", value: "Collector → Data Fetcher → Categorizer → Embedder ✓", inline: false },
        ],
        footer: {
          text: "Pipeline will run again at next scheduled time",
        },
        timestamp: new Date().toISOString(),
      };
      break;
    case "error":
      embed = {
        title: "🚨 Embedder Error",
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

function cleanHtml(text: string): string {
  if (!text) return "";
  return text.replace(/<[^>]*>/g, "").replace(/&nbsp;/g, " ").replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'").replace(/\s+/g, " ").trim();
}

function createEmbeddingText(bill: BillForEmbedding): string {
  const parts: string[] = [];
  if (bill.title) parts.push(bill.title);
  if (bill.committees) parts.push(`Committees: ${bill.committees}`);
  if (bill.latest_summary) {
    const cleanSummary = cleanHtml(bill.latest_summary);
    if (cleanSummary) parts.push(`Summary: ${cleanSummary.substring(0, 2000)}`);
  }
  return parts.join("\n\n");
}

async function generateEmbeddings(
  texts: string[],
  apiKey: string
): Promise<number[][]> {
  const response = await fetch(OPENROUTER_API_URL, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      "HTTP-Referer": "https://cruzhacks-environmental-transparency.vercel.app",
      "X-Title": "Environmental Transparency - Embedder",
    },
    body: JSON.stringify({
      model: EMBEDDING_MODEL,
      input: texts,
      dimensions: EMBEDDING_DIMENSIONS,
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`OpenRouter error: ${response.status} - ${error}`);
  }

  const data = await response.json();
  const sorted = data.data.sort((a: { index: number }, b: { index: number }) => a.index - b.index);
  return sorted.map((item: { embedding: number[] }) => item.embedding);
}

Deno.serve(async (req: Request) => {
  let currentStage = "init";
  let discordUrl = "";

  try {
    // Stage: Initialize
    currentStage = "init_env_vars";
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    const openRouterKey = Deno.env.get("OPENROUTER_API_KEY");
    discordUrl = Deno.env.get("DISCORD_WEBHOOK_URL") ?? "";

    if (!supabaseUrl || !supabaseKey) {
      throw new Error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY env vars");
    }
    if (!openRouterKey) {
      throw new Error("Missing OPENROUTER_API_KEY env var");
    }

    currentStage = "init_supabase_client";
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Stage: Fetch bills with NULL embedding (and non-NULL category)
    currentStage = "fetch_unembedded_bills";
    const { data: bills, error: fetchError } = await supabase
      .from("house_bills")
      .select("id, legislation_number, title, committees, latest_summary")
      .is("embedding", null)
      .not("category", "is", null)
      .limit(BATCH_SIZE);

    if (fetchError) {
      throw new Error(`Failed to fetch bills: ${fetchError.message}`);
    }

    if (!bills || bills.length === 0) {
      console.log("No bills to embed. Pipeline complete!");
      
      if (discordUrl) {
        await sendDiscordNotification(discordUrl, "pipeline_complete", {});
      }
      
      return new Response(JSON.stringify({
        success: true,
        message: "Pipeline complete - all bills embedded",
      }), { headers: { "Content-Type": "application/json" } });
    }

    console.log(`Generating embeddings for ${bills.length} bills...`);

    // Stage: Create embedding texts
    currentStage = "create_embedding_texts";
    const texts = bills.map(createEmbeddingText);

    // Stage: Generate embeddings via OpenRouter
    currentStage = "call_openrouter_embeddings_api";
    const embeddings = await generateEmbeddings(texts, openRouterKey);
    console.log(`Generated ${embeddings.length} embeddings`);

    // Stage: Update database
    currentStage = "update_embeddings_in_db";
    let updated = 0;
    for (let i = 0; i < bills.length; i++) {
      const { error: updateError } = await supabase
        .from("house_bills")
        .update({ embedding: JSON.stringify(embeddings[i]) })
        .eq("id", bills[i].id);

      if (!updateError) updated++;
    }

    console.log(`Updated ${updated} bills with embeddings`);

    // Stage: Check remaining work
    currentStage = "count_remaining_unembedded";
    const { count, error: countError } = await supabase
      .from("house_bills")
      .select("*", { count: "exact", head: true })
      .is("embedding", null)
      .not("category", "is", null);

    if (countError) {
      throw new Error(`Failed to count remaining bills: ${countError.message}`);
    }

    const remaining = count || 0;

    // Stage: Send Discord notification and trigger next step
    currentStage = "send_notification_and_trigger";
    if (remaining > 0) {
      console.log(`${remaining} bills still need embeddings. Triggering self.`);
      
      if (discordUrl) {
        await sendDiscordNotification(discordUrl, "progress", {
          processed: bills.length,
          embedded: updated,
          remaining,
        });
      }
      
      await triggerNextStep(supabase, "generate-bill-embeddings");
    } else {
      console.log("All bills embedded. Pipeline complete!");
      
      if (discordUrl) {
        await sendDiscordNotification(discordUrl, "pipeline_complete", {});
      }
    }

    return new Response(JSON.stringify({
      success: true,
      processed: bills.length,
      updated,
      remaining,
    }), { headers: { "Content-Type": "application/json" } });

  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    const fullError = `[${currentStage}] ${errorMsg}`;
    console.error("Embedder error:", fullError);
    
    if (discordUrl) {
      await sendDiscordNotification(discordUrl, "error", { 
        error: errorMsg,
        stage: currentStage,
      });
    }

    return new Response(JSON.stringify({ 
      error: errorMsg,
      stage: currentStage,
      function: "generate-bill-embeddings"
    }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
});
