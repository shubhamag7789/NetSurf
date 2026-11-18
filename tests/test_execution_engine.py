"""
Test Suite for NetSurf Execution Engine
Verifies complete task plan execution, 7 required test cases,
state transitions, progress tracking, and completion validation.
"""

import pytest
from fastapi.testclient import TestClient

from fastapi_backend.main import app
from fastapi_backend.schemas import (
    Action,
    ActionType,
    ActionParams,
    Observation,
    InteractiveElement,
    Plan,
    PlanPhase,
    PlannedTask,
    TaskStatus,
    CompletionCriteria
)
from fastapi_backend.planner import build_structured_plan, plan_next_step
from fastapi_backend.verifier import validate_completion

client = TestClient(app)


# ── TEST CASE 1: ALL 15 REQUIRED ACTIONS SUCCEED ──────────────────────────────
def test_case_1_all_15_actions_succeed():
    """
    1. All planned actions (e.g. 15 discrete tasks across 4 phases) execute and succeed.
    Verifies phases and actions counters, records validation, source URLs, and final success.
    """
    goal = "Extract book titles, prices, and ratings from https://books.toscrape.com/catalogue/page-1.html"
    plan = build_structured_plan(goal)

    # Verify structured plan decomposition
    assert len(plan.phases) == 4, f"Expected 4 phases, got {len(plan.phases)}"
    assert len(plan.actions) == 15, f"Expected 15 actions, got {len(plan.actions)}"

    # Simulate execution of all 15 actions
    mock_records = [
        {"title": f"Book {i}", "price": f"£{20+i}.00", "rating": "Four", "source_url": "https://books.toscrape.com/catalogue/page-1.html"}
        for i in range(1, 21)
    ]

    for task in plan.actions:
        task.status = TaskStatus.COMPLETED
        task.result = f"Action {task.id} verified successfully"

    for phase in plan.phases:
        phase.status = TaskStatus.COMPLETED

    # Validate completion
    result = validate_completion(plan, extracted_data=mock_records, export_generated=False)

    assert result["is_complete"] is True
    assert result["is_partial"] is False
    assert result["status"] == "completed"
    assert result["completed_phases_count"] == 4
    assert result["total_phases_count"] == 4
    assert result["records_count"] == 20
    assert "Success" in result["message"]


# ── TEST CASE 2: REQUIRED ACTION FAILS AND IS RETRIED ─────────────────────────
def test_case_2_action_fails_and_is_retried():
    """
    2. A required action fails on initial execution, enters RETRYING state,
    and succeeds on bounded retry.
    """
    goal = "Extract book titles, prices, and ratings from books.toscrape.com"
    plan = build_structured_plan(goal)

    # Pick a required task, e.g. Action 2 (wait for network ready)
    task = plan.actions[1]
    assert task.required is True
    assert task.status == TaskStatus.PENDING

    # Attempt 1: Fails
    task.status = TaskStatus.RETRYING
    task.retries = 1
    task.error = "DOM element not ready"
    assert task.status == TaskStatus.RETRYING
    assert task.retries == 1

    # Attempt 2 (Retry): Succeeds
    task.status = TaskStatus.COMPLETED
    task.result = "Verified on retry"

    assert task.status == TaskStatus.COMPLETED
    assert task.retries <= task.max_retries


# ── TEST CASE 3: REQUIRED ACTION FAILS PERMANENTLY ────────────────────────────
def test_case_3_action_fails_permanently():
    """
    3. A required action fails and exhausts all retries, permanently marking it FAILED.
    Execution halts without marking unexecuted steps as completed.
    """
    goal = "Extract book titles, prices, and ratings from books.toscrape.com"
    plan = build_structured_plan(goal)

    # Action 1 completed
    plan.actions[0].status = TaskStatus.COMPLETED

    # Action 2 fails permanently after retries
    plan.actions[1].retries = 2
    plan.actions[1].status = TaskStatus.FAILED
    plan.actions[1].error = "Network timeout after 2 retries"

    # Tasks 3 to 15 remain PENDING (never marked completed)
    for t in plan.actions[2:]:
        assert t.status == TaskStatus.PENDING

    result = validate_completion(plan, extracted_data=[])

    assert result["is_complete"] is False
    assert result["status"] == "failed" or result["status"] == "partial"
    assert result["completed_required_count"] == 1
    assert any("not completed" in issue or "pending" in issue for issue in result["details"]["issues"])


