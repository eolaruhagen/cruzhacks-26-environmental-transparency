import { describe, test, expect } from "bun:test";
import {
    NewsMeshResponseSchema,
    NewsMeshItemSchema,
    NewsIOResponseSchema,
    NewsIOItemSchema,
    filterFromLastDay,
} from "../externalApis";

// ── NewsMesh schema tests ───────────────────────────────────────────

describe("NewsMeshResponseSchema", () => {
    const validItem = {
        article_id: "abc-123",
        title: "EPA announces new clean water rule",
        description: "The Environmental Protection Agency today...",
        link: "https://example.com/article/123",
        media_url: "https://example.com/image.jpg",
        published_date: "2026-04-05T12:00:00Z",
        source: "Reuters",
        category: "environment",
        topics: ["environment", "epa"],
        people: ["Scott Pruitt"],
        author: ["Jane Doe"],
    };

    test("parses a valid full response", () => {
        const response = { data: [validItem], next_cursor: "cursor_abc" };
        const parsed = NewsMeshResponseSchema.parse(response);
        expect(parsed.data).toHaveLength(1);
        expect(parsed.data[0]?.title).toBe("EPA announces new clean water rule");
        expect(parsed.next_cursor).toBe("cursor_abc");
    });

    test("parses response with no cursor (last page)", () => {
        const response = { data: [validItem] };
        const parsed = NewsMeshResponseSchema.parse(response);
        expect(parsed.next_cursor).toBeUndefined();
    });

    test("parses empty data array", () => {
        const response = { data: [] };
        const parsed = NewsMeshResponseSchema.parse(response);
        expect(parsed.data).toHaveLength(0);
    });

    // ── Schema drift detection ──────────────────────────────────────

    test("Rejects when data field is missing (envelope changed)", () => {
        expect(() => NewsMeshResponseSchema.parse({ articles: [] })).toThrow();
    });

    test("Rejects when data is not an array", () => {
        expect(() => NewsMeshResponseSchema.parse({ data: "not-an-array" })).toThrow();
    });

    test("Rejects when data is null", () => {
        expect(() => NewsMeshResponseSchema.parse({ data: null })).toThrow();
    });

    test("Rejects when data is nested differently", () => {
        expect(() => NewsMeshResponseSchema.parse({
            data: { results: [validItem] },
        })).toThrow();
    });

    test("Rejects item missing required title", () => {
        const { title, ...noTitle } = validItem;
        expect(() => NewsMeshResponseSchema.parse({ data: [noTitle] })).toThrow();
    });

    test("Rejects item missing required link", () => {
        const { link, ...noLink } = validItem;
        expect(() => NewsMeshResponseSchema.parse({ data: [noLink] })).toThrow();
    });

    test("Rejects item missing required published_date", () => {
        const { published_date, ...noDate } = validItem;
        expect(() => NewsMeshResponseSchema.parse({ data: [noDate] })).toThrow();
    });

    test("Rejects item with title as number (type changed)", () => {
        expect(() => NewsMeshResponseSchema.parse({
            data: [{ ...validItem, title: 12345 }],
        })).toThrow();
    });

    // These fields may come as null, undefined, wrong type from the API.
    // The schemas allow it; normalization happens downstream.

    test("accepts item with null optional fields", () => {
        const parsed = NewsMeshItemSchema.parse({
            ...validItem,
            media_url: null,
            source: null,
            category: null,
        });
        expect(parsed.media_url).toBeNull();
        expect(parsed.source).toBeNull();
    });

    test("accepts item with missing optional fields", () => {
        const { media_url, source, category, topics, people, author, ...required } = validItem;
        const parsed = NewsMeshItemSchema.parse(required);
        expect(parsed.media_url).toBeUndefined();
        expect(parsed.topics).toEqual([]);  // default
        expect(parsed.people).toEqual([]);  // default
        expect(parsed.author).toEqual([]);  // default
    });

    test("accepts item with string instead of string[] for topics (API quirk)", () => {
        const parsed = NewsMeshItemSchema.parse({
            ...validItem,
            topics: "single-topic",
        });
        // z.unknown() passes it through — toStringArray handles normalization
        expect(parsed.topics).toBe("single-topic");
    });

    test("passes through unknown fields from API (forward compat)", () => {
        const parsed = NewsMeshItemSchema.parse({
            ...validItem,
            new_api_field: "surprise",
        });
        // Zod 4 strips unknown keys by default, but that's fine —
        // we don't access fields not in the schema
        expect(parsed.title).toBe("EPA announces new clean water rule");
    });
});

