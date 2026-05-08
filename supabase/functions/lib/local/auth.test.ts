import { assertEquals } from "jsr:@std/assert@1";
import { authenticateRequest } from "./auth.ts";

const SECRET = "test-secret-abc123";

function reqWith(headers: Record<string, string>): Request {
    return new Request("https://example.com/fn", {
        method: "POST",
        headers,
        body: '{"kind":"manual","reason":"test"}',
    });
}

// ---------------------------------------------------------------------------
// Authorized paths — should return null (no error response)
// ---------------------------------------------------------------------------

Deno.test("returns null for valid Bearer token matching env", () => {
    const req = reqWith({ Authorization: `Bearer ${SECRET}` });
    assertEquals(authenticateRequest(req, SECRET), null);
});

Deno.test("returns null for case-insensitive 'bearer' prefix", () => {
    const req = reqWith({ Authorization: `bearer ${SECRET}` });
    assertEquals(authenticateRequest(req, SECRET), null);
});

Deno.test("returns null for uppercase 'BEARER' prefix", () => {
    const req = reqWith({ Authorization: `BEARER ${SECRET}` });
    assertEquals(authenticateRequest(req, SECRET), null);
});

Deno.test("returns null when token has trailing whitespace", () => {
    const req = reqWith({ Authorization: `Bearer ${SECRET}  ` });
    assertEquals(authenticateRequest(req, SECRET), null);
});

// ---------------------------------------------------------------------------
// Sad paths — every one returns a real 401 Response
// ---------------------------------------------------------------------------

async function assert401(resp: Response | null) {
    assertEquals(resp instanceof Response, true);
    assertEquals(resp!.status, 401);
    const body = await resp!.text();
    assertEquals(body.length > 0, true); // body is informative, not empty
}

Deno.test("returns 401 when Authorization header is missing", async () => {
    const req = reqWith({});
    await assert401(authenticateRequest(req, SECRET));
});

Deno.test("returns 401 when Bearer prefix is missing (no scheme)", async () => {
    // Strict: just sending the raw secret as the header value should NOT auth.
    // Defends against misconfigured callers that drop the scheme.
    const req = reqWith({ Authorization: SECRET });
    await assert401(authenticateRequest(req, SECRET));
});

Deno.test("returns 401 when Bearer prefix has empty token", async () => {
    const req = reqWith({ Authorization: "Bearer " });
    await assert401(authenticateRequest(req, SECRET));
});

Deno.test("returns 401 when Bearer prefix has whitespace-only token", async () => {
    const req = reqWith({ Authorization: "Bearer    " });
    await assert401(authenticateRequest(req, SECRET));
});

Deno.test("returns 401 when token does not match env", async () => {
    const req = reqWith({ Authorization: "Bearer wrong-secret-xyz" });
    await assert401(authenticateRequest(req, SECRET));
});

Deno.test("returns 401 when envSecretKey is empty (unconfigured env)", async () => {
    const req = reqWith({ Authorization: `Bearer ${SECRET}` });
    await assert401(authenticateRequest(req, ""));
});

Deno.test("returns 401 when envSecretKey is whitespace-only", async () => {
    const req = reqWith({ Authorization: `Bearer ${SECRET}` });
    await assert401(authenticateRequest(req, "   "));
});

Deno.test("returns 401 when both env and token are empty (degenerate match)", async () => {
    // Defense in depth: even if both are empty/equal, do not authorize.
    // Otherwise unconfigured env + missing header would be a green light.
    const req = reqWith({ Authorization: "Bearer " });
    await assert401(authenticateRequest(req, ""));
});
