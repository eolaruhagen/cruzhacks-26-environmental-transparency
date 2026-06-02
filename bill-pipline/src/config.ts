import { z } from "zod";

const ConfigSchema = z.object({
    SUPABASE_URL: z.string().url(),
    SECRET_API_KEY: z.string().min(1),
    OPENROUTER_API_KEY: z.string().min(1),
    DISCORD_WEBHOOK_URL: z.string().url().optional(),
    BATCH_SIZE: z.coerce.number().int().positive().default(20),
    PER_BATCH_CONCURRENCY: z.coerce.number().int().positive().default(10),
    MAX_BATCHES: z.coerce.number().int().positive().optional(),
});

export type Config = z.infer<typeof ConfigSchema>;

export function loadConfig(): Config {
    const parsed = ConfigSchema.safeParse(process.env);
    if (!parsed.success) {
        throw new Error(`config: invalid env — ${parsed.error.message}`);
    }
    return parsed.data;
}
