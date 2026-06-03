from __future__ import annotations

import pytest

from extractor_types import ExtractedReference
from lib.extract import (
    dedup_named_laws,
    extract_cfr,
    extract_eo,
    extract_fedreg,
    extract_named_acts,
    extract_public_laws,
    extract_references_from_text,
    extract_stat,
    extract_treaties,
    extract_usc,
    get_nlp,
    resolve_overlaps,
)

EXPECTED_KEYS = {
    "kind",
    "raw",
    "normalized_key",
    "normalized",
    "context",
    "span_start",
    "span_end",
    "is_self_ref",
}


def _only(refs: list[ExtractedReference]) -> ExtractedReference:
    assert len(refs) == 1, f"expected exactly one record, got {len(refs)}: {refs}"
    return refs[0]


def _pairs(refs: list[ExtractedReference]) -> set[tuple[str, str]]:
    return {(r["kind"], r["normalized_key"]) for r in refs}


def _make_ref(**overrides: object) -> ExtractedReference:
    base: ExtractedReference = {
        "kind": "named_law",
        "raw": "Clean Air Act",
        "normalized_key": "named:clean air act",
        "normalized": {"name": "Clean Air Act", "law_number": None},
        "context": "",
        "span_start": 0,
        "span_end": 13,
        "is_self_ref": False,
    }
    return {**base, **overrides}  # type: ignore[return-value]


# --- per-kind extractors ---


def test_extract_public_laws() -> None:
    rec = _only(extract_public_laws("See Public Law 117-58 for details."))
    assert rec["kind"] == "public_law"
    assert rec["normalized_key"] == "pl:117-58"
    assert rec["normalized"]["law_number"] == "117-58"


def test_extract_usc_plain() -> None:
    rec = _only(extract_usc("Codified at 42 U.S.C. 7401 today."))
    assert rec["kind"] == "usc"
    assert rec["normalized_key"] == "usc:42:7401"
    assert rec["normalized"]["title"] == 42
    assert rec["normalized"]["section"] == "7401"


def test_extract_usc_et_seq() -> None:
    rec = _only(extract_usc("Codified at 42 U.S.C. 7401 et seq. today."))
    assert rec["kind"] == "usc_et_seq"
    assert rec["normalized_key"] == "usc:42:7401"


def test_extract_usc_subsection_base_in_key_surface_in_section() -> None:
    rec = _only(extract_usc("Per 42 U.S.C. 7412(b)(7) the rule applies."))
    assert rec["kind"] == "usc"
    assert rec["normalized_key"] == "usc:42:7412"
    assert rec["normalized"]["section"] == "7412(b)(7)"


def test_extract_cfr_standard() -> None:
    rec = _only(extract_cfr("Defined in 40 C.F.R. § 50.1 precisely."))
    assert rec["kind"] == "cfr"
    assert rec["normalized_key"] == "cfr:40:50.1"
    assert rec["normalized"]["title"] == 40
    assert rec["normalized"]["part"] == "50.1"


def test_extract_cfr_inverted() -> None:
    rec = _only(
        extract_cfr("See part 260 of title 16, Code of Federal Regulations here.")
    )
    assert rec["kind"] == "cfr"
    assert rec["normalized_key"] == "cfr:16:260"
    assert rec["normalized"]["title"] == 16
    assert rec["normalized"]["part"] == "260"


def test_extract_fedreg() -> None:
    rec = _only(extract_fedreg("Published at 88 Fed. Reg. 54118 last year."))
    assert rec["kind"] == "fed_reg"
    assert rec["normalized_key"] == "fr:88:54118"
    assert rec["normalized"]["volume"] == 88
    assert rec["normalized"]["page"] == 54118


def test_extract_eo() -> None:
    rec = _only(extract_eo("Issued Executive Order 14008 in January."))
    assert rec["kind"] == "executive_order"
    assert rec["normalized_key"] == "eo:14008"
    assert rec["normalized"]["order_number"] == 14008


def test_extract_stat() -> None:
    rec = _only(extract_stat("Printed at 134 Stat. 1096 in the volume."))
    assert rec["kind"] == "stat_at_large"
    assert rec["normalized_key"] == "stat:134:1096"
    assert rec["normalized"]["volume"] == 134
    assert rec["normalized"]["page"] == 1096


