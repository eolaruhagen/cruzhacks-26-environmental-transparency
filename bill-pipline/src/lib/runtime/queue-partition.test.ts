import { test, expect } from "bun:test";
import { partitionPoisonMessages } from "./queue-partition.ts";

interface FakeMessage {
    msg_id: number;
    read_ct: number;
    payload?: string;
}

function makeQueue(opts: { rejectOn?: number[] } = {}) {
    const calls: number[] = [];
    return {
        calls,
        archive: (msgId: number): Promise<void> => {
            calls.push(msgId);
            if (opts.rejectOn?.includes(msgId)) {
                return Promise.reject(new Error(`fake archive failure on ${msgId}`));
            }
            return Promise.resolve();
        },
    };
}

test("empty input → no archives, no fresh, no drops", async () => {
    const q = makeQueue();
    const { fresh, droppedCount } = await partitionPoisonMessages([], q, 5);
    expect(fresh.length).toEqual(0);
    expect(droppedCount).toEqual(0);
    expect(q.calls).toEqual([]);
});

test("all fresh messages → no archives", async () => {
    const q = makeQueue();
    const msgs: FakeMessage[] = [
        { msg_id: 1, read_ct: 0 },
        { msg_id: 2, read_ct: 1 },
        { msg_id: 3, read_ct: 4 },
    ];
    const { fresh, droppedCount } = await partitionPoisonMessages(msgs, q, 5);
    expect(fresh.length).toEqual(3);
    expect(droppedCount).toEqual(0);
    expect(q.calls).toEqual([]);
});

test("all poison messages → archived in order", async () => {
    const q = makeQueue();
    const msgs: FakeMessage[] = [
        { msg_id: 10, read_ct: 5 },
        { msg_id: 11, read_ct: 6 },
        { msg_id: 12, read_ct: 99 },
    ];
    const { fresh, droppedCount } = await partitionPoisonMessages(msgs, q, 5);
    expect(fresh.length).toEqual(0);
    expect(droppedCount).toEqual(3);
    expect(q.calls).toEqual([10, 11, 12]);
});

test("mixed batch → partition correctly + archive only the poison", async () => {
    const q = makeQueue();
    const msgs: FakeMessage[] = [
        { msg_id: 1, read_ct: 0, payload: "a" },
        { msg_id: 2, read_ct: 5, payload: "poison" },
        { msg_id: 3, read_ct: 2, payload: "b" },
        { msg_id: 4, read_ct: 7, payload: "poison" },
    ];
    const { fresh, droppedCount } = await partitionPoisonMessages(msgs, q, 5);
    expect(fresh.map((m) => m.msg_id)).toEqual([1, 3]);
    expect(droppedCount).toEqual(2);
    expect(q.calls).toEqual([2, 4]);
});

test(
    "poison-archive failure does NOT propagate; partition continues",
    async () => {
        // Bug being fixed: previously a single archive() throw would break
        // the entire batch's partition loop, leaving fresh messages
        // un-processed and stalling the worker.
        const q = makeQueue({ rejectOn: [20] }); // msg 20's archive will throw
        const msgs: FakeMessage[] = [
            { msg_id: 10, read_ct: 0 }, // fresh
            { msg_id: 20, read_ct: 5 }, // poison, archive THROWS
            { msg_id: 30, read_ct: 6 }, // poison, archive succeeds
            { msg_id: 40, read_ct: 1 }, // fresh
        ];

        const { fresh, droppedCount } = await partitionPoisonMessages(msgs, q, 5);

        // Fresh messages still come through.
        expect(fresh.map((m) => m.msg_id)).toEqual([10, 40]);
        // Only the successful archive counts toward droppedCount.
        expect(droppedCount).toEqual(1);
        // archive was attempted on BOTH poison messages.
        expect(q.calls).toEqual([20, 30]);
    },
);

test(
    "boundary: read_ct exactly == maxReads is poison (the >= condition)",
    async () => {
        // maxReads = 5 means "give up at the 5th attempt and beyond".
        // PGMQ increments read_ct when popping the message, so a popped
        // message with read_ct=5 has been read 5 times now — poison.
        const q = makeQueue();
        const msgs: FakeMessage[] = [
            { msg_id: 1, read_ct: 4 }, // 5th attempt — fresh, give it one more
            { msg_id: 2, read_ct: 5 }, // 6th read on a maxReads=5 budget — drop
        ];
        const { fresh, droppedCount } = await partitionPoisonMessages(msgs, q, 5);
        expect(fresh.map((m) => m.msg_id)).toEqual([1]);
        expect(droppedCount).toEqual(1);
    },
);

test("logName affects log prefix (smoke; verify call shape only)", async () => {
    // We don't assert log content (console.warn output isn't easily captured
    // in Deno tests without monkeypatching). This test exists so the logName
    // parameter has at least one explicit caller exercising the override.
    const q = makeQueue();
    const msgs: FakeMessage[] = [{ msg_id: 99, read_ct: 99 }];
    const { droppedCount } = await partitionPoisonMessages(msgs, q, 5, "custom-worker");
    expect(droppedCount).toEqual(1);
});
