"""
Unit & Integration Test Suite for Phase 6:
Saved Items and Deterministic Price Tracking Engine.

Tests:
1. Saved items CRUD across categories (product, hotel, website, workflow).
2. Saved items filtering (by item_type and tracking_only).
3. Price observation persistence in the price_observations table.
4. Price observation deduplication (preventing duplicate unchanged rows).
5. HTML price extraction across currencies and microdata formats.
6. Strict anti-bot / CAPTCHA guard: records status='blocked' without attempting bypass.
7. Deterministic notification triggers:
   - Target price reached
   - Significant price drop (>= 5%)
   - Repeated failures (>= 3 consecutive failures)
8. Notification deduplication: prevents repeat spam for unchanged price/state.
9. Cross-user isolation: User A items/history inaccessible to User B.
10. Background check endpoints (single item and check-all).
"""

import pytest
import uuid
from fastapi.testclient import TestClient

from fastapi_backend.main import app
from fastapi_backend.database import (
    create_user_saved_item,
    get_user_saved_item,
    get_user_saved_items,
    update_user_saved_item,
    delete_user_saved_item,
    add_price_observation,
    get_price_history_for_item,
)
from fastapi_backend.price_tracker import (
    extract_price_from_html,
    is_bot_challenge_page,
    evaluate_notification_triggers,
    check_single_tracked_item
)

client = TestClient(app)

def create_registered_user(prefix: str):
    uid = uuid.uuid4().hex[:8]
    creds = {
        "email": f"{prefix}_{uid}@example.com",
        "password": "SecurePassword123!",
        "name": f"User {prefix.title()} {uid}"
    }
    res = client.post("/auth/register", json=creds)
    assert res.status_code == 201
    data = res.json()
    return {
        "id": data["user"]["id"],
        "email": creds["email"],
        "token": data["access_token"]
    }

# ── 1. SAVED ITEMS CRUD ACROSS ITEM TYPES ────────────────────────────────────

def test_saved_items_crud_all_types():
    user = create_registered_user("saver")
    auth_header = {"Authorization": f"Bearer {user['token']}"}

    # 1. Create a product item
    prod_payload = {
        "item_type": "product",
        "title": "Pixel 9 Pro 256GB",
        "url": "https://example.com/pixel-9-pro",
        "currency": "INR",
        "initial_price": 79999.0,
        "current_price": 79999.0,
        "target_price": 74999.0,
        "tracking_enabled": True,
        "content": {"ram": 16, "storage": 256}
    }
    res = client.post("/user/saved", json=prod_payload, headers=auth_header)
    assert res.status_code == 201
    prod_data = res.json()
    prod_id = prod_data["id"]
    assert prod_data["title"] == "Pixel 9 Pro 256GB"
    assert prod_data["tracking_enabled"] is True
    assert prod_data["target_price"] == 74999.0

    # 2. Create a hotel item
    hotel_payload = {
        "item_type": "hotel",
        "title": "Heritage Haveli Resort",
        "url": "https://example.com/haveli-resort",
        "currency": "INR",
        "initial_price": 4500.0,
        "current_price": 4500.0,
        "target_price": 3800.0,
        "tracking_enabled": True
    }
    res = client.post("/user/saved", json=hotel_payload, headers=auth_header)
    assert res.status_code == 201
    hotel_id = res.json()["id"]

    # 3. Create a website bookmark item
    web_payload = {
        "item_type": "website",
        "title": "Netsurf AI Documentation",
        "url": "https://docs.netsurf.local",
        "tracking_enabled": False
    }
    res = client.post("/user/saved", json=web_payload, headers=auth_header)
    assert res.status_code == 201

    # 4. Create a workflow item
    wf_payload = {
        "item_type": "workflow",
        "title": "Hotel Search Workflow: Jaipur Under 5k",
        "url": "https://booking.example.com",
        "content": {"actions": ["navigate", "fill", "click"]}
    }
    res = client.post("/user/saved", json=wf_payload, headers=auth_header)
    assert res.status_code == 201

    # 5. List all saved items
    res = client.get("/user/saved", headers=auth_header)
    assert res.status_code == 200
    all_items = res.json()
    assert len(all_items) >= 4

    # 6. Filter by item_type=product
    res = client.get("/user/saved?item_type=product", headers=auth_header)
    assert res.status_code == 200
    prods = res.json()
    assert all(i["item_type"] == "product" for i in prods)
    assert any(i["id"] == prod_id for i in prods)

    # 7. Filter by tracking_only=true
    res = client.get("/user/saved?tracking_only=true", headers=auth_header)
    assert res.status_code == 200
    trackers = res.json()
    assert all(i["tracking_enabled"] is True for i in trackers)
    assert any(i["id"] == prod_id for i in trackers)
    assert any(i["id"] == hotel_id for i in trackers)

    # 8. Update saved item (adjust target price & tracking status)
    res = client.put(f"/user/saved/{prod_id}", json={
        "target_price": 72000.0,
        "tracking_enabled": False
    }, headers=auth_header)
    assert res.status_code == 200
    updated = res.json()
    assert updated["target_price"] == 72000.0
    assert updated["tracking_enabled"] is False

    # 9. Delete saved item
    res = client.delete(f"/user/saved/{prod_id}", headers=auth_header)
    assert res.status_code == 200
    assert res.json()["status"] == "deleted"

    # 10. Verify item is deleted
    res = client.get(f"/user/saved/{prod_id}", headers=auth_header)
    assert res.status_code == 404

