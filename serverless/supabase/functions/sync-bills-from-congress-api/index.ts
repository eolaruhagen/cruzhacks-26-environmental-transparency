/**
 * Congress Collector Edge Function
 * 
 * Purpose: Scans Congress.gov API for bills updated since the last sync date.
 * Pushes raw bill identifiers into PGMQ for processing by the Data Fetcher.
 * 
 * Flow:
 * 1. Fetch last sync date from congress_sync_state.
 * 2. Fetch updated bills from /v3/bill (paginated using 'next' link).
 * 3. Push {congress, billType, billNumber} to 'raw_bills_queue'.
 * 4. Trigger 'bill-data-fetcher' via pg_net.
 * 5. Send Discord notification (success or failure) with all bill identifiers.
 */

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const CONGRESS_API_BASE = "https://api.congress.gov/v3";

interface CongressBill {
  congress: number;
  type: string;
  number: number;
  updateDate: string;
}

type SupabaseClient = ReturnType<typeof createClient>;

// Helper to format bill identifier consistently: "H.R. 123 (119)"
function formatBillId(congress: number, type: string, number: number): string {
  const typeMap: Record<string, string> = {
    "HR": "H.R.", "S": "S.", "HJRES": "H.J.Res.", "SJRES": "S.J.Res.",
    "HCONRES": "H.Con.Res.", "SCONRES": "S.Con.Res.", "HRES": "H.Res.", "SRES": "S.Res.",
  };
  const formattedType = typeMap[type.toUpperCase()] || type;
  return `${formattedType} ${number} (${congress})`;
}

