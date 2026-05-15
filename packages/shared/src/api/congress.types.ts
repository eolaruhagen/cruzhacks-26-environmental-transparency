/**
 * Zod schemas for Library of Congress Bills API (api.congress.gov v3) responses.
 *
 * Source of truth: the official OpenAPI spec at
 *   https://github.com/LibraryOfCongress/api.congress.gov/blob/main/Documentation/swagger.json
 * cross-referenced with the per-endpoint markdown spec at
 *   https://github.com/LibraryOfCongress/api.congress.gov/blob/main/Documentation/BillEndpoint.md
 *
 * The OpenAPI schemas describe the inner item shapes but omit the response
 * envelope (e.g. `{ bills: [...], pagination: {...}, request: {...} }`); the
 * envelope keys are described in the markdown docs and confirmed by the existing
 * pipeline code in this repo.
 *
 * These schemas validate the wire format only. Date/time fields are kept as
 * `z.string()` — transforms to JS `Date` happen in the worker, not here.
 *
 * Optional vs nullable convention:
 *   .optional()   the API may omit the key entirely
 *   .nullable()   the key is present but the value is null
 *   .nullish()    either of the above
 *
 * Where a field is documented but its inner shape is loose or undocumented, it
 * is modelled as `z.unknown()` with a comment.
 */

import { z } from "zod";

// ---------------------------------------------------------------------------
// Enums
// ---------------------------------------------------------------------------

/**
 * Bill type as it appears in response data fields (`bill.type`, etc.) — always
 * uppercase on the wire. Use `BillTypeAsParamSchema` for the lowercase URL/param
 * form.
 */
export const BillTypeSchema = z.enum([
  "HR",
  "S",
  "HJRES",
  "SJRES",
  "HCONRES",
  "SCONRES",
  "HRES",
  "SRES",
]);
export type BillType = z.infer<typeof BillTypeSchema>;

/**
 * Lowercase bill type for URL path segments and the `request` echo block.
 * Same eight values as `BillTypeSchema`, lowercased. Convert with
 * `.toLowerCase()` / `.toUpperCase()` — they're disjoint string sets, not
 * synonyms.
 */
export const BillTypeAsParamSchema = z.enum([
  "hr",
  "s",
  "hjres",
  "sjres",
  "hconres",
  "sconres",
  "hres",
  "sres",
]);
export type BillTypeAsParam = z.infer<typeof BillTypeAsParamSchema>;

/** Origin chamber name. Documented values are "House" and "Senate". */
export const ChamberSchema = z.enum(["House", "Senate", "Joint"]);
export type Chamber = z.infer<typeof ChamberSchema>;

/** Origin chamber single-letter code: "H" or "S". */
export const ChamberCodeSchema = z.enum(["H", "S"]);
export type ChamberCode = z.infer<typeof ChamberCodeSchema>;

// ---------------------------------------------------------------------------
// Shared envelope pieces
// ---------------------------------------------------------------------------

/**
 * Pagination block. The Congress API's list endpoints return either or both of
 * `next` and `prev` URLs (relative or absolute, includes `format` query param
 * but NOT `api_key` — caller appends it). `count` is the total result count
 * for the query, not the page size.
 */
export const PaginationSchema = z.object({
  count: z.number().int().nonnegative().optional(),
  next: z.string().url().optional(),
  prev: z.string().url().optional(),
});
export type Pagination = z.infer<typeof PaginationSchema>;

/**
 * Request echo block. Congress API echoes back the request parameters used to
 * resolve the response. Shape is loose; we only model the well-known keys we
 * have seen and allow unknown extras as optional strings (no passthrough).
 */
export const RequestEchoSchema = z.object({
  contentType: z.string().optional(),
  format: z.string().optional(),
  fromDateTime: z.string().optional(),
  toDateTime: z.string().optional(),
  congress: z.string().optional(),
  billType: BillTypeAsParamSchema.optional(),
  billNumber: z.string().optional(),
  billUrl: z.string().url().optional(),
});
export type RequestEcho = z.infer<typeof RequestEchoSchema>;

