import { assertEquals } from "jsr:@std/assert@1";
import { z } from "zod";
import { runEdgeInvocation } from "../edge-invocation.ts";

const SECRET = "test-secret-edge-invocation";

const TestSchema = z.object({
    kind: z.literal("manual"),
    reason: z.string(),
});

function reqWith(headers: Record<string, string>, body: string): Request {
    return new Request("https://example.com/fn", {
        method: "POST",
        headers,
        body,
    });
}

Deno.test("happy path: returns ok with parsed invocation", async () => {
    const req = reqWith(
        { Authorization: `Bearer ${SECRET}`, "Content-Type": "application/json" },
        JSON.stringify({ kind: "manual", reason: "smoke" }),
    );
    const result = await runEdgeInvocation({
        req,
        envSecretKey: SECRET,
        schema: TestSchema,
    });
    assertEquals(result.kind, "ok");
    if (result.kind === "ok") {
        assertEquals(result.invocation, { kind: "manual", reason: "smoke" });
    }
});

Deno.test("auth failure: deny with 401", async () => {
    const req = reqWith(
        { Authorization: "Bearer wrong" },
        JSON.stringify({ kind: "manual", reason: "smoke" }),
    );
    const result = await runEdgeInvocation({
        req,
        envSecretKey: SECRET,
        schema: TestSchema,
    });
    assertEquals(result.kind, "deny");
    if (result.kind === "deny") assertEquals(result.response.status, 401);
});

Deno.test("missing Authorization header: deny with 401", async () => {
    const req = reqWith({}, JSON.stringify({ kind: "manual", reason: "smoke" }));
    const result = await runEdgeInvocation({
        req,
        envSecretKey: SECRET,
        schema: TestSchema,
    });
    assertEquals(result.kind, "deny");
    if (result.kind === "deny") assertEquals(result.response.status, 401);
});

Deno.test("malformed JSON body: deny with 400 and informative body", async () => {
    const req = reqWith({ Authorization: `Bearer ${SECRET}` }, "{not json}");
    const result = await runEdgeInvocation({
        req,
        envSecretKey: SECRET,
        schema: TestSchema,
    });
    assertEquals(result.kind, "deny");
    if (result.kind === "deny") {
        assertEquals(result.response.status, 400);
        const body = await result.response.text();
        // Body must give a hint about JSON parsing — substring chosen so a
        // generic 400 wouldn't satisfy this test.
        assertEquals(body.toLowerCase().includes("json"), true);
    }
});

Deno.test("schema rejection: deny with 400 and validation message", async () => {
    const req = reqWith(
        { Authorization: `Bearer ${SECRET}` },
        JSON.stringify({ kind: "scheduled" }), // missing 'reason' for manual
    );
    const result = await runEdgeInvocation({
        req,
        envSecretKey: SECRET,
        schema: TestSchema,
    });
    assertEquals(result.kind, "deny");
    if (result.kind === "deny") {
        assertEquals(result.response.status, 400);
        const body = await result.response.text();
        // Body must mention the schema problem (Zod surfaces field paths).
        // A generic 400 without context wouldn't satisfy this assertion.
        assertEquals(body.length > 0, true);
        assertEquals(body.toLowerCase().includes("invalid"), true);
    }
});

Deno.test("auth check runs before body parse — bad auth + bad json still 401", async () => {
    // Reasoning: if both fail, we want to surface 401 (not leak parse errors
    // to unauthorized callers). Auth gate is the outermost layer.
    const req = reqWith({ Authorization: "Bearer wrong" }, "{not json}");
    const result = await runEdgeInvocation({
        req,
        envSecretKey: SECRET,
        schema: TestSchema,
    });
    assertEquals(result.kind, "deny");
    if (result.kind === "deny") assertEquals(result.response.status, 401);
});
