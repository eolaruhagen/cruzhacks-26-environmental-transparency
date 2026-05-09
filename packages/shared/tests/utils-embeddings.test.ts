import { describe, expect, test } from "bun:test";
import { EmbeddingResponseSchema } from "../src/utils/embeddings.ts";

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
        // Some embedding APIs return {embeddings: [...]} instead of {data: [...]}.
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
