from __future__ import annotations

import os
import sys

# Ensure the python/ package root is importable no matter where pytest is
# invoked from. The extractor uses bare imports (`from extractor_types import
# ...`, `from lib.extract import ...`) that resolve only when this dir is on
# sys.path. Inserting at position 0 also shadows any same-named modules.
_PYTHON_ROOT = os.path.dirname(os.path.abspath(__file__))
if _PYTHON_ROOT not in sys.path:
    sys.path.insert(0, _PYTHON_ROOT)
