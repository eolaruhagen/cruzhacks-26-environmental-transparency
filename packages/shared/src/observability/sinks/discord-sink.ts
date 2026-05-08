import type { Sink, SessionEvent, SessionStatus } from "../types.ts";

/**
 * Narrow contract for what DiscordSink needs from a fetch-like function.
 * Avoids depending on the runtime's full `typeof fetch`, which varies between
 * environments (Bun's `@types/bun` adds `preconnect`, etc.).
 */
export type FetchImpl = (
  url: string,
  init: { method: string; headers: Record<string, string>; body: string },
) => Promise<unknown>;

export interface DiscordSinkOptions {
  webhookUrl: string;
  fetchImpl?: FetchImpl;
  username?: string;
}

const COLORS: Record<SessionStatus, number> = {
  completed: 0x2ecc71,
  failed: 0xe74c3c,
};

const FIELD_VALUE_LIMIT = 1024;
const DESCRIPTION_LIMIT = 4096;
const MAX_FIELDS = 25;

export class DiscordSink implements Sink {
  private readonly webhookUrl: string;
  private readonly fetchImpl: FetchImpl;
  private readonly username?: string;

  constructor(opts: DiscordSinkOptions) {
    this.webhookUrl = opts.webhookUrl;
    this.fetchImpl = opts.fetchImpl ?? ((url, init) => globalThis.fetch(url, init));
    this.username = opts.username;
  }

  async emit(event: SessionEvent): Promise<void> {
    const body = JSON.stringify(this.buildPayload(event));
    try {
      await this.fetchImpl(this.webhookUrl, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body,
      });
    } catch (err) {
      console.error("[DiscordSink] webhook delivery failed", err);
    }
  }

  buildPayload(event: SessionEvent): Record<string, unknown> {
    const description = truncate(
      event.error
        ? `**Error:** ${event.error.message}${
          event.error.stack ? `\n\`\`\`\n${event.error.stack}\n\`\`\`` : ""
        }`
        : `Run \`${event.runId}\``,
      DESCRIPTION_LIMIT,
    );

    const baseFields: { name: string; value: string; inline?: boolean }[] = [
      { name: "runId", value: truncate(event.runId, FIELD_VALUE_LIMIT), inline: true },
      { name: "status", value: event.status, inline: true },
    ];
    if (event.stage) {
      baseFields.push({ name: "stage", value: truncate(event.stage, FIELD_VALUE_LIMIT), inline: true });
    }
    baseFields.push({ name: "durationMs", value: String(event.durationMs), inline: true });

    for (const [k, v] of Object.entries(event.fields)) {
      if (baseFields.length >= MAX_FIELDS) break;
      baseFields.push({
        name: truncate(k, 256),
        value: truncate(formatValue(v), FIELD_VALUE_LIMIT),
      });
    }

    const embed: Record<string, unknown> = {
      title: `${event.name} — ${event.status}`,
      description,
      color: COLORS[event.status],
      timestamp: event.endedAt.toISOString(),
      fields: baseFields.slice(0, MAX_FIELDS),
    };

    const payload: Record<string, unknown> = { embeds: [embed] };
    if (this.username) payload.username = this.username;
    return payload;
  }
}

function truncate(s: string, max: number): string {
  if (s.length <= max) return s;
  return s.slice(0, max - 1) + "…";
}

function formatValue(v: unknown): string {
  if (v === null || v === undefined) return String(v);
  if (typeof v === "string") return v;
  if (typeof v === "number" || typeof v === "boolean") return String(v);
  try {
    return JSON.stringify(v);
  } catch {
    return String(v);
  }
}
