from __future__ import annotations

from typing import Final

import spacy
from spacy.language import Language
from spacy.tokens import Doc

from extractor_types import (
    CharSpan,
    ExtractedReference,
    ReferenceKind,
)
from lib.patterns import (
    AMENDS_ACT_RE,
    CFR_INVERTED_RE,
    CFR_STANDARD_RE,
    CONTEXT_CHARS,
    EO_RE,
    ENV_ACRONYMS,
    FEDREG_RE,
    FP_PREFIX_RE,
    NAMED_ACT_RE,
    NAMED_ACT_WITH_PL_RE,
    PUBLAW_RE,
    STAT_RE,
    TREATY_RE,
    USC_RE,
    clean_act_name,
    context,
    is_valid_law_span,
    normalize_phrase_key,
    usc_section_base,
)

SPACY_TEXT_WINDOW: Final = 20_000
EO_FR_GLOSS_GAP_CHARS: Final = 60  # max gap to treat a Fed.Reg. as a parenthetical gloss on a nearby EO

_NLP: Language | None = None


def build_nlp() -> Language:
    nlp = spacy.load("en_core_web_sm", disable=["parser"])
    ruler = nlp.add_pipe(
        "entity_ruler", before="ner", config={"overwrite_ents": False}
    )

    patterns: list[dict[str, object]] = []

    for acronym in ENV_ACRONYMS:
        patterns.append(
            {"label": "LAW_ACRONYM", "pattern": [{"TEXT": acronym}]}
        )
        patterns.append(
            {
                "label": "LAW_ACRONYM",
                "pattern": [{"LOWER": acronym.lower()}],
            }
        )

    patterns.append(
        {
            "label": "LAW_CANDIDATE",
            "pattern": [
                {"LOWER": "the"},
                {"IS_UPPER": False, "IS_ALPHA": True, "OP": "+"},
                {"LOWER": {"IN": ["act", "law", "code", "treaty", "convention"]}},
            ],
        }
    )
    patterns.append(
        {
            "label": "LAW_CANDIDATE",
            "pattern": [
                {"LOWER": "the"},
                {"IS_UPPER": False, "IS_ALPHA": True, "OP": "+"},
                {"LOWER": {"IN": ["act", "law", "code", "treaty", "convention"]}},
                {"LOWER": "of"},
                {"IS_DIGIT": True},
            ],
        }
    )

    ruler.add_patterns(patterns)  # type: ignore[arg-type]
    return nlp


def get_nlp() -> Language:
    """Module-cached spaCy pipeline. Lazily built on first call."""
    global _NLP
    if _NLP is None:
        _NLP = build_nlp()
    return _NLP


def extract_public_laws(text: str) -> list[ExtractedReference]:
    results: list[ExtractedReference] = []
    for m in PUBLAW_RE.finditer(text):
        cong = m.group("cong")
        num = m.group("num")
        results.append(
            {
                "kind": "public_law",
                "raw": m.group(0),
                "normalized_key": f"pl:{cong}-{num}",
                "normalized": {"law_number": f"{cong}-{num}"},
                "context": context(text, m.start(), m.end()),
                "span_start": m.start(),
                "span_end": m.end(),
                "is_self_ref": False,
            }
        )
    return results


def extract_usc(text: str) -> list[ExtractedReference]:
    results: list[ExtractedReference] = []
    for m in USC_RE.finditer(text):
        title = int(m.group("title"))
        section = m.group("section")
        section_base = usc_section_base(section)
        kind: ReferenceKind = (
            "usc_et_seq" if m.group("et_seq") else "usc"
        )
        results.append(
            {
                "kind": kind,
                "raw": m.group(0),
                "normalized_key": f"usc:{title}:{section_base}",
                "normalized": {"title": title, "section": section},
                "context": context(text, m.start(), m.end()),
                "span_start": m.start(),
                "span_end": m.end(),
                "is_self_ref": False,
            }
        )
    return results


