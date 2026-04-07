import { describe, test, expect } from "bun:test";
import { JinaResponseSchema } from "../jina";
import { EmbeddingResponseSchema } from "../embeddings";


describe("JinaResponseSchema", () => {
    test("parses a valid response with content", () => {
        const response = {
            code: 200,
            data: {
                content: "# someting someting markdown here yay not a 409 please",
                title: "Article Title",
                url: "https://example.com/article",
            },
        };
        const parsed = JinaResponseSchema.parse(response);
        expect(parsed.data.content).toContain("someting someting");
    });

    test("parses response with null content (paywall/empty)", () => {
        const response = {
            code: 200,
            data: { content: null, title: "Paywalled Article" },
        };
        const parsed = JinaResponseSchema.parse(response);
        expect(parsed.data.content).toBeNull();
    });

    test("parses response with minimal data (content only)", () => {
        const response = {
            code: 200,
            data: { content: "some markdown" },
        };
        const parsed = JinaResponseSchema.parse(response);
        expect(parsed.data.content).toBe("some markdown");
    });

    test("Rejects when data field is missing", () => {
        expect(() => JinaResponseSchema.parse({ code: 200 })).toThrow();
    });

    test("Rejects when data is a string instead of object", () => {
        expect(() => JinaResponseSchema.parse({
            code: 200,
            data: "raw text response",
        })).toThrow();
    });

    test("Rejects when code is missing", () => {
        expect(() => JinaResponseSchema.parse({
            data: { content: "text" },
        })).toThrow();
    });

    test("Rejects when response is completely different envelope", () => {
        expect(() => JinaResponseSchema.parse({
            error: "rate_limited",
            message: "Too many requests",
        })).toThrow();
    });
});


describe("EmbeddingResponseSchema", () => {
    const validResponse = {
        data: [{
            embedding: [0.1, 0.2, 0.3, -0.5, 0.0],
        }],
    };

    test("parses a valid response with embedding", () => {
        const parsed = EmbeddingResponseSchema.parse(validResponse);
        const { embedding } = parsed.data[0] ?? { embedding: [] };
        expect(embedding).toHaveLength(5);
        expect(embedding[0]).toBe(0.1);
    });

    test("Rejects empty data array (was: crash on data[0]! assertion)", () => {
        expect(() => EmbeddingResponseSchema.parse({ data: [] })).toThrow(
            /empty data array/i,
        );
    });

    test("Rejects when data field is missing", () => {
        expect(() => EmbeddingResponseSchema.parse({})).toThrow();
    });

    test("Rejects when embedding contains non-numbers", () => {
        expect(() => EmbeddingResponseSchema.parse({
            data: [{ embedding: ["not", "numbers"] }],
        })).toThrow();
    });

    test("Rejects when data items lack embedding field", () => {
        expect(() => EmbeddingResponseSchema.parse({
            data: [{ vector: [0.1, 0.2] }],
        })).toThrow();
    });

    test("Rejects when response has different envelope", () => {
        // Some embedding APIs return {embeddings: [...]} instead of {data: [...]}
        expect(() => EmbeddingResponseSchema.parse({
            embeddings: [[0.1, 0.2, 0.3]],
        })).toThrow();
    });


    test("accepts response with additional metadata fields", () => {
        const parsed = EmbeddingResponseSchema.parse({
            data: [{ embedding: [0.1, 0.2], index: 0, object: "embedding" }],
            model: "text-embedding-3-small",
            usage: { prompt_tokens: 5, total_tokens: 5 },
        });
        const { embedding } = parsed.data[0] ?? { embedding: [] };
        expect(embedding).toEqual([0.1, 0.2]);
    });
});
