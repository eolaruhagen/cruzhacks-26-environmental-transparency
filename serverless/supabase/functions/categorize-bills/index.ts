/**
 * Categorize Bills Edge Function
 * 
 * Purpose: Finds bills with NULL category, sends them to Gemini for categorization,
 * and updates the database. Uses a loop pattern to process in batches.
 * 
 * Flow:
 * 1. Query house_bills WHERE category IS NULL (limit BATCH_SIZE).
 * 2. Send to Gemini via OpenRouter for categorization.
 * 3. Update the category column (or delete if "no_category").
 * 4. If more NULL categories exist -> trigger self via pg_net.
 * 5. If done -> trigger generate-bill-embeddings.
 * 6. Send Discord notification on progress/completion/failure.
 * 
 * NOTE: verify_jwt is FALSE because this function is called internally
 * by pg_net from other Edge Functions. It is NOT meant to be called
 * directly by end users.
 * 
 * "no_category" handling:
 * - If a bill doesn't have enough info (no title, no summary), the model
 *   can return "no_category" instead of forcing a wrong categorization.
 * - Bills with "no_category" are DELETED from house_bills so they can be
 *   re-fetched and processed again when Congress updates them with more info.
 */

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const OPENROUTER_API_URL = "https://openrouter.ai/api/v1/chat/completions";
const CATEGORIZATION_MODEL = "google/gemini-2.5-flash-lite";
const BATCH_SIZE = 10;

const CATEGORIES = [
  "Air Quality & Emissions",
  "Water Resources & Quality",
  "Land & Wildlife Conservation",
  "Climate Change & Energy",
  "Waste & Pollution Control",
  "Environmental Justice",
  "Agriculture & Food Systems",
  "Infrastructure & Development",
  "Public Health & Environment",
  "Other Environmental",
];

// Map human-readable categories to database enum values
const CATEGORY_TO_ENUM: Record<string, string> = {
  "Air Quality & Emissions": "air_and_atmosphere",
  "Water Resources & Quality": "water_resources",
  "Land & Wildlife Conservation": "land_and_conservation",
  "Climate Change & Energy": "climate_and_emissions",
  "Waste & Pollution Control": "waste_and_toxics",
  "Environmental Justice": "justice_and_environment",
  "Agriculture & Food Systems": "energy_and_resources", // Best fit for agriculture/food systems
  "Infrastructure & Development": "energy_and_resources", // Best fit for infrastructure
  "Public Health & Environment": "justice_and_environment", // Best fit for public health
  "Other Environmental": "energy_and_resources", // Default catchall
};

// Special category for bills without enough info
const NO_CATEGORY = "no_category";

interface BillForCategorization {
  id: string;
  legislation_number: string;
  title: string;
  committees: string | null;
  latest_summary: string | null;
}

interface CategorizationResult {
  // Model returns legislation_number as the identifier (e.g., "H.R. 123 (119)")
  // This is more reliable than UUIDs which are prone to hallucination
  categories: { legislation_number: string; category: string }[];
  prompt: string;
  rawResponse: string;
  fullApiResponse: unknown;
}

type SupabaseClient = ReturnType<typeof createClient>;

type NotificationType = "progress" | "complete" | "error";

