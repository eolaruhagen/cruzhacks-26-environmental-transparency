/**
 * Validate Categorization Edge Function
 * 
 * Purpose: Validate model output from bill categorization workflow.
 * Ensures that:
 * 1. Bill identifiers (billType, billNumber, congress) are valid format
 * 2. The bill exists in the house_bills database table
 * 3. The subcategory matches the bill_type enum in the database
 * 
 * Expected Input: JSON array of objects like:
 * [
 *   {
 *     "billType": "H.R.",
 *     "billNumber": "5861",
 *     "congress": "113",
 *     "subcategory": "water_resources"
 *   }
 * ]
 * 
 * Valid subcategories (bill_type enum):
 * - air_and_atmosphere
 * - water_resources
 * - waste_and_toxics
 * - energy_and_resources
 * - land_and_conservation
 * - disaster_and_emergency
 * - climate_and_emissions
 * - justice_and_environment
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

// Valid subcategory enum values (must match bill_type enum in DB)
const VALID_SUBCATEGORIES = [
  "air_and_atmosphere",
  "water_resources",
  "waste_and_toxics",
  "energy_and_resources",
  "land_and_conservation",
  "disaster_and_emergency",
  "climate_and_emissions",
  "justice_and_environment",
] as const;

type Subcategory = typeof VALID_SUBCATEGORIES[number];

interface ModelOutput {
  billType: string;
  billNumber: string;
  congress: string;
  subcategory: string;
}

interface ValidationResult {
  input: ModelOutput;
  valid: boolean;
  errors: string[];
  legislationNumber?: string;
}

interface ValidationResponse {
  totalProcessed: number;
  validCount: number;
  invalidCount: number;
  results: ValidationResult[];
  validBills: Array<ModelOutput & { legislationNumber: string }>;
}

/**
 * Reconstruct legislation number from parts to match DB format
 * e.g., { billType: "H.R.", billNumber: "5861", congress: "113" } -> "H.R. 5861 (113)"
 */
function reconstructLegislationNumber(billType: string, billNumber: string, congress: string): string {
  return `${billType} ${billNumber} (${congress})`.trim();
}

/**
 * Validate a single categorization output
 */
function validateSingle(item: ModelOutput): { errors: string[]; legislationNumber: string } {
  const errors: string[] = [];
  
  // Validate required fields
  if (!item.billType || typeof item.billType !== "string") {
    errors.push("Missing or invalid billType");
  }
  if (!item.billNumber || typeof item.billNumber !== "string") {
    errors.push("Missing or invalid billNumber");
  }
  if (!item.congress || typeof item.congress !== "string") {
    errors.push("Missing or invalid congress");
  }
  if (!item.subcategory || typeof item.subcategory !== "string") {
    errors.push("Missing or invalid subcategory");
  }
  
  // Validate subcategory is valid enum
  if (item.subcategory && !VALID_SUBCATEGORIES.includes(item.subcategory as Subcategory)) {
    errors.push(`Invalid subcategory "${item.subcategory}". Must be one of: ${VALID_SUBCATEGORIES.join(", ")}`);
  }
  
  // Validate congress is numeric
  if (item.congress && !/^\d+$/.test(item.congress)) {
    errors.push(`Congress must be numeric, got "${item.congress}"`);
  }
  
  // Validate bill number is numeric
  if (item.billNumber && !/^\d+$/.test(item.billNumber)) {
    errors.push(`Bill number must be numeric, got "${item.billNumber}"`);
  }
  
  const legislationNumber = reconstructLegislationNumber(
    item.billType || "", 
    item.billNumber || "",
    item.congress || ""
  );
  
  return { errors, legislationNumber };
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
    
    // Expect array of model outputs
    const modelOutputs: ModelOutput[] = Array.isArray(body) ? body : body.results || body.data || [];
    
    if (!Array.isArray(modelOutputs) || modelOutputs.length === 0) {
      return new Response(
        JSON.stringify({ 
          error: "Expected array of categorization results",
          example: [{ billType: "H.R.", billNumber: "5861", congress: "113", subcategory: "water_resources" }],
          validSubcategories: VALID_SUBCATEGORIES,
        }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const results: ValidationResult[] = [];
    const validBills: Array<ModelOutput & { legislationNumber: string }> = [];
    
    // First pass: validate format
    const formatValidItems: Array<{ item: ModelOutput; legislationNumber: string }> = [];
    
    for (const item of modelOutputs) {
      const { errors, legislationNumber } = validateSingle(item);
      
      if (errors.length > 0) {
        results.push({
          input: item,
          valid: false,
          errors,
          legislationNumber,
        });
      } else {
        formatValidItems.push({ item, legislationNumber });
      }
    }

    // Second pass: verify bills exist in database (batch query)
    if (formatValidItems.length > 0) {
      const legislationNumbers = formatValidItems.map(x => x.legislationNumber);
      
      const { data: existingBills, error: dbError } = await supabase
        .from("house_bills")
        .select("legislation_number")
        .in("legislation_number", legislationNumbers);

      if (dbError) {
        console.error("DB query error:", dbError);
        // If DB query fails, mark all as valid (format-wise) but warn
        for (const { item, legislationNumber } of formatValidItems) {
          results.push({
            input: item,
            valid: true,
            errors: ["Warning: Could not verify bill exists in database"],
            legislationNumber,
          });
          validBills.push({ ...item, legislationNumber });
        }
      } else {
        const existingSet = new Set(existingBills?.map(b => b.legislation_number) || []);
        
        for (const { item, legislationNumber } of formatValidItems) {
          if (existingSet.has(legislationNumber)) {
            results.push({
              input: item,
              valid: true,
              errors: [],
              legislationNumber,
            });
            validBills.push({ ...item, legislationNumber });
          } else {
            results.push({
              input: item,
              valid: false,
              errors: [`Bill "${legislationNumber}" not found in database`],
              legislationNumber,
            });
          }
        }
      }
    }

    const response: ValidationResponse = {
      totalProcessed: modelOutputs.length,
      validCount: validBills.length,
      invalidCount: modelOutputs.length - validBills.length,
      results,
      validBills,
    };

    return new Response(
      JSON.stringify(response),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
