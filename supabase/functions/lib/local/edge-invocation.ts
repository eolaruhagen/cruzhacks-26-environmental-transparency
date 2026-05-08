import { z } from "zod";
import { authenticateRequest } from "./auth.ts";

/**
 * Composed entry-point helper for edge functions. Runs the three steps every
 * invocation needs before doing real work:
 *
 *   1. Auth gate (authenticateRequest) — Bearer token vs. SECRET_API_KEY.
 *   2. JSON parse on the request body — malformed bodies get 400.
 *   3. Schema parse against the caller-provided Zod schema — unknown shapes
 *      get 400 with the validation message in the response body.
 *
 * Returns a discriminated result so callers can either short-circuit (return
 * `result.response` straight to the client) or continue with `result.invocation`.
 *
 * Observability is deliberately not part of this helper. Whether an edge
 * function spins up a Discord-backed session is a per-function decision; the
 * helper stays pure and testable.
 */
export type EdgeInvocationResult<T> =
    | { kind: "ok"; invocation: T }
    | { kind: "deny"; response: Response };

export async function runEdgeInvocation<T>(opts: {
    req: Request;
    envSecretKey: string;
    schema: z.ZodType<T>;
}): Promise<EdgeInvocationResult<T>> {
    const authError = authenticateRequest(opts.req, opts.envSecretKey);
    if (authError) return { kind: "deny", response: authError };

    let raw: unknown;
    try {
        raw = await opts.req.json();
    } catch (err) {
        const detail = err instanceof Error ? err.message : String(err);
        return {
            kind: "deny",
            response: new Response(`Bad request: malformed JSON body (${detail})`, {
                status: 400,
            }),
        };
    }

    const parsed = opts.schema.safeParse(raw);
    if (!parsed.success) {
        return {
            kind: "deny",
            response: new Response(
                `Bad request: invalid invocation body — ${parsed.error.message}`,
                { status: 400 },
            ),
        };
    }

    return { kind: "ok", invocation: parsed.data };
}

// Re-export for symmetry — callers using runEdgeInvocation rarely need to
// call authenticateRequest directly, but keeping it accessible avoids a
// second import in edge functions that have non-standard entry paths.
export { authenticateRequest };