// ---------------------------------------------------------------------------
// Latest action (used in many places)
// ---------------------------------------------------------------------------

/**
 * Repeated subobject across the API. Documented fields are `actionDate`,
 * `actionTime` (House-only, may be missing), and `text`. Dates appear as
 * `YYYY-MM-DD`; times as `HH:MM:SS`.
 */
export const LatestActionSchema = z.object({
  actionDate: z.string().optional(),
  actionTime: z.string().optional(),
  text: z.string().optional(),
});
export type LatestAction = z.infer<typeof LatestActionSchema>;

// ---------------------------------------------------------------------------
// 1. GET /bill — paginated bill list
// ---------------------------------------------------------------------------

/**
 * Single item in `GET /bill` and `GET /bill/{congress}/{billType}` lists.
 * Note: `number` is documented as a string in the OpenAPI spec but appears
 * to be sent as a JSON number in practice. Allow both via `z.union`.
 */
export const BillListItemSchema = z.object({
  congress: z.number().int(),
  type: BillTypeSchema,
  number: z.union([z.number().int(), z.string()]),
  originChamber: ChamberSchema.optional(),
  originChamberCode: ChamberCodeSchema.optional(),
  title: z.string().optional(),
  url: z.string().url().optional(),
  /** Date of last update on Congress.gov; format `YYYY-MM-DD`. */
  updateDate: z.string().optional(),
  /** Date of last update including text changes; format `YYYY-MM-DD` or ISO datetime. */
  updateDateIncludingText: z.string().optional(),
  latestAction: LatestActionSchema.optional(),
});
export type BillListItem = z.infer<typeof BillListItemSchema>;

export const BillListResponseSchema = z.object({
  bills: z.array(BillListItemSchema),
  pagination: PaginationSchema.optional(),
  request: RequestEchoSchema.optional(),
});
export type BillListResponse = z.infer<typeof BillListResponseSchema>;

// ---------------------------------------------------------------------------
// 2. GET /bill/{congress}/{billType}/{billNumber} — bill detail
// ---------------------------------------------------------------------------

/**
 * Sponsor block. Sourced from BillEndpoint.md "sponsors" subtree. `district`
 * may be a number or the string "0" for at-large districts (docs are
 * ambiguous; we accept both via z.union).
 */
export const SponsorSchema = z.object({
  bioguideId: z.string().optional(),
  fullName: z.string().optional(),
  firstName: z.string().optional(),
  middleName: z.string().optional(),
  lastName: z.string().optional(),
  party: z.string().optional(),
  state: z.string().optional(),
  url: z.string().url().optional(),
  district: z.union([z.number().int(), z.string()]).optional(),
  isByRequest: z.string().optional(),
});
export type Sponsor = z.infer<typeof SponsorSchema>;

/** Reference subobject: { count, url } pointing at a sub-endpoint. */
export const CountUrlRefSchema = z.object({
  count: z.number().int().nonnegative().optional(),
  url: z.string().url().optional(),
});
export type CountUrlRef = z.infer<typeof CountUrlRefSchema>;

/** Cosponsors ref on the bill detail; has the extra withdrawn count. */
export const CosponsorsRefSchema = z.object({
  count: z.number().int().nonnegative().optional(),
  countIncludingWithdrawnCosponsors: z.number().int().nonnegative().optional(),
  url: z.string().url().optional(),
});
export type CosponsorsRef = z.infer<typeof CosponsorsRefSchema>;

/** Inline policy area block on the bill detail. */
export const PolicyAreaSchema = z.object({
  name: z.string(),
  updateDate: z.string().optional(),
});
export type PolicyArea = z.infer<typeof PolicyAreaSchema>;

