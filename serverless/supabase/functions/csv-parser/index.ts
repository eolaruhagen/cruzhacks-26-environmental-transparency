import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

/**
 * Parse CSV string into array of objects
 */
function parseCSV(csvText: string): Record<string, string>[] {
  const lines = csvText.trim().split("\n");
  if (lines.length === 0) return [];

  // Parse header row
  const headers = parseCSVLine(lines[0]);
  
  // Parse data rows
  const rows: Record<string, string>[] = [];
  for (let i = 1; i < lines.length; i++) {
    const values = parseCSVLine(lines[i]);
    const row: Record<string, string> = {};
    headers.forEach((header, index) => {
      row[header.trim()] = (values[index] || "").trim();
    });
    rows.push(row);
  }
  
  return rows;
}

/**
 * Parse a single CSV line, handling quoted values
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

/**
 * Infer and convert value types (string -> int/float/bool/null)
 */
function inferType(value: string): string | number | boolean | null {
  if (value === "" || value.toLowerCase() === "null" || value.toLowerCase() === "none") {
    return null;
  }
  if (value.toLowerCase() === "true" || value.toLowerCase() === "yes") {
    return true;
  }
  if (value.toLowerCase() === "false" || value.toLowerCase() === "no") {
    return false;
  }
  
  // Try integer
  if (/^-?\d+$/.test(value)) {
    return parseInt(value, 10);
  }
  
  // Try float
  if (/^-?\d+\.\d+$/.test(value)) {
    return parseFloat(value);
  }
  
  return value;
}

/**
 * Escape value for TOON format (handle commas, newlines)
 */
function escapeToonValue(value: string | number | boolean | null): string {
  if (value === null) return "null";
  if (typeof value === "boolean") return value.toString();
  if (typeof value === "number") return value.toString();
  
  // String: escape if contains comma, newline, or starts/ends with whitespace
  const str = value.toString();
  if (str.includes(",") || str.includes("\n") || str.startsWith(" ") || str.endsWith(" ")) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

/**
 * Convert rows to TOON format
 * TOON uses tabular format: collection[N]{field1,field2,...}:\nval1,val2,...
 */
function toTOON(rows: Record<string, string>[], rootName: string = "records"): string {
  if (rows.length === 0) {
    return `${rootName}[0]{}:`;
  }
  
  // Get headers from first row
  const headers = Object.keys(rows[0]);
  
  // Build TOON header
  const toonHeader = `${rootName}[${rows.length}]{${headers.join(",")}}:`;
  
  // Build TOON rows
  const toonRows = rows.map(row => {
    return headers.map(header => {
      const rawValue = row[header];
      const typedValue = inferType(rawValue);
      return escapeToonValue(typedValue);
    }).join(",");
  });
  
  return toonHeader + "\n" + toonRows.join("\n");
}

Deno.serve(async (req: Request) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    // Initialize Supabase client
    const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Get parameters from request body
    const body = await req.json().catch(() => ({}));
    const bucket = body.bucket || Deno.env.get("SUPABASE_BUCKET_NAME") || "csv-data";
    const fileName = body.fileName || Deno.env.get("KICKSTART_CSV_NAME") || "kickstart.csv";
    const rootName = body.rootName || "records";
    const format = body.format || "toon"; // "toon" or "json"

    // Download CSV from storage
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
          fileName 
        }),
        {
          status: 404,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    // Parse CSV
    const csvText = await fileData.text();
    const rows = parseCSV(csvText);

    // Convert to requested format
    let output: string;
    let contentType: string;

    if (format === "json") {
      output = JSON.stringify(rows, null, 2);
      contentType = "application/json";
    } else {
      // Default: TOON format
      output = toTOON(rows, rootName);
      contentType = "text/plain";
    }

    return new Response(output, {
      headers: {
        ...corsHeaders,
        "Content-Type": contentType,
      },
    });

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    return new Response(
      JSON.stringify({ error: errorMessage }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});
