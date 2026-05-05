import sys
from pathlib import Path
from unittest.mock import MagicMock

# Allow tests to import scripts from eval/ directly
sys.path.insert(0, str(Path(__file__).parent.parent))

# Stub heavy ML dependencies so unit tests run without installing bert-score / pdfplumber
for _mod in ("bert_score", "pdfplumber"):
    if _mod not in sys.modules:
        sys.modules[_mod] = MagicMock()
