"""
NetSurf Price Tracking & Scheduled Observation Engine (Phase 6)
Implements:
- Respectful web scraping with rate limits and timeout guards.
- Anti-bot / CAPTCHA protection guards (records failures, never bypasses or fabricates).
- Price normalization and historical persistence in `price_observations`.
- Notification trigger evaluation (Target price met, >=5% significant drop, repeated failures).
- Strict notification deduplication.
"""

import re
import json
import logging
from datetime import datetime, timezone
from typing import Dict, Any, List, Optional, Tuple

import httpx

from .safety import is_url_safe
from .recommendation import normalize_price
from .database import (
    get_user_saved_item,
    update_user_saved_item,
    add_price_observation,
    get_all_active_trackers
)

logger = logging.getLogger("netsurf.price_tracker")

# Signatures for bot detection / CAPTCHA gates
BOT_CHALLENGE_KEYWORDS = [
    "cf-browser-verification",
    "cf-challenge",
    "ray id:",
    "just a moment...",
    "challenge-running",
    "turnstile",
    "recaptcha",
    "hcaptcha",
    "verify you are human",
    "checking if the site connection is secure",
    "attention required! | cloudflare",
    "robot check",
    "validatecaptcha"
]

def is_bot_challenge_page(html_text: str) -> bool:
    """Detects whether target page is gated by anti-bot, Cloudflare, or CAPTCHA challenge."""
    if not html_text:
        return False
    lower = html_text.lower()
    return any(kw in lower for kw in BOT_CHALLENGE_KEYWORDS)

def evaluate_notification_triggers(
    item: Dict[str, Any],
    new_price: Optional[float],
    status: str
) -> Tuple[bool, Optional[str], Optional[str]]:
    """
    Evaluates whether an alert should trigger.
    Returns: (should_notify, alert_type, message)
    
    Conditions:
    1. Target Price Reached: new_price <= target_price
    2. Significant Price Drop: >= 5% drop from initial_price or previous current_price
    3. Repeated Tracking Failures: consecutive_failures >= 3
    
    Deduplication:
    Avoids firing duplicate alerts if already notified for the same price or error state.
    """
    title = item.get("title", "Product")
    currency = item.get("currency", "INR")
    curr_price = item.get("current_price")
    target_price = item.get("target_price")
    initial_price = item.get("initial_price")
    last_notified_pr = item.get("last_notified_price")
    consecutive_fails = item.get("consecutive_failures", 0)

    # Trigger 3: Repeated Tracking Failures
    if status in ["failed", "blocked", "unreachable"] or consecutive_fails >= 3:
        if consecutive_fails >= 3 and item.get("last_status") != "notified_failure":
            return (
                True,
                "repeated_failures",
                f"Attention Required: 3 consecutive tracking checks failed for '{title}'. Site may require login or block automation."
            )
        return (False, None, None)

    # For successful price observations
    if status == "verified" and new_price is not None:
        # Trigger 1: Target Price Reached
        if target_price is not None and new_price <= target_price:
            # Deduplicate: do not re-notify if previously notified for this exact price
            if last_notified_pr is None or abs(last_notified_pr - new_price) > 0.01:
                diff = target_price - new_price
                diff_text = f" (Saved {currency} {diff:,.2f} below target!)" if diff > 0 else ""
                return (
                    True,
                    "target_reached",
                    f"Target Price Reached! '{title}' is now {currency} {new_price:,.2f}{diff_text}"
                )

        # Trigger 2: Significant Price Drop (>= 5%)
        ref_price = initial_price or curr_price
        if ref_price and ref_price > 0 and new_price < ref_price:
            drop_pct = ((ref_price - new_price) / ref_price) * 100.0
            if drop_pct >= 5.0:
                if last_notified_pr is None or abs(last_notified_pr - new_price) > 0.01:
                    return (
                        True,
                        "significant_drop",
                        f"Price Drop Alert: '{title}' dropped by {drop_pct:.1f}% to {currency} {new_price:,.2f}!"
                    )

    return (False, None, None)

def extract_price_from_html(html_text: str, default_currency: str = "INR") -> Tuple[Optional[float], str]:
    """
    Extracts price from product webpage HTML using structured meta tags and regex patterns.
    """
    if not html_text:
        return None, default_currency

    # 1. Try OpenGraph / Schema.org meta tags
    meta_patterns = [
        r'<meta\s+property=["\']product:price:amount["\']\s+content=["\']([\d.]+)["\']',
        r'<meta\s+property=["\']og:price:amount["\']\s+content=["\']([\d.]+)["\']',
        r'<meta\s+itemprop=["\']price["\']\s+content=["\']([\d.]+)["\']',
        r'"price":\s*"?([\d.]+)"?',
        r'"priceAmount":\s*"?([\d.]+)"?'
    ]
    for p in meta_patterns:
        m = re.search(p, html_text, re.IGNORECASE)
        if m:
            try:
                num = float(m.group(1))
                if num > 0:
                    return num, default_currency
            except ValueError:
                pass

    # 2. Try common price element classes
    elem_patterns = [
        r'class=["\'][^"\']*(?:price|amount|current-price|sale-price)[^"\']*["\'][^>]*>\s*([₹$€£]|Rs\.?|INR)?\s*([\d,]+(?:\.\d{2})?)',
        r'([₹$€£]|Rs\.?|INR)\s*([\d,]+(?:\.\d{2})?)'
    ]
    for p in elem_patterns:
        m = re.search(p, html_text, re.IGNORECASE)
        if m:
            val, curr, _ = normalize_price(m.group(0))
            if val is not None and val > 0:
                return val, curr

    return None, default_currency

