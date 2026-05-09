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
import { HttpResponseError } from "../utils/http/error.ts";
import {
  type FetchLike,
  type FetchResponseLike,
  getValidated as sharedGetValidated,
} from "../utils/http/get-validated.ts";
import { buildQuery } from "../utils/http/query.ts";
import { type RetryOptions, withRetry } from "../utils/http/with-retry.ts";

const DEFAULT_BASE_URL = "https://api.congress.gov/v3";

/**
 * Re-export the canonical fetch-shape types so existing CongressClient
 * consumers keep working without importing from a new path.
 */
export type { FetchResponseLike };
export type CongressFetch = FetchLike;

export interface CongressClientOptions {
  apiKey: string;
  baseUrl?: string;
  fetchImpl?: CongressFetch;
  /**
   * Retry policy applied to every CongressClient request. Defaults to the
   * shared retry options (3 attempts, 5s timeout, exponential backoff
   * 250→500ms with jitter, capped at 1.5s). Pass `{ maxAttempts: 1 }` to
   * disable retries entirely (useful in tests that want deterministic
   * fail-fast behavior).
   */
  retryOptions?: RetryOptions;
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
  private readonly retryOptions?: RetryOptions;

  constructor(opts: CongressClientOptions) {
    this.apiKey = opts.apiKey;
    this.baseUrl = opts.baseUrl ?? DEFAULT_BASE_URL;
    this.fetchImpl = opts.fetchImpl ?? ((url, init) => globalThis.fetch(url, init));
    this.retryOptions = opts.retryOptions;
  }


  /** Fetch one page of bills. Returns the raw envelope including `pagination`. */
  listBills(params: ListBillsParams = {}): Promise<BillListResponse> {
    const qs = buildQuery(params);
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
    if (!response.ok) {
      let body: string | undefined;
      try {
        body = await response.text();
      } catch {
        body = undefined;
      }
      throw new HttpResponseError(response.status, textUrl, body);
    }
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

  /**
   * @internal
   * Wraps the shared `getValidated` (which returns `HttpResult<T>`) with
   * `withRetry` (which retries 5xx + thrown errors, NOT 429/4xx), then
   * collapses the Result back to a throw on the outer surface so existing
   * callers (`scope.detail()` etc.) keep their try/catch ergonomics.
   *
   * The 429 path: bails after attempt 1 with HttpResponseError(429, ...).
   * Caller catches it and updates rate-limit cooldown state.
   */
  async getValidated<T>(urlOrPath: string, schema: z.ZodType<T>): Promise<T> {
    const url = this.resolveUrl(urlOrPath);
    const result = await withRetry(
      (signal) => sharedGetValidated(this.fetchImpl, url, schema, { signal }),
      this.retryOptions,
    );
    if (result instanceof HttpResponseError) throw result;
    return result.data;
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

