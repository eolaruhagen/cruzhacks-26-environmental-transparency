/**
 * Bill Data Fetcher Edge Function
 * 
 * Purpose: Pops bills from the PGMQ queue, filters for Environmental Protection,
 * fetches full details from Congress API, and inserts into house_bills.
 * 
 * Flow:
 * 1. Pop up to 20 bills from raw_bills_queue.
 * 2. For each bill: fetch subjects -> filter -> fetch details -> insert.
 * 3. Track API request count (max 4500/day safety limit).
 * 4. If queue not empty AND under limit -> trigger self via pg_net.
 * 5. If queue empty -> trigger categorize-bills.
 * 6. Send Discord notification on progress/pause/failure.
 */

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const CONGRESS_API_BASE = "https://api.congress.gov/v3";
const BATCH_SIZE = 20;
const DAILY_REQUEST_LIMIT = 4500;
const MAX_RETRIES = 5;

interface QueueMessage {
  msg_id: number;
  read_ct: number;
  message: {
    congress: number;
    bill_type: string;
    bill_number: number;
  };
}

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

type SupabaseClient = ReturnType<typeof createClient>;

// Discord notification types
type NotificationType = "progress" | "paused" | "error" | "queue_empty";

async function sendDiscordNotification(
  webhookUrl: string,
  type: NotificationType,
  data: {
    processed?: number;
    inserted?: number;
    remaining?: number;
    dailyRequests?: number;
    error?: string;
    stage?: string;
    bill?: string;
  }
): Promise<void> {
  let embed;
  
  switch (type) {
    case "progress":
      embed = {
        title: "⚙️ Data Fetcher Progress",
        color: 3447003, // Blue
        fields: [
          { name: "Processed", value: `${data.processed} bills`, inline: true },
          { name: "Inserted", value: `${data.inserted} environmental`, inline: true },
          { name: "Remaining", value: `${data.remaining} in queue`, inline: true },
          { name: "Daily Requests", value: `${data.dailyRequests}/4500`, inline: true },
        ],
        timestamp: new Date().toISOString(),
      };
      break;
    case "paused":
      embed = {
        title: "⏸️ Data Fetcher Paused",
        color: 16776960, // Yellow
        fields: [
          { name: "Reason", value: "Daily request limit reached", inline: true },
          { name: "Requests Used", value: `${data.dailyRequests}/4500`, inline: true },
          { name: "Remaining", value: `${data.remaining} bills in queue`, inline: true },
          { name: "Resume", value: "Tomorrow at midnight UTC", inline: false },
        ],
        timestamp: new Date().toISOString(),
      };
      break;
    case "queue_empty":
      embed = {
        title: "✅ Data Fetcher Complete",
        color: 5763719, // Green
        fields: [
          { name: "Status", value: "Queue empty - all bills processed", inline: false },
          { name: "Next Step", value: "Triggering Categorizer", inline: false },
        ],
        timestamp: new Date().toISOString(),
      };
      break;
    case "error":
      embed = {
        title: "🚨 Data Fetcher Error",
        color: 15158332, // Red
        fields: [
          { name: "Stage", value: data.stage || "unknown", inline: true },
          { name: "Bill", value: data.bill || "N/A", inline: true },
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

function mapBillType(apiType: string): string {
  const typeMap: Record<string, string> = {
    "HR": "H.R.", "S": "S.", "HJRES": "H.J.Res.", "SJRES": "S.J.Res.",
    "HCONRES": "H.Con.Res.", "SCONRES": "S.Con.Res.", "HRES": "H.Res.", "SRES": "S.Res.",
  };
  return typeMap[apiType.toUpperCase()] || apiType;
}

function mapBillTypeToPath(apiType: string): string {
  return apiType.toLowerCase().replace(/\./g, "");
}

function determineTrackerStage(latestAction: string): string {
  const action = latestAction.toLowerCase();
  if (action.includes("became public law") || action.includes("signed by president")) return "Became Law";
  if (action.includes("passed senate") && action.includes("passed house")) return "To President";
  if (action.includes("passed senate")) return "Passed Senate";
  if (action.includes("passed house")) return "Passed House";
  if (action.includes("reported") || action.includes("committee")) return "In Committee";
  return "Introduced";
}

function cleanHtml(text: string): string {
  if (!text) return "";
  return text.replace(/<[^>]*>/g, "").replace(/&nbsp;/g, " ").replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'").replace(/\s+/g, " ").trim();
}

async function congressApiRequest<T>(endpoint: string, apiKey: string): Promise<T> {
  const url = `${CONGRESS_API_BASE}${endpoint}${endpoint.includes("?") ? "&" : "?"}api_key=${apiKey}&format=json`;
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Congress API error: ${response.status}`);
  return response.json();
}

async function processOneBill(
  supabase: SupabaseClient,
  congress: number,
  billType: string,
  billNumber: number,
  apiKey: string
): Promise<{ inserted: boolean; requests: number; error?: string }> {
  let requestCount = 0;
  const typePath = mapBillTypeToPath(billType);
  const legislationNumber = `${mapBillType(billType)} ${billNumber} (${congress})`;

  try {
    // 1. Check if already exists
    const { data: existing } = await supabase
      .from("house_bills")
      .select("id")
      .eq("legislation_number", legislationNumber)
      .single();
    
    if (existing) {
      console.log(`Bill ${legislationNumber} already exists, skipping.`);
      return { inserted: false, requests: 0 };
    }

    // 2. Fetch subjects (1 request)
    const subjectsData = await congressApiRequest<{
      subjects?: { legislativeSubjects?: { name: string }[]; policyArea?: { name: string } }
    }>(`/bill/${congress}/${typePath}/${billNumber}/subjects`, apiKey);
    requestCount++;

    const subjects: string[] = [];
    if (subjectsData.subjects?.legislativeSubjects) {
      subjects.push(...subjectsData.subjects.legislativeSubjects.map(s => s.name));
    }
    if (subjectsData.subjects?.policyArea?.name) {
      subjects.push(subjectsData.subjects.policyArea.name);
    }

    // 3. Filter: Skip if not Environmental Protection
    const isEnvironmental = subjects.some(s => 
      s.toLowerCase().includes("environmental protection")
    );
    
    if (!isEnvironmental) {
      console.log(`Bill ${legislationNumber} not environmental, skipping.`);
      return { inserted: false, requests: requestCount };
    }

    // 4. Fetch full details (4 more requests)
    const [detailsData, committeesData, cosponsorsData, summariesData] = await Promise.all([
      congressApiRequest<{ bill: any }>(`/bill/${congress}/${typePath}/${billNumber}`, apiKey),
      congressApiRequest<{ committees?: { name: string }[] }>(`/bill/${congress}/${typePath}/${billNumber}/committees`, apiKey),
      congressApiRequest<{ cosponsors?: { fullName: string }[] }>(`/bill/${congress}/${typePath}/${billNumber}/cosponsors`, apiKey),
      congressApiRequest<{ summaries?: { text: string }[] }>(`/bill/${congress}/${typePath}/${billNumber}/summaries`, apiKey),
    ]);
    requestCount += 4;

    const bill = detailsData.bill;
    const committees = committeesData.committees?.map(c => c.name) || [];
    const cosponsors = cosponsorsData.cosponsors?.map(c => c.fullName) || [];
    const summary = summariesData.summaries?.length 
      ? cleanHtml(summariesData.summaries[summariesData.summaries.length - 1].text)
      : null;

    // 5. Build BillData
    const billData: BillData = {
      legislation_number: legislationNumber,
      url: `https://www.congress.gov/bill/${congress}th-congress/${billType.toLowerCase()}-bill/${billNumber}`,
      congress: `${congress}th Congress`,
      title: bill?.title || "",
      sponsor: bill?.sponsors?.[0]?.fullName || "",
      party_of_sponsor: bill?.sponsors?.[0]?.party || "",
      date_of_introduction: bill?.introducedDate || null,
      committees: committees.length > 0 ? committees.join("; ") : null,
      latest_action: bill?.latestAction?.text || "",
      latest_action_date: bill?.latestAction?.actionDate || null,
      latest_tracker_stage: determineTrackerStage(bill?.latestAction?.text || ""),
      cosponsors,
      num_cosponsors: cosponsors.length,
      subject_terms: subjects,
      bill_policy_area: bill?.policyArea?.name || null,
      latest_summary: summary,
    };

    // 5b. Validate data integrity before inserting
    const validLegislationFormat = /^(H\.R\.|S\.|H\.Res\.|S\.Res\.|H\.J\.Res\.|S\.J\.Res\.|H\.Con\.Res\.|S\.Con\.Res\.) \d+ \(\d+\)$/;
    if (!validLegislationFormat.test(legislationNumber)) {
      console.error(`[SKIP] Invalid legislation_number format: "${legislationNumber}"`);
      return { inserted: false, requests: requestCount, error: `Invalid legislation_number format: ${legislationNumber}` };
    }
    
    // Check if title looks like corrupted sponsor data
    const corruptedTitlePattern = /\[Sen\.|Rep\.\-[A-Z]{1,2}\-[A-Z]{2}\]/;
    if (corruptedTitlePattern.test(billData.title)) {
      console.error(`[SKIP] Title looks like corrupted sponsor data: "${billData.title}"`);
      return { inserted: false, requests: requestCount, error: `Corrupted title (sponsor pattern): ${billData.title}` };
    }

    // 6. Insert (category and embedding will be NULL for now)
    const { error: insertError } = await supabase
      .from("house_bills")
      .upsert(billData, { onConflict: "legislation_number" });

    if (insertError) throw insertError;

    console.log(`Inserted bill ${legislationNumber}`);
    return { inserted: true, requests: requestCount };

  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : "Unknown error";
    return { inserted: false, requests: requestCount, error: errorMsg };
  }
}

Deno.serve(async (req: Request) => {
  let currentStage = "init";
  let discordUrl = "";
  let currentBill = "";

  try {
    // Stage: Initialize
    currentStage = "init_env_vars";
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    const apiKey = Deno.env.get("CONGRESS_API_KEY");
    discordUrl = Deno.env.get("DISCORD_WEBHOOK_URL") ?? "";

    if (!supabaseUrl || !supabaseKey) {
      throw new Error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY env vars");
    }
    if (!apiKey) {
      throw new Error("Missing CONGRESS_API_KEY env var");
    }

    currentStage = "init_supabase_client";
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Stage: Check daily request count
    currentStage = "fetch_daily_request_count";
    const { data: syncState, error: syncStateError } = await supabase
      .from("congress_sync_state")
      .select("daily_request_count")
      .order("updated_at", { ascending: false })
      .limit(1)
      .single();

    if (syncStateError && syncStateError.code !== "PGRST116") {
      throw new Error(`Failed to fetch sync state: ${syncStateError.message}`);
    }

    let dailyCount = syncState?.daily_request_count || 0;

    if (dailyCount >= DAILY_REQUEST_LIMIT) {
      console.log(`Daily limit reached (${dailyCount}). Stopping until tomorrow.`);
      
      currentStage = "fetch_queue_stats_for_pause";
      const { data: queueStats } = await supabase.rpc("pgmq_metrics", { queue_name: "raw_bills_queue" });
      const remaining = queueStats?.[0]?.queue_length || 0;
      
      if (discordUrl) {
        await sendDiscordNotification(discordUrl, "paused", {
          dailyRequests: dailyCount,
          remaining,
        });
      }
      
      return new Response(JSON.stringify({ 
        success: true, 
        message: "Daily limit reached, will resume tomorrow",
        daily_count: dailyCount,
      }), { headers: { "Content-Type": "application/json" } });
    }

    // Stage: Pop messages from queue
    currentStage = "pgmq_read_batch";
    const { data: messages, error: popError } = await supabase.rpc("pgmq_read_batch", {
      queue_name: "raw_bills_queue",
      batch_size: BATCH_SIZE,
      visibility_timeout: 300,
    });

    if (popError) {
      throw new Error(`PGMQ read_batch failed: ${popError.message}`);
    }

    if (!messages || messages.length === 0) {
      console.log("Queue empty. Triggering categorizer.");
      
      if (discordUrl) {
        await sendDiscordNotification(discordUrl, "queue_empty", {});
      }
      
      currentStage = "trigger_categorizer_empty_queue";
      await triggerNextStep(supabase, "categorize-bills");
      return new Response(JSON.stringify({ 
        success: true, 
        message: "Queue empty, triggered categorizer",
      }), { headers: { "Content-Type": "application/json" } });
    }

    // Stage: Dedupe messages by unique bill key (congress-type-number)
    currentStage = "dedupe_messages";
    const billToMsgIds = new Map<string, { 
      congress: number; 
      bill_type: string; 
      bill_number: number; 
      msg_ids: number[];
      max_read_ct: number;
    }>();

    for (const msg of messages as QueueMessage[]) {
      const { congress, bill_type, bill_number } = msg.message;
      const key = `${congress}-${bill_type}-${bill_number}`;
      
      if (billToMsgIds.has(key)) {
        // Bill already seen - just track the additional msg_id
        const existing = billToMsgIds.get(key)!;
        existing.msg_ids.push(msg.msg_id);
        existing.max_read_ct = Math.max(existing.max_read_ct, msg.read_ct);
      } else {
        billToMsgIds.set(key, {
          congress,
          bill_type,
          bill_number,
          msg_ids: [msg.msg_id],
          max_read_ct: msg.read_ct,
        });
      }
    }

    const uniqueBills = Array.from(billToMsgIds.values());
    console.log(`Processing ${uniqueBills.length} unique bills from ${messages.length} queue messages...`);

    // Stage: Process each unique bill
    currentStage = "process_bills_loop";
    let totalInserted = 0;
    let totalRequests = 0;
    const failedBills: { msg_ids: number[]; legislation: string; error: string }[] = [];

    for (const bill of uniqueBills) {
      const { congress, bill_type, bill_number, msg_ids, max_read_ct } = bill;
      // Use consistent formatting: "H.R. 123 (119)" everywhere
      const formattedLegislation = `${mapBillType(bill_type)} ${bill_number} (${congress})`;
      currentBill = formattedLegislation;
      currentStage = `process_bill:${currentBill}`;
      
      const result = await processOneBill(supabase, congress, bill_type, bill_number, apiKey);
      
      totalRequests += result.requests;
      dailyCount += result.requests;

      if (result.error) {
        if (max_read_ct >= MAX_RETRIES) {
          currentStage = `archive_failed_bill:${currentBill}`;
          await supabase.from("incomplete_bills").upsert({
            legislation_number: formattedLegislation,
            congress: String(congress),
            bill_type: mapBillType(bill_type),
            bill_number: String(bill_number),
            missing_fields: ["fetch_failed"],
            error_context: result.error,
            resolved: false,
          }, { onConflict: "legislation_number" });
          
          // Archive ALL duplicate messages for this bill
          for (const msgId of msg_ids) {
            await supabase.rpc("pgmq_archive", { queue_name: "raw_bills_queue", msg_id: msgId });
          }
          failedBills.push({ msg_ids, legislation: formattedLegislation, error: result.error });
        }
        // If not max retries, messages will become visible again after timeout
      } else {
        currentStage = `archive_success_bill:${currentBill}`;
        // Archive ALL duplicate messages for this bill
        for (const msgId of msg_ids) {
          await supabase.rpc("pgmq_archive", { queue_name: "raw_bills_queue", msg_id: msgId });
        }
        if (result.inserted) totalInserted++;
      }

      if (dailyCount >= DAILY_REQUEST_LIMIT) {
        console.log("Approaching daily limit, stopping early.");
        break;
      }
    }

    currentBill = ""; // Clear after loop

    // Stage: Update daily request count
    currentStage = "increment_api_request_count";
    const { error: incrementError } = await supabase.rpc("increment_api_request_count", { p_increment: totalRequests });
    if (incrementError) {
      console.warn(`Failed to increment API request count: ${incrementError.message}`);
    }

    // Stage: Check remaining work
    currentStage = "fetch_queue_stats";
    const { data: queueStats } = await supabase.rpc("pgmq_metrics", { queue_name: "raw_bills_queue" });
    const remainingMessages = queueStats?.[0]?.queue_length || 0;

    // Stage: Send progress notification
    currentStage = "send_progress_notification";
    if (discordUrl) {
      if (dailyCount >= DAILY_REQUEST_LIMIT) {
        await sendDiscordNotification(discordUrl, "paused", {
          dailyRequests: dailyCount,
          remaining: remainingMessages,
        });
      } else {
        await sendDiscordNotification(discordUrl, "progress", {
          processed: uniqueBills.length,
          inserted: totalInserted,
          remaining: remainingMessages,
          dailyRequests: dailyCount,
        });
      }
    }

    // Stage: Trigger next step
    currentStage = "trigger_next_step";
    if (remainingMessages > 0 && dailyCount < DAILY_REQUEST_LIMIT) {
      console.log(`${remainingMessages} bills remaining. Triggering self.`);
      await triggerNextStep(supabase, "bill-data-fetcher");
    } else if (remainingMessages === 0) {
      console.log("All bills processed. Triggering categorizer.");
      await triggerNextStep(supabase, "categorize-bills");
    }

    return new Response(JSON.stringify({
      success: true,
      queue_messages: messages.length,
      unique_bills_processed: uniqueBills.length,
      inserted: totalInserted,
      requests_made: totalRequests,
      daily_total: dailyCount,
      remaining_in_queue: remainingMessages,
      failed: failedBills,
    }), { headers: { "Content-Type": "application/json" } });

  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    const fullError = `[${currentStage}] ${errorMsg}`;
    console.error("Data Fetcher error:", fullError);
    
    if (discordUrl) {
      await sendDiscordNotification(discordUrl, "error", {
        error: errorMsg,
        stage: currentStage,
        bill: currentBill || undefined,
      });
    }
    
    return new Response(JSON.stringify({ 
      error: errorMsg,
      stage: currentStage,
      bill: currentBill || undefined,
      function: "bill-data-fetcher"
    }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
});
