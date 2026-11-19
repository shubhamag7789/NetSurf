import pytest
from fastapi_backend.planner import build_structured_plan
from fastapi_backend.schemas import TaskStatus

def test_daily_task_mobile_under_30000():
    goal = "checking mobile under 30000 inr"
    plan = build_structured_plan(goal)
    assert plan is not None
    assert len(plan.phases) == 4
    assert len(plan.actions) >= 8
    # Assert shopping URL is generated
    assert any("search" in a.params.url for a in plan.actions if a.params and a.params.url)
    assert any(a.action.value == "extract" for a in plan.actions)
    assert any(a.action.value == "done" for a in plan.actions)
    assert plan.completion_criteria.require_source_urls is True

def test_daily_task_research_pollution():
    goal = "Research about pollution across multiple websites, summarize findings with source links and compare claims"
    plan = build_structured_plan(goal)
    assert plan is not None
    assert len(plan.phases) == 4
    assert len(plan.actions) >= 8
    assert any("search" in a.params.url for a in plan.actions if a.params and a.params.url)
    assert any(a.action.value == "extract" for a in plan.actions)
    assert any(a.action.value == "done" for a in plan.actions)
    assert plan.completion_criteria.require_source_urls is True