/** A CBO cost estimate on the bill detail. */
export const CboCostEstimateSchema = z.object({
  pubDate: z.string().optional(),
  title: z.string().optional(),
  url: z.string().url().optional(),
  description: z.string().optional(),
});
export type CboCostEstimate = z.infer<typeof CboCostEstimateSchema>;

/** A committee report citation on the bill detail. */
export const CommitteeReportRefSchema = z.object({
  citation: z.string().optional(),
  url: z.string().url().optional(),
});
export type CommitteeReportRef = z.infer<typeof CommitteeReportRefSchema>;

/** Single law assignment on a bill that became law. */
export const LawSchema = z.object({
  /** "Public Law" or "Private Law". */
  type: z.string().optional(),
  /** NARA-assigned law number, e.g. "117-108". */
  number: z.string().optional(),
});
export type Law = z.infer<typeof LawSchema>;

/** Inline note on the bill detail. Text may be CDATA-wrapped HTML. */
export const BillNoteSchema = z.object({
  text: z.string().optional(),
});
export type BillNote = z.infer<typeof BillNoteSchema>;

/**
 * Bill detail item — the value of the `bill` key on the
 * `GET /bill/{congress}/{billType}/{billNumber}` response.
 */
export const BillDetailSchema = z.object({
  congress: z.number().int(),
  type: BillTypeSchema,
  number: z.union([z.number().int(), z.string()]),
  originChamber: ChamberSchema.optional(),
  originChamberCode: ChamberCodeSchema.optional(),
  title: z.string().optional(),
  introducedDate: z.string().optional(),
  updateDate: z.string().optional(),
  updateDateIncludingText: z.string().optional(),
  /** Public-facing congress.gov URL for the bill (consumed by bill-data-fetcher). */
  legislationUrl: z.string().url().optional(),
  constitutionalAuthorityStatementText: z.string().optional(),
  latestAction: LatestActionSchema.optional(),
  sponsors: z.array(SponsorSchema).optional(),
  /**
   * Senators introducing on behalf of a sponsor. Shape resembles `SponsorSchema`
   * but with an extra `type` discriminator. Modelled loosely.
   */
  onBehalfOfSponsor: z.array(SponsorSchema.extend({ type: z.string().optional() })).optional(),
  policyArea: PolicyAreaSchema.optional(),
  laws: z.array(LawSchema).optional(),
  notes: z.array(BillNoteSchema).optional(),
  cboCostEstimates: z.array(CboCostEstimateSchema).optional(),
  committeeReports: z.array(CommitteeReportRefSchema).optional(),
  // Sub-endpoint references: each is a { count, url } pointer.
  actions: CountUrlRefSchema.optional(),
  amendments: CountUrlRefSchema.optional(),
  committees: CountUrlRefSchema.optional(),
  cosponsors: CosponsorsRefSchema.optional(),
  relatedBills: CountUrlRefSchema.optional(),
  subjects: CountUrlRefSchema.optional(),
  summaries: CountUrlRefSchema.optional(),
  textVersions: CountUrlRefSchema.optional(),
  titles: CountUrlRefSchema.optional(),
});
export type BillDetail = z.infer<typeof BillDetailSchema>;

export const BillDetailResponseSchema = z.object({
  bill: BillDetailSchema,
  request: RequestEchoSchema.optional(),
});
export type BillDetailResponse = z.infer<typeof BillDetailResponseSchema>;

// ---------------------------------------------------------------------------
// 3. GET /bill/{congress}/{billType}/{billNumber}/actions
// ---------------------------------------------------------------------------

/** Source system that recorded an action. Codes are 0/1/2/9. */
export const SourceSystemSchema = z.object({
  code: z.number().int().optional(),
  name: z.string().optional(),
});
export type SourceSystem = z.infer<typeof SourceSystemSchema>;

/** A roll-call vote attached to a bill action. */
export const RecordedVoteSchema = z.object({
  rollNumber: z.number().int().optional(),
  url: z.string().url().optional(),
  chamber: ChamberSchema.optional(),
  congress: z.number().int().optional(),
  /** ISO datetime, e.g. `2022-03-08T22:45:05Z`. */
  date: z.string().optional(),
  sessionNumber: z.number().int().optional(),
});
export type RecordedVote = z.infer<typeof RecordedVoteSchema>;

