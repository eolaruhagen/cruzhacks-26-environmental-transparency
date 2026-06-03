from __future__ import annotations

import re
from typing import Final

CONTEXT_CHARS: Final = 100

PUBLAW_RE: Final[re.Pattern[str]] = re.compile(
    r"""
    (?:Public\s+Law|Pub\.?\s*L\.?|P\.L\.)
    \s*
    (?:No\.?\s*)?
    (?P<cong>\d{2,3})-(?P<num>\d{1,4})
    \b
    """,
    re.VERBOSE | re.IGNORECASE,
)

USC_RE: Final[re.Pattern[str]] = re.compile(
    r"""
    (?P<title>\d{1,3})
    \s+
    U\.?S\.?C\.?
    \s*
    (?:§\s*)?
    (?P<section>\d[\w-]*(?:\([^)]+\))*)
    (?P<et_seq>\s*et\s+seq\.)?
    """,
    re.VERBOSE | re.IGNORECASE,
)

CFR_STANDARD_RE: Final[re.Pattern[str]] = re.compile(
    r"""
    (?P<title>\d{1,3})
    \s+
    C\.?F\.?R\.?
    \s*
    (?:§\s*)?
    (?P<part>[\d][\w.]*)
    \b
    """,
    re.VERBOSE | re.IGNORECASE,
)

CFR_INVERTED_RE: Final[re.Pattern[str]] = re.compile(
    r"""
    (?:part|section)
    \s+
    (?P<part>[\d][\w.]*)
    \s+of\s+title\s+
    (?P<title>\d{1,3})
    \s*,\s*
    Code\s+of\s+Federal\s+Regulations
    """,
    re.VERBOSE | re.IGNORECASE,
)

FEDREG_RE: Final[re.Pattern[str]] = re.compile(
    r"""
    (?P<vol>\d{2,3})
    \s+
    Fed\.?\s*Reg\.?
    \s*
    (?P<page>\d{4,6})
    \b
    """,
    re.VERBOSE | re.IGNORECASE,
)

EO_RE: Final[re.Pattern[str]] = re.compile(
    r"""
    (?:Executive\s+Order|E\.O\.|EO)
    \s*
    (?:No\.?\s*)?
    (?P<num>\d{4,5})
    \b
    """,
    re.VERBOSE | re.IGNORECASE,
)

STAT_RE: Final[re.Pattern[str]] = re.compile(
    r"""
    (?P<vol>\d{2,3})
    \s+
    Stat\.
    \s*
    (?P<page>\d{1,6})
    \b
    """,
    re.VERBOSE | re.IGNORECASE,
)

_ACT_NAME_PAT = r"""(?P<act_name>
        (?:
            [A-Z][A-Za-z0-9,'\-]*\s+
            | (?:and|of|for|the|to|on|in|at|by|or|with)\s+
        ){1,14}
        Act
        (?:\s+of\s+\d{4})?
    )"""

NAMED_ACT_WITH_PL_RE: Final[re.Pattern[str]] = re.compile(
    r"""
    (?:the\s+)?
    """
    + _ACT_NAME_PAT
    + r"""
    \s*
    \(
        (?:Public\s+Law|Pub\.?\s*L\.?|P\.L\.)
        \s*
        (?:No\.?\s*)?
        (?P<pl_cong>\d{2,3})-(?P<pl_num>\d{1,4})
        [^)]*?
    \)
    """,
    re.VERBOSE,
)

NAMED_ACT_RE: Final[re.Pattern[str]] = re.compile(
    r"""
    (?:the\s+)
    """
    + _ACT_NAME_PAT
    + r"""
    \b
    """,
    re.VERBOSE,
)

AMENDS_ACT_RE: Final[re.Pattern[str]] = re.compile(
    r"""
    (?:Amends|amends|amending|Amending)\s+
    (?:the\s+)?
    """
    + _ACT_NAME_PAT
    + r"""
    \b
    """,
    re.VERBOSE,
)

_TREATY_NAMES: Final[list[str]] = [
    "Paris Agreement",
    "Kyoto Protocol",
    "Stockholm Convention",
    "Rotterdam Convention",
    "Basel Convention",
    "Montreal Protocol",
    "Vienna Convention",
    "UNFCCC",
    "UN Framework Convention on Climate Change",
    "Convention on Biological Diversity",
    "Minamata Convention",
    "Convention on Long-Range Transboundary Air Pollution",
    "Protocol on Persistent Organic Pollutants",
    "Convention on Persistent Organic Pollutants",
    "POPs Convention",
    "LRTAP POPs Protocol",
    "OECD Chemicals Programme",
]

