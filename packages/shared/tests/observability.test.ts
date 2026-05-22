/**
 * Tests for the shared observability provider primitive.
 */
import { expect, test } from "bun:test";
import {
  DiscordSink,
  type FetchImpl,
  ObservabilityProvider,
  Session,
  type SessionEvent,
  type Sink,
} from "../src/observability/index.ts";

// Tiny inline sink for tests — captures every emit call.
class CapturingSink implements Sink {
  events: SessionEvent[] = [];
  emit(e: SessionEvent): void {
    this.events.push(e);
  }
}

// ---------------------------------------------------------------------------
// Session basics
// ---------------------------------------------------------------------------

test("session.runId is non-empty and unique across sessions", () => {
  const a = new Session("a", []);
  const b = new Session("b", []);
  expect(a.runId.length).toBeGreaterThan(0);
  expect(a.runId).not.toBe(b.runId);
});

test("set + complete emits one completed event with the field present", async () => {
  const sink = new CapturingSink();
  const s = new Session("test", [sink]);
  s.set("count", 5);
  await s.complete();
  expect(sink.events).toHaveLength(1);
  expect(sink.events[0]!.status).toBe("completed");
  expect(sink.events[0]!.fields.count).toBe(5);
});

test("stage is reflected in the emitted event", async () => {
  const sink = new CapturingSink();
  const s = new Session("test", [sink]);
  s.stage("fetching");
  await s.complete();
  expect(sink.events[0]!.stage).toBe("fetching");
});

test("fail(Error) emits failed event with message and stack", async () => {
  const sink = new CapturingSink();
  const s = new Session("test", [sink]);
  await s.fail(new Error("boom"));
  const e = sink.events[0]!;
  expect(e.status).toBe("failed");
  expect(e.error?.message).toBe("boom");
  expect(e.error?.stack).toBeTruthy();
});

test("fail(non-Error) emits failed event with String() message and no stack", async () => {
  const sink = new CapturingSink();
  const s = new Session("test", [sink]);
  await s.fail("just a string");
  const e = sink.events[0]!;
  expect(e.error?.message).toBe("just a string");
  expect(e.error?.stack).toBeUndefined();
});

test("complete sets endedAt and durationMs", async () => {
  const sink = new CapturingSink();
  const s = new Session("test", [sink]);
  await s.complete();
  const e = sink.events[0]!;
  expect(e.endedAt).toBeInstanceOf(Date);
  expect(e.durationMs).toBeGreaterThanOrEqual(0);
});

// ---------------------------------------------------------------------------
// Multi-sink dispatch
// ---------------------------------------------------------------------------

test("all sinks receive the same event", async () => {
  const a = new CapturingSink();
  const b = new CapturingSink();
  const s = new Session("test", [a, b]);
  await s.complete();
  expect(a.events).toHaveLength(1);
  expect(b.events).toHaveLength(1);
  expect(a.events[0]!.runId).toBe(b.events[0]!.runId);
});

test("a throwing sink does not break other sinks", async () => {
  const throwing: Sink = {
    emit() {
      throw new Error("sink failure");
    },
  };
  const good = new CapturingSink();
  const s = new Session("test", [throwing, good]);
  await s.complete();
  expect(good.events).toHaveLength(1);
});

// ---------------------------------------------------------------------------
// ObservabilityProvider.withSession
// ---------------------------------------------------------------------------

test("withSession auto-completes on success and returns the inner value", async () => {
  const sink = new CapturingSink();
  const obs = new ObservabilityProvider([sink]);
  const result = await obs.withSession("work", async (s) => {
    s.set("ok", true);
    return 42;
  });
  expect(result).toBe(42);
  expect(sink.events[0]!.status).toBe("completed");
  expect(sink.events[0]!.fields.ok).toBe(true);
});

test("withSession calls fail and rethrows when the inner function throws", async () => {
  const sink = new CapturingSink();
  const obs = new ObservabilityProvider([sink]);
  await expect(
    obs.withSession("work", async () => {
      throw new Error("nope");
    }),
  ).rejects.toThrow("nope");
  expect(sink.events[0]!.status).toBe("failed");
  expect(sink.events[0]!.error?.message).toBe("nope");
});

// ---------------------------------------------------------------------------
// DiscordSink
// ---------------------------------------------------------------------------

test("DiscordSink builds payload with green color on completed", async () => {
  const calls: { url: string; body: string }[] = [];
  const fakeFetch: FetchImpl = (url, init) => {
    calls.push({ url: String(url), body: String((init as { body?: unknown })?.body ?? "") });
    return Promise.resolve(new Response(null, { status: 204 }));
  };
  const sink = new DiscordSink({ webhookUrl: "https://hook/x", fetchImpl: fakeFetch });
  const s = new Session("work", [sink]);
  await s.complete();
  expect(calls).toHaveLength(1);
  const body = JSON.parse(calls[0]!.body);
  expect(body.embeds[0].color).toBe(0x2ecc71);
});

test("DiscordSink builds payload with red color on failed", async () => {
  const calls: { url: string; body: string }[] = [];
  const fakeFetch: FetchImpl = (url, init) => {
    calls.push({ url: String(url), body: String((init as { body?: unknown })?.body ?? "") });
    return Promise.resolve(new Response(null, { status: 204 }));
  };
  const sink = new DiscordSink({ webhookUrl: "https://hook/x", fetchImpl: fakeFetch });
  const s = new Session("work", [sink]);
  await s.fail(new Error("x"));
  const body = JSON.parse(calls[0]!.body);
  expect(body.embeds[0].color).toBe(0xe74c3c);
});

test("DiscordSink calls injected fetchImpl with POST and JSON content-type", async () => {
  let captured: { method?: string; ct?: string } = {};
  const fakeFetch: FetchImpl = (_url, init) => {
    const i = init as { method?: string; headers?: HeadersInit } | undefined;
    captured = {
      method: i?.method,
      ct: new Headers(i?.headers).get("content-type") ?? undefined,
    };
    return Promise.resolve(new Response(null, { status: 204 }));
  };
  const sink = new DiscordSink({ webhookUrl: "https://hook/x", fetchImpl: fakeFetch });
  const s = new Session("work", [sink]);
  await s.complete();
  expect(captured.method).toBe("POST");
  expect(captured.ct).toBe("application/json");
});

test("DiscordSink swallows fetch failures so the session still completes", async () => {
  const fakeFetch: FetchImpl = () => Promise.reject(new Error("network"));
  const sink = new DiscordSink({ webhookUrl: "https://hook/x", fetchImpl: fakeFetch });
  const s = new Session("work", [sink]);
  // Should resolve, not reject:
  await s.complete();
});

test("DiscordSink truncates field values over 1024 chars", async () => {
  let body: string = "";
  const fakeFetch: FetchImpl = (_url, init) => {
    body = String((init as { body?: unknown })?.body ?? "");
    return Promise.resolve(new Response(null, { status: 204 }));
  };
  const sink = new DiscordSink({ webhookUrl: "https://hook/x", fetchImpl: fakeFetch });
  const s = new Session("work", [sink]);
  s.set("big", "x".repeat(2000));
  await s.complete();
  const parsed = JSON.parse(body);
  const bigField = parsed.embeds[0].fields.find((f: { name: string }) => f.name === "big");
  expect(bigField).toBeDefined();
  expect(bigField.value.length).toBeLessThanOrEqual(1024);
  expect(bigField.value).toContain("…");
});