def test_extract_treaties_stockholm() -> None:
    rec = _only(extract_treaties("Implements the Stockholm Convention soon."))
    assert rec["kind"] == "treaty"
    assert rec["normalized_key"] == "treaty:stockholm convention"
    assert rec["normalized"]["name"] == "Stockholm Convention"


def test_extract_treaties_paris() -> None:
    rec = _only(extract_treaties("Ratifies the Paris Agreement next year."))
    assert rec["kind"] == "treaty"
    assert rec["normalized_key"] == "treaty:paris agreement"
    assert rec["normalized"]["name"] == "Paris Agreement"


def test_extract_named_acts_simple() -> None:
    rec = _only(extract_named_acts("Provisions of the Clean Air Act apply broadly."))
    assert rec["kind"] == "named_law"
    assert rec["normalized_key"] == "named:clean air act"
    assert rec["normalized"]["name"] == "Clean Air Act"
    assert rec["normalized"]["law_number"] is None


def test_extract_named_acts_name_has_no_embedded_whitespace() -> None:
    # Hard-wrapped act name in bill text must not leak \n/\t into the stored
    # normalized.name (which lands in the cited_references jsonb). Use a plain
    # "the X Act" phrasing (no "amends") so a single candidate is returned.
    rec = _only(extract_named_acts("Under the Clean\tAir\nAct the rule applies."))
    name = rec["normalized"]["name"]
    assert name == "Clean Air Act"
    assert "\t" not in name and "\n" not in name


def test_extract_named_acts_returns_raw_overlapping_candidates() -> None:
    # extract_named_acts is a multi-pass candidate generator; "amends" trips
    # both the "the X Act" pass and the "Amends X Act" pass, so two overlapping
    # candidates are returned by design. Overlap collapse is resolve_overlaps'
    # job, not this function's.
    recs = extract_named_acts("This amends the Clean Air Act broadly.")
    assert len(recs) == 2
    assert {r["normalized_key"] for r in recs} == {"named:clean air act"}
    raws = {r["raw"] for r in recs}
    assert "the Clean Air Act" in raws
    assert "amends the Clean Air Act" in raws

    # ...and resolve_overlaps collapses them to the single longest span.
    resolved = resolve_overlaps(recs)
    assert len(resolved) == 1
    assert resolved[0]["raw"] == "amends the Clean Air Act"


def test_extract_named_acts_with_pl_sets_law_number() -> None:
    rec = _only(extract_named_acts("the Clean Air Act (Public Law 117-58) applies."))
    assert rec["kind"] == "named_law"
    assert rec["normalized_key"] == "named:clean air act"
    assert rec["normalized"]["law_number"] == "117-58"


# --- resolve_overlaps ---


def test_resolve_overlaps_eo_absorbs_parenthetical_fedreg() -> None:
    text = "Executive Order 14008 (86 Fed. Reg. 7619)"
    matches = extract_eo(text) + extract_fedreg(text)
    assert _pairs(matches) == {
        ("executive_order", "eo:14008"),
        ("fed_reg", "fr:86:7619"),
    }
    resolved = resolve_overlaps(matches)
    assert _pairs(resolved) == {("executive_order", "eo:14008")}


def test_resolve_overlaps_treaty_beats_named_law() -> None:
    treaty = _make_ref(
        kind="treaty",
        raw="Stockholm Convention",
        normalized_key="treaty:stockholm convention",
        normalized={"name": "Stockholm Convention"},
        context="the Stockholm Convention",
        span_start=4,
        span_end=24,
    )
    named = _make_ref(
        kind="named_law",
        raw="the Stockholm Convention",
        normalized_key="named:stockholm convention",
        normalized={"name": "Stockholm Convention", "law_number": None},
        context="the Stockholm Convention",
        span_start=0,
        span_end=24,
    )
    resolved = resolve_overlaps([named, treaty])
    assert _pairs(resolved) == {("treaty", "treaty:stockholm convention")}


def test_resolve_overlaps_longest_span_wins() -> None:
    short = _make_ref(span_start=10, span_end=23)
    long_ = _make_ref(
        raw="the Clean Air Act Amendments",
        normalized_key="named:clean air act amendments",
        normalized={"name": "Clean Air Act Amendments", "law_number": None},
        span_start=6,
        span_end=34,
    )
    resolved = resolve_overlaps([short, long_])
    assert [r["normalized_key"] for r in resolved] == ["named:clean air act amendments"]


