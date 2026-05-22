import type { Sink, SessionEvent, SessionError, SessionStatus } from "./types.ts";

export class Session {
  readonly runId: string = globalThis.crypto.randomUUID();
  readonly startedAt: Date = new Date();

  private readonly fields: Map<string, unknown> = new Map();
  private currentStage: string | undefined;

  constructor(readonly name: string, private readonly sinks: readonly Sink[]) {}

  set(key: string, value: unknown): void {
    this.fields.set(key, value);
  }

  stage(name: string): void {
    this.currentStage = name;
  }

  complete(): Promise<void> {
    return this.dispatch("completed");
  }

  fail(err: unknown): Promise<void> {
    return this.dispatch("failed", normalizeError(err));
  }

  private async dispatch(status: SessionStatus, error?: SessionError): Promise<void> {
    const endedAt = new Date();
    const event: SessionEvent = {
      runId: this.runId,
      name: this.name,
      status,
      stage: this.currentStage,
      fields: Object.fromEntries(this.fields),
      startedAt: this.startedAt,
      endedAt,
      durationMs: endedAt.getTime() - this.startedAt.getTime(),
      ...(error && { error }),
    };
    // swallow sink failures so one bad sink can't break a session
    await Promise.all(this.sinks.map(async (s) => {
      try { await s.emit(event); } catch { /* swallow */ }
    }));
  }
}

function normalizeError(err: unknown): SessionError {
  if (err instanceof Error) {
    return err.stack ? { message: err.message, stack: err.stack } : { message: err.message };
  }
  return { message: String(err) };
}
