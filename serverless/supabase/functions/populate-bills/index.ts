/**
 * Populate Bills Edge Function
 * 
 * Purpose: Parse CSV from Supabase Storage bucket, generate embeddings via OpenAI,
 * and insert bills into the house_bills table.
 * 
 * Embedding Strategy:
 * - Uses Title + Committees as the embedding text
 * - OpenAI text-embedding-3-small model (1536 dimensions)
 * - Batch request to OpenAI API (same order in = same order out)
 * 
 * Supports pagination via offset/limit for batching large CSV files.
 * Category is left as null (to be filled by categorization workflow).
 * 
 * Environment Variables:
 * - SUPABASE_URL (auto-provided)
 * - SUPABASE_SERVICE_ROLE_KEY (auto-provided)
 * - CSV_BUCKET_NAME (optional, defaults to "csv-data")
 * - KICKSTART_CSV_NAME (optional, defaults to "all_bills.csv")
 * - OPENAI_API_KEY (required for embeddings)
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

// OpenAI embedding model
const EMBEDDING_MODEL = "text-embedding-3-small";
const EMBEDDING_DIMENSIONS = 1536;

interface BillData {
  legislation_number: string;
  url: string;
  congress: string;
  title: string;
  sponsor: string;
  party_of_sponsor: string;
  date_of_introduction: string | null;
  committees: string | null;
  latest_action: string;
  latest_action_date: string | null;
  latest_tracker_stage: string;
  cosponsors: string[];
  num_cosponsors: number;
  subject_terms: string[];
  bill_policy_area: string | null;
  latest_summary: string | null;
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

/**
 * Parse date string from CSV (MM/DD/YYYY format)
 */
function parseDate(dateStr: string): string | null {
  if (!dateStr || !dateStr.trim()) return null;
  const match = dateStr.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (match) {
    return `${match[3]}-${match[1]}-${match[2]}`; // YYYY-MM-DD
  }
  return null;
}

/**
 * Strip HTML tags from text
 */
function cleanHtml(text: string): string {
  if (!text) return "";
  return text
    .replace(/<[^>]*>/g, "") // Remove HTML tags
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, " ") // Normalize whitespace
    .trim();
}

/**
 * Generate embedding text from bill data
 * Uses Title + Committees + Summary (if available) for semantic representation
 */
function createEmbeddingText(title: string, committees: string, summary?: string | null): string {
  const parts: string[] = [];
  if (title) parts.push(title);
  if (committees) parts.push(`Committees: ${committees}`);
  if (summary) {
    const cleanSummary = cleanHtml(summary);
    if (cleanSummary) parts.push(`Summary: ${cleanSummary}`);
  }
  return parts.join("\n\n");
}

/**
 * Call OpenAI Embeddings API with batch of texts
 * Returns embeddings in same order as input
 */