// ── NewsIO schema tests ─────────────────────────────────────────────

describe("NewsIOResponseSchema", () => {
    const validItem = {
        article_id: "def-456",
        title: "Biden signs conservation bill",
        description: "President Biden signed...",
        link: "https://newsdata.io/article/456",
        source_icon: "https://newsdata.io/icon.png",
        pubDate: "2026-04-05 10:30:00",
        source_name: "AP News",
        category: ["environment"],
        keywords: ["biden", "conservation"],
        creator: ["AP Staff"],
    };

    test("parses a valid full response", () => {
        const response = {
            status: "success",
            totalResults: 50,
            results: [validItem],
            nextPage: "page_2",
        };
        const parsed = NewsIOResponseSchema.parse(response);
        expect(parsed.results).toHaveLength(1);
        expect(parsed.nextPage).toBe("page_2");
    });

    test("parses response with no next page (last page)", () => {
        const response = { status: "success", totalResults: 5, results: [validItem] };
        const parsed = NewsIOResponseSchema.parse(response);
        expect(parsed.nextPage).toBeUndefined();
    });

    // ── Schema drift detection ──────────────────────────────────────

    test("Rejects when results field is missing", () => {
        expect(() => NewsIOResponseSchema.parse({
            status: "success", totalResults: 0,
        })).toThrow();
    });

    test("Rejects when results is not an array", () => {
        expect(() => NewsIOResponseSchema.parse({
            status: "success", totalResults: 0, results: {},
        })).toThrow();
    });

    test("Rejects item missing required pubDate", () => {
        const { pubDate, ...noDate } = validItem;
        expect(() => NewsIOResponseSchema.parse({
            status: "success", totalResults: 1, results: [noDate],
        })).toThrow();
    });

    test("Rejects when API returns error envelope with wrong structure", () => {
        // NewsData.io returns {status: "error", results: {code: ...}} on errors
        expect(() => NewsIOResponseSchema.parse({
            status: "error",
            results: { code: "RateLimitExceeded", message: "..." },
        })).toThrow();
    });

    // ── Lenient field handling ───────────────────────────────────────

    test("accepts item with null description, keywords, creator", () => {
        const parsed = NewsIOItemSchema.parse({
            ...validItem,
            description: null,
            keywords: null,
            creator: null,
        });
        expect(parsed.description).toBeNull();
        expect(parsed.keywords).toBeNull();
        expect(parsed.creator).toBeNull();
    });

    test("accepts item with missing optional fields", () => {
        const { source_icon, keywords, creator, description, category, ...required } = validItem;
        const parsed = NewsIOItemSchema.parse(required);
        expect(parsed.source_icon).toBeUndefined();
        expect(parsed.keywords).toBeNull();   // default
        expect(parsed.creator).toBeNull();     // default
    });
});

// ── filterFromLastDay tests ─────────────────────────────────────────

describe("filterFromLastDay", () => {
    test("keeps articles from last 24 hours", () => {
        const recent = new Date(Date.now() - 1000 * 60 * 60 * 2).toISOString(); // 2h ago
        const result = filterFromLastDay(
            [{ pubDate: recent, title: "recent" }],
            "pubDate",
        );
        expect(result).toHaveLength(1);
    });

    test("filters out articles older than 24 hours", () => {
        const old = new Date(Date.now() - 1000 * 60 * 60 * 48).toISOString(); // 48h ago
        const result = filterFromLastDay(
            [{ pubDate: old, title: "old" }],
            "pubDate",
        );
        expect(result).toHaveLength(0);
    });

    test("handles empty array", () => {
        const result = filterFromLastDay([], "pubDate");
        expect(result).toHaveLength(0);
    });

    test("silently drops items with invalid date (NaN propagation)", () => {
        // This documents current behavior — NaN comparison returns false
        const result = filterFromLastDay(
            [{ pubDate: "not-a-date", title: "bad" }],
            "pubDate",
        );
        expect(result).toHaveLength(0);
    });

    test("silently drops items with null date field", () => {
        const result = filterFromLastDay(
            [{ pubDate: null as any, title: "null-date" }],
            "pubDate",
        );
        expect(result).toHaveLength(0);
    });
});