async function sendDiscordNotification(
  webhookUrl: string,
  type: NotificationType,
  data: {
    processed?: number;
    categorized?: number;
    skipped?: number;
    skippedPct?: string;
    missing?: number;
    missingPct?: string;
    remaining?: number;
    skippedBills?: string[];
    missingBills?: string[];
    error?: string;
    stage?: string;
    prompt?: string;
    modelResponse?: string;
  }
): Promise<void> {
  // deno-lint-ignore no-explicit-any
  const embeds: any[] = [];
  const totalRemoved = (data.skipped || 0) + (data.missing || 0);
  
  switch (type) {
    case "progress":
      embeds.push({
        title: "🏷️ Categorizer Progress",
        color: 3447003, // Blue
        fields: [
          { name: "Processed", value: `${data.processed} bills`, inline: true },
          { name: "Categorized", value: `${data.categorized} bills`, inline: true },
          { name: "Skipped (no_category)", value: `${data.skipped} (${data.skippedPct})`, inline: true },
          { name: "Missing (loop prevention)", value: `${data.missing || 0} (${data.missingPct || "0%"})`, inline: true },
          { name: "Total Removed", value: `${totalRemoved} bills`, inline: true },
          { name: "Remaining", value: `${data.remaining} uncategorized`, inline: true },
        ],
        timestamp: new Date().toISOString(),
      });
      
      // If there are skipped bills, show them
      if (data.skippedBills && data.skippedBills.length > 0) {
        embeds.push({
          title: "⏭️ Skipped Bills (Insufficient Info)",
          color: 16776960, // Yellow
          description: data.skippedBills.slice(0, 20).join("\n").substring(0, 4000),
          footer: data.skippedBills.length > 20 
            ? { text: `... and ${data.skippedBills.length - 20} more` }
            : undefined,
        });
      }
      
      // If there are missing bills (model didn't return them), show them
      if (data.missingBills && data.missingBills.length > 0) {
        embeds.push({
          title: "⚠️ Missing Bills (Model Didn't Return - Deleted)",
          color: 15158332, // Red
          description: data.missingBills.slice(0, 20).join("\n").substring(0, 4000),
          footer: data.missingBills.length > 20 
            ? { text: `... and ${data.missingBills.length - 20} more` }
            : undefined,
        });
      }
      break;
    case "complete":
      embeds.push({
        title: "✅ Categorizer Complete",
        color: 5763719, // Green
        fields: [
          { name: "Status", value: "All bills categorized", inline: false },
          { name: "Next Step", value: "Triggering Embedder", inline: false },
        ],
        timestamp: new Date().toISOString(),
      });
      break;
    case "error":
      // Main error embed
      embeds.push({
        title: "🚨 Categorizer Error",
        color: 15158332, // Red
        fields: [
          { name: "Stage", value: data.stage || "unknown", inline: true },
          { name: "Error", value: (data.error || "Unknown").substring(0, 1000), inline: false },
        ],
        timestamp: new Date().toISOString(),
      });
      
      // If we have model response, add it as a second embed
      if (data.modelResponse) {
        embeds.push({
          title: "📤 Model Response (Raw)",
          color: 15158332,
          description: data.modelResponse.substring(0, 4000),
        });
      }
      
      // If we have the prompt, add it as a third embed
      if (data.prompt) {
        embeds.push({
          title: "📥 Prompt Sent to Model",
          color: 15158332,
          description: data.prompt.substring(0, 4000),
        });
      }
      break;
  }

  await fetch(webhookUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ embeds }),
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

function buildPrompt(bills: BillForCategorization[]): string {
  const categoryList = CATEGORIES.map((c, i) => `${i + 1}. ${c}`).join("\n");
  
  const billsList = bills.map((b) => {
    const title = b.title?.trim() || "N/A";
    const committees = b.committees?.trim() || "N/A";
    const summary = (b.latest_summary?.trim() || "N/A").substring(0, 500);
    
    // Use legislation_number as the ID - it's meaningful and less prone to hallucination than UUIDs
    return `[BILL]
Legislation Number: ${b.legislation_number}
Title: ${title}
Committees: ${committees}
Summary: ${summary}`;
  }).join("\n\n");

  return `You are a legislative analyst. Categorize each bill into exactly ONE of these categories:

${categoryList}

IMPORTANT: If a bill does NOT have enough information to categorize (missing title, missing summary, or the data appears corrupted/incomplete), use "no_category" instead of guessing.

Bills to categorize:
${billsList}

Respond with ONLY a JSON array of objects. Each object must have:
- "legislation_number": the bill's legislation number (string, copy EXACTLY as provided, e.g., "H.R. 123 (119)")
- "category": either an exact category name from the list OR "no_category" if insufficient info

Example response:
[{"legislation_number": "H.R. 123 (119)", "category": "Air Quality & Emissions"}, {"legislation_number": "S. 456 (119)", "category": "no_category"}]`;
}

