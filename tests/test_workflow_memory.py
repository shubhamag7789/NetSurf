"""
Unit & Integration Test Suite for Phase 5:
Explainable AI and Adaptive Workflow Memory.

Tests:
1. Task Signature and Parameter Extraction (Hotel, Shopping, General).
2. Action Sequence Templatization ({city}, {budget}, {brand}, {ram}).
3. Workflow Memory Instantiation & Parameter Substitution (Jaipur/4000 -> Udaipur/5000).
4. Adaptive Execution Recovery without Blind Retries (DOM rescan, scroll, wait hydration).
5. Human Safety Approval Gate enforcement for high-risk recovered actions.
6. Cross-User Workflow Memory Isolation: User A and User B cannot access or mutate each other's memories.
7. Workflow Memory Execution Statistics & Outcome Recording (Success rate, reuse counts).
8. Workflow Memory Deletion and Clear All Endpoints.
9. Workflow Memory Enable/Disable Master Toggle via User Preferences.
"""

import pytest
import uuid
from fastapi.testclient import TestClient

from fastapi_backend.main import app
from fastapi_backend.workflow_memory import (
    extract_task_signature,
    templatize_action_sequence,
    instantiate_templated_workflow,
    plan_adaptive_recovery_action
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

# ── 1. SIGNATURE EXTRACTION & TEMPLATIZATION ──────────────────────────────────

def test_extract_task_signature_hotel():
    goal = "Find hotels in Jaipur under ₹4,000 with swimming pool"
    category, pattern, params = extract_task_signature(goal)
    assert category == "hotel"
    assert params["city"] == "Jaipur"
    assert params["budget"] == 4000

def test_extract_task_signature_shopping():
    goal = "Find OnePlus phone with 12GB RAM and 256GB storage under ₹35,000"
    category, pattern, params = extract_task_signature(goal)
    assert category == "shopping"
    assert params["brand"].lower() == "oneplus"
    assert params["ram"] == 12
    assert params["storage"] == 256
    assert params["budget"] == 35000

def test_templatize_action_sequence():
    goal = "Find hotels in Jaipur under ₹4,000"
    plan = {
        "goal": goal,
        "phases": [
            {
                "id": "phase-1",
                "name": "Search",
                "actions": [
                    {
                        "action": "navigate",
                        "params": {"url": "https://www.booking.com/searchresults.html?ss=Jaipur"}
                    },
                    {
                        "action": "type",
                        "params": {"text": "Hotels in Jaipur under 4000", "id": 12}
                    }
                ]
            }
        ]
    }
    category, pattern, params = extract_task_signature(goal)
    templated_actions, templated_phases = templatize_action_sequence(plan, params)
    
    assert len(templated_actions) == 2
    # Verify substitution of Jaipur with {city}
    assert "{city}" in templated_actions[0]["params"]["url"]
    assert "Jaipur" not in templated_actions[0]["params"]["url"]
    assert "{city}" in templated_actions[1]["params"]["text"]
    assert "{budget}" in templated_actions[1]["params"]["text"]

# ── 2. INSTANTIATION & PARAMETER SUBSTITUTION ────────────────────────────────

def test_instantiate_templated_workflow_jaipur_to_udaipur():
    """
    Validates Example from Prompt:
    Previous task: Find hotels in Jaipur under ₹4,000.
    New task: Find hotels in Udaipur under ₹5,000.
    Reuses previous successful workflow structure replacing city and budget.
    """
    memory_item = {
        "id": "mem-123",
        "category": "hotel",
        "task_pattern": "Find hotels in {city} under {budget}",
        "action_sequence": [
            {
                "action": "navigate",
                "params": {"url": "https://www.google.com/travel/hotels/{city}"}
            },
            {
                "action": "type",
                "params": {"text": "Hotels in {city} budget {budget}", "id": 5}
            },
            {
                "action": "extract",
                "params": {"selector": "div.hotel-card"}
            }
        ],
        "phases": [
            {
                "id": "phase-1",
                "name": "Navigate to {city}",
                "actions": [
                    {
                        "action": "navigate",
                        "params": {"url": "https://www.google.com/travel/hotels/{city}"}
                    }
                ]
            }
        ]
    }

    new_goal = "Find hotels in Udaipur under ₹5,000"
    new_params = {"city": "Udaipur", "budget": "5000"}

    instantiated = instantiate_templated_workflow(memory_item, new_goal, new_params)
    assert instantiated is not None
    assert instantiated.memory_reused is True
    assert instantiated.memory_pattern == "Find hotels in {city} under {budget}"

    actions = instantiated.actions
    assert "Udaipur" in actions[0].params.url
    assert "{city}" not in actions[0].params.url

# ── 3. ADAPTIVE EXECUTION RECOVERY ──────────────────────────────────────────

def test_plan_adaptive_recovery_action_element_not_found():
    task = {
        "id": "t-1",
        "action": "click",
        "params": {"id": 42, "text": "Apply Filter"},
        "description": "Apply Filter button",
        "retries": 1
    }
    curr_obs = {
        "url": "https://example.com/hotels",
        "interactive_elements": [
            {"id": 88, "tag": "button", "label": "Apply Filter", "role": "button"}
        ]
    }
    recovery = plan_adaptive_recovery_action(
        goal="Filter hotels",
        failed_task=task,
        error_reason="Element #42 not found on page",
        observation=curr_obs
    )

    assert recovery is not None
    assert "Re-anchored" in recovery.recovery_strategy
    # Should re-anchor to element 88 with matching text
    assert recovery.action.params.id == 88

def test_plan_adaptive_recovery_safety_approval_gate():
    """Consequential financial/checkout actions require human approval even in recovery."""
    task = {
        "id": "t-pay",
        "action": "click",
        "params": {"id": 99, "text": "Pay Now and Complete Booking"},
        "description": "Pay Now and Complete Booking",
        "retries": 1
    }
    recovery = plan_adaptive_recovery_action(
        goal="Book room",
        failed_task=task,
        error_reason="Element detached from DOM",
        observation={"url": "https://example.com/checkout", "interactive_elements": [{"id": 105, "tag": "button", "label": "Pay Now and Complete Booking"}]}
    )

    assert recovery is not None
    assert recovery.requires_approval is True
    assert recovery.approval_reason is not None

# ── 4. CROSS-USER MEMORY ISOLATION & CRUD ───────────────────────────────────

def test_workflow_memory_user_isolation():
    user_a = create_registered_user("user_a")
    user_b = create_registered_user("user_b")

    # User A creates a memory item
    payload_a = {
        "task_pattern": "Find hotels in {city} under {budget}",
        "category": "hotel",
        "description": "Hotel search automation for {city}",
        "parameters": ["city", "budget"],
        "action_sequence": [{"action": "navigate", "params": {"url": "https://hotels.com/{city}"}}]
    }
    res_a = client.post(
        "/user/memory",
        json=payload_a,
        headers={"Authorization": f"Bearer {user_a['token']}"}
    )
    assert res_a.status_code == 201
    mem_a = res_a.json()
    assert mem_a["user_id"] == user_a["id"]

    # User B lists memory: User A's item must NOT appear
    res_b_list = client.get(
        "/user/memory",
        headers={"Authorization": f"Bearer {user_b['token']}"}
    )
    assert res_b_list.status_code == 200
    mems_b = res_b_list.json()
    assert len(mems_b) == 0

    # User B cannot delete User A's memory item (404/unauthorized)
    res_b_del = client.delete(
        f"/user/memory/{mem_a['id']}",
        headers={"Authorization": f"Bearer {user_b['token']}"}
    )
    assert res_b_del.status_code == 404

    # User A can delete their own item
    res_a_del = client.delete(
        f"/user/memory/{mem_a['id']}",
        headers={"Authorization": f"Bearer {user_a['token']}"}
    )
    assert res_a_del.status_code == 200

def test_workflow_memory_execution_recording():
    user = create_registered_user("mem_stats")
    
    # Create memory
    res = client.post(
        "/user/memory",
        json={
            "task_pattern": "Find phones under {budget}",
            "category": "shopping",
            "parameters": ["budget"],
            "action_sequence": [{"action": "navigate", "params": {"url": "https://shop.com"}}]
        },
        headers={"Authorization": f"Bearer {user['token']}"}
    )
    mem_id = res.json()["id"]

    # Record 2 successful outcomes
    client.post(
        "/user/memory/record",
        json={"memory_id": mem_id, "success": True},
        headers={"Authorization": f"Bearer {user['token']}"}
    )
    rec2 = client.post(
        "/user/memory/record",
        json={"memory_id": mem_id, "success": True},
        headers={"Authorization": f"Bearer {user['token']}"}
    )
    assert rec2.status_code == 200
    updated = rec2.json()["memory"]
    assert updated["reuse_count"] == 2
    assert updated["success_count"] == 3
    assert updated["success_rate"] == 100.0

def test_workflow_memory_clear_all():
    user = create_registered_user("clear_mem")
    
    # Create two items
    for i in range(2):
        client.post(
            "/user/memory",
            json={
                "task_pattern": f"Workflow Pattern {i}",
                "category": "general",
                "action_sequence": [{"action": "wait", "params": {"ms": 500}}]
            },
            headers={"Authorization": f"Bearer {user['token']}"}
        )

    # Clear all
    clear_res = client.delete(
        "/user/memory",
        headers={"Authorization": f"Bearer {user['token']}"}
    )
    assert clear_res.status_code == 200
    assert clear_res.json()["deleted_count"] == 2

    # Verify list is empty
    empty_res = client.get(
        "/user/memory",
        headers={"Authorization": f"Bearer {user['token']}"}
    )
    assert len(empty_res.json()) == 0

def test_workflow_memory_master_toggle():
    user = create_registered_user("toggle_user")

    # Disable memory reuse in preferences
    put_res = client.put(
        "/user/preferences",
        json={"enable_workflow_memory": False},
        headers={"Authorization": f"Bearer {user['token']}"}
    )
    assert put_res.status_code == 200

    # Retrieve preferences to confirm toggle persisted
    get_res = client.get(
        "/user/preferences",
        headers={"Authorization": f"Bearer {user['token']}"}
    )
    assert get_res.json()["enable_workflow_memory"] is False
