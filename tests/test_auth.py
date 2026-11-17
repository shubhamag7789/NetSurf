"""
Comprehensive Automated Test Suite for Phase 2:
Authentication and Multi-User Architecture.
Tests:
- User Registration
- Duplicate Email Handling
- Invalid Password & Login Rejection
- Valid Login & Token Issuance
- Current User Profile Retrieval (/auth/me)
- Expired Access Token Rejection
- Refresh Token Single-Use Rotation
- Revoked Refresh Token Reuse Detection
- User Logout & Token Revocation
- Unauthorized Endpoint Access Protection
- Cross-User Data Access Isolation (Tasks, Preferences, Saved Items, Memory)
"""

import pytest
import uuid
import jwt
from datetime import datetime, timedelta, timezone
from fastapi.testclient import TestClient

from fastapi_backend.main import app
from fastapi_backend.config import settings
from fastapi_backend.auth import create_access_token

client = TestClient(app)

@pytest.fixture
def unique_credentials():
    uid = uuid.uuid4().hex[:8]
    return {
        "email": f"user_{uid}@example.com",
        "password": "SecurePassword123!",
        "name": f"User {uid}"
    }

def test_user_registration_success(unique_credentials):
    res = client.post("/auth/register", json=unique_credentials)
    assert res.status_code == 201
    data = res.json()
    assert "access_token" in data
    assert "refresh_token" in data
    assert data["token_type"] == "bearer"
    assert data["user"]["email"] == unique_credentials["email"].lower()
    assert data["user"]["name"] == unique_credentials["name"]
    assert "password_hash" not in data["user"]

def test_duplicate_email_registration_rejected(unique_credentials):
    # First registration
    r1 = client.post("/auth/register", json=unique_credentials)
    assert r1.status_code == 201

    # Second registration with same email
    r2 = client.post("/auth/register", json=unique_credentials)
    assert r2.status_code == 400
    assert "already registered" in r2.json()["detail"].lower()

def test_login_incorrect_password(unique_credentials):
    client.post("/auth/register", json=unique_credentials)

    res = client.post("/auth/login", json={
        "email": unique_credentials["email"],
        "password": "WrongPassword999!"
    })
    assert res.status_code == 401
    assert "invalid email or password" in res.json()["detail"].lower()

def test_login_success(unique_credentials):
    client.post("/auth/register", json=unique_credentials)

    res = client.post("/auth/login", json={
        "email": unique_credentials["email"],
        "password": unique_credentials["password"]
    })
    assert res.status_code == 200
    data = res.json()
    assert "access_token" in data
    assert "refresh_token" in data
    assert data["user"]["email"] == unique_credentials["email"].lower()

def test_get_current_user_me(unique_credentials):
    reg = client.post("/auth/register", json=unique_credentials).json()
    token = reg["access_token"]

    res = client.get("/auth/me", headers={"Authorization": f"Bearer {token}"})
    assert res.status_code == 200
    me = res.json()
    assert me["id"] == reg["user"]["id"]
    assert me["email"] == unique_credentials["email"].lower()
    assert me["name"] == unique_credentials["name"]

def test_expired_access_token_rejected(unique_credentials):
    reg = client.post("/auth/register", json=unique_credentials).json()
    user_id = reg["user"]["id"]

    # Manually issue an already expired access token
    expired_token = create_access_token(
        user_id=user_id,
        email=unique_credentials["email"],
        name=unique_credentials["name"],
        expires_delta=timedelta(seconds=-10)
    )

    res = client.get("/auth/me", headers={"Authorization": f"Bearer {expired_token}"})
    assert res.status_code == 401
    assert "expired" in res.json()["detail"].lower()

def test_refresh_token_rotation(unique_credentials):
    reg = client.post("/auth/register", json=unique_credentials).json()
    initial_refresh = reg["refresh_token"]

    # Perform refresh
    res = client.post("/auth/refresh", json={"refresh_token": initial_refresh})
    assert res.status_code == 200
    data = res.json()
    new_access = data["access_token"]
    new_refresh = data["refresh_token"]

    assert new_refresh != initial_refresh
    assert new_access != reg["access_token"]

    # Verify new access token works
    me_res = client.get("/auth/me", headers={"Authorization": f"Bearer {new_access}"})
    assert me_res.status_code == 200

