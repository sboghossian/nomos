#!/usr/bin/env python3
"""
Eyecite bridge for Nomos.

Reads JSON requests from stdin (one per line), writes JSON responses to
stdout. Keeps a single Python process alive so we don't pay import cost
per call.

Request shape:
  { "id": "req-1", "text": "Brown v. Board, 347 U.S. 483 (1954)" }

Response shape:
  {
    "id": "req-1",
    "citations": [
      {
        "cite": "347 U.S. 483",
        "reporter": "U.S.",
        "volume": "347",
        "page": "483",
        "year": 1954,
        "case_name": "Brown v. Board",
        "type": "case_citation"
      }
    ]
  }

Exits on EOF. Errors return `{ "id": ..., "error": "..." }`.
"""
import json
import sys
from typing import Any, Dict, List

try:
    from eyecite import get_citations
    from eyecite.models import (
        FullCaseCitation,
        ShortCaseCitation,
        FullLawCitation,
        FullJournalCitation,
    )
except ImportError as e:
    sys.stderr.write("error: eyecite not installed: " + str(e) + "\n")
    sys.stderr.write("install with: pip3 install eyecite\n")
    sys.exit(1)


def _coerce(v: Any) -> Any:
    """Make eyecite values JSON-safe — methods get called, objects stringified."""
    if v is None:
        return None
    if callable(v):
        try:
            v = v()
        except Exception:
            return None
    if isinstance(v, (str, int, float, bool)):
        return v
    return str(v)


def serialize(c: Any) -> Dict[str, Any]:
    """Best-effort serialization of an eyecite citation."""
    cite = _coerce(getattr(c, "corrected_citation", None))
    if not cite:
        cite = _coerce(getattr(c, "matched_text", None))
    if not cite:
        cite = str(c)
    out: Dict[str, Any] = {
        "type": type(c).__name__,
        "cite": cite,
    }
    if isinstance(c, (FullCaseCitation, ShortCaseCitation)):
        meta = getattr(c, "metadata", None)
        if meta is not None:
            out["case_name"] = getattr(meta, "plaintiff", None) or getattr(meta, "defendant", None) or None
            year = getattr(meta, "year", None)
            out["year"] = int(year) if year and str(year).isdigit() else None
            out["court"] = getattr(meta, "court", None)
        groups = getattr(c, "groups", {}) or {}
        out["reporter"] = groups.get("reporter")
        out["volume"] = groups.get("volume")
        out["page"] = groups.get("page")
    elif isinstance(c, FullLawCitation):
        groups = getattr(c, "groups", {}) or {}
        out["reporter"] = groups.get("reporter")
        out["section"] = groups.get("section")
    elif isinstance(c, FullJournalCitation):
        groups = getattr(c, "groups", {}) or {}
        out["journal"] = groups.get("reporter")
    return {k: v for k, v in out.items() if v is not None}


def main() -> None:
    for line in sys.stdin:
        line = line.strip()
        if not line:
            continue
        try:
            req = json.loads(line)
            text = req.get("text", "")
            citations: List[Dict[str, Any]] = [serialize(c) for c in get_citations(text)]
            resp = {"id": req.get("id"), "citations": citations}
        except Exception as e:
            resp = {"id": req.get("id"), "error": f"{type(e).__name__}: {e}"}
        sys.stdout.write(json.dumps(resp) + "\n")
        sys.stdout.flush()


if __name__ == "__main__":
    main()