async function categorizeBatch(
  bills: BillForCategorization[],
  apiKey: string
): Promise<CategorizationResult> {
  const prompt = buildPrompt(bills);
  
  // Log the prompt being sent
  console.log("=== CATEGORIZATION PROMPT ===");
  console.log(prompt);
  console.log("=== END PROMPT ===");
  
  const requestBody = {
    model: CATEGORIZATION_MODEL,
    messages: [{ role: "user", content: prompt }],
    temperature: 0.1,
    max_tokens: 2000,
  };
  
  console.log("=== API REQUEST BODY ===");
  console.log(JSON.stringify(requestBody, null, 2));
  console.log("=== END REQUEST BODY ===");

  const response = await fetch(OPENROUTER_API_URL, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      "HTTP-Referer": "https://cruzhacks-environmental-transparency.vercel.app",
      "X-Title": "Environmental Transparency - Categorizer",
    },
    body: JSON.stringify(requestBody),
  });

  const responseText = await response.text();
  
  // Log full response
  console.log("=== FULL API RESPONSE ===");
  console.log(`Status: ${response.status}`);
  console.log(`Headers: ${JSON.stringify(Object.fromEntries(response.headers.entries()))}`);
  console.log(`Body: ${responseText}`);
  console.log("=== END RESPONSE ===");

  if (!response.ok) {
    const error = new Error(`OpenRouter error: ${response.status} - ${responseText}`);
    (error as any).prompt = prompt;
    (error as any).modelResponse = responseText;
    throw error;
  }

  let data: any;
  try {
    data = JSON.parse(responseText);
  } catch (parseError) {
    const error = new Error(`Failed to parse API response as JSON: ${parseError}`);
    (error as any).prompt = prompt;
    (error as any).modelResponse = responseText;
    throw error;
  }
  
  console.log("=== PARSED API RESPONSE ===");
  console.log(JSON.stringify(data, null, 2));
  console.log("=== END PARSED RESPONSE ===");
  
  const content = data.choices?.[0]?.message?.content || "";
  
  console.log("=== MODEL CONTENT OUTPUT ===");
  console.log(content);
  console.log("=== END CONTENT ===");
  
  const jsonMatch = content.match(/\[[\s\S]*\]/);
  if (!jsonMatch) {
    const error = new Error(`No JSON array found in model response. Content was: ${content.substring(0, 500)}`);
    (error as any).prompt = prompt;
    (error as any).modelResponse = content;
    (error as any).fullApiResponse = data;
    throw error;
  }
  
  let categories: { legislation_number: string; category: string }[];
  try {
    categories = JSON.parse(jsonMatch[0]);
  } catch (parseError) {
    const error = new Error(`Failed to parse JSON array from model: ${parseError}. JSON was: ${jsonMatch[0].substring(0, 500)}`);
    (error as any).prompt = prompt;
    (error as any).modelResponse = content;
    (error as any).fullApiResponse = data;
    throw error;
  }
  
  console.log("=== PARSED CATEGORIES ===");
  console.log(JSON.stringify(categories, null, 2));
  console.log("=== END CATEGORIES ===");
  
  return {
    categories,
    prompt,
    rawResponse: content,
    fullApiResponse: data,
  };
}

