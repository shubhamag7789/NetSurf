import pytest
from fastapi.testclient import TestClient
from fastapi_backend.main import app
from fastapi_backend.schemas import (
    Observation,
    TaskClassification,
    ActionType
)
from fastapi_backend.planner import (
    classify_task_request,
    build_structured_plan,
    generate_plan
)

client = TestClient(app)


def test_classify_flight_makemytrip():
    goal = "Find the cheapest flight from Delhi to Mumbai on MakeMyTrip on 25 November 2026."
    obs = Observation(url="https://www.makemytrip.com/flight/search", title="MakeMyTrip Flights")
    classification = classify_task_request(goal, obs)

    assert isinstance(classification, TaskClassification)
    assert classification.task_category == "flight"
    assert classification.target_website_name == "MakeMyTrip"
    assert classification.is_already_open is True
    assert classification.search_parameters.get("origin") == "Delhi"
    assert classification.search_parameters.get("destination") == "Mumbai"
    assert classification.search_parameters.get("date") == "25 November 2026"
    assert "MakeMyTrip" in classification.summary_text


def test_classify_smartphone_shopping():
    goal = "Find Samsung smartphones under ₹23,000."
    classification = classify_task_request(goal)

    assert classification.task_category == "shopping"
    assert "PRODUCT" in classification.user_intent
    assert classification.search_parameters.get("brand") == "Samsung"
    assert classification.search_parameters.get("max_price") == "₹23,000"


def test_classify_fresher_jobs():
    goal = "Find software engineering jobs for freshers on LinkedIn."
    classification = classify_task_request(goal)

    assert classification.task_category == "jobs"
    assert "LinkedIn" in classification.target_website_name
    assert "freshers" in classification.search_parameters.get("experience", "").lower()


def test_classify_movie_tickets():
    goal = "Compare movie ticket prices for a particular film on BookMyShow."
    classification = classify_task_request(goal)

    assert classification.task_category == "movies"
    assert classification.target_website_name == "BookMyShow"


def test_classify_hotels():
    goal = "Find hotels near Connaught Place Delhi under ₹5,000."
    classification = classify_task_request(goal)

    assert classification.task_category == "hotels"
    assert "connaught place delhi" in classification.search_parameters.get("location", "").lower()


def test_classify_form_autofill_requires_confirmation():
    goal = "Fill this job application form with my profile details."
    classification = classify_task_request(goal)

    assert classification.task_category == "form_autofill"
    assert classification.requires_confirmation is True
    assert "human" in classification.confirmation_reason.lower()


def test_classify_page_qa():
    goal = "What is the price and cancellation policy of this flight?"
    obs = Observation(url="https://www.makemytrip.com/flight/review", title="Flight Review")
    classification = classify_task_request(goal, obs)

    assert classification.task_category == "page_qa"
    assert classification.user_intent == "ACTIVE_PAGE_QA"


def test_plan_does_not_redirect_to_google_when_makemytrip_open():
    goal = "Find the cheapest flight from Delhi to Mumbai on MakeMyTrip on 25 November 2026."
    obs = Observation(
        url="https://www.makemytrip.com/flight/search?itinerary=DEL-BOM",
        title="MakeMyTrip Flights Search",
        text_summary="Indigo 6E-6004 05:10 DEL to 10:20 BOM ₹15,987"
    )
    plan = build_structured_plan(goal, obs)

    assert plan.task_classification is not None
    assert plan.task_classification.task_category == "flight"
    # Ensure no Google search navigation step was added!
    for act in plan.actions:
        if act.action == ActionType.NAVIGATE:
            assert "google.com" not in act.params.url


def test_plan_does_not_redirect_to_google_when_target_site_specified():
    goal = "Find Samsung phones under 25000 on amazon"
    plan = build_structured_plan(goal, Observation(url="about:blank"))

    assert plan.task_classification is not None
    assert plan.task_classification.target_website_name == "Amazon"
    for act in plan.actions:
        if act.action == ActionType.NAVIGATE:
            assert "amazon" in act.params.url
            assert "google.com" not in act.params.url


def test_api_classify_endpoint():
    payload = {
        "goal": "Find the cheapest flight from Delhi to Mumbai on MakeMyTrip on 25 November 2026.",
        "observation": {
            "url": "https://www.makemytrip.com/flight/search",
            "title": "Flight Search"
        }
    }
    response = client.post("/agent/classify", json=payload)
    assert response.status_code == 200
    data = response.json()
    assert data["task_category"] == "flight"
    assert data["target_website_name"] == "MakeMyTrip"
    assert data["search_parameters"]["origin"] == "Delhi"
    assert data["search_parameters"]["destination"] == "Mumbai"


def test_agent_plan_attaches_task_classification():
    payload = {
        "goal": "Find software engineering jobs for freshers",
        "observation": {
            "url": "https://www.linkedin.com/jobs",
            "title": "Jobs"
        }
    }
    response = client.post("/agent/plan", json=payload)
    assert response.status_code == 200
    plan_data = response.json()
    assert "task_classification" in plan_data
    assert plan_data["task_classification"]["task_category"] == "jobs"