def test_resolve_overlaps_keeps_non_overlapping() -> None:
    a = _make_ref(
        kind="usc",
        raw="a",
        normalized_key="usc:1:1",
        normalized={"title": 1, "section": "1"},
        span_start=0,
        span_end=10,
    )
    b = _make_ref(
        kind="cfr",
        raw="b",
        normalized_key="cfr:1:1",
        normalized={"title": 1, "part": "1"},
        span_start=20,
        span_end=30,
    )
    resolved = resolve_overlaps([a, b])
    assert _pairs(resolved) == {("usc", "usc:1:1"), ("cfr", "cfr:1:1")}


def test_resolve_overlaps_empty() -> None:
    assert resolve_overlaps([]) == []


# --- dedup_named_laws ---


def test_dedup_named_laws_collapses_regex_and_spacy_duplicate() -> None:
    shared_ctx = (
        "Amends the Clean Air Act (42 U.S.C. 7401) to add things and stuff here now"
    )
    from_regex: ExtractedReference = {
        "kind": "named_law",
        "raw": "the Clean Air Act",
        "normalized_key": "named:clean air act",
        "normalized": {"name": "Clean Air Act", "law_number": None},
        "context": shared_ctx,
        "span_start": 7,
        "span_end": 24,
        "is_self_ref": False,
    }
    from_spacy: ExtractedReference = {
        "kind": "named_law",
        "raw": "Clean Air Act",
        "normalized_key": "named:clean air act",
        "normalized": {"name": "Clean Air Act", "law_number": None},
        "context": shared_ctx,
        "span_start": 11,
        "span_end": 24,
        "is_self_ref": False,
    }
    out = dedup_named_laws([from_regex, from_spacy])
    assert len(out) == 1


# --- extract_references_from_text (integration) ---


SMOKE_TEXT = (
    "Amends the Clean Air Act (42 U.S.C. 7401 et seq.) to add new requirements. "
    "References Public Law 117-58 and Executive Order 14008 (86 Fed. Reg. 7619). "
    "The Stockholm Convention shall be considered."
)

SMOKE_EXPECTED = {
    ("named_law", "named:clean air act"),
    ("usc_et_seq", "usc:42:7401"),
    ("public_law", "pl:117-58"),
    ("executive_order", "eo:14008"),
    ("treaty", "treaty:stockholm convention"),
}


@pytest.fixture(scope="module")
def smoke_refs() -> list[ExtractedReference]:
    return extract_references_from_text(SMOKE_TEXT)


def test_integration_smoke_exact_pairs(
    smoke_refs: list[ExtractedReference],
) -> None:
    assert _pairs(smoke_refs) == SMOKE_EXPECTED


def test_integration_no_fedreg_survives_eo_absorption(
    smoke_refs: list[ExtractedReference],
) -> None:
    assert all(r["kind"] != "fed_reg" for r in smoke_refs)


def test_integration_records_have_exact_shape_and_not_self_ref(
    smoke_refs: list[ExtractedReference],
) -> None:
    assert smoke_refs
    for rec in smoke_refs:
        assert set(rec.keys()) == EXPECTED_KEYS
        assert rec["is_self_ref"] is False


def test_integration_empty_and_whitespace() -> None:
    assert extract_references_from_text("") == []
    assert extract_references_from_text("   \n\t ") == []


def test_integration_legislation_number_ignored() -> None:
    without = _pairs(extract_references_from_text(SMOKE_TEXT))
    with_arg = _pairs(extract_references_from_text(SMOKE_TEXT, "H.R. 999"))
    assert without == with_arg


def test_integration_spacy_acronym_uses_surface_key_expansion_in_name() -> None:
    refs = extract_references_from_text(
        "The CWA governs water quality nationwide today."
    )
    cwa = [r for r in refs if r["normalized_key"] == "named:cwa"]
    assert len(cwa) == 1
    assert cwa[0]["kind"] == "named_law"
    assert cwa[0]["raw"] == "CWA"
    assert cwa[0]["normalized"]["name"] == "Clean Water Act"


# --- get_nlp ---


def test_get_nlp_is_module_cached() -> None:
    assert get_nlp() is get_nlp()