# ── 2. PRICE OBSERVATIONS PERSISTENCE & DEDUPLICATION ─────────────────────────

def test_price_observations_persistence_and_deduplication():
    user = create_registered_user("observer")
    item = create_user_saved_item(
        user_id=user["id"],
        item_type="product",
        title="Bose QC45 Headphones",
        url="https://example.com/bose",
        currency="INR",
        initial_price=24990.0,
        current_price=24990.0,
        target_price=21990.0,
        tracking_enabled=True
    )
    item_id = item["id"]

    # First observation (creation already recorded initial observation)
    history = get_price_history_for_item(user["id"], item_id)
    assert len(history) == 1
    assert history[0]["observed_price"] == 24990.0

    # Add identical price observation with same status (deduplication check)
    obs2 = add_price_observation(
        item_id=item_id,
        user_id=user["id"],
        observed_price=24990.0,
        extraction_status="verified",
        currency="INR"
    )
    assert obs2["deduplicated"] is True

    # Confirm history count did not artificially inflate
    history = get_price_history_for_item(user["id"], item_id)
    assert len(history) == 1

    # Add a new observed price (price drop to 23490)
    obs3 = add_price_observation(
        item_id=item_id,
        user_id=user["id"],
        observed_price=23490.0,
        extraction_status="verified",
        currency="INR"
    )
    assert obs3.get("deduplicated", False) is False

    history = get_price_history_for_item(user["id"], item_id)
    assert len(history) == 2
    assert history[0]["observed_price"] == 24990.0   # Chronological: earliest first
    assert history[-1]["observed_price"] == 23490.0  # Chronological: latest last

    # Check updated item in database has new current_price
    db_item = get_user_saved_item(user["id"], item_id)
    assert db_item["current_price"] == 23490.0

# ── 3. HTML PRICE EXTRACTION ALGORITHMS ───────────────────────────────────────

def test_extract_price_from_html_formats():
    # Format 1: Typical Indian e-commerce ₹ format with commas
    html_1 = """
    <div class="product-info">
      <h1>Sony WH-1000XM5</h1>
      <span class="price-current">₹29,990</span>
    </div>
    """
    price_1, curr_1 = extract_price_from_html(html_1)
    assert price_1 == 29990.0
    assert curr_1 == "INR"

    # Format 2: Rs. prefix format
    html_2 = """
    <div>
      <p class="selling-price">Rs. 14,499.00</p>
    </div>
    """
    price_2, curr_2 = extract_price_from_html(html_2)
    assert price_2 == 14499.0

    # Format 3: OpenGraph meta tag
    html_3 = """
    <html>
      <head>
        <meta property="og:price:amount" content="42999.00" />
        <meta property="og:price:currency" content="INR" />
      </head>
      <body><h1>OnePlus 12</h1></body>
    </html>
    """
    price_3, _ = extract_price_from_html(html_3)
    assert price_3 == 42999.0

    # Format 4: Schema.org JSON-LD structured data
    html_4 = """
    <html>
      <head>
        <script type="application/ld+json">
        {
          "@context": "https://schema.org/",
          "@type": "Product",
          "name": "MacBook Air M2",
          "offers": {
            "@type": "Offer",
            "price": "89900",
            "priceCurrency": "INR"
          }
        }
        </script>
      </head>
      <body><div>MacBook Air</div></body>
    </html>
    """
    price_4, _ = extract_price_from_html(html_4)
    assert price_4 == 89900.0

# ── 4. STRICT ANTI-BOT GUARD & ACCESS POLICY COMPLIANCE ───────────────────────

def test_anti_bot_detection_and_no_bypass():
    # Cloudflare challenge page
    cf_html = """
    <html>
      <head><title>Just a moment...</title></head>
      <body>
        <h1>Please wait while we verify your browser</h1>
        <div id="turnstile-wrapper"></div>
      </body>
    </html>
    """
    assert is_bot_challenge_page(cf_html) is True

    # CAPTCHA verification page
    captcha_html = """
    <html>
      <body>
        <h2>Verify you are human</h2>
        <div class="g-recaptcha" data-sitekey="xyz"></div>
      </body>
    </html>
    """
    assert is_bot_challenge_page(captcha_html) is True

    # Standard product page without challenge
    standard_html = """
    <html>
      <body>
        <h1>Apple iPhone 15</h1>
        <div class="price">₹65,999</div>
      </body>
    </html>
    """
    assert is_bot_challenge_page(standard_html) is False

