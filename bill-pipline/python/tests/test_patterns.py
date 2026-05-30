from __future__ import annotations

from lib.patterns import (
    CONTEXT_CHARS,
    EO_RE,
    PUBLAW_RE,
    USC_RE,
    clean_act_name,
    context,
    is_valid_law_span,
    normalize_phrase_key,
    usc_section_base,
)


# --- clean_act_name ---


def test_clean_act_name_strips_leading_connectors_repeatedly() -> None:
    assert clean_act_name("and of the Clean Air Act") == "Clean Air Act"


def test_clean_act_name_leaves_clean_name_unchanged() -> None:
    assert clean_act_name("Clean Air Act") == "Clean Air Act"


def test_clean_act_name_empty_and_whitespace() -> None:
    assert clean_act_name("") == ""
    assert clean_act_name("   ") == ""


# --- normalize_phrase_key ---


def test_normalize_phrase_key_lowercases_and_drops_leading_the() -> None:
    assert normalize_phrase_key("The Clean Air Act") == "clean air act"


def test_normalize_phrase_key_collapses_whitespace_and_strips_punct() -> None:
    assert normalize_phrase_key("Clean   Air  Act.") == "clean air act"


def test_normalize_phrase_key_equivalence_class() -> None:
    variants = ["the Clean Air Act", "Clean Air Act ", "The   Clean Air Act."]
    keys = {normalize_phrase_key(v) for v in variants}
    assert keys == {"clean air act"}


# --- usc_section_base ---


def test_usc_section_base_drops_subsection() -> None:
    assert usc_section_base("7412(b)(7)") == "7412"


def test_usc_section_base_passes_plain_section() -> None:
    assert usc_section_base("7401") == "7401"


def test_usc_section_base_trims() -> None:
    assert usc_section_base("  7401  ") == "7401"


# --- context ---


def test_context_window_size_in_interior() -> None:
    text = "x" * 400
    window = context(text, 150, 160)
    # CONTEXT_CHARS on each side plus the span itself.
    assert len(window) == 2 * CONTEXT_CHARS + (160 - 150)


def test_context_clamps_at_start() -> None:
    text = "abcdefghij" * 30
    window = context(text, 0, 3)
    assert window.startswith("abc")
    assert len(window) == 3 + CONTEXT_CHARS


def test_context_clamps_at_end() -> None:
    text = "abcdefghij" * 30  # 300 chars
    window = context(text, 295, 300)
    assert window.endswith(text[-1])
    assert len(window) == CONTEXT_CHARS + (300 - 295)


# --- is_valid_law_span ---


def test_is_valid_law_span_accepts_real_acts() -> None:
    assert is_valid_law_span("Clean Air Act") is True
    assert is_valid_law_span("National Environmental Policy Act") is True


def test_is_valid_law_span_rejects_fp_prefix() -> None:
    assert is_valid_law_span("Section 5") is False
    assert is_valid_law_span("Article 3 of the treaty") is False


def test_is_valid_law_span_rejects_clause_fragment() -> None:
    assert is_valid_law_span("shall submit a report") is False


def test_is_valid_law_span_rejects_all_lowercase_no_content() -> None:
    assert is_valid_law_span("lowercase no content") is False


def test_is_valid_law_span_rejects_overlong() -> None:
    overlong = "Clean Air " * 20 + "Act"
    assert len(overlong) > 120
    assert is_valid_law_span(overlong) is False


def test_is_valid_law_span_rejects_single_token() -> None:
    assert is_valid_law_span("Act") is False


# --- raw regex sanity ---


def test_publaw_re_variants() -> None:
    for s in ("Public Law 117-58", "Pub. L. 117-58", "P.L. 117-58"):
        m = PUBLAW_RE.search(s)
        assert m is not None
        assert m.group("cong") == "117"
        assert m.group("num") == "58"


def test_usc_re_plain_and_et_seq() -> None:
    plain = USC_RE.search("42 U.S.C. 7401")
    assert plain is not None
    assert plain.group("title") == "42"
    assert plain.group("section") == "7401"
    assert not plain.group("et_seq")

    et = USC_RE.search("42 U.S.C. 7401 et seq.")
    assert et is not None
    assert et.group("et_seq") is not None


def test_eo_re_variants() -> None:
    for s in ("Executive Order 14008", "E.O. 14008", "EO 14008"):
        m = EO_RE.search(s)
        assert m is not None
        assert m.group("num") == "14008"
