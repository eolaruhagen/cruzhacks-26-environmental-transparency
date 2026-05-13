import { ModelStream, getOpenRouter } from "../../../packages/shared/src/utils/llm.ts";
import { ClassifyResultSchema } from "./bill-enrich.ts";
import type { ClassifyFn } from "./process-bill-enrichment.ts";

const LLM_MODEL = "google/gemini-2.5-flash-lite";

const BILL_CLASSIFY_SYSTEM_PROMPT =
    `You are a classifier for U.S. legislative bills, deciding whether each bill belongs to one of 8 environmental categories.

Respond with valid JSON matching one of these two shapes:

1. If you can confidently classify:
   {"kind":"classified","category":"<one of: air_and_atmosphere, water_resources, waste_and_toxics, energy_and_resources, land_and_conservation, disaster_and_emergency, climate_and_emissions, justice_and_environment>","reasoning":"<<=500 chars explaining the choice>"}

2. If the bill's metadata (title, summary, subjects, policy area) doesn't carry enough signal to confidently choose a category:
   {"kind":"insufficient_info","reason":"<<=500 chars on what's missing>"}

Prefer insufficient_info over guessing. Output ONLY the JSON object, no prose.`;

export function makeClassify(apiKey: string): ClassifyFn {
    const client = getOpenRouter(apiKey);
    return async (prompt: string) => {
        const result = new ModelStream()
            .model(LLM_MODEL, client)
            .instructions(BILL_CLASSIFY_SYSTEM_PROMPT)
            .input(prompt)
            .text({ format: { type: "json_object" } })
            .execute();
        const text = await result.getText();
        const parsed = ClassifyResultSchema.safeParse(JSON.parse(text));
        if (!parsed.success) {
            throw new Error(`classify: invalid LLM response: ${parsed.error.message}`);
        }
        return parsed.data;
    };
}