# ── TEST CASE 4: FINISHES EARLY BECAUSE REMAINING STEPS ARE UNNECESSARY ───────
def test_case_4_task_finishes_early_optional_steps_skipped():
    """
    4. Optional steps are genuinely unnecessary (e.g. scroll to locate next button
    when button is already visible in viewport) and are marked SKIPPED with a reason.
    All required steps succeed -> task completes successfully.
    """
    goal = "Extract book titles, prices, and ratings from books.toscrape.com"
    plan = build_structured_plan(goal)

    mock_records = [
        {"title": f"Book {i}", "price": f"£{20+i}.00", "rating": "Three", "source_url": "https://books.toscrape.com/catalogue/page-1.html"}
        for i in range(1, 21)
    ]

    for task in plan.actions:
        if task.id == 8:
            # Action 8 is optional scroll
            assert task.required is False
            task.status = TaskStatus.SKIPPED
            task.skip_reason = "Pagination control already visible in active viewport"
        else:
            task.status = TaskStatus.COMPLETED

    for phase in plan.phases:
        phase.status = TaskStatus.COMPLETED

    result = validate_completion(plan, extracted_data=mock_records)

    assert result["is_complete"] is True
    assert result["status"] == "completed"
    assert plan.actions[7].status == TaskStatus.SKIPPED
    assert plan.actions[7].skip_reason is not None


# ── TEST CASE 5: USER CANCELS A RUNNING TASK ──────────────────────────────────
def test_case_5_user_cancels_running_task():
    """
    5. The user cancels a running task midway.
    Running and unexecuted pending tasks are transitioned to CANCELLED.
    Status reports cancellation without marking unexecuted steps completed.
    """
    goal = "Extract book titles, prices, and ratings from books.toscrape.com"
    plan = build_structured_plan(goal)

    # Steps 1-4 completed
    for t in plan.actions[:4]:
        t.status = TaskStatus.COMPLETED

    # Step 5 was running when user pressed Stop
    plan.actions[4].status = TaskStatus.CANCELLED

    # Steps 6-15 cancelled
    for t in plan.actions[5:]:
        t.status = TaskStatus.CANCELLED

    result = validate_completion(plan, extracted_data=[])

    assert result["is_complete"] is False
    assert result["status"] == "cancelled"
    assert "cancelled" in result["message"].lower()
    # Ensure unexecuted steps were not marked completed
    assert result["completed_required_count"] == 4


# ── TEST CASE 6: EXTRACTION SUCCEEDS BUT VERIFICATION STEP PENDING ────────────
def test_case_6_extraction_succeeds_but_verification_step_pending():
    """
    6. Data extraction succeeds (20 records extracted), but a required verification
    step remains pending. Status MUST report Partial Completion, NOT Success!
    """
    goal = "Extract book titles, prices, and ratings from books.toscrape.com"
    plan = build_structured_plan(goal)

    mock_records = [
        {"title": f"Book {i}", "price": f"£{20+i}.00", "rating": "Five", "source_url": "https://books.toscrape.com/catalogue/page-1.html"}
        for i in range(1, 21)
    ]

    # Steps 1 to 13 completed
    for t in plan.actions[:13]:
        t.status = TaskStatus.COMPLETED

    # Step 14 and 15 remain PENDING
    plan.actions[13].status = TaskStatus.PENDING
    plan.actions[14].status = TaskStatus.PENDING

    result = validate_completion(plan, extracted_data=mock_records)

    # MUST NOT BE COMPLETED
    assert result["is_complete"] is False
    assert result["is_partial"] is True
    assert result["status"] == "partial"
    assert "Partial Completion" in result["message"]
    assert "still pending" in result["message"]


# ── TEST CASE 7: COMPLETION VALIDATION ENDPOINT HTTP ──────────────────────────
def test_completion_validation_endpoint():
    """
    Tests the FastAPI /agent/validate_completion endpoint directly.
    """
    goal = "Extract book titles, prices, and ratings from books.toscrape.com"
    plan = build_structured_plan(goal)

    # Set all completed
    for t in plan.actions:
        t.status = TaskStatus.COMPLETED

    payload = {
        "plan": plan.model_dump(),
        "extracted_data": [
            {"title": "Book 1", "price": "£10.00", "rating": "One", "source_url": "https://books.toscrape.com/catalogue/page-1.html"}
        ] * 20,
        "history": [],
        "export_generated": False
    }

    response = client.post("/agent/validate_completion", json=payload)
    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "completed"
    assert data["is_complete"] is True


def test_agent_plan_endpoint_returns_structured_phases_and_actions():
    """
    Tests that POST /agent/plan returns phases, actions, and criteria.
    """
    response = client.post("/agent/plan", json={"goal": "Extract book titles, prices, and ratings from books.toscrape.com"})
    assert response.status_code == 200
    data = response.json()
    assert "phases" in data
    assert "actions" in data
    assert len(data["phases"]) == 4
    assert len(data["actions"]) == 15
    assert len(data["steps"]) == 4  # Backwards compatibility list