async function sendDiscordNotification(
  webhookUrl: string,
  success: boolean,
  data: {
    queued?: number;
    since?: string;
    billIds?: string[];
    error?: string;
    stage?: string;
  }
): Promise<void> {
  const embeds = [];
  
  if (success) {
    embeds.push({
      title: "📥 Collector Complete",
      color: 5763719, // Green
      fields: [
        { name: "Status", value: "Bills queued for processing", inline: true },
        { name: "Bills Queued", value: String(data.queued || 0), inline: true },
        { name: "Since", value: data.since || "N/A", inline: true },
      ],
      timestamp: new Date().toISOString(),
    });
    
    // Add bill identifiers as a second embed if there are any
    if (data.billIds && data.billIds.length > 0) {
      // Group into chunks for better readability
      const billList = data.billIds.slice(0, 50).join("\n");
      embeds.push({
        title: `📋 Bills Queued (${data.billIds.length} total)`,
        color: 3447003, // Blue
        description: billList.substring(0, 4000),
        footer: data.billIds.length > 50 
          ? { text: `... and ${data.billIds.length - 50} more` }
          : undefined,
      });
    }
  } else {
    embeds.push({
      title: "🚨 Collector Error",
      color: 15158332, // Red
      fields: [
        { name: "Stage", value: data.stage || "unknown", inline: true },
        { name: "Error", value: (data.error || "Unknown error").substring(0, 1000), inline: false },
      ],
      timestamp: new Date().toISOString(),
    });
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

Deno.serve(async (req: Request) => {
  let currentStage = "init";
  let lastSync = "";
  let discordUrl = "";

  try {
    // Stage: Initialize clients
    currentStage = "init_supabase_client";
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    const congressApiKey = Deno.env.get("CONGRESS_API_KEY");
    discordUrl = Deno.env.get("DISCORD_WEBHOOK_URL") ?? "";
    
    if (!supabaseUrl || !supabaseKey) {
      throw new Error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY env vars");
    }
    if (!congressApiKey) {
      throw new Error("Missing CONGRESS_API_KEY env var");
    }

    const supabase = createClient(supabaseUrl, supabaseKey);

    // Stage: Get last sync date
    currentStage = "fetch_sync_state";
    const { data: syncState, error: syncStateError } = await supabase
      .from("congress_sync_state")
      .select("last_sync_date")
      .order("updated_at", { ascending: false })
      .limit(1)
      .single();

    if (syncStateError && syncStateError.code !== "PGRST116") {
      throw new Error(`Failed to fetch sync state: ${syncStateError.message}`);
    }

    // Use yesterday if no last sync date exists
    lastSync = syncState?.last_sync_date 
      ? new Date(syncState.last_sync_date).toISOString().split(".")[0] + "Z"
      : new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString().split(".")[0] + "Z";

    console.log("=== COLLECTOR STARTING ===");
    console.log("Collecting bills updated since: " + lastSync);

    // Stage: Fetch from Congress API and collect all bills
    currentStage = "fetch_congress_api";
    let nextUrl: string | null = `${CONGRESS_API_BASE}/bill?fromDateTime=${lastSync}&limit=250&api_key=${congressApiKey}&format=json`;
    let pageNum = 0;
    
    // Use a Map to dedupe bills by unique key (congress-type-number)
    const billsMap = new Map<string, { congress: number; bill_type: string; bill_number: number }>();

    // Fetch all pages first
    while (nextUrl) {
      pageNum++;
      currentStage = `fetch_congress_api_page_${pageNum}`;
      
      console.log("Fetching page " + pageNum + "...");
      
      const response = await fetch(nextUrl);
      if (!response.ok) {
        const errorBody = await response.text().catch(() => "");
        throw new Error(`Congress API error: ${response.status} ${response.statusText}. Body: ${errorBody.substring(0, 200)}`);
      }
      
      const data = await response.json();
      const bills: CongressBill[] = data.bills || [];

      console.log("  Page " + pageNum + ": " + bills.length + " bills");

      // Dedupe by adding to Map (later entries overwrite earlier ones)
      for (const b of bills) {
        const key = `${b.congress}-${b.type}-${b.number}`;
        billsMap.set(key, {
          congress: b.congress,
          bill_type: b.type,
          bill_number: b.number,
        });
      }

      nextUrl = data.pagination?.next 
        ? `${data.pagination.next}&api_key=${congressApiKey}&format=json` 
        : null;
    }

    // Convert Map to array
    const uniqueBills = Array.from(billsMap.values());
    
    // Create formatted bill IDs for logging and Discord
    const billIds = uniqueBills.map(b => formatBillId(b.congress, b.bill_type, b.bill_number));
    
    console.log("=== FETCHED " + uniqueBills.length + " UNIQUE BILLS FROM " + pageNum + " PAGES ===");
    console.log("Bill identifiers:");
    for (const id of billIds) {
      console.log("  - " + id);
    }
    console.log("=== END BILL LIST ===");

    // Stage: Queue to PGMQ (in batches of 250 to avoid payload limits)
    let totalQueued = 0;
    if (uniqueBills.length > 0) {
      currentStage = "queue_pgmq_batch";
      const BATCH_SIZE = 250;
      
      for (let i = 0; i < uniqueBills.length; i += BATCH_SIZE) {
        const batch = uniqueBills.slice(i, i + BATCH_SIZE);
        const batchNum = Math.floor(i / BATCH_SIZE) + 1;
        currentStage = `queue_pgmq_batch_${batchNum}`;
        
        console.log("Queueing batch " + batchNum + ": " + batch.length + " bills");
        
        const { error: pgmqError } = await supabase.rpc("pgmq_send_batch", {
          queue_name: "raw_bills_queue",
          msgs: batch,
        });

        if (pgmqError) {
          throw new Error(`PGMQ send_batch failed: ${pgmqError.message}`);
        }
        totalQueued += batch.length;
      }
    }

    console.log("=== QUEUED " + totalQueued + " UNIQUE BILLS ===");

    // Stage: Trigger next step
    currentStage = "trigger_next_step";
    if (totalQueued > 0) {
      console.log("Triggering bill-data-fetcher...");
      await triggerNextStep(supabase, "bill-data-fetcher");
    } else {
      // No new bills - trigger categorizer to check for any pending work
      console.log("No new bills. Triggering categorize-bills...");
      await triggerNextStep(supabase, "categorize-bills");
    }

    // Stage: Update sync state
    currentStage = "update_sync_state";
    const { data: stateRow } = await supabase
      .from("congress_sync_state")
      .select("id")
      .order("updated_at", { ascending: false })
      .limit(1)
      .single();

    if (stateRow) {
      const { error: updateError } = await supabase.from("congress_sync_state").update({
        collector_status: "idle",
        last_sync_date: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      }).eq("id", stateRow.id);
      
      if (updateError) {
        console.warn(`Failed to update sync state: ${updateError.message}`);
      }
    }

    // Stage: Send success notification with bill identifiers
    currentStage = "send_success_notification";
    if (discordUrl) {
      await sendDiscordNotification(discordUrl, true, {
        queued: totalQueued,
        since: lastSync,
        billIds,
      });
    }

    console.log("=== COLLECTOR COMPLETE ===");

    return new Response(JSON.stringify({ 
      success: true, 
      queued: totalQueued,
      bills: billIds,
    }), {
      headers: { "Content-Type": "application/json" },
    });

  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    const fullError = `[${currentStage}] ${errorMsg}`;
    console.error("=== COLLECTOR ERROR ===");
    console.error("Stage:", currentStage);
    console.error("Error:", errorMsg);
    console.error("=== END ERROR ===");

    // Send failure Discord notification
    if (discordUrl) {
      await sendDiscordNotification(discordUrl, false, {
        error: errorMsg,
        stage: currentStage,
      });
    }

    return new Response(JSON.stringify({ 
      error: errorMsg,
      stage: currentStage,
      function: "sync-bills-from-congress-api"
    }), { 
      status: 500, 
      headers: { "Content-Type": "application/json" },
    });
  }
});