TREATY_RE: Final[re.Pattern[str]] = re.compile(
    r"(?:" + "|".join(re.escape(t) for t in _TREATY_NAMES) + r")",
    re.IGNORECASE,
)

FP_PREFIX_RE: Final[re.Pattern[str]] = re.compile(
    r"^(?:[Ss]ection|[Aa]rticle|[Pp]rotocol|[Ss]ubsection|[Cc]hapter|[Pp]aragraph)\s*\d",
    re.IGNORECASE,
)

CLAUSE_MARKERS_RE: Final[re.Pattern[str]] = re.compile(
    r"\b(shall|require|submit|notify|publish|devise|report|satisfy|resume|enact|authorize|eliminate|direct|amend)\b",
    re.IGNORECASE,
)

TERMINAL_RE: Final[re.Pattern[str]] = re.compile(
    r"\b(Act|Law|Code|Treaty|Convention|Compact|Agreement|Program)\b",
    re.IGNORECASE,
)

ENV_ACRONYMS: Final[dict[str, str]] = {
    "TSCA": "Toxic Substances Control Act",
    "CAA": "Clean Air Act",
    "CWA": "Clean Water Act",
    "SDWA": "Safe Drinking Water Act",
    "ESA": "Endangered Species Act",
    "MMPA": "Marine Mammal Protection Act",
    "NMSA": "National Marine Sanctuaries Act",
    "EPCRA": "Emergency Planning and Community Right-To-Know Act of 1986",
    "ANILCA": "Alaska National Interest Lands Conservation Act",
    "FLPMA": "Federal Land Policy and Management Act",
    "MUSYA": "Multiple-Use Sustained-Yield Act",
    "OPA": "Oil Pollution Act of 1990",
    "PURPA": "Public Utility Regulatory Policies Act of 1978",
    "FWPCA": "Clean Water Act",
    "IIJA": "Infrastructure Investment and Jobs Act",
    "IRA": "Inflation Reduction Act of 2022",
    "BIL": "Infrastructure Investment and Jobs Act",
}

_LEADING_CONNECTORS_RE: Final[re.Pattern[str]] = re.compile(
    r"^(?:and|of|for|the|to|on|in|at|by|or|with)\s+",
    re.IGNORECASE,
)

_TRAILING_PUNCT_RE: Final[re.Pattern[str]] = re.compile(r"[\s.,;:!?]+$")
_WHITESPACE_RE: Final[re.Pattern[str]] = re.compile(r"\s+")
_USC_SUBSECTION_RE: Final[re.Pattern[str]] = re.compile(r"\(.*$")


def clean_act_name(raw: str) -> str:
    """Display form of a matched act name: collapse internal whitespace
    (bill text hard-wraps act names across lines, leaking \\n/\\t into the
    stored name), strip leading connectors, strip trailing punctuation.
    Case is preserved — this is the human-facing name, not the grouping key."""
    name = _WHITESPACE_RE.sub(" ", raw).strip()
    while True:
        cleaned = _LEADING_CONNECTORS_RE.sub("", name).strip()
        if cleaned == name:
            break
        name = cleaned
    return _TRAILING_PUNCT_RE.sub("", name).strip()


def normalize_phrase_key(name: str) -> str:
    """Lowercase, trim, drop leading connectors (incl. 'the'), collapse whitespace, strip
    trailing punctuation. No alias collapse — that's Stage 2."""
    s = name.strip().lower()
    s = _LEADING_CONNECTORS_RE.sub("", s)
    s = _WHITESPACE_RE.sub(" ", s)
    s = _TRAILING_PUNCT_RE.sub("", s)
    return s.strip()


def context(text: str, start: int, end: int) -> str:
    lo = max(0, start - CONTEXT_CHARS)
    hi = min(len(text), end + CONTEXT_CHARS)
    return text[lo:hi]


def usc_section_base(section: str) -> str:
    """Drop parenthetical subsections so '7412(b)(7)' → '7412' for the
    normalized_key. The surface form stays in normalized.section."""
    return _USC_SUBSECTION_RE.sub("", section).strip()


def is_valid_law_span(text: str) -> bool:
    text = text.strip()
    if not text or len(text) > 120:
        return False
    if not re.match(r"^[A-Z]", text):
        return False
    tokens = text.split()
    if len(tokens) < 2:
        return False
    if not TERMINAL_RE.search(text):
        return False
    if FP_PREFIX_RE.match(text):
        return False
    if CLAUSE_MARKERS_RE.search(text):
        return False
    stop = {"the", "of", "and", "in", "for", "to", "with", "on", "at", "a", "an"}
    if not any(w[0].isupper() for w in tokens if w.lower() not in stop):
        return False
    return True
