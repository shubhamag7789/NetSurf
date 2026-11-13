"""Turn the agent's synthesized answer into structured, rankable items.

Search-result pages describe *where* to find things (articles, forum threads, listicles); the items the
user actually asked for (products, hotels, jobs, books ...) are named in the answer the agent composes
from them. This module parses that answer generically - markdown tables and "N. Name" lists with
"Label: value" bullets - with no per-domain vocabulary. Every field comes from the answer text; nothing
is invented, and rows without a name are dropped.
"""
from __future__ import annotations

import re
from typing import Any, Dict, List, Optional

_LINK_RE = re.compile(r"\[([^\]]*)\]\((https?://[^)\s]+)\)")
_URL_RE = re.compile(r"https?://[^\s)>\]]+")
_PRICE_RE = re.compile(r"(?:₹|Rs\.?|INR|USD|\$|€|£)\s*[\d,]+(?:\.\d+)?(?:\s*(?:k|K|lakh|lac|cr)\b)?")
_RATING_RE = re.compile(r"(\d(?:\.\d+)?)")
_PRICE_WORDS = ("price", "cost", "fare", "salary", "rate", "amount")
_RATING_WORDS = ("rating", "score", "stars", "review")
_DATE_WORDS = ("date", "published", "posted", "when")
_LINK_WORDS = ("link", "url", "source", "where", "platform", "store", "buy")
_NAME_WORDS = ("name", "model", "product", "title", "item", "option", "hotel", "job", "role", "book", "flight")

_COL_ROLES = (
    ("name", _NAME_WORDS),
    ("price", _PRICE_WORDS),
    ("rating", _RATING_WORDS),
    ("link", _LINK_WORDS),
    ("date", _DATE_WORDS),
)


def _strip_md(text: str) -> str:
    text = _LINK_RE.sub(lambda m: m.group(1), text or "")
    return re.sub(r"[*_`#]+", "", text).strip()


def _first_link(text: str) -> Optional[str]:
    m = _LINK_RE.search(text or "")
    if m:
        return m.group(2)
    m = _URL_RE.search(text or "")
    return m.group(0).rstrip(".,;") if m else None


def _domain(url: Optional[str]) -> str:
    m = re.match(r"https?://(?:www\.)?([^/:]+)", url or "")
    return m.group(1) if m else ""


def _num_price(raw: str) -> Optional[float]:
    m = _PRICE_RE.search(raw or "")
    s = m.group(0) if m else (raw or "")
    digits = re.search(r"[\d,]+(?:\.\d+)?", s)
    if not digits:
        return None
    try:
        val = float(digits.group(0).replace(",", ""))
    except ValueError:
        return None
    suffix = s[digits.end():].strip().lower()
    return val * {"k": 1e3, "lakh": 1e5, "lac": 1e5, "cr": 1e7}.get(suffix, 1)


def _record(name: str, price: str, rating: str, link: Optional[str], snippet: str, date: str = "") -> Optional[Dict[str, Any]]:
    name = _strip_md(name)
    name = re.sub(r"^\d+[.)]\s*", "", name).strip()
    if len(name) < 3 or name.lower() in ("n/a", "name", "model", "product"):
        return None
    price_clean = _strip_md(price)
    pm = _PRICE_RE.search(price_clean)
    rating_val = None
    rm = _RATING_RE.search(_strip_md(rating)) if rating else None
    if rm:
        v = float(rm.group(1))
        rating_val = v if 0 < v <= 5 else None
    return {
        "title": name,
        "name": name,
        "price": pm.group(0).strip() if pm else (price_clean if re.search(r"\d", price_clean) else ""),
        "numeric_price": _num_price(price_clean),
        "rating": rating_val,
        "snippet": _strip_md(snippet)[:320],
        "link": link or "",
        "product_url": link or "",
        "source_url": link or "",
        "source_website": _domain(link),
        "published_at": date.strip() or None,
        "record_kind": "answer_item",
        "evidence": {"origin": "agent_answer"},
        "sponsored_status": False,
    }


def _role(header: str) -> Optional[str]:
    h = header.lower()
    for role, keys in _COL_ROLES:
        if any(k in h for k in keys):
            return role
    return None


def _is_separator(line: str) -> bool:
    core = line.replace("|", "").replace(":", "").replace("-", "").strip()
    return "-" in line and "|" in line and core == ""