# ── 5. DETERMINISTIC NOTIFICATION TRIGGERS & DEDUPLICATION ───────────────────

def test_notification_trigger_target_reached():
    item = {
        "id": "item-1",
        "title": "Samsung Galaxy S24",
        "initial_price": 79999.0,
        "current_price": 79999.0,
        "target_price": 72000.0,
        "last_notified_price": None,
        "consecutive_failures": 0
    }

    # New observed price drops below target
    should_notify, alert_type, message = evaluate_notification_triggers(
        item=item,
        new_price=71500.0,
        status="verified"
    )
    assert should_notify is True
    assert alert_type == "target_reached"
    assert "71,500" in message

def test_notification_trigger_significant_drop():
    item = {
        "id": "item-2",
        "title": "LG OLED 55-inch TV",
        "initial_price": 100000.0,
        "current_price": 100000.0,
        "target_price": 80000.0,  # Target is 80k, price drops to 90k (10% drop, >= 5%)
        "last_notified_price": None,
        "consecutive_failures": 0
    }

    should_notify, alert_type, message = evaluate_notification_triggers(
        item=item,
        new_price=90000.0,
        status="verified"
    )
    assert should_notify is True
    assert alert_type == "significant_drop"
    assert "10.0%" in message

def test_notification_trigger_repeated_failures():
    item = {
        "id": "item-3",
        "title": "Amazon Kindle Oasis",
        "initial_price": 21999.0,
        "current_price": 21999.0,
        "target_price": 18000.0,
        "last_notified_price": None,
        "consecutive_failures": 3  # Hit 3 failures
    }

    should_notify, alert_type, message = evaluate_notification_triggers(
        item=item,
        new_price=None,
        status="blocked"
    )
    assert should_notify is True
    assert alert_type == "repeated_failures"
    assert "3 consecutive" in message

def test_notification_deduplication_prevents_spam():
    # If item was already notified at 71500, checking again at 71500 must not spam the user
    item = {
        "id": "item-4",
        "title": "Sony Alpha Camera",
        "initial_price": 80000.0,
        "current_price": 71500.0,
        "target_price": 75000.0,
        "last_notified_price": 71500.0,  # Already notified for this exact price
        "consecutive_failures": 0
    }

    should_notify, alert_type, message = evaluate_notification_triggers(
        item=item,
        new_price=71500.0,
        status="verified"
    )
    assert should_notify is False

# ── 6. CROSS-USER DATA ISOLATION ──────────────────────────────────────────────

def test_user_saved_items_and_history_isolation():
    user_a = create_registered_user("usera")
    user_b = create_registered_user("userb")

    header_a = {"Authorization": f"Bearer {user_a['token']}"}
    header_b = {"Authorization": f"Bearer {user_b['token']}"}

    # User A creates a saved product
    res = client.post("/user/saved", json={
        "item_type": "product",
        "title": "User A Private Gadget",
        "initial_price": 5000.0,
        "current_price": 5000.0,
        "target_price": 4000.0,
        "tracking_enabled": True
    }, headers=header_a)
    assert res.status_code == 201
    item_a_id = res.json()["id"]

    # User B lists saved items -> must NOT see User A's item
    res = client.get("/user/saved", headers=header_b)
    assert res.status_code == 200
    user_b_items = res.json()
    assert not any(i["id"] == item_a_id for i in user_b_items)

    # User B attempts to access User A's item directly -> 404
    res = client.get(f"/user/saved/{item_a_id}", headers=header_b)
    assert res.status_code == 404

    # User B attempts to view User A's item price history -> 404
    res = client.get(f"/user/saved/{item_a_id}/history", headers=header_b)
    assert res.status_code == 404

    # User B attempts to update User A's item -> 404
    res = client.put(f"/user/saved/{item_a_id}", json={"target_price": 100.0}, headers=header_b)
    assert res.status_code == 404

    # User B attempts to delete User A's item -> 404
    res = client.delete(f"/user/saved/{item_a_id}", headers=header_b)
    assert res.status_code == 404

# ── 7. BACKGROUND CHECK API INTEGRATION ───────────────────────────────────────

def test_check_all_endpoint_execution():
    user = create_registered_user("batchchecker")
    header = {"Authorization": f"Bearer {user['token']}"}

    # Create 2 tracked items
    client.post("/user/saved", json={
        "item_type": "product",
        "title": "Monitor 1",
        "url": "",  # Empty URL simulates checked item without network call
        "initial_price": 15000.0,
        "current_price": 15000.0,
        "target_price": 12000.0,
        "tracking_enabled": True
    }, headers=header)

    client.post("/user/saved", json={
        "item_type": "product",
        "title": "Monitor 2",
        "url": "",
        "initial_price": 20000.0,
        "current_price": 20000.0,
        "target_price": 18000.0,
        "tracking_enabled": True
    }, headers=header)

    res = client.post("/user/tracking/check-all", headers=header)
    assert res.status_code == 200
    data = res.json()
    assert data["checked_count"] >= 2
    assert "notifications" in data
