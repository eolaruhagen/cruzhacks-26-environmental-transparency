/**
 * Update Categories Edge Function
 * 
 * Purpose: Take categorization results from n8n workflow and update
 * the house_bills table with the assigned categories.
 * 
 * Expected Input Format (from n8n):
 * [
 *   {
 *     "categorizedBills": [
 *       {
 *         "output": {
 *           "congress": "113",
 *           "billType": "H.R.",
 *           "billNumber": "5861",
 *           "category": "water_resources"
 *         }
 *       }
 *     ]
 *   }
 * ]
 * 
 * OR flat array:
 * [
 *   { "congress": "113", "billType": "H.R.", "billNumber": "5861", "category": "water_resources" }
 * ]
 * 
 * Hallucination Detection:
 * - Compares batch size to actual DB updates
 * - Logs which bills failed to match (AI made up bill numbers)
 * - Returns detailed success/failure breakdown
 * 
 * Environment Variables:
 * - SUPABASE_URL (auto-provided)
 * - SUPABASE_SERVICE_ROLE_KEY (auto-provided)
 */

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Valid category enum values (must match bill_type enum in DB)
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

type Category = typeof VALID_CATEGORIES[number];

interface BillCategorization {
  congress: string;
  billType: string;
  billNumber: string;
  category: string;
}

interface UpdateResult {
  legislationNumber: string;
  category: string;
  success: boolean;
  error?: string;
}

/**
 * Reconstruct legislation_number to match DB format
 * e.g., { billType: "H.R.", billNumber: "5861", congress: "113" } -> "H.R. 5861 (113)"
 */
function toLegislationNumber(billType: string, billNumber: string, congress: string): string {
  return billType + " " + billNumber + " (" + congress + ")";
}

/**
 * Extract bill categorizations from various input formats
 */
function extractCategorizations(body: unknown): BillCategorization[] {
  const results: BillCategorization[] = [];
  
  if (Array.isArray(body)) {
    for (const item of body) {
      // Format 1: Array with categorizedBills wrapper (n8n format)
      if (item.categorizedBills && Array.isArray(item.categorizedBills)) {
        for (const bill of item.categorizedBills) {
          if (bill.output) {
            results.push(bill.output);
          } else if (bill.congress && bill.billType && bill.billNumber && bill.category) {
            results.push(bill);
          }
        }
      }
      // Format 2: Direct array of categorizations
      else if (item.congress && item.billType && item.billNumber && item.category) {
        results.push(item);
      }
      // Format 3: Output wrapper
      else if (item.output && item.output.congress) {
        results.push(item.output);
      }
    }
  }
  // Format 4: Single object with categorizedBills
  else if (body && typeof body === 'object' && 'categorizedBills' in body) {
    const obj = body as { categorizedBills: unknown[] };
    if (Array.isArray(obj.categorizedBills)) {
      for (const bill of obj.categorizedBills) {
        const b = bill as { output?: BillCategorization } & BillCategorization;
        if (b.output) {
          results.push(b.output);
        } else if (b.congress && b.billType && b.billNumber && b.category) {
          results.push(b);
        }
      }
    }
  }
  
  return results;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Parse request body
    const body = await req.json();
    
    // Extract categorizations from various input formats
    const categorizations = extractCategorizations(body);
    
    if (categorizations.length === 0) {
      return new Response(
        JSON.stringify({ 
          error: "No categorizations found in request body",
          hint: "Expected format: [{ categorizedBills: [{ output: { congress, billType, billNumber, category } }] }]",
        }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const batchSize = categorizations.length;
    const results: UpdateResult[] = [];
    const successful: UpdateResult[] = [];
    const failed: UpdateResult[] = [];
    
    console.log("Processing batch of " + batchSize + " categorizations...");

    // Process each categorization
    for (const cat of categorizations) {
      const legislationNumber = toLegislationNumber(cat.billType, cat.billNumber, cat.congress);
      
      // Validate category is valid enum
      if (!VALID_CATEGORIES.includes(cat.category as Category)) {
        const result: UpdateResult = {
          legislationNumber,
          category: cat.category,
          success: false,
          error: "Invalid category '" + cat.category + "'. Valid: " + VALID_CATEGORIES.join(", "),
        };
        results.push(result);
        failed.push(result);
        continue;
      }

      // Update the bill in the database
      const { data, error } = await supabase
        .from("house_bills")
        .update({ category: cat.category })
        .eq("legislation_number", legislationNumber)
        .select("id, legislation_number");

      if (error) {
        const result: UpdateResult = {
          legislationNumber,
          category: cat.category,
          success: false,
          error: "DB error: " + error.message,
        };
        results.push(result);
        failed.push(result);
      } else if (!data || data.length === 0) {
        // No rows matched - this bill doesn't exist (hallucination!)
        const result: UpdateResult = {
          legislationNumber,
          category: cat.category,
          success: false,
          error: "HALLUCINATION: Bill not found in database",
        };
        results.push(result);
        failed.push(result);
      } else {
        const result: UpdateResult = {
          legislationNumber,
          category: cat.category,
          success: true,
        };
        results.push(result);
        successful.push(result);
      }
    }

    // Calculate stats
    const successCount = successful.length;
    const failCount = failed.length;
    const hallucinationCount = failed.filter(f => f.error?.includes("HALLUCINATION")).length;
    const invalidCategoryCount = failed.filter(f => f.error?.includes("Invalid category")).length;
    const dbErrorCount = failed.filter(f => f.error?.includes("DB error")).length;
    const hallucinationRate = batchSize > 0 ? ((hallucinationCount / batchSize) * 100).toFixed(2) : "0";

    // Log summary
    console.log("=== UPDATE CATEGORIES SUMMARY ===");
    console.log("Batch size: " + batchSize);
    console.log("Successful updates: " + successCount);
    console.log("Failed updates: " + failCount);
    console.log("  - Hallucinations (bill not found): " + hallucinationCount);
    console.log("  - Invalid categories: " + invalidCategoryCount);
    console.log("  - DB errors: " + dbErrorCount);
    console.log("Hallucination rate: " + hallucinationRate + "%");
    
    if (failed.length > 0) {
      console.log("\n=== FAILED ENTRIES ===");
      for (const f of failed) {
        console.log("  " + f.legislationNumber + ": " + f.error);
      }
    }

    return new Response(
      JSON.stringify({
        summary: {
          batchSize,
          successCount,
          failCount,
          hallucinationCount,
          invalidCategoryCount,
          dbErrorCount,
          hallucinationRate: hallucinationRate + "%",
        },
        successful: successful.map(s => ({
          legislationNumber: s.legislationNumber,
          category: s.category,
        })),
        failed: failed.map(f => ({
          legislationNumber: f.legislationNumber,
          category: f.category,
          error: f.error,
        })),
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    console.error("Error:", errorMessage);
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
