/**
 * Categorize Bills Edge Function
 * 
 * Purpose: Batch process uncategorized bills (category IS NULL) using GPT-5-mini
 * to assign environmental policy categories, with PARALLEL batch processing for speed.
 * 
 * Uses OpenAI Responses API with:
 * - gpt-5-mini model for reliable output
 * - reasoning: { effort: "minimal" }
 * - Strict JSON schema for reliable output
 * 
 * Process:
 * 1. Fetch all uncategorized bills from DB (up to maxBills)
 * 2. Split bills into batches of batchSize (default 50)
 * 3. Process all batches in PARALLEL using Promise.all
 * 4. Each batch call OpenAI Responses API and updates DB
 * 5. Aggregate results across all batches
 * 
 * Can process up to 5K rows efficiently across batches.
 * 
 * Parameters:
 * - batchSize: Number of bills per LLM call (default: 50)
 * - maxBills: Maximum total bills to process (default: 5000)
 * - dryRun: If true, don't update DB, just return what would be categorized
 * 
 * Environment Variables:
 * - SUPABASE_URL (auto-provided)
 * - SUPABASE_SERVICE_ROLE_KEY (auto-provided)
 * - OPENAI_API_KEY (required)
 */

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Valid categories
const VALID_CATEGORIES = [
  "air_and_atmosphere",
  "water_resources",
  "waste_and_toxics",
  "energy_and_resources",
  "land_and_conservation",
  "disaster_and_emergency",
  "climate_and_emissions",
  "justice_and_environment",
] as const;

// Default settings
const DEFAULT_BATCH_SIZE = 50;
const DEFAULT_MAX_BILLS = 5000;
const OPENAI_MODEL = "gpt-5-mini";

interface DbBill {
  id: string;
  legislation_number: string;
  congress: string;
  title: string;
  committees: string | null;
  latest_action: string;
  latest_summary: string | null;
}

interface BillForLLM {
  congress: string;
  billType: string;
  billNumber: string;
  title: string;
  committees: string;
  latestAction: string;
  summary?: string;
}

interface Categorization {
  congress: string;
  billType: string;
  billNumber: string;
  category: string;
}

interface BatchResult {
  batchNumber: number;
  processed: number;
  successful: number;
  failed: number;
  missing: number;
  hallucinations: number;
  timeMs: number;
  error?: string;
}

/**
 * Parse legislation_number from DB format back to components
 */
function parseLegislationNumber(legNum: string): { billType: string; billNumber: string; congress: string } | null {
  if (!legNum) return null;
  const match = legNum.match(/^([A-Z][A-Za-z.]*\.(?:\s*[A-Za-z]+\.)*)\s*(\d+)\s*\((\d+)\)$/i);
  if (match) {
    return {
      billType: match[1].trim(),
      billNumber: match[2],
      congress: match[3],
    };
  }
  return null;
}

/**
 * Convert DB bill to LLM format
 */
function dbBillToLLMFormat(bill: DbBill): BillForLLM | null {
  const parsed = parseLegislationNumber(bill.legislation_number);
  if (!parsed) return null;
  
  const result: BillForLLM = {
    congress: parsed.congress,
    billType: parsed.billType,
    billNumber: parsed.billNumber,
    title: bill.title || "",
    committees: bill.committees || "",
    latestAction: bill.latest_action || "",
  };
  
  if (bill.latest_summary) {
    result.summary = bill.latest_summary;
  }
  
  return result;
}

/**
 * Build the system prompt for categorization
 */
function buildSystemPrompt(): string {
  return `You are an expert at categorizing US environmental legislation into policy categories.

For each bill, analyze the title, committees, latest action, and summary (if provided) to determine the most appropriate category.

VALID CATEGORIES (you MUST use exactly one of these):
- air_and_atmosphere: Air quality, pollution control, ozone, acid rain, noise pollution
- water_resources: Water quality, drinking water, ocean/coastal, water pollution
- waste_and_toxics: Hazardous waste, solid waste, toxic substances, pesticides
- energy_and_resources: Renewable energy, nuclear, fossil fuels, energy efficiency
- land_and_conservation: Public lands, forests, wildlife, endangered species, parks
- disaster_and_emergency: Chemical emergencies, oil spills, flood hazards
- climate_and_emissions: Greenhouse gases, climate adaptation, sea level rise
- justice_and_environment: Environmental justice, civil rights, interstate pollution

RULES:
1. Return ONLY valid JSON array
2. Use EXACTLY the category names above (lowercase with underscores)
3. Include ALL bills from the input
4. Preserve the exact congress, billType, and billNumber from input

OUTPUT FORMAT (JSON array):
[
  {"congress": "113", "billType": "H.R.", "billNumber": "5861", "category": "water_resources"},
  ...
]`;
}