Deno.serve(async (req: Request) => {
  let currentStage = "init";
  let discordUrl = "";
  let lastPrompt = "";
  let lastModelResponse = "";

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

    // Stage: Fetch bills with NULL category
    currentStage = "fetch_uncategorized_bills";
    const { data: bills, error: fetchError } = await supabase
      .from("house_bills")
      .select("id, legislation_number, title, committees, latest_summary")
      .is("category", null)
      .limit(BATCH_SIZE) as { data: BillForCategorization[] | null; error: any };

    if (fetchError) {
      throw new Error(`Failed to fetch bills: ${fetchError.message}`);
    }

    if (!bills || bills.length === 0) {
      console.log("No bills to categorize. Triggering embedder.");
      
      if (discordUrl) {
        await sendDiscordNotification(discordUrl, "complete", {});
      }
      
      currentStage = "trigger_embedder_empty";
      await triggerNextStep(supabase, "generate-bill-embeddings");
      return new Response(JSON.stringify({
        success: true,
        message: "No bills to categorize, triggered embedder",
      }), { headers: { "Content-Type": "application/json" } });
    }

    console.log("=== CATEGORIZING " + bills.length + " BILLS ===");
    console.log("Bills to categorize:");
    for (const b of bills) {
      console.log("  - " + b.legislation_number + " (ID: " + b.id + ")");
      console.log("    Title: " + (b.title?.substring(0, 80) || "N/A"));
      console.log("    Summary: " + (b.latest_summary ? "present" : "N/A"));
    }
    console.log("=== END BILL LIST ===");

    // Stage: Send to Gemini
    currentStage = "call_openrouter_api";
    const result = await categorizeBatch(bills, openRouterKey);
    lastPrompt = result.prompt;
    lastModelResponse = result.rawResponse;
    
    console.log(`Received ${result.categories.length} categorizations`);

    // Stage: Process results - categorize or delete
    currentStage = "update_categories_in_db";
    let categorized = 0;
    let skipped = 0;
    let unmatched = 0;
    let missing = 0;
    const skippedBills: string[] = [];
    const unmatchedBills: string[] = [];
    const missingBills: string[] = [];
    
    // Create a lookup map for bills by legislation_number (the identifier used in the prompt)
    const billLookup = new Map(bills.map(b => [b.legislation_number, b]));
    
    // Track which bills from our batch were handled by the model
    const handledBills = new Set<string>();
    
    for (const cat of result.categories) {
      const legislationNumber = cat.legislation_number;
      const bill = billLookup.get(legislationNumber);
      
      if (!bill) {
        // Model returned a legislation_number we don't recognize
        console.warn("⚠️ UNMATCHED: Model returned unknown legislation_number: " + legislationNumber);
        unmatched++;
        unmatchedBills.push(legislationNumber);
        continue;
      }
      
      // Mark this bill as handled
      handledBills.add(legislationNumber);
      
      if (cat.category === NO_CATEGORY || cat.category === "no_category") {
        // Delete bill - it will be re-fetched later when more info is available
        console.log("⏭️ SKIP: " + legislationNumber + " - insufficient info, deleting from house_bills");
        
        const { error: deleteError } = await supabase
          .from("house_bills")
          .delete()
          .eq("id", bill.id);
        
        if (deleteError) {
          console.error("Failed to delete bill " + legislationNumber + ": " + deleteError.message);
        } else {
          skipped++;
          skippedBills.push(legislationNumber);
        }
      } else {
        // Valid category - update
        const humanReadableCategory = CATEGORIES.includes(cat.category) ? cat.category : "Other Environmental";
        const enumCategory = CATEGORY_TO_ENUM[humanReadableCategory];
        
        if (!enumCategory) {
          console.error("⚠️ ERROR: No enum mapping for category: " + humanReadableCategory + " (bill: " + legislationNumber + ")");
          continue;
        }
        
        console.log("✅ CATEGORIZE: " + legislationNumber + " -> " + humanReadableCategory + " (enum: " + enumCategory + ")");
        
        const { error: updateError } = await supabase
          .from("house_bills")
          .update({ category: enumCategory })
          .eq("id", bill.id);

        if (updateError) {
          console.error("❌ DB UPDATE FAILED for bill " + legislationNumber + ": " + updateError.message);
          console.error("   Attempted to set category to: " + enumCategory);
          console.error("   Full error:", updateError);
        } else {
          categorized++;
        }
      }
    }
    
    // CRITICAL: Handle bills the model did NOT return (to prevent infinite loops)
    // Delete them like no_category - they'll be re-fetched later
    for (const bill of bills) {
      if (!handledBills.has(bill.legislation_number)) {
        console.warn("⚠️ MISSING: Model did not return result for: " + bill.legislation_number + " - deleting to prevent loop");
        
        const { error: deleteError } = await supabase
          .from("house_bills")
          .delete()
          .eq("id", bill.id);
        
        if (deleteError) {
          console.error("Failed to delete missing bill " + bill.legislation_number + ": " + deleteError.message);
        } else {
          missing++;
          missingBills.push(bill.legislation_number);
        }
      }
    }
    
    if (unmatched > 0) {
      console.warn("=== UNMATCHED BILLS ===");
      console.warn("Model returned " + unmatched + " legislation numbers we couldn't match:");
      for (const um of unmatchedBills) {
        console.warn("  - " + um);
      }
      console.warn("=== END UNMATCHED ===");
    }
    
    if (missing > 0) {
      console.warn("=== MISSING BILLS (deleted to prevent loop) ===");
      console.warn("Model did not return " + missing + " bills from our batch:");
      for (const mb of missingBills) {
        console.warn("  - " + mb);
      }
      console.warn("=== END MISSING ===");
    }

    const skippedPct = bills.length > 0 
      ? ((skipped / bills.length) * 100).toFixed(1) + "%" 
      : "0%";
    const missingPct = bills.length > 0 
      ? ((missing / bills.length) * 100).toFixed(1) + "%" 
      : "0%";
    const totalRemoved = skipped + missing;

    console.log("=== BATCH RESULTS ===");
    console.log("Categorized: " + categorized);
    console.log("Skipped (no_category): " + skipped + " (" + skippedPct + ")");
    console.log("Missing (deleted to prevent loop): " + missing + " (" + missingPct + ")");
    console.log("Total removed from house_bills: " + totalRemoved);
    console.log("Skipped bills: " + (skippedBills.join(", ") || "none"));
    console.log("Missing bills: " + (missingBills.join(", ") || "none"));
    console.log("=== END RESULTS ===");

    // Stage: Check remaining work
    currentStage = "count_remaining_uncategorized";
    const { count, error: countError } = await supabase
      .from("house_bills")
      .select("*", { count: "exact", head: true })
      .is("category", null);

    if (countError) {
      throw new Error(`Failed to count remaining bills: ${countError.message}`);
    }

    const remaining = count || 0;

    // Stage: Send Discord notification
    currentStage = "send_progress_notification";
    if (discordUrl) {
      if (remaining > 0) {
        await sendDiscordNotification(discordUrl, "progress", {
          processed: bills.length,
          categorized,
          skipped,
          skippedPct,
          missing,
          missingPct,
          remaining,
          skippedBills,
          missingBills,
        });
      } else {
        await sendDiscordNotification(discordUrl, "complete", {});
      }
    }

    // Stage: Trigger next step
    currentStage = "trigger_next_step";
    if (remaining > 0) {
      console.log(`${remaining} bills still need categorization. Triggering self.`);
      await triggerNextStep(supabase, "categorize-bills");
    } else {
      console.log("All bills categorized. Triggering embedder.");
      await triggerNextStep(supabase, "generate-bill-embeddings");
    }

    return new Response(JSON.stringify({
      success: true,
      processed: bills.length,
      categorized,
      skipped,
      skipped_pct: skippedPct,
      skipped_bills: skippedBills,
      remaining,
      debug: {
        promptLength: lastPrompt.length,
        responseLength: lastModelResponse.length,
      }
    }), { headers: { "Content-Type": "application/json" } });

  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    const fullError = `[${currentStage}] ${errorMsg}`;
    
    // Extract prompt and model response from error if available
    const errorPrompt = (error as any)?.prompt || lastPrompt;
    const errorModelResponse = (error as any)?.modelResponse || lastModelResponse;
    
    console.error("=== CATEGORIZER ERROR ===");
    console.error("Stage:", currentStage);
    console.error("Error:", errorMsg);
    console.error("Prompt:", errorPrompt);
    console.error("Model Response:", errorModelResponse);
    console.error("Full Error Object:", error);
    console.error("=== END ERROR ===");
    
    if (discordUrl) {
      await sendDiscordNotification(discordUrl, "error", { 
        error: errorMsg,
        stage: currentStage,
        prompt: errorPrompt,
        modelResponse: errorModelResponse,
      });
    }

    return new Response(JSON.stringify({ 
      error: errorMsg,
      stage: currentStage,
      function: "categorize-bills",
      debug: {
        prompt: errorPrompt?.substring(0, 2000),
        modelResponse: errorModelResponse?.substring(0, 2000),
      }
    }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
});
