import { Session } from "./session.ts";
import type { Sink } from "./types.ts";

export class ObservabilityProvider {
  constructor(private readonly sinks: Sink[]) {}

  async withSession<T>(name: string, fn: (s: Session) => Promise<T>): Promise<T> {
    const session = new Session(name, this.sinks);
    try {
      const result = await fn(session);
      await session.complete();
      return result;
    } catch (err) {
      await session.fail(err);
      throw err;
    }
  }
}