/**
 * Build user prompt with bills to categorize
 */
function buildUserPrompt(bills: BillForLLM[]): string {
  const billsJson = JSON.stringify(bills);
  return "Categorize these " + bills.length + " environmental bills:\n\n" + billsJson;
}

/**
 * Call OpenAI Responses API to categorize bills
 */
async function callOpenAI(bills: BillForLLM[], apiKey: string): Promise<Categorization[]> {
  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      "Authorization": "Bearer " + apiKey,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: OPENAI_MODEL,
      instructions: buildSystemPrompt(),
      input: buildUserPrompt(bills),
      reasoning: { effort: "minimal" },
      text: {
        format: {
          type: "json_schema",
          name: "categorizations",
          schema: {
            type: "object",
            properties: {
              categorizations: {
                type: "array",
                items: {
                  type: "object",
                  properties: {
                    congress: { type: "string" },
                    billType: { type: "string" },
                    billNumber: { type: "string" },
                    category: { type: "string" }
                  },
                  required: ["congress", "billType", "billNumber", "category"],
                  additionalProperties: false
                }
              }
            },
            required: ["categorizations"],
            additionalProperties: false
          },
          strict: true
        }
      }
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error("OpenAI API error: " + response.status + " - " + error);
  }

  const data = await response.json();
  const messageOutput = data.output?.find((item: any) => item.type === "message");
  const content = messageOutput?.content?.[0]?.text;
  
  if (!content) {
    throw new Error("No text content in OpenAI response");
  }

  const parsed = JSON.parse(content);
  if (parsed.categorizations && Array.isArray(parsed.categorizations)) {
    return parsed.categorizations;
  }
  
  throw new Error("Could not find categorization array in OpenAI response");
}

/**
 * Update bills in database with categories
 */
async function updateBillCategories(
  supabase: ReturnType<typeof createClient>,
  categorizations: Categorization[],
  dryRun: boolean
): Promise<{ successful: string[]; failed: { legNum: string; error: string }[] }> {
  const successful: string[] = [];
  const failed: { legNum: string; error: string }[] = [];

  for (const cat of categorizations) {
    const legislationNumber = cat.billType + " " + cat.billNumber + " (" + cat.congress + ")";
    
    if (!VALID_CATEGORIES.includes(cat.category as typeof VALID_CATEGORIES[number])) {
      failed.push({ legNum: legislationNumber, error: "Invalid category: " + cat.category });
      continue;
    }

    if (dryRun) {
      successful.push(legislationNumber);
      continue;
    }

    const { data, error } = await supabase
      .from("house_bills")
      .update({ category: cat.category })
      .eq("legislation_number", legislationNumber)
      .select("id");

    if (error) {
      failed.push({ legNum: legislationNumber, error: "DB error: " + error.message });
    } else if (!data || data.length === 0) {
      failed.push({ legNum: legislationNumber, error: "HALLUCINATION: Bill not found" });
    } else {
      successful.push(legislationNumber);
    }
  }

  return { successful, failed };
}

/**
 * Process a single batch of bills
 */
