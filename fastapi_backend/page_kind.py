"""Tell an *item* apart from a *page about items* (thread, listicle, guide, review roundup).

Domain-neutral on purpose: no product, brand or site vocabulary. It uses only how such pages are
phrased and whether the record's own numbers are plausible for the user's stated budget.
"""
from __future__ import annotations

import re
from typing import Any, Dict, Optional

# Phrasing typical of pages that talk ABOUT a set of options rather than being one option.
_ABOUT_PATTERNS = [
    r"\?",                                                   # questions / forum threads
    r"^\s*(?:which|what|how|why|should|is|are|can|any)\b",   # question openers
    r"\b(?:best|top|cheapest|latest|greatest)\b.*\b(?:under|below|within|between|for|in|of|to buy)\b",
    r"\b(?:best|top)\s+\d+\b|\b\d+\s+(?:best|top)\b",        # "top 10", "7 best"
    r"\bbetween\b.*\b(?:and|to)\b",                          # "between 25000 to 30000"
    r"\b(?:vs\.?|versus|comparison|compared|alternatives?|roundup|buying guide|guide|list of|recommendations?)\b",
    r"\b(?:reviews?|ranking|ranked)\b\s*(?:\(|:|-|\d{4}|$)",
    r"\b(?:20\d{2})\)?\s*$",                                 # title ends with a year/date stamp
]
_ABOUT_RE = [re.compile(p, re.I) for p in _ABOUT_PATTERNS]
_FIRST_PERSON_RE = re.compile(r"^\s*(?:i|we|my|hey|hi)\b", re.I)


def looks_like_page_about_items(rec: Dict[str, Any], budget_max: Optional[float] = None) -> bool:
    """True when a record is more plausibly a page about options than an option itself."""
    kind = rec.get("record_kind")
    if kind == "search_result":
        return True
    if kind == "answer_item":
        return False
    title = str(rec.get("title") or rec.get("name") or "")
    snippet = str(rec.get("snippet") or "")
    hits = sum(1 for r in _ABOUT_RE if r.search(title))
    if _FIRST_PERSON_RE.search(snippet):
        hits += 1
    # A price that is a rounding error next to the stated budget is a misread number, not a price.
    price = rec.get("numeric_price")
    if budget_max and isinstance(price, (int, float)) and 0 < price < budget_max * 0.01:
        hits += 1
    return hits >= 1 and not _has_item_evidence(rec)


def _has_item_evidence(rec: Dict[str, Any]) -> bool:
    """Concrete, item-level attributes extracted from a real listing (not a page-level snippet)."""
    if rec.get("record_kind") in ("listing", "answer_item"):
        return True
    return any(rec.get(k) for k in ("ram", "storage", "processor", "flight_code", "departure_time",
                                    "cinema", "showtime", "company", "amenities"))
