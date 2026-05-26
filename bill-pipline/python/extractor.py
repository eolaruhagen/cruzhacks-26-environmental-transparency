#!/usr/bin/env python3
from __future__ import annotations

import json
import sys
import traceback
from typing import cast

from extractor_types import InputRecord, OutputRecord
from lib.extract import extract_references_from_text, get_nlp


def _emit(record: OutputRecord) -> None:
    sys.stdout.write(json.dumps(record) + "\n")
    sys.stdout.flush()


def main() -> None:
    get_nlp()  # warm the model before reading stdin

    for line in sys.stdin:
        line = line.strip()
        if not line:
            continue

        bill_id: str | None = None
        try:
            payload = cast(InputRecord, json.loads(line))
            bill_id = payload["bill_id"]
            refs = extract_references_from_text(
                payload["text"],
                payload.get("legislation_number", ""),
            )
            _emit({"bill_id": bill_id, "references": refs, "error": None})
        except Exception:
            _emit(
                {
                    "bill_id": bill_id,
                    "references": [],
                    "error": traceback.format_exc(limit=3).strip(),
                }
            )


if __name__ == "__main__":
    main()
