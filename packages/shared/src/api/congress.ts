import type { z } from "zod";
export * from "./congress.types.ts";
import {
  type BillActionsResponse,
  BillActionsResponseSchema,
  type BillCommitteesResponse,
  BillCommitteesResponseSchema,
  type BillCosponsorsResponse,
  BillCosponsorsResponseSchema,
  type BillDetailResponse,
  BillDetailResponseSchema,
  type BillListResponse,
  BillListResponseSchema,
  type BillRelatedBillsResponse,
  BillRelatedBillsResponseSchema,
  type BillSubjectsResponse,
  BillSubjectsResponseSchema,
  type BillSummariesResponse,
  BillSummariesResponseSchema,
  type BillTextResponse,
  BillTextResponseSchema,
  type BillTextVersion,
  type BillTitlesResponse,
  BillTitlesResponseSchema,
  type BillTypeAsParam,
} from "./congress.types.ts";

const DEFAULT_BASE_URL = "https://api.congress.gov/v3";

/**
 * Narrow contract for what CongressClient needs from a fetch-like function.
 * Avoids depending on the runtime's full `typeof fetch`, which varies between
 * environments (Bun's `@types/bun` adds `preconnect`, etc.).
 */
export interface FetchResponseLike {
  readonly ok: boolean;
  readonly status: number;
  json(): Promise<unknown>;
  text(): Promise<string>;
}
export type CongressFetch = (url: string) => Promise<FetchResponseLike>;

export interface CongressClientOptions {
  apiKey: string;
  baseUrl?: string;
  fetchImpl?: CongressFetch;
}

export interface ListBillsParams {
  /** ISO datetime, e.g. "2024-01-01T00:00:00Z". */
  fromDateTime?: string;
  toDateTime?: string;
  offset?: number;
  /** API max is 250. */
  limit?: number;
  /** Documented values include "updateDate+desc", "updateDate+asc". */
  sort?: string;
}

export class CongressClient {
  private readonly apiKey: string;
  private readonly baseUrl: string;
  private readonly fetchImpl: CongressFetch;

  constructor(opts: CongressClientOptions) {
    this.apiKey = opts.apiKey;
    this.baseUrl = opts.baseUrl ?? DEFAULT_BASE_URL;
    this.fetchImpl = opts.fetchImpl ?? ((url) => globalThis.fetch(url));
  }


  /** Fetch one page of bills. Returns the raw envelope including `pagination`. */
  listBills(params: ListBillsParams = {}): Promise<BillListResponse> {
    const qs = buildQuery(params as Record<string, string | number | undefined>);
    return this.getValidated(`/bill${qs}`, BillListResponseSchema);
  }

  /** Fetch a list page from an absolute URL (e.g. the `pagination.next` value). */
  listBillsAt(absoluteUrl: string): Promise<BillListResponse> {
    return this.getValidated(absoluteUrl, BillListResponseSchema);
  }

  /**
   * Async-generator that walks every page until the `next` link disappears.
   * Yields one BillListItem at a time so callers can stream-process without
   * holding the full result set in memory.
   */
  async *streamBills(params: ListBillsParams = {}): AsyncGenerator<BillListResponse["bills"][number]> {
    let page: BillListResponse = await this.listBills(params);
    while (true) {
      for (const bill of page.bills) yield bill;
      const next = page.pagination?.next;
      if (!next) return;
      page = await this.listBillsAt(next);
    }
  }

  /**
   * Returns a per-bill accessor that holds (congress, type, number) so you
   * don't pass them to every sub-endpoint call.
   */
  bill(congress: number, type: BillTypeAsParam, number: number | string): BillScope {
    return new BillScope(this, congress, type, String(number));
  }

  // -------------------------------------------------------------------------
  // Bill text (an unauthenticated endpoint at congress.gov, not /v3)
  // -------------------------------------------------------------------------

  /** Download the actual bill text from a `textVersions[].formats[].url` value. */
  async fetchBillText(textUrl: string): Promise<string> {
    const response = await this.fetchImpl(textUrl);
    if (!response.ok) throw httpError("bill text", response.status);
    return response.text();
  }

