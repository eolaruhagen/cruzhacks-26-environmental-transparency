import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, Json } from "../../database.types.ts";
import z from "zod";

/**
 * One message popped from a PGMQ queue. The `message` field is the validated
 * payload — its shape is determined by the queue's entry in `QueueRegistry`.
 */
export interface PgmqMessage<T> {
    msg_id: number;
    read_ct: number;
    enqueued_at: string;
    vt: string;
    message: T;
    headers: Json;
}

// ---------------------------------------------------------------------------
// Queue registry
// ---------------------------------------------------------------------------
// Add an entry per queue. The registry doubles as:
//   - the source of truth for valid queue names (PgmqInteraction's generic K
//     extends keyof typeof QueueRegistry, so unknown names fail at compile-time)
//   - the runtime validator for messages popped via readBatch (each message
//     gets parsed through the queue's schema before being returned)

const HouseBillMessageSchema = z.object({
    congress: z.number(),
    bill_type: z.string(),
    bill_number: z.string(),
});

export const QueueRegistry = {
    house_bills_queue_new: HouseBillMessageSchema,
} as const satisfies Record<string, z.ZodType>;

export type QueueName = keyof typeof QueueRegistry;
export type QueueMessage<K extends QueueName> = z.infer<typeof QueueRegistry[K]>;

// Convenience aliases for common consumers.
export type HouseBillQueueMessage = QueueMessage<"house_bills_queue_new">;

/**
 * Typed wrapper around the public-schema `pgmq_*` RPC functions for one
 * queue. The generic `K` is constrained to a key of `QueueRegistry`, so
 * `sendBatch` accepts only payloads that match the queue's schema and
 * `readBatch` validates each popped message against that schema before
 * returning. Logs every operation. Throws with queue + operation context
 * on any RPC error, schema-validation failure, or unexpected return —
 * never swallows.
 *
 * Usage:
 *   const billsQueue = new PgmqInteraction("house_bills_queue_new", supabase);
 *   await billsQueue.sendBatch([{ congress: 119, bill_type: "HR", bill_number: "1" }]);
 *   const msgs = await billsQueue.readBatch(10, 300);
 *   for (const m of msgs) {
 *       // m.message is typed as HouseBillQueueMessage and has been Zod-validated.
 *       await billsQueue.archive(m.msg_id);
 *   }
 */
export class PgmqInteraction<K extends QueueName> {
    private readonly schema: typeof QueueRegistry[K];

    constructor(
        private readonly queueName: K,
        private readonly supabase: SupabaseClient<Database>,
    ) {
        this.schema = QueueRegistry[queueName];
    }

    /** Enqueue many messages in one round-trip. Returns the new msg_ids in order. */
    async sendBatch(messages: QueueMessage<K>[]): Promise<number[]> {
        if (messages.length === 0) {
            console.log(`[pgmq:${this.queueName}] sendBatch called with 0 messages, skipping`);
            return [];
        }
        const { data, error } = await this.supabase.rpc("pgmq_send_batch", {
            queue_name: this.queueName,
            msgs: messages as unknown as Json[],
        });
        if (error) {
            throw new Error(
                `pgmq_send_batch failed (queue=${this.queueName}, count=${messages.length}): ${error.message}`,
            );
        }
        const ids = (data ?? []) as unknown as number[];
        console.log(`[pgmq:${this.queueName}] sent batch of ${ids.length}`);
        return ids;
    }

    /**
     * Pop up to `batchSize` messages, hiding them for `visibilityTimeoutSec`
     * seconds. If processing doesn't archive() within that window the messages
     * become visible again — set the timeout above the worker's worst-case
     * runtime per message. Each popped message is validated through the
     * queue's registry schema; a malformed payload throws.
     */
    async readBatch(
        batchSize: number,
        visibilityTimeoutSec: number,
    ): Promise<PgmqMessage<QueueMessage<K>>[]> {
        const { data, error } = await this.supabase.rpc("pgmq_read_batch", {
            queue_name: this.queueName,
            batch_size: batchSize,
            visibility_timeout: visibilityTimeoutSec,
        });
        if (error) {
            throw new Error(
                `pgmq_read_batch failed (queue=${this.queueName}, batch=${batchSize}, vt=${visibilityTimeoutSec}s): ${error.message}`,
            );
        }
        const raw = (data ?? []) as unknown as PgmqMessage<unknown>[];
        const validated = raw.map((m) => ({
            ...m,
            message: this.schema.parse(m.message) as QueueMessage<K>,
        }));
        console.log(
            `[pgmq:${this.queueName}] read ${validated.length} msg(s) (requested ${batchSize})`,
        );
        return validated;
    }

    /**
     * Archive a single message after successful processing. Throws if the
     * message doesn't exist — the caller almost certainly believes it should,
     * so a silent false would mask a logic bug.
     */
    async archive(msgId: number): Promise<void> {
        const { data, error } = await this.supabase.rpc("pgmq_archive", {
            queue_name: this.queueName,
            msg_id: msgId,
        });
        if (error) {
            throw new Error(
                `pgmq_archive failed (queue=${this.queueName}, msg_id=${msgId}): ${error.message}`,
            );
        }
        if ((data as unknown) !== true) {
            throw new Error(
                `pgmq_archive returned ${data} (queue=${this.queueName}, msg_id=${msgId}) — message not found`,
            );
        }
        console.log(`[pgmq:${this.queueName}] archived msg ${msgId}`);
    }
}

