from __future__ import annotations

import json
import os
import subprocess
import sys
from typing import Any

import pytest

PY_BIN = sys.executable
PYTHON_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


def _run(stdin: str, timeout: int = 180) -> subprocess.CompletedProcess[str]:
    return subprocess.run(
        [PY_BIN, "extractor.py"],
        input=stdin,
        capture_output=True,
        text=True,
        cwd=PYTHON_ROOT,
        timeout=timeout,
    )


def _parsed_lines(stdout: str) -> list[dict[str, Any]]:
    return [json.loads(line) for line in stdout.splitlines() if line.strip()]


# spaCy load is the cost-dominant step, so drive every case through one
# subprocess invocation and assert across the collected output lines.
_INPUT_LINES = [
    json.dumps(
        {
            "bill_id": "b1",
            "legislation_number": "H.R. 1",
            "source": "bill_text",
            "text": "Amends the Clean Air Act (42 U.S.C. 7401 et seq.) to add rules.",
        }
    ),
    "",  # blank line -> skipped, no output
    "this is not valid json {",  # malformed -> top-level except, bill_id None
    json.dumps({"bill_id": "b3", "source": "bill_text"}),  # missing text
    "   ",  # whitespace-only -> skipped
    json.dumps(
        {
            "bill_id": "b5",
            "legislation_number": "S. 2",
            "source": "summary",
            "text": "References Public Law 117-58 in the summary.",
        }
    ),
]


@pytest.fixture(scope="module")
def ipc_output() -> list[dict[str, Any]]:
    stdin = "\n".join(_INPUT_LINES) + "\n"
    proc = _run(stdin)
    assert proc.returncode == 0, f"nonzero exit; stderr={proc.stderr!r}"
    return _parsed_lines(proc.stdout)


def test_blank_lines_skipped_so_line_count_matches_nonblank_input(
    ipc_output: list[dict[str, Any]],
) -> None:
    # 6 input lines, 2 of which are blank/whitespace -> 4 output lines.
    assert len(ipc_output) == 4


def test_order_preserved_and_bill_ids_match(
    ipc_output: list[dict[str, Any]],
) -> None:
    assert [o["bill_id"] for o in ipc_output] == ["b1", None, "b3", "b5"]


def test_well_formed_line_produces_references(
    ipc_output: list[dict[str, Any]],
) -> None:
    first = ipc_output[0]
    assert first["bill_id"] == "b1"
    assert first["error"] is None
    assert len(first["references"]) > 0


def test_well_formed_record_has_exact_reference_shape(
    ipc_output: list[dict[str, Any]],
) -> None:
    expected_keys = {
        "kind",
        "raw",
        "normalized_key",
        "normalized",
        "context",
        "span_start",
        "span_end",
        "is_self_ref",
    }
    for ref in ipc_output[0]["references"]:
        assert set(ref.keys()) == expected_keys
        assert ref["is_self_ref"] is False


def test_malformed_json_line_errors_with_null_bill_id(
    ipc_output: list[dict[str, Any]],
) -> None:
    malformed = ipc_output[1]
    assert malformed["bill_id"] is None
    assert malformed["error"] is not None
    assert malformed["references"] == []


def test_missing_text_errors_but_recovers_bill_id(
    ipc_output: list[dict[str, Any]],
) -> None:
    missing_text = ipc_output[2]
    assert missing_text["bill_id"] == "b3"
    assert missing_text["error"] is not None
    assert missing_text["references"] == []


def test_second_well_formed_line(ipc_output: list[dict[str, Any]]) -> None:
    last = ipc_output[3]
    assert last["bill_id"] == "b5"
    assert last["error"] is None
    pairs = {(r["kind"], r["normalized_key"]) for r in last["references"]}
    assert ("public_law", "pl:117-58") in pairs


