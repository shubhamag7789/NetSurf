import pytest
import sqlite3
import os
from fastapi_backend.qa_service import (
    clean_page_text,
    chunk_document,
    score_chunk_relevance,
    retrieve_relevant_chunks,
    extract_evidence_snippets,
    answer_page_question,
    PageQARequest
)
from fastapi_backend.recommendation import (
    ProductRequirements,
    FlightRequirements,
    rank_extracted_items
)
from fastapi_backend.database import (
    get_user_preferences,
    update_user_preferences,
    create_user_saved_item,
    get_user_saved_items,
    delete_user_saved_item
)

# ── 1. PAGE Q&A GROUNDED RAG PIPELINE TESTS ──────────────────────────

def test_page_qa_clean_text_and_chunking():
    dirty_html_text = """
    Nav Home Contact Careers Privacy Cookie Policy
    ================================================
    Akasa Air QP-2022 departs from Delhi at 18:45 and arrives in Mumbai at 21:10.
    Non-stop flight duration is 02h 25m.
    Standard Economy fare is ₹ 5,850 per adult passenger.
    Baggage allowance includes 15kg check-in baggage and 7kg cabin baggage.
    Cancellation policy: Free cancellation up to 24 hours prior to departure.
    """
    cleaned = clean_page_text(dirty_html_text)
    assert "Akasa Air QP-2022" in cleaned
    assert "Cancellation policy" in cleaned

    chunks = chunk_document(cleaned, chunk_size_words=30, overlap_words=10)
    assert len(chunks) >= 1
    assert any("Cancellation policy" in c.content for c in chunks)


def test_page_qa_retrieval_and_evidence():
    page_text = (
        "IndiGo flight 6E-449 departs Delhi at 05:00 and reaches Mumbai at 07:25. "
        "The minimum ticket price is ₹ 4,200. "
        "The cancellation fee is ₹ 1,500 if cancelled within 48 hours. "
        "Check-in baggage limit is strictly 15 kg."
    )
    chunks = chunk_document(page_text, chunk_size_words=25, overlap_words=5)
    retrieved = retrieve_relevant_chunks("What is the cancellation fee?", chunks, top_k=2)
    assert len(retrieved) > 0
    assert any("cancellation fee" in r.content.lower() for r in retrieved)

    evidence = extract_evidence_snippets("What is the baggage limit?", page_text)
    assert len(evidence) > 0
    assert any("15 kg" in e for e in evidence)


def test_page_qa_answer_found():
    page_text = "The iPhone 15 Pro features a Titanium design, A17 Pro chip, and a 48MP main camera with USB-C."
    req = PageQARequest(
        question="What chip does the iPhone 15 Pro use?",
        page_url="https://apple.com/iphone-15-pro",
        page_title="iPhone 15 Pro",
        page_text=page_text
    )
    res = answer_page_question(req)
    assert res.found_on_page is True
    assert "A17 Pro" in res.answer or "A17" in res.answer
    assert len(res.evidence) > 0


def test_page_qa_answer_not_found():
    page_text = "Welcome to the Python documentation for dictionary methods: keys(), values(), and items()."
    req = PageQARequest(
        question="What is the price of a flight from Delhi to Paris?",
        page_url="https://docs.python.org",
        page_title="Python Docs",
        page_text=page_text
    )
    res = answer_page_question(req)
    assert res.found_on_page is False
    assert "not" in res.answer.lower() and "found" in res.answer.lower()


# ── 2. PREFERENCES INTELLIGENCE TESTS (DISQUALIFICATION VS RANK BOOST) ──

def test_shopping_preferences_excluded_brand_disqualification():
    raw_items = [
        {"title": "Infinix Zero 30 5G", "brand": "Infinix", "price": "₹ 21,999", "category": "smartphone", "link": "https://store.com/1"},
        {"title": "Samsung Galaxy M34 5G", "brand": "Samsung", "price": "₹ 18,999", "category": "smartphone", "link": "https://store.com/2"},
        {"title": "Redmi Note 13 Pro", "brand": "Redmi", "price": "₹ 22,999", "category": "smartphone", "link": "https://store.com/3"}
    ]
    req = ProductRequirements(
        category="smartphone",
        excluded_brands=["Infinix", "Itel"],
        preferred_brands=["Samsung"]
    )
    result = rank_extracted_items(raw_items, req)
    passing_titles = [i.name for i in result.ranked_items] + [a.name for a in result.alternative_items]
    disqualified_titles = [d.name for d in result.disqualified_items]

    assert any("Infinix" in t for t in disqualified_titles)
    assert any("Samsung" in t for t in passing_titles)
    assert any("Redmi" in t for t in passing_titles)