def extract_cfr(text: str) -> list[ExtractedReference]:
    results: list[ExtractedReference] = []
    seen_spans: set[int] = set()
    for m in CFR_STANDARD_RE.finditer(text):
        seen_spans.add(m.start())
        title = int(m.group("title"))
        part = m.group("part")
        results.append(
            {
                "kind": "cfr",
                "raw": m.group(0),
                "normalized_key": f"cfr:{title}:{part}",
                "normalized": {"title": title, "part": part},
                "context": context(text, m.start(), m.end()),
                "span_start": m.start(),
                "span_end": m.end(),
                "is_self_ref": False,
            }
        )
    for m in CFR_INVERTED_RE.finditer(text):
        if m.start() in seen_spans:
            continue
        title = int(m.group("title"))
        part = m.group("part")
        results.append(
            {
                "kind": "cfr",
                "raw": m.group(0),
                "normalized_key": f"cfr:{title}:{part}",
                "normalized": {"title": title, "part": part},
                "context": context(text, m.start(), m.end()),
                "span_start": m.start(),
                "span_end": m.end(),
                "is_self_ref": False,
            }
        )
    return results


def extract_fedreg(text: str) -> list[ExtractedReference]:
    results: list[ExtractedReference] = []
    for m in FEDREG_RE.finditer(text):
        vol = int(m.group("vol"))
        page = int(m.group("page"))
        results.append(
            {
                "kind": "fed_reg",
                "raw": m.group(0),
                "normalized_key": f"fr:{vol}:{page}",
                "normalized": {"volume": vol, "page": page},
                "context": context(text, m.start(), m.end()),
                "span_start": m.start(),
                "span_end": m.end(),
                "is_self_ref": False,
            }
        )
    return results


def extract_eo(text: str) -> list[ExtractedReference]:
    results: list[ExtractedReference] = []
    for m in EO_RE.finditer(text):
        num = int(m.group("num"))
        results.append(
            {
                "kind": "executive_order",
                "raw": m.group(0),
                "normalized_key": f"eo:{num}",
                "normalized": {"order_number": num},
                "context": context(text, m.start(), m.end()),
                "span_start": m.start(),
                "span_end": m.end(),
                "is_self_ref": False,
            }
        )
    return results


def extract_stat(text: str) -> list[ExtractedReference]:
    results: list[ExtractedReference] = []
    for m in STAT_RE.finditer(text):
        vol = int(m.group("vol"))
        page = int(m.group("page"))
        results.append(
            {
                "kind": "stat_at_large",
                "raw": m.group(0),
                "normalized_key": f"stat:{vol}:{page}",
                "normalized": {"volume": vol, "page": page},
                "context": context(text, m.start(), m.end()),
                "span_start": m.start(),
                "span_end": m.end(),
                "is_self_ref": False,
            }
        )
    return results


def extract_treaties(text: str) -> list[ExtractedReference]:
    results: list[ExtractedReference] = []
    seen: set[tuple[int, int]] = set()
    for m in TREATY_RE.finditer(text):
        key = (m.start(), m.end())
        if key in seen:
            continue
        seen.add(key)
        name = m.group(0)
        results.append(
            {
                "kind": "treaty",
                "raw": name,
                "normalized_key": f"treaty:{normalize_phrase_key(name)}",
                "normalized": {"name": name},
                "context": context(text, m.start(), m.end()),
                "span_start": m.start(),
                "span_end": m.end(),
                "is_self_ref": False,
            }
        )
    return results