async function generateEmbeddings(
  texts: string[],
  apiKey: string
): Promise<number[][]> {
  const response = await fetch("https://api.openai.com/v1/embeddings", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: EMBEDDING_MODEL,
      input: texts,
      dimensions: EMBEDDING_DIMENSIONS,
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`OpenAI API error: ${response.status} - ${error}`);
  }

  const data = await response.json();
  
  // Sort by index to ensure same order as input
  const sorted = data.data.sort((a: { index: number }, b: { index: number }) => a.index - b.index);
  return sorted.map((item: { embedding: number[] }) => item.embedding);
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
    const openaiKey = Deno.env.get("OPENAI_API_KEY") ?? "";
    
    if (!openaiKey) {
      return new Response(
        JSON.stringify({ error: "OPENAI_API_KEY not configured" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }
    
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Get parameters with defaults
    const body = await req.json().catch(() => ({}));
    const bucket = body.bucket || Deno.env.get("CSV_BUCKET_NAME") || "csv-data";
    const fileName = body.fileName || Deno.env.get("KICKSTART_CSV_NAME") || "all_bills.csv";
    const offset = typeof body.offset === "number" ? body.offset : DEFAULT_OFFSET;
    const limit = typeof body.limit === "number" ? body.limit : DEFAULT_LIMIT;
    const skipExisting = body.skipExisting !== false; // Default true

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
        }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Parse CSV
    const csvText = await fileData.text();
    const lines = csvText.trim().split("\n");
    
    // Skip first 3 metadata rows, get header on line 4 (index 3)
    const headerLine = lines[3];
    const allHeaders = parseCSVLine(headerLine);
    
    // Find column indices for main fields
    const colIndex: Record<string, number> = {};
    const cosponsorIndices: number[] = [];
    const subjectTermIndices: number[] = [];
    
    allHeaders.forEach((header, idx) => {
      const h = header.trim();
      if (h === "Cosponsor") {
        cosponsorIndices.push(idx);
      } else if (h === "billSubjectTerm") {
        subjectTermIndices.push(idx);
      } else {
        // Map known headers
        const mapping: Record<string, string> = {
          "Legislation Number": "legislationNumber",
          "URL": "url",
          "Congress": "congress",
          "Title": "title",
          "Sponsor": "sponsor",
          "Party of Sponsor": "partyOfSponsor",
          "Date of Introduction": "dateOfIntroduction",
          "Committees": "committees",
          "Latest Action": "latestAction",
          "Latest Action Date": "latestActionDate",
          "Latest Tracker Stage": "latestTrackerStage",
          "Number of Cosponsors": "numCosponsors",
          "billPolicyArea": "billPolicyArea",
          "Latest Summary": "latestSummary",
        };
        if (mapping[h]) {
          colIndex[mapping[h]] = idx;
        }
      }
    });

    // Parse data rows (starting from line 5, index 4)
    const dataLines = lines.slice(4);
    const totalRows = dataLines.length;
    
    // Apply pagination
    const paginatedLines = dataLines.slice(offset, offset + limit);
    
    const bills: BillData[] = [];
    const embeddingTexts: string[] = [];
    const seenInBatch = new Set<string>();

    for (const line of paginatedLines) {
      if (!line.trim()) continue;
      
      const values = parseCSVLine(line);
      
      const legislationNumber = values[colIndex.legislationNumber]?.trim() || "";
      if (!legislationNumber) continue;

      // Create unique legislation number by appending congress
      // "H.R. 5861" -> "H.R. 5861 (113)"
      const congressStr = values[colIndex.congress]?.trim() || "";
      const congressNum = congressStr.match(/^(\d+)/)?.[1] || "0";
      const legislationNumberUnique = `${legislationNumber} (${congressNum})`;

      // Skip duplicates within the same batch
      if (seenInBatch.has(legislationNumberUnique)) continue;
      seenInBatch.add(legislationNumberUnique);
      
      // Extract cosponsors from their columns
      const cosponsors: string[] = [];
      for (const idx of cosponsorIndices) {
        const val = values[idx]?.trim();
        if (val) cosponsors.push(val);
      }
      
      // Extract subject terms from their columns
      const subjectTerms: string[] = [];
      for (const idx of subjectTermIndices) {
        const val = values[idx]?.trim();
        if (val) subjectTerms.push(val);
      }
      
      const title = values[colIndex.title]?.trim() || "";
      const committees = values[colIndex.committees]?.trim() || null;
      const rawSummary = values[colIndex.latestSummary]?.trim() || null;
      const cleanedSummary = rawSummary ? cleanHtml(rawSummary) : null;
      
      const bill: BillData = {
        legislation_number: legislationNumberUnique,
        url: values[colIndex.url]?.trim() || "",
        congress: congressStr,
        title,
        sponsor: values[colIndex.sponsor]?.trim() || "",
        party_of_sponsor: values[colIndex.partyOfSponsor]?.trim() || "",
        date_of_introduction: parseDate(values[colIndex.dateOfIntroduction]?.trim() || ""),
        committees,
        latest_action: values[colIndex.latestAction]?.trim() || "",
        latest_action_date: parseDate(values[colIndex.latestActionDate]?.trim() || ""),
        latest_tracker_stage: values[colIndex.latestTrackerStage]?.trim() || "",
        cosponsors,
        num_cosponsors: parseInt(values[colIndex.numCosponsors]?.trim() || "0") || cosponsors.length,
        subject_terms: subjectTerms,
        bill_policy_area: values[colIndex.billPolicyArea]?.trim() || null,
        latest_summary: cleanedSummary, // Store cleaned HTML in DB
      };
      
      bills.push(bill);
      embeddingTexts.push(createEmbeddingText(title, committees || "", cleanedSummary));
    }

    if (bills.length === 0) {
      return new Response(
        JSON.stringify({
          message: "No bills to process in this batch",
          pagination: { offset, limit, returned: 0, total: totalRows },
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Check for existing bills if skipExisting is true
    let existingLegNumbers = new Set<string>();
    if (skipExisting) {
      const { data: existing } = await supabase
        .from("house_bills")
        .select("legislation_number")
        .in("legislation_number", bills.map(b => b.legislation_number));
      
      if (existing) {
        existingLegNumbers = new Set(existing.map(e => e.legislation_number));
      }
    }

    // Filter out existing bills
    const newBills = bills.filter(b => !existingLegNumbers.has(b.legislation_number));
    const newEmbeddingTexts = bills
      .map((b, i) => ({ bill: b, text: embeddingTexts[i] }))
      .filter(x => !existingLegNumbers.has(x.bill.legislation_number))
      .map(x => x.text);

    if (newBills.length === 0) {
      return new Response(
        JSON.stringify({
          message: "All bills in this batch already exist",
          skipped: bills.length,
          pagination: { offset, limit, returned: 0, total: totalRows, hasMore: offset + limit < totalRows },
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Generate embeddings for new bills
    console.log(`Generating embeddings for ${newBills.length} bills...`);
    const embeddings = await generateEmbeddings(newEmbeddingTexts, openaiKey);

    // Prepare insert data with embeddings
    const insertData = newBills.map((bill, idx) => ({
      ...bill,
      embedding: JSON.stringify(embeddings[idx]), // halfvec accepts JSON array
    }));

    // Upsert into database (update if legislation_number already exists)
    const { data: insertedData, error: insertError } = await supabase
      .from("house_bills")
      .upsert(insertData, { onConflict: "legislation_number" })
      .select("id, legislation_number");

    if (insertError) {
      return new Response(
        JSON.stringify({ 
          error: "Failed to insert bills", 
          details: insertError.message,
        }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    return new Response(
      JSON.stringify({
        message: `Successfully inserted ${insertedData?.length || 0} bills with embeddings`,
        inserted: insertedData?.length || 0,
        skipped: existingLegNumbers.size,
        pagination: {
          offset,
          limit,
          returned: newBills.length,
          total: totalRows,
          hasMore: offset + limit < totalRows,
          nextOffset: offset + limit < totalRows ? offset + limit : null,
        },
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
