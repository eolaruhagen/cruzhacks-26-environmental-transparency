/**
 * Send Discord Notification Edge Function
 *
 * Purpose: Send error notifications to Discord webhook for pipeline monitoring.
 *
 * Payload:
 * - pipeline_stage: Current stage where error occurred
 * - error_type: Type of error (e.g., "Congress API Error", "LLM Error")
 * - incomplete_bills: Array of {legislation_number, missing_fields[]}
 * - additional_context: Optional additional context string
 *
 * Environment Variables:
 * - DISCORD_WEBHOOK_URL (required)
 */

import "@supabase/functions-js/edge-runtime.d.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface IncompleteBill {
  legislation_number: string;
  missing_fields: string[];
}

interface NotificationPayload {
  pipeline_stage: string;
  error_type: string;
  incomplete_bills?: IncompleteBill[];
  additional_context?: string;
}

/**
 * Format incomplete bills list for Discord message
 */
function formatIncompleteBills(bills: IncompleteBill[]): string {
  if (!bills || bills.length === 0) return "None";

  const maxToShow = 10;
  const formatted = bills.slice(0, maxToShow).map(b =>
    `• ${b.legislation_number} - [${b.missing_fields.join(", ")}]`
  ).join("\n");

  if (bills.length > maxToShow) {
    return formatted + `\n... and ${bills.length - maxToShow} more`;
  }
  return formatted;
}

/**
 * Send Discord webhook notification
 */
async function sendDiscordNotification(
  webhookUrl: string,
  payload: NotificationPayload
): Promise<void> {
  const embed = {
    title: "🚨 Congress Sync Error",
    color: 15158332, // Red color
    fields: [
      {
        name: "Stage",
        value: payload.pipeline_stage || "Unknown",
        inline: true,
      },
      {
        name: "Error",
        value: payload.error_type || "Unknown error",
        inline: true,
      },
      {
        name: "Incomplete Bills",
        value: String(payload.incomplete_bills?.length || 0),
        inline: true,
      },
    ],
    timestamp: new Date().toISOString(),
  };

  // Add missing data field if there are incomplete bills
  if (payload.incomplete_bills && payload.incomplete_bills.length > 0) {
    embed.fields.push({
      name: "Missing Data",
      value: formatIncompleteBills(payload.incomplete_bills),
      inline: false,
    });
  }

  // Add additional context if provided
  if (payload.additional_context) {
    embed.fields.push({
      name: "Context",
      value: payload.additional_context.substring(0, 1000), // Discord limit
      inline: false,
    });
  }

  const response = await fetch(webhookUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      embeds: [embed],
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Discord webhook error: ${response.status} - ${error}`);
  }
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const webhookUrl = Deno.env.get("DISCORD_WEBHOOK_URL");

    if (!webhookUrl) {
      return new Response(
        JSON.stringify({ error: "DISCORD_WEBHOOK_URL not configured" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const payload: NotificationPayload = await req.json();

    if (!payload.pipeline_stage || !payload.error_type) {
      return new Response(
        JSON.stringify({ error: "Missing required fields: pipeline_stage, error_type" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    await sendDiscordNotification(webhookUrl, payload);

    return new Response(
      JSON.stringify({
        success: true,
        message: "Discord notification sent successfully"
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    console.error("Error sending Discord notification:", errorMessage);
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
