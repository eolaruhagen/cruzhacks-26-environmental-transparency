/**
 * Partition a freshly-popped batch of PGMQ messages into fresh-to-process
 * vs. poison-to-archive, while archiving the poison ones in-place.
 *
 * "Poison" = `read_ct >= maxReads` — we've already tried this message
 * `maxReads` times across visibility-timeout retries and given up.
 *
 * Critical bit: archiving a poison message can fail (DB blip, transient
 * lock). When it does, we MUST NOT abort the partition — that would block
 * the worker indefinitely behind a single bad poison message. Instead we
 * log + leave the message; visibility timeout will re-deliver it and a
 * subsequent worker tick can try archive again.
 *
 * Returns:
 *   fresh        — messages with read_ct < maxReads, ready for processing
 *   droppedCount — successfully archived poison messages (for telemetry)
 */

interface PartitionableMessage {
    msg_id: number;
    read_ct: number;
}

interface ArchiveOnlyQueue {
    archive(msgId: number): Promise<void>;
}

export async function partitionPoisonMessages<M extends PartitionableMessage>(
    messages: readonly M[],
    queue: ArchiveOnlyQueue,
    maxReads: number,
    logName = "queue",
): Promise<{ fresh: M[]; droppedCount: number }> {
    const fresh: M[] = [];
    let droppedCount = 0;
    for (const m of messages) {
        if (m.read_ct < maxReads) {
            fresh.push(m);
            continue;
        }
        console.warn(
            `[${logName}] dropping msg ${m.msg_id} (read_ct=${m.read_ct} >= maxReads=${maxReads})`,
        );
        try {
            await queue.archive(m.msg_id);
            droppedCount++;
        } catch (err) {
            const detail = err instanceof Error ? err.message : String(err);
            console.warn(
                `[${logName}] failed to archive poison msg ${m.msg_id}: ${detail}` +
                    " — leaving for retry on next tick",
            );
            // Intentionally don't push to fresh: read_ct >= maxReads, we've
            // given up on processing it. Just couldn't archive this tick.
        }
    }
    return { fresh, droppedCount };
}