def extract_named_acts(text: str) -> list[ExtractedReference]:
    """Three-pass named-act extraction: paired-with-PL, "the X Act",
    "Amends X Act". Inner passes skip spans already subsumed by an earlier
    pass.
    """
    candidates: list[ExtractedReference] = []

    for m in NAMED_ACT_WITH_PL_RE.finditer(text):
        raw_name = clean_act_name(m.group("act_name"))
        if not raw_name:
            continue
        law_number = f"{m.group('pl_cong')}-{m.group('pl_num')}"
        candidates.append(
            {
                "kind": "named_law",
                "raw": m.group(0),
                "normalized_key": f"named:{normalize_phrase_key(raw_name)}",
                "normalized": {"name": raw_name, "law_number": law_number},
                "context": context(text, m.start(), m.end()),
                "span_start": m.start(),
                "span_end": m.end(),
                "is_self_ref": False,
            }
        )

    paired_spans: set[CharSpan] = {
        (c["span_start"], c["span_end"])
        for c in candidates
        if c["span_start"] is not None and c["span_end"] is not None
    }

    for m in NAMED_ACT_RE.finditer(text):
        if any(s <= m.start() and m.end() <= e for s, e in paired_spans):
            continue
        raw_name = clean_act_name(m.group("act_name"))
        if not raw_name or raw_name.lower() in ("act", "the act", "this act"):
            continue
        candidates.append(
            {
                "kind": "named_law",
                "raw": m.group(0),
                "normalized_key": f"named:{normalize_phrase_key(raw_name)}",
                "normalized": {"name": raw_name, "law_number": None},
                "context": context(text, m.start(), m.end()),
                "span_start": m.start(),
                "span_end": m.end(),
                "is_self_ref": False,
            }
        )

    current_spans: set[CharSpan] = {
        (c["span_start"], c["span_end"])
        for c in candidates
        if c["span_start"] is not None and c["span_end"] is not None
    }

    for m in AMENDS_ACT_RE.finditer(text):
        if any(s <= m.start() and m.end() <= e for s, e in current_spans):
            continue
        raw_name = clean_act_name(m.group("act_name"))
        if not raw_name:
            continue
        candidates.append(
            {
                "kind": "named_law",
                "raw": m.group(0),
                "normalized_key": f"named:{normalize_phrase_key(raw_name)}",
                "normalized": {"name": raw_name, "law_number": None},
                "context": context(text, m.start(), m.end()),
                "span_start": m.start(),
                "span_end": m.end(),
                "is_self_ref": False,
            }
        )

    return candidates


def extract_spacy_named_laws(
    doc: Doc, text: str
) -> list[ExtractedReference]:
    results: list[ExtractedReference] = []
    seen: set[CharSpan] = set()
    for ent in doc.ents:
        if ent.label_ not in ("LAW", "LAW_CANDIDATE", "LAW_ACRONYM"):
            continue

        phrase = ent.text.strip()
        start = ent.start_char
        end = ent.end_char
        key: CharSpan = (start, end)
        if key in seen:
            continue

        if ent.label_ == "LAW_ACRONYM":
            seen.add(key)
            expanded = ENV_ACRONYMS.get(
                phrase, ENV_ACRONYMS.get(phrase.upper(), phrase)
            )
            results.append(
                {
                    "kind": "named_law",
                    "raw": phrase,
                    "normalized_key": f"named:{phrase.lower()}",
                    "normalized": {"name": expanded, "law_number": None},
                    "context": text[
                        max(0, start - CONTEXT_CHARS) : min(
                            len(text), end + CONTEXT_CHARS
                        )
                    ],
                    "span_start": start,
                    "span_end": end,
                    "is_self_ref": False,
                }
            )
            continue

        clean = clean_act_name(phrase)
        if not is_valid_law_span(clean):
            continue
        if FP_PREFIX_RE.match(clean):
            continue

        seen.add(key)
        results.append(
            {
                "kind": "named_law",
                "raw": phrase,
                "normalized_key": f"named:{normalize_phrase_key(clean)}",
                "normalized": {"name": clean, "law_number": None},
                "context": text[
                    max(0, start - CONTEXT_CHARS) : min(
                        len(text), end + CONTEXT_CHARS
                    )
                ],
                "span_start": start,
                "span_end": end,
                "is_self_ref": False,
            }
        )
    return results


def _spans_overlap(a: CharSpan, b: CharSpan) -> bool:
    return a[0] < b[1] and b[0] < a[1]


def _span_of(ref: ExtractedReference) -> CharSpan:
    s = ref["span_start"]
    e = ref["span_end"]
    if s is None or e is None:
        return (0, 0)
    return (s, e)


