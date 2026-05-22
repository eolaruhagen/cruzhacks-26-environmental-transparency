export type SessionStatus = "completed" | "failed";

export interface SessionError {
  message: string;
  stack?: string;
}

export interface SessionEvent {
  runId: string;
  name: string;
  status: SessionStatus;
  stage?: string;
  fields: Record<string, unknown>;
  error?: SessionError;
  startedAt: Date;
  endedAt: Date;
  durationMs: number;
}

export interface Sink {
  emit(event: SessionEvent): Promise<void> | void;
}
