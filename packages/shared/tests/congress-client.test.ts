/**
 * Tests for CongressClient. Mocks the network layer via the injectable
 * `fetchImpl` so no live API calls occur.
 */
import { expect, test } from "bun:test";
import {
  CongressClient,
  type CongressFetch,
  type FetchResponseLike,
} from "../src/api/congress.ts";

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

interface FakeCall {
  url: string;
}

function fakeOk(body: unknown): FetchResponseLike {
  return {
    ok: true,
    status: 200,
    json: () => Promise.resolve(body),
    text: () => Promise.resolve(typeof body === "string" ? body : JSON.stringify(body)),
  };
}

function fakeErr(status: number): FetchResponseLike {
  return {
    ok: false,
    status,
    json: () => Promise.resolve({}),
    text: () => Promise.resolve(""),
  };
}

function recorder(handler: (url: string) => FetchResponseLike): {
  fetchImpl: CongressFetch;
  calls: FakeCall[];
} {
  const calls: FakeCall[] = [];
  const fetchImpl: CongressFetch = (url) => {
    calls.push({ url });
    return Promise.resolve(handler(url));
  };
  return { fetchImpl, calls };
}

// Minimal valid fixtures for each schema (just enough to pass parse).
const FIX_BILL_LIST = {
  bills: [
    {
      congress: 119,
      type: "HR",
      number: "1",
      title: "A Bill",
      url: "https://api.congress.gov/v3/bill/119/hr/1?format=json",
    },
  ],
};
const FIX_BILL_DETAIL = {
  bill: { congress: 119, type: "HR", number: "1" },
};
const FIX_ACTIONS = { actions: [] };
const FIX_COMMITTEES = { committees: [] };
const FIX_COSPONSORS = {
  cosponsors: [],
};
const FIX_SUMMARIES = { summaries: [] };
const FIX_TEXT = { textVersions: [] };
const FIX_SUBJECTS = { subjects: { legislativeSubjects: [] } };
const FIX_RELATED = { relatedBills: [] };
const FIX_TITLES = { titles: [{ title: "ok" }] };

// ---------------------------------------------------------------------------
// URL construction
// ---------------------------------------------------------------------------

test("listBills builds a /bill URL with query params and appends api_key + format", async () => {
  const { fetchImpl, calls } = recorder(() => fakeOk(FIX_BILL_LIST));
  const client = new CongressClient({ apiKey: "K", fetchImpl });
  await client.listBills({ fromDateTime: "2024-01-01T00:00:00Z", limit: 10 });
  expect(calls).toHaveLength(1);
  expect(calls[0]!.url).toContain("/bill?fromDateTime=");
  expect(calls[0]!.url).toContain("limit=10");
  expect(calls[0]!.url).toContain("api_key=K");
  expect(calls[0]!.url).toContain("format=json");
});

test("listBills with no params still appends api_key and format", async () => {
  const { fetchImpl, calls } = recorder(() => fakeOk(FIX_BILL_LIST));
  const client = new CongressClient({ apiKey: "K", fetchImpl });
  await client.listBills();
  expect(calls[0]!.url).toMatch(/\/bill\?api_key=K&format=json$/);
});

test("listBillsAt uses the absolute url and does not double-append api_key when already present", async () => {
  const { fetchImpl, calls } = recorder(() => fakeOk(FIX_BILL_LIST));
  const client = new CongressClient({ apiKey: "K", fetchImpl });
  const next = "https://api.congress.gov/v3/bill?offset=250&limit=250&format=json&api_key=K";
  await client.listBillsAt(next);
  expect(calls[0]!.url).toBe(next);
});

test("listBillsAt appends api_key when absent from the next url", async () => {
  const { fetchImpl, calls } = recorder(() => fakeOk(FIX_BILL_LIST));
  const client = new CongressClient({ apiKey: "K", fetchImpl });
  await client.listBillsAt("https://api.congress.gov/v3/bill?offset=250&format=json");
  expect(calls[0]!.url).toContain("api_key=K");
  expect(calls[0]!.url.match(/api_key=/g)).toHaveLength(1);
});

test("bill().detail builds the right path", async () => {
  const { fetchImpl, calls } = recorder(() => fakeOk(FIX_BILL_DETAIL));
  const client = new CongressClient({ apiKey: "K", fetchImpl });
  await client.bill(119, "hr", 1234).detail();
  expect(calls[0]!.url).toContain("/bill/119/hr/1234?api_key=K");
});

