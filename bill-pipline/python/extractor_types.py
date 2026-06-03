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