def test_shopping_preferences_exclusive_brand_filter():
    raw_items = [
        {"title": "Apple iPhone 13 (128GB)", "brand": "Apple", "price": "₹ 48,999", "category": "smartphone", "link": "https://store.com/1"},
        {"title": "Samsung Galaxy S23 FE", "brand": "Samsung", "price": "₹ 49,999", "category": "smartphone", "link": "https://store.com/2"},
        {"title": "Google Pixel 7a", "brand": "Google", "price": "₹ 39,999", "category": "smartphone", "link": "https://store.com/3"}
    ]
    req = ProductRequirements(
        category="smartphone",
        preferred_brands=["Apple"],
        exclusive_brands=True
    )
    result = rank_extracted_items(raw_items, req)
    passing_brands = [i.brand for i in result.ranked_items]

    assert passing_brands == ["Apple"]
    assert len(result.disqualified_items) == 2


def test_travel_preferences_excluded_airlines_and_stops():
    raw_items = [
        {"title": "SpiceJet SG-123", "airline": "SpiceJet", "price": "₹ 4,500", "stops": "Non-stop", "category": "flight", "link": "https://mmt.com/1"},
        {"title": "IndiGo 6E-449", "airline": "IndiGo", "price": "₹ 5,200", "stops": "Non-stop", "category": "flight", "link": "https://mmt.com/2"},
        {"title": "Air India AI-2587", "airline": "Air India", "price": "₹ 5,100", "stops": "2 stops", "category": "flight", "link": "https://mmt.com/3"}
    ]
    req = FlightRequirements(
        category="flight",
        excluded_airlines=["SpiceJet"],
        preferred_airlines=["IndiGo"],
        max_stops=0, # Non-stop only
        budget_max=6000.0
    )
    result = rank_extracted_items(raw_items, req, category="flight")
    passing_airlines = [i.airline for i in result.ranked_items]
    disqualified_airlines = [d.airline for d in result.disqualified_items]

    assert "SpiceJet" in disqualified_airlines
    assert "Air India" in disqualified_airlines
    assert passing_airlines == ["IndiGo"]


def test_travel_preferences_rank_boost_and_applied_badge():
    raw_items = [
        {"title": "Akasa Air QP-2022", "airline": "Akasa Air", "price": "₹ 5,000", "stops": "Non-stop", "category": "flight", "link": "https://mmt.com/1"},
        {"title": "IndiGo 6E-449", "airline": "IndiGo", "price": "₹ 5,100", "stops": "Non-stop", "category": "flight", "link": "https://mmt.com/2"}
    ]
    req = FlightRequirements(
        category="flight",
        preferred_airlines=["IndiGo"]
    )
    result = rank_extracted_items(raw_items, req, category="flight")

    # IndiGo should rank #1 due to preferred airline boost despite slightly higher price
    top_flight = result.ranked_items[0]
    assert top_flight.airline == "IndiGo"
    assert any("Preferred Carrier" in badge for badge in top_flight.applied_preferences)


# ── 3. SAVED ITEMS CENTRALIZED DEDUPLICATION TESTS ───────────────────

def test_saved_items_deduplication():
    import uuid
    from fastapi_backend.database import create_user, init_db
    init_db()
    unique_email = f"test_phase3_dedup_{uuid.uuid4().hex[:6]}@example.com"
    user = create_user(unique_email, "Phase 3 Tester", "SecurePassword123!")
    test_user_id = user["id"]

    # First save
    item1 = create_user_saved_item(
        user_id=test_user_id,
        item_type="flight",
        title="Akasa Air QP-2022 DEL -> BOM",
        url="https://www.makemytrip.com/flight/search?itinerary=DEL-BOM-25/11/2026",
        current_price=5850.0
    )
    assert item1["id"] is not None

    # Save exact same flight URL again with updated price
    item2 = create_user_saved_item(
        user_id=test_user_id,
        item_type="flight",
        title="Akasa Air QP-2022 DEL -> BOM (Updated)",
        url="https://www.makemytrip.com/flight/search?itinerary=DEL-BOM-25/11/2026",
        current_price=5650.0
    )
    # Deduplication updates the row in-place rather than creating duplicate ID
    assert item2["id"] == item1["id"]
    assert item2["current_price"] == 5650.0

    # Verify only 1 saved item exists
    saved_list = get_user_saved_items(test_user_id)
    assert len(saved_list) == 1
    assert saved_list[0]["current_price"] == 5650.0

    # Clean up
    delete_user_saved_item(test_user_id, item1["id"])