/**
 * A committee referenced from an action. Lighter than the full
 * `BillCommitteeSchema` used at the committees endpoint level.
 */
export const ActionCommitteeRefSchema = z.object({
  url: z.string().url().optional(),
  systemCode: z.string().optional(),
  name: z.string().optional(),
});
export type ActionCommitteeRef = z.infer<typeof ActionCommitteeRefSchema>;

/** Calendar info attached to an action. */
export const CalendarNumberSchema = z.object({
  calendar: z.string().optional(),
  /** May be a number or null/empty for House actions. */
  number: z.union([z.string(), z.number()]).nullish(),
});
export type CalendarNumber = z.infer<typeof CalendarNumberSchema>;

/**
 * Single action item.
 *
 * `type` is documented as one of "Committee", "Calendars", "Floor", "BecameLaw",
 * "IntroReferral", "President", "ResolvingDifferences", "Discharge", "NotUsed",
 * "Veto" — but the docs hint at growth, so we keep it as a free string.
 */
export const BillActionSchema = z.object({
  actionDate: z.string().optional(),
  actionTime: z.string().optional(),
  text: z.string().optional(),
  type: z.string().optional(),
  actionCode: z.string().optional(),
  sourceSystem: SourceSystemSchema.optional(),
  committees: z.array(ActionCommitteeRefSchema).optional(),
  recordedVotes: z.array(RecordedVoteSchema).optional(),
  calendarNumber: CalendarNumberSchema.optional(),
});
export type BillAction = z.infer<typeof BillActionSchema>;

export const BillActionsResponseSchema = z.object({
  actions: z.array(BillActionSchema),
  pagination: PaginationSchema.optional(),
  request: RequestEchoSchema.optional(),
});
export type BillActionsResponse = z.infer<typeof BillActionsResponseSchema>;

// ---------------------------------------------------------------------------
// 4. GET /bill/{congress}/{billType}/{billNumber}/committees
// ---------------------------------------------------------------------------

/** A committee/subcommittee activity. */
export const CommitteeActivitySchema = z.object({
  /**
   * Documented possible values: "Referred to", "Re-Referred to", "Hearings by",
   * "Markup by", "Reported by", "Reported original measure", "Committed to",
   * "Re-Committed to", "Legislative Interest". Kept as a free string in case
   * new values appear.
   */
  name: z.string().optional(),
  /** ISO datetime, e.g. `2021-05-11T18:05:45Z`. */
  date: z.string().optional(),
});
export type CommitteeActivity = z.infer<typeof CommitteeActivitySchema>;

/**
 * Committee/subcommittee item on the committees endpoint. The
 * `subcommittees` field is documented but its sub-shape is not fully
 * specified in the markdown — modelled as `z.unknown()`.
 */
export const BillCommitteeSchema = z.object({
  url: z.string().url().optional(),
  systemCode: z.string().optional(),
  name: z.string().optional(),
  chamber: ChamberSchema.optional(),
  /**
   * Documented values: "Standing", "Select", "Special", "Joint", "Task Force",
   * "Other", "Subcommittee", "Commission or Caucus".
   */
  type: z.string().optional(),
  subcommittees: z.array(z.unknown()).optional(),
  activities: z.array(CommitteeActivitySchema).optional(),
});
export type BillCommittee = z.infer<typeof BillCommitteeSchema>;

export const BillCommitteesResponseSchema = z.object({
  committees: z.array(BillCommitteeSchema),
  pagination: PaginationSchema.optional(),
  request: RequestEchoSchema.optional(),
});
export type BillCommitteesResponse = z.infer<typeof BillCommitteesResponseSchema>;

// ---------------------------------------------------------------------------
// 5. GET /bill/{congress}/{billType}/{billNumber}/cosponsors
// ---------------------------------------------------------------------------