def _parse_tables(lines: List[str]) -> List[Dict[str, Any]]:
    out: List[Dict[str, Any]] = []
    i = 0
    while i < len(lines) - 1:
        if "|" in lines[i] and _is_separator(lines[i + 1]):
            headers = [c.strip() for c in lines[i].strip().strip("|").split("|")]
            roles: Dict[str, int] = {}
            for idx, h in enumerate(headers):
                r = _role(h)
                if r and r not in roles:
                    roles[r] = idx
            j = i + 2
            while j < len(lines) and "|" in lines[j]:
                cells = [c.strip() for c in lines[j].strip().strip("|").split("|")]
                j += 1

                def get(role: str) -> str:
                    return cells[roles[role]] if role in roles and roles[role] < len(cells) else ""

                name = get("name") or (cells[0] if cells else "")
                row_text = " ".join(cells)
                link = _first_link(get("link")) or _first_link(row_text)
                pm = _PRICE_RE.search(row_text)
                price = get("price") or (pm.group(0) if pm else "")
                used = {roles[r] for r in ("name", "price", "rating", "link", "date") if r in roles}
                extra = "; ".join(_strip_md(c) for k, c in enumerate(cells) if k not in used and c.strip())
                rec = _record(name, price, get("rating"), link, extra, get("date"))
                if rec:
                    out.append(rec)
            i = j
        else:
            i += 1
    return out


_HEAD_RE = re.compile(r"^\s*(?:#{1,6}\s*)?(?:\*\*)?\d+[.)]\s+(.+?)(?:\*\*)?\s*$")
_FIELD_RE = re.compile(r"^\s*[-*•+✦]?\s*\**([A-Za-z][A-Za-z &/()]{1,40}?)\**\s*:\s*\**\s*(.+)$")


def _parse_numbered_lists(lines: List[str]) -> List[Dict[str, Any]]:
    """'1. Name' (optionally heading/bold) followed by 'Label: value' bullets."""
    out: List[Dict[str, Any]] = []
    cur: Optional[Dict[str, Any]] = None

    def flush() -> None:
        nonlocal cur
        if cur:
            fields = [(k.lower(), v) for k, v in cur["fields"]]

            def pick(words) -> str:
                return next((v for k, v in fields if any(w in k for w in words)), "")

            price, rating, date = pick(_PRICE_WORDS), pick(_RATING_WORDS), pick(_DATE_WORDS)
            link = _first_link(cur["body"])
            skip = _PRICE_WORDS + _RATING_WORDS + _DATE_WORDS + _LINK_WORDS
            others = "; ".join(f"{k}: {_strip_md(v)}" for k, v in cur["fields"]
                               if not any(w in k.lower() for w in skip))
            # Only an item when it carries concrete attributes (not a numbered step/instruction)
            if price or rating or link or len(cur["fields"]) >= 2:
                rec = _record(cur["name"], price, rating, link, others, date)
                if rec:
                    out.append(rec)
        cur = None

    for ln in lines:
        m = _HEAD_RE.match(ln)
        if m:
            flush()
            cur = {"name": m.group(1), "fields": [], "body": ""}
            continue
        if cur is not None:
            cur["body"] += ln + "\n"
            fm = _FIELD_RE.match(ln)
            if fm:
                cur["fields"].append((fm.group(1).strip(), fm.group(2).strip()))
    flush()
    return out


def parse_answer_items(answer_text: str, limit: int = 30) -> List[Dict[str, Any]]:
    """Return de-duplicated structured items found in the answer (tables first, then numbered lists)."""
    if not answer_text or not isinstance(answer_text, str):
        return []
    lines = answer_text.replace("\r\n", "\n").split("\n")
    found = _parse_tables(lines) + _parse_numbered_lists(lines)
    seen: Dict[str, Dict[str, Any]] = {}
    for rec in found:
        key = re.sub(r"[^a-z0-9]", "", re.sub(r"\(.*?\)", "", rec["name"].lower()))
        if not key:
            continue
        if key in seen:  # merge a table row with the detailed entry for the same item
            base = seen[key]
            for f in ("price", "numeric_price", "rating", "link", "product_url", "source_url", "source_website", "snippet"):
                if not base.get(f) and rec.get(f):
                    base[f] = rec[f]
            if len(rec["name"]) > len(base["name"]):
                base["name"] = base["title"] = rec["name"]
            continue
        seen[key] = rec
    return list(seen.values())[:limit]
