const UNAUTHORIZED_BODY = "Not authorized: invalid secret API key";

function unauthorized(): Response {
    return new Response(UNAUTHORIZED_BODY, { status: 401 });
}

/**
 * Validate the `apikey` header on an incoming request against the configured
 * SECRET_API_KEY env value. Returns null when the request is authorized, or
 * a 401 Response when it isn't.
 *
 * Newer Supabase versions reserve the Authorization header for end-user JWT
 * sessions and rewrite/strip it for service-to-service edge function calls.
 * Service traffic must carry the secret in the `apikey` header (raw value,
 * no scheme prefix).
 *
 * Pure function — does not touch Deno.env. Callers pass the env value, so
 * tests can inject without setenv mucking.
 *
 * Fail-closed semantics — every "not happy path" returns 401:
 *   - envSecretKey is empty/whitespace → 401 (unconfigured env counts as denial)
 *   - apikey header missing → 401
 *   - apikey is empty/whitespace → 401
 *   - apikey does not match envSecretKey → 401
 */
export function authenticateRequest(
    req: Request,
    envSecretKey: string,
): Response | null {
    if (envSecretKey.trim().length === 0) return unauthorized();

    const header = req.headers.get("apikey");
    if (!header) return unauthorized();

    const token = header.trim();
    if (token.length === 0) return unauthorized();

    if (token !== envSecretKey.trim()) return unauthorized();

    return null;
}