/**
 * Single cosponsor.
 *
 * Note: the OpenAPI spec has a typo (`bioguidId` vs `bioguideId`); the
 * markdown spec and live responses use `bioguideId`. We follow the markdown.
 */
export const BillCosponsorSchema = z.object({
  bioguideId: z.string().optional(),
  fullName: z.string().optional(),
  firstName: z.string().optional(),
  middleName: z.string().optional(),
  lastName: z.string().optional(),
  /** Documented possible values: "D", "R", "I", "ID", "L". */
  party: z.string().optional(),
  state: z.string().optional(),
  url: z.string().url().optional(),
  district: z.union([z.number().int(), z.string()]).optional(),
  /** `YYYY-MM-DD` */
  sponsorshipDate: z.string().optional(),
  /**
   * Markdown documents the value as the strings "True"/"False" but the
   * OpenAPI spec types it as a JSON boolean. Live responses are JSON
   * booleans — we accept both to be robust.
   */
  isOriginalCosponsor: z.union([z.boolean(), z.string()]).optional(),
  sponsorshipWithdrawnDate: z.string().optional(),
});
export type BillCosponsor = z.infer<typeof BillCosponsorSchema>;

/**
 * Cosponsors response. Note: at the cosponsors level the markdown shows
 * pagination merged with cosponsor counts (both `count` and
 * `countIncludingWithdrawnCosponsors`). We extend `PaginationSchema` here.
 */
export const CosponsorsPaginationSchema = PaginationSchema.extend({
  countIncludingWithdrawnCosponsors: z.number().int().nonnegative().optional(),
});
export type CosponsorsPagination = z.infer<typeof CosponsorsPaginationSchema>;

export const BillCosponsorsResponseSchema = z.object({
  cosponsors: z.array(BillCosponsorSchema),
  pagination: CosponsorsPaginationSchema.optional(),
  request: RequestEchoSchema.optional(),
});
export type BillCosponsorsResponse = z.infer<typeof BillCosponsorsResponseSchema>;

// ---------------------------------------------------------------------------
// 6. GET /bill/{congress}/{billType}/{billNumber}/summaries
// ---------------------------------------------------------------------------

/** A single CRS-written bill summary. */
export const BillSummaryItemSchema = z.object({
  /** CRS-internal version code (e.g. "00", "36"). See markdown spec. */
  versionCode: z.string().optional(),
  actionDate: z.string().optional(),
  actionDesc: z.string().optional(),
  /** ISO datetime, e.g. `2022-02-18T16:38:41Z`. */
  updateDate: z.string().optional(),
  /** CDATA-wrapped HTML body. */
  text: z.string().optional(),
});
export type BillSummaryItem = z.infer<typeof BillSummaryItemSchema>;

export const BillSummariesResponseSchema = z.object({
  summaries: z.array(BillSummaryItemSchema),
  pagination: PaginationSchema.optional(),
  request: RequestEchoSchema.optional(),
});
export type BillSummariesResponse = z.infer<typeof BillSummariesResponseSchema>;

// ---------------------------------------------------------------------------
// 7. GET /bill/{congress}/{billType}/{billNumber}/text
// ---------------------------------------------------------------------------

/** A format link for a bill text version. */
export const TextFormatSchema = z.object({
  /** Documented values: "Formatted Text", "PDF", "Formatted XML". */
  type: z.string(),
  url: z.string().url(),
});
export type TextFormat = z.infer<typeof TextFormatSchema>;

/** A single text version of the bill. */
export const BillTextVersionSchema = z.object({
  type: z.string().optional(),
  /**
   * ISO datetime, e.g. `2021-05-11T04:00:00Z`. Sometimes null when the
   * date is not yet assigned (rare but seen in the wild).
   */
  date: z.string().nullish(),
  formats: z.array(TextFormatSchema).optional(),
});
export type BillTextVersion = z.infer<typeof BillTextVersionSchema>;

