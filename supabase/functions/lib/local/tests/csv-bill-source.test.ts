import { assertEquals } from "jsr:@std/assert@1";
import { csvBillSource, type CsvSource } from "../csv-bill-source.ts";
import type { HouseBillQueueMessage } from "../pgmq-interactions.ts";

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

Deno.test("yields one message per valid row", async () => {
    const csv = csvFixture([
        '"H.R. 1","119th Congress (2025-2027)","Lower Energy Costs Act","",""',
        '"S. 42","119th Congress (2025-2027)","Some Senate Bill","",""',
    ]);
    const messages = await collect(csvBillSource(fromString(csv)));
    assertEquals(messages.length, 2);
    assertEquals(messages[0].congress, 119);
    assertEquals(messages[0].bill_type, "HR");
    assertEquals(messages[0].bill_number, "1");
    assertEquals(messages[1].bill_type, "S");
    assertEquals(messages[1].bill_number, "42");
});

Deno.test("yields HouseBillQueueMessage shape (numbers + strings)", async () => {
    const csv = csvFixture([
        '"H.J.Res. 138","118th Congress (2023-2024)","Joint Resolution","",""',
    ]);
    const messages = await collect(csvBillSource(fromString(csv)));
    const m: HouseBillQueueMessage = messages[0];
    assertEquals(typeof m.congress, "number");
    assertEquals(typeof m.bill_type, "string");
    assertEquals(typeof m.bill_number, "string");
    assertEquals(m.bill_type, "HJRES");
});

Deno.test("skips rows with malformed legislation number", async () => {
    const csv = csvFixture([
        '"H.R. 1","119th Congress (2025-2027)","Valid","",""',
        '"junk-no-number","119th Congress (2025-2027)","Bad","",""',
        '"S. 99","119th Congress (2025-2027)","Valid","",""',
    ]);
    const messages = await collect(csvBillSource(fromString(csv)));
    assertEquals(messages.length, 2);
    assertEquals(messages.map((m) => m.bill_type), ["HR", "S"]);
});

Deno.test("skips rows with unknown bill type", async () => {
    const csv = csvFixture([
        '"H.R. 1","119th Congress (2025-2027)","Valid","",""',
        '"X.Y. 5","119th Congress (2025-2027)","UnknownType","",""',
    ]);
    const messages = await collect(csvBillSource(fromString(csv)));
    assertEquals(messages.length, 1);
    assertEquals(messages[0].bill_type, "HR");
});

Deno.test("skips rows with malformed congress column", async () => {
    const csv = csvFixture([
        '"H.R. 1","not-a-congress","Valid","",""',
        '"S. 2","119th Congress (2025-2027)","Valid","",""',
    ]);
    const messages = await collect(csvBillSource(fromString(csv)));
    assertEquals(messages.length, 1);
    assertEquals(messages[0].bill_type, "S");
});

Deno.test("skips empty data rows", async () => {
    const csv = csvFixture([
        '"H.R. 1","119th Congress (2025-2027)","Valid","",""',
        "",
        "   ",
        '"S. 2","119th Congress (2025-2027)","Valid","",""',
    ]);
    const messages = await collect(csvBillSource(fromString(csv)));
    assertEquals(messages.length, 2);
});

Deno.test("empty CSV (just metadata + header) yields nothing", async () => {
    const csv = csvFixture([]);
    const messages = await collect(csvBillSource(fromString(csv)));
    assertEquals(messages, []);
});

Deno.test("caller can early-break the generator", async () => {
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
    assertEquals(collected.length, 2);
    assertEquals(collected.map((m) => m.bill_number), ["1", "2"]);
});