def test_revoked_refresh_token_reuse_detection(unique_credentials):
    reg = client.post("/auth/register", json=unique_credentials).json()
    initial_refresh = reg["refresh_token"]

    # First rotation succeeds
    r1 = client.post("/auth/refresh", json={"refresh_token": initial_refresh})
    assert r1.status_code == 200
    second_refresh = r1.json()["refresh_token"]

    # Attempting to re-use initial_refresh (which has been rotated) must fail and trigger reuse detection
    r2 = client.post("/auth/refresh", json={"refresh_token": initial_refresh})
    assert r2.status_code == 401
    assert "reuse detected" in r2.json()["detail"].lower()

    # Reuse detection terminates all sessions: second_refresh should now also be invalidated
    r3 = client.post("/auth/refresh", json={"refresh_token": second_refresh})
    assert r3.status_code == 401

def test_logout_revokes_session(unique_credentials):
    reg = client.post("/auth/register", json=unique_credentials).json()
    access = reg["access_token"]
    refresh = reg["refresh_token"]

    # Logout
    out = client.post(
        "/auth/logout",
        json={"refresh_token": refresh},
        headers={"Authorization": f"Bearer {access}"}
    )
    assert out.status_code == 200

    # Refreshing after logout should fail
    ref_res = client.post("/auth/refresh", json={"refresh_token": refresh})
    assert ref_res.status_code == 401

def test_unauthorized_endpoint_access_rejected():
    res = client.get("/auth/me")
    assert res.status_code == 401

    res_tasks = client.get("/user/tasks")
    assert res_tasks.status_code == 401

    res_prefs = client.get("/user/preferences")
    assert res_prefs.status_code == 401

def test_cross_user_data_isolation():
    # Register User A
    user_a_creds = {
        "email": f"alice_{uuid.uuid4().hex[:6]}@example.com",
        "password": "PasswordAlice123!",
        "name": "Alice"
    }
    user_a = client.post("/auth/register", json=user_a_creds).json()
    token_a = user_a["access_token"]

    # Register User B
    user_b_creds = {
        "email": f"bob_{uuid.uuid4().hex[:6]}@example.com",
        "password": "PasswordBob123!",
        "name": "Bob"
    }
    user_b = client.post("/auth/register", json=user_b_creds).json()
    token_b = user_b["access_token"]

    # 1. User A creates a task
    task_res = client.post(
        "/user/tasks",
        json={"goal": "Alice secret shopping list", "domain": "amazon.com"},
        headers={"Authorization": f"Bearer {token_a}"}
    )
    assert task_res.status_code == 201
    task_id = task_res.json()["id"]

    # User A can access it
    assert client.get(f"/user/tasks/{task_id}", headers={"Authorization": f"Bearer {token_a}"}).status_code == 200

    # User B CANNOT access User A's task (isolation enforced, returns 404)
    b_task_access = client.get(f"/user/tasks/{task_id}", headers={"Authorization": f"Bearer {token_b}"})
    assert b_task_access.status_code == 404

    # User B CANNOT delete User A's task
    b_task_del = client.delete(f"/user/tasks/{task_id}", headers={"Authorization": f"Bearer {token_b}"})
    assert b_task_del.status_code == 404

    # User B's task list does not include Alice's task
    b_tasks_list = client.get("/user/tasks", headers={"Authorization": f"Bearer {token_b}"}).json()
    assert all(t["id"] != task_id for t in b_tasks_list)

    # 2. Preferences Isolation
    client.put(
        "/user/preferences",
        json={"preferred_job_roles": ["AI Architect"], "preferred_locations": ["Zurich"]},
        headers={"Authorization": f"Bearer {token_a}"}
    )
    b_prefs = client.get("/user/preferences", headers={"Authorization": f"Bearer {token_b}"}).json()
    assert b_prefs["preferred_job_roles"] != ["AI Architect"]

    # 3. Saved Items Isolation
    saved_res = client.post(
        "/user/saved",
        json={"item_type": "table", "title": "Alice Confidential Leads", "content": {"leads": 50}},
        headers={"Authorization": f"Bearer {token_a}"}
    )
    saved_id = saved_res.json()["id"]

    b_saved_access = client.get(f"/user/saved", headers={"Authorization": f"Bearer {token_b}"}).json()
    assert all(item["id"] != saved_id for item in b_saved_access)

    b_saved_del = client.delete(f"/user/saved/{saved_id}", headers={"Authorization": f"Bearer {token_b}"})
    assert b_saved_del.status_code == 404

    # 4. Workflow Memory Isolation
    client.post(
        "/user/memory",
        json={"task_pattern": "alice_custom_banking_flow", "learned_solution": {"click": 42}},
        headers={"Authorization": f"Bearer {token_a}"}
    )
    b_memory = client.get("/user/memory", headers={"Authorization": f"Bearer {token_b}"}).json()
    assert all(m["task_pattern"] != "alice_custom_banking_flow" for m in b_memory)
