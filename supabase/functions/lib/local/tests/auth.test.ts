import { assertEquals } from "jsr:@std/assert@1";
import { authenticateRequest } from "../auth.ts";

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
//
// Newer Supabase versions reserve the Authorization header for end-user JWTs
// and require service-to-service traffic to carry the secret in the `apikey`
// header (raw value, no scheme). That's what the gate enforces now.

Deno.test("returns null for valid apikey matching env", () => {
    const req = reqWith({ apikey: SECRET });
    assertEquals(authenticateRequest(req, SECRET), null);
});

Deno.test("returns null when apikey has trailing whitespace", () => {
    const req = reqWith({ apikey: `${SECRET}  ` });
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

Deno.test("returns 401 when apikey header is missing", async () => {
    const req = reqWith({});
    await assert401(authenticateRequest(req, SECRET));
});

Deno.test("returns 401 when apikey is empty", async () => {
    const req = reqWith({ apikey: "" });
    await assert401(authenticateRequest(req, SECRET));
});

Deno.test("returns 401 when apikey is whitespace-only", async () => {
    const req = reqWith({ apikey: "    " });
    await assert401(authenticateRequest(req, SECRET));
});

Deno.test("returns 401 when apikey does not match env", async () => {
    const req = reqWith({ apikey: "wrong-secret-xyz" });
    await assert401(authenticateRequest(req, SECRET));
});

Deno.test("returns 401 when envSecretKey is empty (unconfigured env)", async () => {
    const req = reqWith({ apikey: SECRET });
    await assert401(authenticateRequest(req, ""));
});

Deno.test("returns 401 when envSecretKey is whitespace-only", async () => {
    const req = reqWith({ apikey: SECRET });
    await assert401(authenticateRequest(req, "   "));
});

Deno.test("returns 401 when both env and apikey are empty (degenerate match)", async () => {
    // Defense in depth: even if both are empty/equal, do not authorize.
    // Otherwise unconfigured env + missing header would be a green light.
    const req = reqWith({ apikey: "" });
    await assert401(authenticateRequest(req, ""));
});

Deno.test(
    "returns 401 when secret is sent under Authorization: Bearer (legacy/wrong header)",
    async () => {
        // Newer Supabase strips the Authorization header on inbound traffic
        // when it looks like a service key. Tests guard against silently
        // re-accepting that path if someone re-introduces it.
        const req = reqWith({ Authorization: `Bearer ${SECRET}` });
        await assert401(authenticateRequest(req, SECRET));
    },
);