export const BillTextResponseSchema = z.object({
  textVersions: z.array(BillTextVersionSchema),
  pagination: PaginationSchema.optional(),
  request: RequestEchoSchema.optional(),
});
export type BillTextResponse = z.infer<typeof BillTextResponseSchema>;

// ---------------------------------------------------------------------------
// 8. GET /bill/{congress}/{billType}/{billNumber}/subjects
// ---------------------------------------------------------------------------

/** A single legislative subject term. */
export const LegislativeSubjectSchema = z.object({
  name: z.string(),
  updateDate: z.string().optional(),
});
export type LegislativeSubject = z.infer<typeof LegislativeSubjectSchema>;

/**
 * Subjects level differs from other endpoints — instead of a top-level array
 * keyed by the endpoint name, it is keyed by `subjects` whose value is an
 * object containing `legislativeSubjects` and `policyArea`.
 */
export const BillSubjectsContainerSchema = z.object({
  legislativeSubjects: z.array(LegislativeSubjectSchema).optional(),
  policyArea: PolicyAreaSchema.optional(),
});
export type BillSubjectsContainer = z.infer<typeof BillSubjectsContainerSchema>;

export const BillSubjectsResponseSchema = z.object({
  subjects: BillSubjectsContainerSchema,
  pagination: PaginationSchema.optional(),
  request: RequestEchoSchema.optional(),
});
export type BillSubjectsResponse = z.infer<typeof BillSubjectsResponseSchema>;

// ---------------------------------------------------------------------------
// 9. GET /bill/{congress}/{billType}/{billNumber}/relatedbills
// ---------------------------------------------------------------------------

/** A single relationship-type detail. */
export const RelationshipDetailSchema = z.object({
  /** e.g. "Related bill", "Identical bill", "Companion measure". */
  type: z.string().optional(),
  /** Documented values: "House", "Senate", "CRS". */
  identifiedBy: z.string().optional(),
});
export type RelationshipDetail = z.infer<typeof RelationshipDetailSchema>;

/** A single related bill entry. */
export const BillRelatedBillSchema = z.object({
  url: z.string().url().optional(),
  title: z.string().optional(),
  congress: z.number().int().optional(),
  number: z.union([z.number().int(), z.string()]).optional(),
  type: BillTypeSchema.optional(),
  latestAction: LatestActionSchema.optional(),
  relationshipDetails: z.array(RelationshipDetailSchema).optional(),
});
export type BillRelatedBill = z.infer<typeof BillRelatedBillSchema>;

export const BillRelatedBillsResponseSchema = z.object({
  relatedBills: z.array(BillRelatedBillSchema),
  pagination: PaginationSchema.optional(),
  request: RequestEchoSchema.optional(),
});
export type BillRelatedBillsResponse = z.infer<typeof BillRelatedBillsResponseSchema>;

// ---------------------------------------------------------------------------
// 10. GET /bill/{congress}/{billType}/{billNumber}/titles
// ---------------------------------------------------------------------------

/**
 * A single title associated with a bill. `titleTypeCode` is documented as an
 * integer in the OpenAPI spec; we accept both number and string defensively.
 */
export const BillTitleSchema = z.object({
  titleType: z.string().optional(),
  title: z.string(),
  chamberCode: ChamberCodeSchema.optional(),
  chamberName: ChamberSchema.optional(),
  billTextVersionName: z.string().optional(),
  billTextVersionCode: z.string().optional(),
  titleTypeCode: z.union([z.number().int(), z.string()]).optional(),
  updateDate: z.string().optional(),
});
export type BillTitle = z.infer<typeof BillTitleSchema>;

export const BillTitlesResponseSchema = z.object({
  titles: z.array(BillTitleSchema),
  pagination: PaginationSchema.optional(),
  request: RequestEchoSchema.optional(),
});
export type BillTitlesResponse = z.infer<typeof BillTitlesResponseSchema>;
