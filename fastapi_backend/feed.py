"""Chronological feed handling (news, posts, articles, release notes ...).

Feeds are ordered strictly newest-first by their *published* time. This is deliberately
separate from recommendation ranking (recommendation.py): a feed has no "best" item, only
a recency order, and recommendation scoring must never reorder it (nor vice versa).
"""
from __future__ import annotations

import re
from datetime import datetime, timedelta, timezone
from email.utils import parsedate_to_datetime
from typing import Any, Dict, List, Optional

from .recommendation import deduplicate_items, clean_source_url

FEED_CATEGORIES = {"news", "feed", "article", "articles", "post", "posts", "blog", "updates", "headlines"}
_FEED_INTENT_RE = re.compile(
    r"\b(latest|newest|most recent|recent|breaking|today'?s|this week'?s)\b.*\b(news|headlines?|articles?|posts?|updates?|stories|announcements?|releases?)\b"
    r"|\b(news|headlines?|updates?)\b.*\b(latest|newest|most recent|recent|today)\b",
    re.I,
)
_REL_RE = re.compile(r"(\d+|an?|one)\s*(second|sec|minute|min|hour|hr|day|week|month|year)s?\s+ago", re.I)
_UNIT = {"second": 1, "sec": 1, "minute": 60, "min": 60, "hour": 3600, "hr": 3600,
         "day": 86400, "week": 604800, "month": 2592000, "year": 31536000}
_TS_KEYS = ("published_at", "published", "date", "datetime", "timestamp", "posted_at", "time")


def is_feed_request(category: Optional[str], goal: Optional[str]) -> bool:
    if (category or "").strip().lower() in FEED_CATEGORIES:
        return True
    return bool(goal and _FEED_INTENT_RE.search(goal))


def parse_timestamp(value: Any, now: Optional[datetime] = None) -> Optional[datetime]:
    """Parse ISO-8601, RFC-2822, epoch (s/ms) and relative ('3 hours ago') times to aware UTC."""
    if value is None or value == "":
        return None
    now = now or datetime.now(timezone.utc)
    if isinstance(value, (int, float)):
        v = float(value)
        v = v / 1000.0 if v > 1e11 else v
        try:
            return datetime.fromtimestamp(v, tz=timezone.utc)
        except (OverflowError, OSError, ValueError):
            return None
    text = str(value).strip()
    if not text:
        return None
    low = text.lower()
    if low in ("just now", "now"):
        return now
    if low == "yesterday":
        return now - timedelta(days=1)
    m = _REL_RE.search(low)
    if m:
        n = 1 if m.group(1) in ("a", "an", "one") else int(m.group(1))
        return now - timedelta(seconds=n * _UNIT[m.group(2).lower()])
    if re.fullmatch(r"\d{9,13}", text):
        return parse_timestamp(int(text), now)
    try:
        dt = datetime.fromisoformat(text.replace("Z", "+00:00"))
        return dt if dt.tzinfo else dt.replace(tzinfo=timezone.utc)
    except ValueError:
        pass
    try:
        dt = parsedate_to_datetime(text)
        return dt if dt.tzinfo else dt.replace(tzinfo=timezone.utc)
    except (TypeError, ValueError):
        pass
    for fmt in ("%B %d, %Y", "%b %d, %Y", "%d %B %Y", "%d %b %Y", "%Y/%m/%d", "%d/%m/%Y"):
        try:
            return datetime.strptime(text, fmt).replace(tzinfo=timezone.utc)
        except ValueError:
            continue
    return None


def build_feed(items: List[Dict[str, Any]], limit: Optional[int] = None) -> Dict[str, Any]:
    """Dedupe, drop sponsored entries, and order newest-first. Undated items go last, in
    their original order (never given a fabricated date)."""
    now = datetime.now(timezone.utc)
    unique = deduplicate_items(items)
    organic = [i for i in unique if not (i.get("sponsored_status") or i.get("is_sponsored"))]
    dated, undated = [], []
    for idx, it in enumerate(organic):
        ts = next((parse_timestamp(it.get(k), now) for k in _TS_KEYS if it.get(k)), None)
        if ts and ts > now + timedelta(days=1):  # implausible future date -> treat as unknown
            ts = None
        domain, clean = clean_source_url(str(it.get("url") or it.get("link") or ""))
        rec = dict(it)
        # Fields the side-panel result cards expect
        rec.setdefault("name", str(it.get("title") or it.get("name") or "Untitled"))
        rec.setdefault("category", "feed")
        rec["product_url"] = clean or rec.get("product_url") or ""
        rec["source_domain"] = domain or rec.get("source_domain") or ""
        rec["passed_filters"] = True
        rec["sponsored_status"] = False
        rec["source_url"] = it.get("source_url") or clean or None
        rec["published_at"] = ts.isoformat() if ts else None
        (dated if ts else undated).append((ts, idx, rec))
    dated.sort(key=lambda t: (t[0], -t[1]), reverse=True)  # newest first, stable for ties
    ordered = [r for _, _, r in dated] + [r for _, _, r in undated]
    for n, r in enumerate(ordered, 1):
        r["rank"] = n
    if limit:
        ordered = ordered[:limit]
    return {
        "category": "feed",
        "order": "newest_first",
        "total_extracted": len(items),
        "unique_count": len(ordered),
        "sponsored_excluded": len(unique) - len(organic),
        "undated_count": len(undated),
        "ranked_items": ordered,
        "alternative_items": [],
        "disqualified_items": [],
        "top_pick": None,
        "summary": f"{len(ordered)} unique item(s), newest first"
                   + (f"; {len(undated)} without a publish date listed last" if undated else ""),
    }
