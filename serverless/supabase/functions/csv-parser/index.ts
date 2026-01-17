/**
 * CSV Parser Edge Function
 * 
 * Purpose: Parse CSV from Supabase Storage bucket and return JSON format
 * for LLM categorization of environmental bills.
 * 
 * Extracts from CSV:
 * - congress (parsed from "113th Congress (2013-2014)" → "113")
 * - billType (parsed from "H.R. 5861" → "H.R.")
 * - billNumber (parsed from "H.R. 5861" → "5861")
 * - title
 * - committees
 * - latestAction
 * 
 * Supports pagination via offset/limit for batching to avoid model context overflow.
 * 
 * Environment Variables:
 * - SUPABASE_URL (auto-provided)
 * - SUPABASE_SERVICE_ROLE_KEY (auto-provided)
 * - CSV_BUCKET_NAME (optional, defaults to "csv-data")
 * - KICKSTART_CSV_NAME (optional, defaults to "all_bills.csv")
 */

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Default pagination values
const DEFAULT_OFFSET = 0;
const DEFAULT_LIMIT = 30;

interface BillForCategorization {
  congress: string;
  billType: string;
  billNumber: string;
  title: string;
  committees: string;
  latestAction: string;
  summary?: string; // Only included if available (~48% of bills have this)
}

/**
 * Parse "Legislation Number" to extract bill type and number
 * e.g., "H.R. 5861" -> { billType: "H.R.", billNumber: "5861" }
 * e.g., "S. 1234" -> { billType: "S.", billNumber: "1234" }
 * e.g., "H.J.Res. 138" -> { billType: "H.J.Res.", billNumber: "138" }
 */
function parseLegislationNumber(legNum: string): { billType: string; billNumber: string } | null {
  if (!legNum) return null;
  
  // Match patterns like "H.R. 5861", "S. 1234", "H.J.Res. 138", "S.Con.Res. 5", etc.
  const match = legNum.match(/^([A-Z][A-Za-z.]*\.(?:\s*[A-Za-z]+\.)*)\s*(\d+)$/i);
  if (match) {
    return {
      billType: match[1].trim(),
      billNumber: match[2],
    };
  }
  return null;
}

/**
 * Parse "Congress" column to extract congress number
 * e.g., "113th Congress (2013-2014)" -> "113"
 */
function parseCongressNumber(congress: string): string | null {
  if (!congress) return null;
  const match = congress.match(/^(\d+)/);
  return match ? match[1] : null;
}

/**
 * Parse CSV string handling quoted values
 */
function parseCSVLine(line: string): string[] {
  const result: string[] = [];
  let current = "";
  let inQuotes = false;
  
  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (char === '"') {
      inQuotes = !inQuotes;
    } else if (char === "," && !inQuotes) {
      result.push(current);
      current = "";
    } else {
      current += char;
    }
  }
  result.push(current);
  return result;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Get parameters with defaults
    const body = await req.json().catch(() => ({}));
    const bucket = body.bucket || Deno.env.get("CSV_BUCKET_NAME") || "csv-data";
    const fileName = body.fileName || Deno.env.get("KICKSTART_CSV_NAME") || "all_bills.csv";
    const offset = typeof body.offset === "number" ? body.offset : DEFAULT_OFFSET;
    const limit = typeof body.limit === "number" ? body.limit : DEFAULT_LIMIT;

    // Download CSV
    const { data: fileData, error: downloadError } = await supabase
      .storage
      .from(bucket)
      .download(fileName);

    if (downloadError) {
      return new Response(
        JSON.stringify({ 
          error: "Failed to download CSV", 
          details: downloadError.message,
          bucket,
          fileName,
        }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Parse CSV
    const csvText = await fileData.text();
    const lines = csvText.trim().split("\n");
    
    // Skip first 3 metadata rows, get header on line 4 (index 3)
    const headerLine = lines[3];
    const headers = parseCSVLine(headerLine);
    
    // Find column indices
    const colIndex = {
      legislationNumber: headers.indexOf("Legislation Number"),
      congress: headers.indexOf("Congress"),
      title: headers.indexOf("Title"),
      committees: headers.indexOf("Committees"),
      latestAction: headers.indexOf("Latest Action"),
      latestSummary: headers.indexOf("Latest Summary"),
    };

    // Parse data rows (starting from line 5, index 4)
    const dataLines = lines.slice(4);
    const totalRows = dataLines.length;
    
    // Apply pagination
    const paginatedLines = dataLines.slice(offset, offset + limit);
    
    const bills: BillForCategorization[] = [];

    for (const line of paginatedLines) {
      if (!line.trim()) continue;
      
      const values = parseCSVLine(line);
      
      const legislationNumber = values[colIndex.legislationNumber]?.trim() || "";
      const congressFull = values[colIndex.congress]?.trim() || "";
      
      const parsed = parseLegislationNumber(legislationNumber);
      const congressNum = parseCongressNumber(congressFull);
      
      if (parsed && congressNum) {
        const bill: BillForCategorization = {
          congress: congressNum,
          billType: parsed.billType,
          billNumber: parsed.billNumber,
          title: values[colIndex.title]?.trim() || "",
          committees: values[colIndex.committees]?.trim() || "",
          latestAction: values[colIndex.latestAction]?.trim() || "",
        };
        
        // Add summary if available (helps model with categorization)
        const summary = values[colIndex.latestSummary]?.trim();
        if (summary) {
          bill.summary = summary;
        }
        
        bills.push(bill);
      }
    }

    return new Response(
      JSON.stringify({
        bills,
        pagination: {
          offset,
          limit,
          returned: bills.length,
          total: totalRows,
          hasMore: offset + limit < totalRows,
          nextOffset: offset + limit < totalRows ? offset + limit : null,
        },
      }),
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