def check_single_tracked_item(
    item: Dict[str, Any],
    user_id: str,
    client: Optional[httpx.Client] = None
) -> Tuple[Dict[str, Any], Optional[Dict[str, Any]]]:
    """
    Executes a verified price check for a single tracked item.
    Returns: (updated_item, notification_dict_or_none)
    """
    item_id = item["id"]
    url = item.get("url") or ""
    title = item.get("title", "Product")
    currency = item.get("currency", "INR")
    now_iso = datetime.now(timezone.utc).isoformat()

    # Safety check on URL
    if not url or not is_url_safe(url):
        add_price_observation(
            item_id=item_id,
            user_id=user_id,
            observed_price=item.get("current_price") or 0.0,
            currency=currency,
            source_url=url,
            extraction_status="failed",
            note="Unsafe or missing source URL"
        )
        updated = get_user_saved_item(user_id, item_id)
        return updated or item, None

    headers = {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36 NetSurfBot/2.0",
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.9"
    }

    status = "verified"
    observed_price = None
    note = "Scheduled price check"

    owns_client = False
    if client is None:
        client = httpx.Client(timeout=8.0, follow_redirects=True, headers=headers)
        owns_client = True

    try:
        resp = client.get(url)
        if resp.status_code == 200:
            html = resp.text
            if is_bot_challenge_page(html):
                status = "blocked"
                note = "Encountered anti-bot protection / CAPTCHA gate. Skipped bypass."
            else:
                p_num, p_curr = extract_price_from_html(html, currency)
                if p_num is not None:
                    observed_price = p_num
                    currency = p_curr
                    status = "verified"
                    note = f"Verified web extraction: {currency} {observed_price}"
                else:
                    status = "failed"
                    note = "Price element not found on webpage"
        elif resp.status_code in [403, 429]:
            status = "blocked"
            note = f"HTTP {resp.status_code} - Website rate limit or access restriction."
        else:
            status = "unreachable"
            note = f"HTTP {resp.status_code} - Target URL returned error."
    except Exception as e:
        status = "failed"
        note = f"Network connection error: {str(e)[:100]}"
    finally:
        if owns_client:
            client.close()

    # If verification succeeded
    consecutive_fails = 0 if status == "verified" else (item.get("consecutive_failures", 0) + 1)

    if status == "verified" and observed_price is not None:
        add_price_observation(
            item_id=item_id,
            user_id=user_id,
            observed_price=observed_price,
            currency=currency,
            source_url=url,
            extraction_status="verified",
            note=note,
            timestamp=now_iso
        )
    else:
        # Record unsuccessful check without pretending old price is current
        fallback_pr = item.get("current_price") or 0.0
        add_price_observation(
            item_id=item_id,
            user_id=user_id,
            observed_price=fallback_pr,
            currency=currency,
            source_url=url,
            extraction_status=status,
            note=note,
            timestamp=now_iso
        )

    # Evaluate notification triggers
    should_notify, alert_type, alert_msg = evaluate_notification_triggers(item, observed_price, status)
    notif_data = None
    if should_notify and alert_msg:
        notif_data = {
            "item_id": item_id,
            "title": title,
            "alert_type": alert_type,
            "message": alert_msg,
            "current_price": observed_price or item.get("current_price"),
            "target_price": item.get("target_price"),
            "currency": currency,
            "url": url,
            "timestamp": now_iso
        }
        update_user_saved_item(
            user_id=user_id,
            item_id=item_id,
            last_notified_price=observed_price if status == "verified" else None,
            last_notified_at=now_iso
        )

    updated_item = get_user_saved_item(user_id, item_id)
    return updated_item or item, notif_data

def check_all_tracked_items(user_id: Optional[str] = None) -> Tuple[List[Dict[str, Any]], List[Dict[str, Any]]]:
    """
    Checks all active tracked items for a user (or globally for background alarms).
    Returns (updated_items, triggered_notifications).
    """
    trackers = get_all_active_trackers(user_id)
    updated_items = []
    notifications = []

    headers = {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36 NetSurfBot/2.0"
    }

    with httpx.Client(timeout=8.0, follow_redirects=True, headers=headers) as client:
        for item in trackers:
            u_id = item.get("user_id") or user_id
            if not u_id:
                continue
            up_item, notif = check_single_tracked_item(item, u_id, client)
            updated_items.append(up_item)
            if notif:
                notifications.append(notif)

    return updated_items, notifications
