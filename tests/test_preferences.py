"""
Automated Test Suite for Phase 3:
User Preferences and Personalized Browser Automation.

Tests:
1. Validated CRUD operations for User Preferences (GET, PUT, DELETE/reset).
2. Shopping preferences schema validation (min/max budget, brands, RAM, storage, categories, priorities).
3. Travel preferences schema validation (destinations, hotel budget, rating, amenities, guests, categories).
4. General preferences schema validation (websites, currency, language, search preferences).
5. Cross-User Data Isolation: Two different user accounts have distinct preferences; changes in one do not affect the other.
6. Personalization Engine Category Classification (Shopping, Travel, General).
7. Priority Override Rule: Explicit instruction constraints (e.g. "under ₹30,000") strictly override saved preferences (e.g. ₹25,000) for that task without mutating the profile.
8. Fallback to Saved Preferences: When instructions lack constraints, saved preferences are automatically injected.
9. End-to-End Personalized Planning via POST /agent/plan for isolated users.
"""

import pytest
import uuid
from fastapi.testclient import TestClient

from fastapi_backend.main import app
from fastapi_backend.personalizer import (
    classify_task_category,
    extract_explicit_criteria,
    merge_preferences_with_goal
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

# ── 1. CRUD & VALIDATION TESTS ──────────────────────────────────────────────

def test_preferences_default_retrieval():
    user = create_registered_user("default_pref")
    res = client.get("/user/preferences", headers={"Authorization": f"Bearer {user['token']}"})
    assert res.status_code == 200
    data = res.json()
    assert "shopping" in data
    assert "travel" in data
    assert "general" in data
    assert data["shopping"]["priorities"] == ["price", "performance", "battery", "camera", "rating"]
    assert data["general"]["default_currency"] == "INR"
    assert data["general"]["language"] == "English"

def test_preferences_crud_update_and_reset():
    user = create_registered_user("crud_pref")
    token = user["token"]

    update_payload = {
        "shopping": {
            "min_budget": 15000,
            "max_budget": 35000,
            "preferred_brands": ["Google", "Motorola"],
            "min_ram": 8,
            "min_storage": 128,
            "product_categories": ["Smartphones", "Audio"],
            "priorities": ["camera", "clean os", "battery"]
        },
        "travel": {
            "preferred_destinations": ["Manali", "Dharamsala"],
            "hotel_budget": 4500,
            "min_hotel_rating": 4.2,
            "amenities": ["WiFi", "Mountain View", "Heater"],
            "num_guests": 2,
            "preferred_hotel_categories": ["Boutique Resort", "Cottage"]
        },
        "general": {
            "preferred_websites": ["amazon.in", "croma.com", "booking.com"],
            "default_currency": "INR",
            "language": "English",
            "search_preferences": {"eco_friendly": True}
        }
    }

    # PUT
    put_res = client.put("/user/preferences", json=update_payload, headers={"Authorization": f"Bearer {token}"})
    assert put_res.status_code == 200
    updated = put_res.json()
    assert updated["shopping"]["max_budget"] == 35000
    assert updated["shopping"]["preferred_brands"] == ["Google", "Motorola"]
    assert updated["travel"]["preferred_destinations"] == ["Manali", "Dharamsala"]
    assert updated["travel"]["min_hotel_rating"] == 4.2
    assert updated["general"]["preferred_websites"] == ["amazon.in", "croma.com", "booking.com"]

    # GET
    get_res = client.get("/user/preferences", headers={"Authorization": f"Bearer {token}"})
    assert get_res.status_code == 200
    fetched = get_res.json()
    assert fetched["shopping"]["max_budget"] == 35000
    assert fetched["travel"]["hotel_budget"] == 4500

    # DELETE (Reset)
    del_res = client.delete("/user/preferences", headers={"Authorization": f"Bearer {token}"})
    assert del_res.status_code == 200
    reset_data = del_res.json()
    assert reset_data["shopping"]["max_budget"] is None
    assert reset_data["shopping"]["preferred_brands"] == []
    assert reset_data["travel"]["hotel_budget"] is None

# ── 2. MULTI-USER ISOLATION TESTS ──────────────────────────────────────────

def test_two_users_preference_isolation():
    """Verify that two users with different preferences have completely isolated records."""
    user_alice = create_registered_user("alice")
    user_bob = create_registered_user("bob")

    # Alice prefers Samsung phones under ₹25,000
    client.put(
        "/user/preferences",
        json={
            "shopping": {
                "max_budget": 25000,
                "preferred_brands": ["Samsung"],
                "min_ram": 6,
                "priorities": ["battery", "display"]
            },
            "travel": {
                "preferred_destinations": ["Goa"],
                "hotel_budget": 3000
            }
        },
        headers={"Authorization": f"Bearer {user_alice['token']}"}
    )

    # Bob prefers Apple & OnePlus devices under ₹70,000
    client.put(
        "/user/preferences",
        json={
            "shopping": {
                "max_budget": 70000,
                "preferred_brands": ["Apple", "OnePlus"],
                "min_ram": 12,
                "priorities": ["camera", "performance"]
            },
            "travel": {
                "preferred_destinations": ["Shimla"],
                "hotel_budget": 8000
            }
        },
        headers={"Authorization": f"Bearer {user_bob['token']}"}
    )

    # Verify Alice's preferences
    alice_data = client.get("/user/preferences", headers={"Authorization": f"Bearer {user_alice['token']}"}).json()
    assert alice_data["shopping"]["max_budget"] == 25000
    assert alice_data["shopping"]["preferred_brands"] == ["Samsung"]
    assert alice_data["travel"]["preferred_destinations"] == ["Goa"]

    # Verify Bob's preferences
    bob_data = client.get("/user/preferences", headers={"Authorization": f"Bearer {user_bob['token']}"}).json()
    assert bob_data["shopping"]["max_budget"] == 70000
    assert bob_data["shopping"]["preferred_brands"] == ["Apple", "OnePlus"]
    assert bob_data["travel"]["preferred_destinations"] == ["Shimla"]

# ── 3. PERSONALIZATION & PRIORITY OVERRIDE ENGINE TESTS ─────────────────────

def test_task_classification():
    assert classify_task_category("Find best phone under 20000") == "shopping"
    assert classify_task_category("Buy running shoes on Amazon") == "shopping"
    assert classify_task_category("Book hotel in Goa for 2 nights") == "travel"
    assert classify_task_category("Search flights to Mumbai") == "travel"
    assert classify_task_category("Summarize this news article") == "general"

def test_priority_override_rule_shopping():
    """
    CRITICAL REQUIREMENT:
    Saved budget: ₹25,000.
    Current instruction: 'Find phones under ₹30,000'.
    Use ₹30,000 for this task without changing the saved profile.
    """
    saved_prefs = {
        "shopping": {
            "max_budget": 25000,
            "preferred_brands": ["Samsung", "OnePlus"],
            "min_ram": 8,
            "min_storage": 128,
            "priorities": ["battery", "camera"]
        }
    }

    # Instruction with explicit budget override
    result = merge_preferences_with_goal("Find phones under ₹30,000", saved_prefs)

    assert result["category"] == "shopping"
    assert result["applied_preferences"]["budget"] == 30000.0
    assert "budget" in result["overrides"]
    assert result["overrides"]["budget"]["used"] == 30000.0
    assert result["overrides"]["budget"]["saved_preference"] == 25000
    # Brands and RAM were not explicitly mentioned in the prompt, so saved preferences are retained
    assert result["applied_preferences"]["brands"] == ["Samsung", "OnePlus"]
    assert result["applied_preferences"]["min_ram"] == 8

def test_fallback_to_saved_preferences_when_instruction_lacks_constraints():
    """When the instruction lacks a budget or brand, inject user's saved preferences."""
    saved_prefs = {
        "shopping": {
            "max_budget": 25000,
            "preferred_brands": ["Samsung"],
            "min_ram": 8,
            "priorities": ["battery"]
        }
    }

    result = merge_preferences_with_goal("Find best smartphones", saved_prefs)
    assert result["category"] == "shopping"
    assert result["applied_preferences"]["budget"] == 25000
    assert result["applied_preferences"]["brands"] == ["Samsung"]
    assert "under ₹25000" in result["effective_goal"]
    assert "Samsung" in result["effective_goal"]

def test_travel_priority_override():
    saved_prefs = {
        "travel": {
            "preferred_destinations": ["Goa"],
            "hotel_budget": 3000,
            "min_hotel_rating": 4.0,
            "num_guests": 2
        }
    }

    # User explicitly asks for Jaipur under ₹5000
    result = merge_preferences_with_goal("Find hotels in Jaipur under ₹5000", saved_prefs)
    assert result["category"] == "travel"
    assert result["applied_preferences"]["destination"] == "Jaipur"
    assert result["applied_preferences"]["budget"] == 5000.0
    # Overrides recorded
    assert result["overrides"]["destination"]["used"] == "Jaipur"
    assert result["overrides"]["budget"]["used"] == 5000.0
    # Non-overridden preferences (rating, guests) applied from saved profile
    assert result["applied_preferences"]["min_hotel_rating"] == 4.0
    assert result["applied_preferences"]["num_guests"] == 2

# ── 4. END-TO-END AGENT PLAN PERSONALIZATION ────────────────────────────────

def test_agent_plan_uses_user_preferences_end_to_end():
    user = create_registered_user("planner_pref")
    token = user["token"]

    # Save user preference for Samsung phones under ₹22,000
    client.put(
        "/user/preferences",
        json={
            "shopping": {
                "max_budget": 22000,
                "preferred_brands": ["Samsung"],
                "min_ram": 6
            }
        },
        headers={"Authorization": f"Bearer {token}"}
    )

    # 1. Ask planner without explicit constraints -> should inject saved preferences
    plan_res = client.post(
        "/agent/plan",
        json={"goal": "Find best smartphones"},
        headers={"Authorization": f"Bearer {token}"}
    )
    assert plan_res.status_code == 200
    plan = plan_res.json()
    assert plan["goal"] == "Find best smartphones"
    # Action 1 Google search query should include Samsung and under 22000
    nav_action = next(a for a in plan["actions"] if a["action"] == "navigate")
    assert "samsung" in nav_action["params"]["url"].lower() or "22000" in nav_action["params"]["url"]

    # 2. Ask planner WITH explicit override -> should use ₹35,000 instead
    override_res = client.post(
        "/agent/plan",
        json={"goal": "Find phones under ₹35,000"},
        headers={"Authorization": f"Bearer {token}"}
    )
    assert override_res.status_code == 200
    override_plan = override_res.json()
    override_nav = next(a for a in override_plan["actions"] if a["action"] == "navigate")
    assert "35000" in override_nav["params"]["url"]
    assert "22000" not in override_nav["params"]["url"]
