import { z } from "zod";

export const EmbeddingResponseSchema = z.object({
    data: z.array(z.object({
        embedding: z.array(z.number()),
    })).min(1, "Embedding API returned empty data array"),
});

export async function embedText(text: string, apiKey: string, embeddingDims: number, embeddingModel: string, embeddingUrl: string): Promise<number[]> {
    const response = await fetch(embeddingUrl, {
        method: "POST",
        headers: {
            "Authorization": `Bearer ${apiKey}`,
            "Content-Type": "application/json",
        },
        body: JSON.stringify({
            model: embeddingModel,
            input: [text],
            dimensions: embeddingDims,
        }),
    });

    if (!response.ok) {
        const error = await response.text();
        throw new Error(`Embedding API error: ${response.status} - ${error}`);
    }

    const parsed = EmbeddingResponseSchema.parse(await response.json());
    const { embedding } = parsed.data[0] ?? { embedding: [] };

    if (embedding.length !== embeddingDims) {
        throw new Error(
            `Embedding dimension mismatch: expected ${embeddingDims}, got ${embedding.length}`
        );
    }

    return embedding;
}