  /**
   * From a textVersions array, return the URL of the most recent "Formatted Text"
   * format. Returns undefined when no version has a Formatted Text format.
   */
  static getMostRecentTextUrl(textVersions: BillTextVersion[]): string | undefined {
    if (!textVersions.length) return undefined;
    const sorted = [...textVersions].sort((a, b) => {
      // dates can be null; null sorts to the end
      const ta = a.date ? new Date(a.date).getTime() : -Infinity;
      const tb = b.date ? new Date(b.date).getTime() : -Infinity;
      return tb - ta;
    });
    for (const version of sorted) {
      const formatted = version.formats?.find(
        (f) => (f.type ?? "").trim().toLowerCase() === "formatted text",
      );
      if (formatted?.url) return formatted.url;
    }
    return undefined;
  }

  // -------------------------------------------------------------------------
  // Internals — used by BillScope as well, hence not private.
  // -------------------------------------------------------------------------

  /** @internal */
  async getValidated<T>(urlOrPath: string, schema: z.ZodType<T>): Promise<T> {
    const url = this.resolveUrl(urlOrPath);
    const response = await this.fetchImpl(url);
    if (!response.ok) throw httpError(urlOrPath, response.status);
    const raw = await response.json();
    return schema.parse(raw);
  }

  private resolveUrl(urlOrPath: string): string {
    let url = urlOrPath.startsWith("http") ? urlOrPath : `${this.baseUrl}${urlOrPath}`;
    if (!/[?&]api_key=/.test(url)) {
      url += url.includes("?") ? "&" : "?";
      url += `api_key=${this.apiKey}`;
    }
    if (!/[?&]format=/.test(url)) url += "&format=json";
    return url;
  }
}

/** Per-bill accessor returned from `client.bill(...)`. */
export class BillScope {
  private readonly path: string;

  constructor(
    private readonly client: CongressClient,
    readonly congress: number,
    readonly type: BillTypeAsParam,
    readonly number: string,
  ) {
    this.path = `/bill/${congress}/${type}/${number}`;
  }

  detail(): Promise<BillDetailResponse> {
    return this.client.getValidated(this.path, BillDetailResponseSchema);
  }
  actions(): Promise<BillActionsResponse> {
    return this.client.getValidated(`${this.path}/actions`, BillActionsResponseSchema);
  }
  committees(): Promise<BillCommitteesResponse> {
    return this.client.getValidated(`${this.path}/committees`, BillCommitteesResponseSchema);
  }
  cosponsors(): Promise<BillCosponsorsResponse> {
    return this.client.getValidated(`${this.path}/cosponsors`, BillCosponsorsResponseSchema);
  }
  summaries(): Promise<BillSummariesResponse> {
    return this.client.getValidated(`${this.path}/summaries`, BillSummariesResponseSchema);
  }
  textVersions(): Promise<BillTextResponse> {
    return this.client.getValidated(`${this.path}/text`, BillTextResponseSchema);
  }
  subjects(): Promise<BillSubjectsResponse> {
    return this.client.getValidated(`${this.path}/subjects`, BillSubjectsResponseSchema);
  }
  relatedBills(): Promise<BillRelatedBillsResponse> {
    return this.client.getValidated(`${this.path}/relatedbills`, BillRelatedBillsResponseSchema);
  }
  titles(): Promise<BillTitlesResponse> {
    return this.client.getValidated(`${this.path}/titles`, BillTitlesResponseSchema);
  }
}

function buildQuery(params: Record<string, string | number | undefined>): string {
  const entries = Object.entries(params).filter(([, v]) => v !== undefined && v !== "");
  if (entries.length === 0) return "";
  const qs = entries.map(([k, v]) => `${k}=${encodeURIComponent(String(v))}`).join("&");
  return `?${qs}`;
}

function httpError(target: string, status: number): Error {
  return new Error(`Congress API error for ${target}: HTTP ${status}`);
}