test("bill scope routes every sub-endpoint to the right path", async () => {
  const handlers: Record<string, unknown> = {
    "/bill/119/hr/1": FIX_BILL_DETAIL,
    "/bill/119/hr/1/actions": FIX_ACTIONS,
    "/bill/119/hr/1/committees": FIX_COMMITTEES,
    "/bill/119/hr/1/cosponsors": FIX_COSPONSORS,
    "/bill/119/hr/1/summaries": FIX_SUMMARIES,
    "/bill/119/hr/1/text": FIX_TEXT,
    "/bill/119/hr/1/subjects": FIX_SUBJECTS,
    "/bill/119/hr/1/relatedbills": FIX_RELATED,
    "/bill/119/hr/1/titles": FIX_TITLES,
  };
  const { fetchImpl, calls } = recorder((url) => {
    const path = Object.keys(handlers).find((p) => url.includes(p + "?"));
    return fakeOk(path ? handlers[path] : {});
  });
  const client = new CongressClient({ apiKey: "K", fetchImpl });
  const scope = client.bill(119, "hr", 1);
  await scope.detail();
  await scope.actions();
  await scope.committees();
  await scope.cosponsors();
  await scope.summaries();
  await scope.textVersions();
  await scope.subjects();
  await scope.relatedBills();
  await scope.titles();
  expect(calls.map((c) => c.url.split("?")[0])).toEqual([
    "https://api.congress.gov/v3/bill/119/hr/1",
    "https://api.congress.gov/v3/bill/119/hr/1/actions",
    "https://api.congress.gov/v3/bill/119/hr/1/committees",
    "https://api.congress.gov/v3/bill/119/hr/1/cosponsors",
    "https://api.congress.gov/v3/bill/119/hr/1/summaries",
    "https://api.congress.gov/v3/bill/119/hr/1/text",
    "https://api.congress.gov/v3/bill/119/hr/1/subjects",
    "https://api.congress.gov/v3/bill/119/hr/1/relatedbills",
    "https://api.congress.gov/v3/bill/119/hr/1/titles",
  ]);
});

// ---------------------------------------------------------------------------
// Validation + errors
// ---------------------------------------------------------------------------

test("getValidated parses the schema and returns typed data", async () => {
  const { fetchImpl } = recorder(() => fakeOk(FIX_BILL_DETAIL));
  const client = new CongressClient({ apiKey: "K", fetchImpl });
  const result = await client.bill(119, "hr", 1).detail();
  expect(result.bill.type).toBe("HR");
  expect(result.bill.congress).toBe(119);
});

test("throws when the response shape doesn't match the schema", async () => {
  const { fetchImpl } = recorder(() => fakeOk({ unexpected: true }));
  const client = new CongressClient({ apiKey: "K", fetchImpl });
  await expect(client.bill(119, "hr", 1).detail()).rejects.toThrow();
});

test("throws when fetch returns non-2xx", async () => {
  const { fetchImpl } = recorder(() => fakeErr(429));
  const client = new CongressClient({ apiKey: "K", fetchImpl });
  await expect(client.listBills()).rejects.toThrow(/HTTP 429/);
});

// ---------------------------------------------------------------------------
// streamBills
// ---------------------------------------------------------------------------

test("streamBills walks the next url until it disappears", async () => {
  const page1 = {
    bills: [{ congress: 119, type: "HR", number: "1" }],
    pagination: { next: "https://api.congress.gov/v3/bill?offset=1&limit=1&format=json" },
  };
  const page2 = { bills: [{ congress: 119, type: "S", number: "5" }] };
  const responses = [page1, page2];
  let i = 0;
  const { fetchImpl } = recorder(() => fakeOk(responses[i++]!));
  const client = new CongressClient({ apiKey: "K", fetchImpl });
  const numbers: string[] = [];
  for await (const bill of client.streamBills({ limit: 1 })) {
    numbers.push(String(bill.number));
  }
  expect(numbers).toEqual(["1", "5"]);
});

// ---------------------------------------------------------------------------
// fetchBillText + getMostRecentTextUrl
// ---------------------------------------------------------------------------

test("fetchBillText returns the response body text from the given URL", async () => {
  const { fetchImpl, calls } = recorder(() => fakeOk("RAW BILL TEXT"));
  const client = new CongressClient({ apiKey: "K", fetchImpl });
  const out = await client.fetchBillText("https://congress.gov/bill/text.htm");
  expect(out).toBe("RAW BILL TEXT");
  expect(calls[0]!.url).toBe("https://congress.gov/bill/text.htm");
});

test("getMostRecentTextUrl picks the newest version with a 'Formatted Text' format", () => {
  const url = CongressClient.getMostRecentTextUrl([
    {
      type: "Introduced",
      date: "2024-01-01T00:00:00Z",
      formats: [{ type: "PDF", url: "old.pdf" }],
    },
    {
      type: "Engrossed",
      date: "2024-06-01T00:00:00Z",
      formats: [
        { type: "PDF", url: "new.pdf" },
        { type: "Formatted Text", url: "new.html" },
      ],
    },
  ]);
  expect(url).toBe("new.html");
});

test("getMostRecentTextUrl falls back to older versions when the newest lacks Formatted Text", () => {
  const url = CongressClient.getMostRecentTextUrl([
    {
      type: "Introduced",
      date: "2024-01-01T00:00:00Z",
      formats: [{ type: "Formatted Text", url: "intro.html" }],
    },
    {
      type: "Engrossed",
      date: "2024-06-01T00:00:00Z",
      formats: [{ type: "PDF", url: "new.pdf" }],
    },
  ]);
  expect(url).toBe("intro.html");
});

test("getMostRecentTextUrl returns undefined when no version has Formatted Text", () => {
  const url = CongressClient.getMostRecentTextUrl([
    {
      type: "Introduced",
      date: "2024-01-01T00:00:00Z",
      formats: [{ type: "PDF", url: "x.pdf" }],
    },
  ]);
  expect(url).toBeUndefined();
});

test("getMostRecentTextUrl returns undefined for an empty list", () => {
  expect(CongressClient.getMostRecentTextUrl([])).toBeUndefined();
});
