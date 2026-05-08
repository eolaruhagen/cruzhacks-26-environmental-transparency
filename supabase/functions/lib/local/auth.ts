const UNAUTHORIZED_BODY = "Not authorized: invalid secret API key";

function unauthorized(): Response {
    return new Response(UNAUTHORIZED_BODY, { status: 401 });
}

/**
 * Validate the Bearer token on an incoming request against the configured
 * SECRET_API_KEY env value. Returns null when the request is authorized, or a
 * 401 Response when it isn't.
 *
 * Pure function — does not touch Deno.env. Callers pass the env value, so
 * tests can inject without setenv mucking.
 *
 * Fail-closed semantics — every "not happy path" returns 401:
 *   - envSecretKey is empty/whitespace → 401 (unconfigured env counts as denial)
 *   - Authorization header missing → 401
 *   - Authorization present but no "Bearer" scheme → 401 (strict: do not
 *     authorize a bare secret in the header, even if it happens to match)
 *   - Bearer prefix present but value is empty/whitespace → 401
 *   - token does not match envSecretKey → 401
 *
 * Bearer prefix is case-insensitive ("Bearer", "bearer", "BEARER") and any
 * surrounding whitespace on the value is trimmed.
 */
export function authenticateRequest(
    req: Request,
    envSecretKey: string,
): Response | null {
    if (envSecretKey.trim().length === 0) return unauthorized();

    const header = req.headers.get("authorization");
    if (!header) return unauthorized();

    const match = header.match(/^bearer\s+(.*)$/i);
    if (!match) return unauthorized();

    const token = match[1].trim();
    if (token.length === 0) return unauthorized();

    if (token !== envSecretKey.trim()) return unauthorized();

    return null;
}