def resolve_overlaps(
    matches: list[ExtractedReference],
) -> list[ExtractedReference]:
    """Two-stage:
    1. EO + nested/adjacent Fed.Reg. → drop the Fed.Reg. (parenthetical gloss).
    2. Longest-span-wins for remaining overlaps.
    """
    if not matches:
        return matches

    matches_sorted = sorted(
        matches,
        key=lambda m: (_span_of(m)[0], -(_span_of(m)[1] - _span_of(m)[0])),
    )

    eo_matches = [m for m in matches_sorted if m["kind"] == "executive_order"]
    fr_matches = [m for m in matches_sorted if m["kind"] == "fed_reg"]
    nested_fr: set[int] = set()

    for eo in eo_matches:
        eo_span = _span_of(eo)
        for fr in fr_matches:
            fr_span = _span_of(fr)
            if _spans_overlap(eo_span, fr_span) or (
                eo_span[1] <= fr_span[0] <= eo_span[1] + EO_FR_GLOSS_GAP_CHARS
            ):
                nested_fr.add(id(fr))

    # Treaties beat overlapping named_law spans — the curated TREATY list is
    # always the more precise signal when both fire on the same text.
    treaty_spans = [
        _span_of(m) for m in matches_sorted if m["kind"] == "treaty"
    ]
    suppressed_named: set[int] = set()
    for m in matches_sorted:
        if m["kind"] != "named_law":
            continue
        m_span = _span_of(m)
        if any(_spans_overlap(m_span, t) for t in treaty_spans):
            suppressed_named.add(id(m))

    non_nested = [
        m
        for m in matches_sorted
        if id(m) not in nested_fr and id(m) not in suppressed_named
    ]

    result: list[ExtractedReference] = []
    for m in non_nested:
        m_span = _span_of(m)
        dominated = False
        for i, kept in enumerate(result):
            kept_span = _span_of(kept)
            if _spans_overlap(m_span, kept_span):
                if kept_span[0] <= m_span[0] and m_span[1] <= kept_span[1]:
                    dominated = True
                    break
                m_len = m_span[1] - m_span[0]
                kept_len = kept_span[1] - kept_span[0]
                if m_len <= kept_len:
                    dominated = True
                    break
                else:
                    result.pop(i)
                    break
        if not dominated:
            result.append(m)

    return result


def dedup_named_laws(
    matches: list[ExtractedReference],
) -> list[ExtractedReference]:
    """Same mention from regex + spaCy → keep one. Fingerprint: normalized_key
    + first 50 chars of context."""
    seen: set[str] = set()
    out: list[ExtractedReference] = []
    for m in matches:
        ctx = m["context"] or ""
        key = f"{m['normalized_key']}|{ctx[:50]}"
        if key in seen:
            continue
        seen.add(key)
        out.append(m)
    return out


def extract_references_from_text(
    text: str,
    legislation_number: str = "",
) -> list[ExtractedReference]:
    """Public entry. Runs all extractors, dedups overlaps, returns list.
    `legislation_number` accepted for API symmetry but unused in Stage 1."""
    del legislation_number  # Stage 2 will use this for self-ref detection.

    matches: list[ExtractedReference] = []
    matches.extend(extract_public_laws(text))
    matches.extend(extract_usc(text))
    matches.extend(extract_cfr(text))
    matches.extend(extract_fedreg(text))
    matches.extend(extract_eo(text))
    matches.extend(extract_stat(text))
    matches.extend(extract_treaties(text))

    named = extract_named_acts(text)

    nlp = get_nlp()
    # spaCy is run on the leading SPACY_TEXT_WINDOW chars only; regex extractors
    # still scan the full text. Trade-off: spaCy is the cost-dominant extractor
    # and the highest-signal named acts almost always appear in the bill's
    # first 20k chars (preamble, findings, definitions).
    doc = nlp(text[:SPACY_TEXT_WINDOW])
    named.extend(extract_spacy_named_laws(doc, text))
    named = dedup_named_laws(named)

    matches.extend(named)
    return resolve_overlaps(matches)
