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

    const bodyText = await response.text();
    if (!response.ok) {
        throw new Error(`Embedding API error: HTTP ${response.status} - ${bodyText.slice(0, 1000)}`);
    }

    let raw: unknown;
    try {
        raw = JSON.parse(bodyText);
    } catch {
        throw new Error(`Embedding API: non-JSON 200 response - ${bodyText.slice(0, 1000)}`);
    }
    const result = EmbeddingResponseSchema.safeParse(raw);
    if (!result.success) {
        throw new Error(`Embedding API: unexpected 200 response shape - ${bodyText.slice(0, 1000)}`);
    }
    const parsed = result.data;
    const { embedding } = parsed.data[0] ?? { embedding: [] };

    if (embedding.length !== embeddingDims) {
        throw new Error(
            `Embedding dimension mismatch: expected ${embeddingDims}, got ${embedding.length}`
        );
    }

    return embedding;
}