async function processBatch(
  batchNum: number,
  llmBills: BillForLLM[],
  openaiKey: string,
  supabase: ReturnType<typeof createClient>,
  dryRun: boolean
): Promise<BatchResult & { allSuccessful: string[], allFailed: { legNum: string; error: string }[] }> {
  const startTime = Date.now();
  const allSuccessful: string[] = [];
  const allFailed: { legNum: string; error: string }[] = [];

  try {
    const categorizations = await callOpenAI(llmBills, openaiKey);
    const { successful, failed } = await updateBillCategories(supabase, categorizations, dryRun);
    
    allSuccessful.push(...successful);
    allFailed.push(...failed);

    const hallucinationCount = failed.filter(f => f.error.includes("HALLUCINATION")).length;
    const missingCount = Math.max(0, llmBills.length - (successful.length + failed.length));

    return {
      batchNumber: batchNum + 1,
      processed: llmBills.length,
      successful: successful.length,
      failed: failed.length,
      missing: missingCount,
      hallucinations: hallucinationCount,
      timeMs: Date.now() - startTime,
      allSuccessful,
      allFailed
    };
  } catch (e) {
    const errorMsg = e instanceof Error ? e.message : "Unknown error";
    for (const bill of llmBills) {
      const legNum = bill.billType + " " + bill.billNumber + " (" + bill.congress + ")";
      allFailed.push({ legNum, error: "Batch error: " + errorMsg });
    }
    return {
      batchNumber: batchNum + 1,
      processed: llmBills.length,
      successful: 0,
      failed: llmBills.length,
      missing: 0,
      hallucinations: 0,
      timeMs: Date.now() - startTime,
      error: errorMsg,
      allSuccessful,
      allFailed
    };
  }
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  const startTime = Date.now();

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
    const openaiKey = Deno.env.get("OPENAI_API_KEY") || "";

    if (!openaiKey) {
      return new Response(JSON.stringify({ error: "OPENAI_API_KEY not configured" }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const supabase = createClient(supabaseUrl, supabaseKey);
    const body = await req.json().catch(() => ({}));
    const batchSize = typeof body.batchSize === "number" ? body.batchSize : DEFAULT_BATCH_SIZE;
    const maxBills = typeof body.maxBills === "number" ? body.maxBills : DEFAULT_MAX_BILLS;
    const dryRun = body.dryRun === true;

    // Fetch uncategorized bills
    const { data: dbBills, error: fetchError } = await supabase
      .from("house_bills")
      .select("id, legislation_number, congress, title, committees, latest_action, latest_summary")
      .is("category", null)
      .limit(maxBills);

    if (fetchError) throw new Error("Fetch error: " + fetchError.message);
    if (!dbBills || dbBills.length === 0) {
      return new Response(JSON.stringify({ message: "No uncategorized bills found" }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const allLlmBills: BillForLLM[] = dbBills
      .map(bill => dbBillToLLMFormat(bill as DbBill))
      .filter((b): b is BillForLLM => b !== null);

    const batches: BillForLLM[][] = [];
    for (let i = 0; i < allLlmBills.length; i += batchSize) {
      batches.push(allLlmBills.slice(i, i + batchSize));
    }

    console.log("Starting parallel categorization: " + allLlmBills.length + " bills in " + batches.length + " batches...");

    // Run all batches in parallel
    const results = await Promise.all(
      batches.map((batch, idx) => processBatch(idx, batch, openaiKey, supabase, dryRun))
    );

    // Get final count of uncategorized bills
    const { count: remainingNulls } = await supabase
      .from("house_bills")
      .select("*", { count: "exact", head: true })
      .is("category", null);

    // Aggregate results
    const allSuccessful: string[] = [];
    const allFailed: { legNum: string; error: string }[] = [];
    const batchSummaries: BatchResult[] = [];
    let processedTotal = 0;
    let totalMissing = 0;

    for (const res of results) {
      allSuccessful.push(...res.allSuccessful);
      allFailed.push(...res.allFailed);
      processedTotal += res.processed;
      totalMissing += res.missing;
      batchSummaries.push({
        batchNumber: res.batchNumber,
        processed: res.processed,
        successful: res.successful,
        failed: res.failed,
        missing: res.missing,
        hallucinations: res.hallucinations,
        timeMs: res.timeMs,
        error: res.error
      });
    }

    const totalTime = Date.now() - startTime;
    const hallucinationCount = allFailed.filter(f => f.error.includes("HALLUCINATION")).length;
    const hallucinationRate = processedTotal > 0 ? ((hallucinationCount / processedTotal) * 100).toFixed(2) : "0";

    console.log("=== PARALLEL CATEGORIZATION COMPLETE ===");
    console.log("Total processed: " + processedTotal + " in " + totalTime + "ms");

    return new Response(
      JSON.stringify({
        summary: {
          totalProcessed: processedTotal,
          totalBatches: batches.length,
          successCount: allSuccessful.length,
          failCount: allFailed.length,
          missingCount: totalMissing,
          hallucinationCount,
          hallucinationRate: hallucinationRate + "%",
          remainingNullCategories: remainingNulls,
          totalTimeMs: totalTime,
          dryRun,
        },
        batchResults: batchSummaries,
        failed: allFailed.slice(0, 100),
        failedCount: allFailed.length,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    console.error("Fatal error:", errorMessage);
    return new Response(JSON.stringify({ error: errorMessage }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});