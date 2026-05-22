import { test, expect } from "bun:test";
import { csvBillSource, type CsvSource } from "./csv-bill-source.ts";
import type { HouseBillQueueMessage } from "../runtime/pgmq-interactions.ts";

function fromString(text: string): CsvSource {
    return { readText: () => Promise.resolve(text) };
}

async function collect<T>(gen: AsyncGenerator<T>): Promise<T[]> {
    const out: T[] = [];
    for await (const v of gen) out.push(v);
    return out;
}

// Realistic 3-line metadata + header + data layout. Headers we care about:
//   "Legislation Number", "Congress". Title and other columns are ignored
//   here (they're fetched fresh by the worker via Congress API anyway).
function csvFixture(rows: string[]): string {
    return [
        "Bulk Data Export from Congress.gov",
        "Search query: ...",
        "Generated 2026-05-08",
        "Legislation Number,Congress,Title,Committees,Latest Action,Latest Summary",
        ...rows,
    ].join("\n");
}

test("yields one message per valid row", async () => {
    const csv = csvFixture([
        '"H.R. 1","119th Congress (2025-2027)","Lower Energy Costs Act","",""',
        '"S. 42","119th Congress (2025-2027)","Some Senate Bill","",""',
    ]);
    const messages = await collect(csvBillSource(fromString(csv)));
    expect(messages.length).toEqual(2);
    expect(messages[0].congress).toEqual(119);
    expect(messages[0].bill_type).toEqual("HR");
    expect(messages[0].bill_number).toEqual("1");
    expect(messages[1].bill_type).toEqual("S");
    expect(messages[1].bill_number).toEqual("42");
});

test("yields HouseBillQueueMessage shape (numbers + strings)", async () => {
    const csv = csvFixture([
        '"H.J.Res. 138","118th Congress (2023-2024)","Joint Resolution","",""',
    ]);
    const messages = await collect(csvBillSource(fromString(csv)));
    const m: HouseBillQueueMessage = messages[0];
    expect(typeof m.congress).toEqual("number");
    expect(typeof m.bill_type).toEqual("string");
    expect(typeof m.bill_number).toEqual("string");
    expect(m.bill_type).toEqual("HJRES");
});

test("skips rows with malformed legislation number", async () => {
    const csv = csvFixture([
        '"H.R. 1","119th Congress (2025-2027)","Valid","",""',
        '"junk-no-number","119th Congress (2025-2027)","Bad","",""',
        '"S. 99","119th Congress (2025-2027)","Valid","",""',
    ]);
    const messages = await collect(csvBillSource(fromString(csv)));
    expect(messages.length).toEqual(2);
    expect(messages.map((m) => m.bill_type)).toEqual(["HR", "S"]);
});

test("skips rows with unknown bill type", async () => {
    const csv = csvFixture([
        '"H.R. 1","119th Congress (2025-2027)","Valid","",""',
        '"X.Y. 5","119th Congress (2025-2027)","UnknownType","",""',
    ]);
    const messages = await collect(csvBillSource(fromString(csv)));
    expect(messages.length).toEqual(1);
    expect(messages[0].bill_type).toEqual("HR");
});

test("skips rows with malformed congress column", async () => {
    const csv = csvFixture([
        '"H.R. 1","not-a-congress","Valid","",""',
        '"S. 2","119th Congress (2025-2027)","Valid","",""',
    ]);
    const messages = await collect(csvBillSource(fromString(csv)));
    expect(messages.length).toEqual(1);
    expect(messages[0].bill_type).toEqual("S");
});

test("skips empty data rows", async () => {
    const csv = csvFixture([
        '"H.R. 1","119th Congress (2025-2027)","Valid","",""',
        "",
        "   ",
        '"S. 2","119th Congress (2025-2027)","Valid","",""',
    ]);
    const messages = await collect(csvBillSource(fromString(csv)));
    expect(messages.length).toEqual(2);
});

test("empty CSV (just metadata + header) yields nothing", async () => {
    const csv = csvFixture([]);
    const messages = await collect(csvBillSource(fromString(csv)));
    expect(messages).toEqual([]);
});

test("caller can early-break the generator", async () => {
    const csv = csvFixture([
        '"H.R. 1","119th Congress (2025-2027)","First","",""',
        '"H.R. 2","119th Congress (2025-2027)","Second","",""',
        '"H.R. 3","119th Congress (2025-2027)","Third","",""',
    ]);
    const collected: HouseBillQueueMessage[] = [];
    for await (const m of csvBillSource(fromString(csv))) {
        collected.push(m);
        if (collected.length === 2) break;
    }
    expect(collected.length).toEqual(2);
    expect(collected.map((m) => m.bill_number)).toEqual(["1", "2"]);
});
