from __future__ import annotations

from typing import Literal, TypedDict

ReferenceKind = Literal[
    "named_law",
    "public_law",
    "usc",
    "usc_et_seq",
    "cfr",
    "fed_reg",
    "executive_order",
    "treaty",
    "stat_at_large",
]

ReferenceSource = Literal["bill_text", "summary"]

CharSpan = tuple[int, int]
NormalizedFields = dict[str, object]


class UscNormalized(TypedDict):
    title: int
    section: str


class UscEtSeqNormalized(UscNormalized):
    pass


class PublicLawNormalized(TypedDict):
    law_number: str


class NamedLawNormalized(TypedDict):
    name: str
    law_number: str | None


class TreatyNormalized(TypedDict):
    name: str


class CfrNormalized(TypedDict):
    title: int
    part: str


class FedRegNormalized(TypedDict):
    volume: int
    page: int


class ExecutiveOrderNormalized(TypedDict):
    order_number: int


class StatAtLargeNormalized(TypedDict):
    volume: int
    page: int


class InputRecord(TypedDict):
    bill_id: str
    legislation_number: str
    source: ReferenceSource
    text: str


class ExtractedReference(TypedDict):
    kind: ReferenceKind
    raw: str
    normalized_key: str
    normalized: NormalizedFields
    context: str | None
    span_start: int | None
    span_end: int | None
    is_self_ref: bool


class OutputRecord(TypedDict):
    bill_id: str | None
    references: list[ExtractedReference]
    error: str | None
