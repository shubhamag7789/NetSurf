"""
Unit & Integration Tests for NetSurf Deterministic Web Extraction & Recommendation Engine (Phase 4).

Covers:
- Price normalization (INR, USD, EUR, GBP, commas, decimals, preservation of raw values)
- Specification extraction (RAM, storage/ROM, TB conversion, brands, ratings)
- Deterministic hard constraint filtering (budget caps, minimum RAM, minimum storage)
- Weighted scoring calculation & mathematical precision
- Missing values handling without score fabrication
- Deduplication of identical records
- URL sanitization & validation
- Hotel research normalization, filtering, and dedicated scoring
- Product vs Hotel criteria isolation
- API endpoint integration (POST /recommend/rank)
"""

import pytest
from fastapi.testclient import TestClient
from fastapi_backend.main import app
from fastapi_backend.recommendation import (
    normalize_price,
    normalize_ram,
    normalize_storage,
    normalize_brand,
    normalize_rating,
    normalize_hotel_amenities,
    clean_source_url,
    deduplicate_items,
    rank_extracted_items,
    ProductRequirements,
    HotelRequirements,
    FlightRequirements,
    DEFAULT_PRODUCT_WEIGHTS,
    DEFAULT_HOTEL_WEIGHTS,
    DEFAULT_FLIGHT_WEIGHTS,
)

client = TestClient(app)

# ── 1. PRICE NORMALIZATION ──────────────────────────────────────────────────

def test_price_normalization_formats():
    """Verifies that diverse price formats across currencies and locales are accurately parsed."""
    # INR with commas and rupee symbol
    val, curr, fmt = normalize_price("₹24,999")
    assert val == 24999.0
    assert curr == "INR"
    assert "₹24,999" in fmt

    # INR with Rs. prefix
    val, curr, fmt = normalize_price("Rs. 18,499.50")
    assert val == 18499.50
    assert curr == "INR"

    # USD with dollar sign
    val, curr, fmt = normalize_price("$299.99")
    assert val == 299.99
    assert curr == "USD"
    assert "$" in fmt

    # EUR with euro sign
    val, curr, fmt = normalize_price("€450.00")
    assert val == 450.0
    assert curr == "EUR"
    assert "€" in fmt

    # GBP with pound sign
    val, curr, fmt = normalize_price("£189.00")
    assert val == 189.0
    assert curr == "GBP"
    assert "£" in fmt

    # Raw preservation on empty or invalid input
    val, curr, fmt = normalize_price(None)
    assert val is None
    assert fmt == ""

    val, curr, fmt = normalize_price("Contact Seller for Pricing")
    assert val is None
    assert fmt == "Contact Seller for Pricing"


# ── 2. SPECIFICATION EXTRACTION ─────────────────────────────────────────────

def test_ram_specification_extraction():
    """Verifies RAM parsing and distinction from ROM/Storage."""
    # Explicit '8GB RAM'
    assert normalize_ram("8GB RAM") == 8
    assert normalize_ram(None, title="Samsung Galaxy S23 (8GB RAM, 128GB Storage)") == 8

    # LPDDR variation
    assert normalize_ram(None, snippet="Features 12GB LPDDR5X RAM with Snapdragon 8 Gen 2") == 12

    # Gigs notation
    assert normalize_ram("16 Gigs") == 16

    # Contextual pair notation: 8GB/256GB
    assert normalize_ram(None, title="OnePlus 11R 5G (8GB/128GB, Galactic Silver)") == 8

    # Ensure ROM is not falsely extracted as RAM
    assert normalize_ram(None, title="Phone with 128GB ROM") is None


def test_storage_specification_extraction():
    """Verifies storage/ROM parsing and Terabyte conversions."""
    # 128GB ROM
    assert normalize_storage("128GB") == 128
    assert normalize_storage(None, title="OnePlus Nord CE 3 (128GB ROM)") == 128

    # 256GB Storage
    assert normalize_storage(None, snippet="Contains 256 GB internal storage") == 256

    # 1 TB conversion to 1024 GB
    assert normalize_storage("1TB") == 1024
    assert normalize_storage(None, title="Apple iPhone 15 Pro Max (1 TB, Natural Titanium)") == 1024


def test_brand_canonicalization():
    """Verifies that brand names are canonicalized to standard titles."""
    assert normalize_brand("samsung") == "Samsung"
    assert normalize_brand("SAMSUNG") == "Samsung"
    assert normalize_brand(None, title="Google Pixel 7a with Tensor G2") == "Google"
    assert normalize_brand(None, title="Apple iPhone 14 128GB Starlight") == "Apple"
    assert normalize_brand(None, title="OnePlus Nord CE 3 Lite 5G") == "OnePlus"
    assert normalize_brand("xiaomi") == "Xiaomi"


def test_rating_normalization():
    """Verifies rating extraction across scales."""
    # 5-star scale
    assert normalize_rating("4.3 out of 5") == 4.3
    assert normalize_rating("4.7/5") == 4.7
    assert normalize_rating("4.5 ★") == 4.5
    assert normalize_rating(4.2) == 4.2

    # 10-point scale scaled down to 5
    assert normalize_rating("8.6/10") == 4.3


# ── 3. DETERMINISTIC HARD FILTERING ─────────────────────────────────────────

def test_deterministic_hard_filters_budget():
    """Strictly verifies that products exceeding the budget are disqualified and never recommended."""
    raw_products = [
        {
            "name": "Overbudget Phone Pro",
            "price": "₹28,999",
            "ram": "8GB",
            "storage": "128GB",
            "rating": "4.6",
            "brand": "Samsung"
        },
        {
            "name": "Within Budget Phone",
            "price": "₹23,999",
            "ram": "8GB",
            "storage": "128GB",
            "rating": "4.4",
            "brand": "Samsung"
        }
    ]

    req = ProductRequirements(
        category="smartphone",
        budget_max=25000,
        minimum_ram=8
    )

    response = rank_extracted_items(raw_products, req)

    # Overbudget item must be disqualified
    assert response.passed_count == 1
    assert response.disqualified_count == 1

    passed_names = [it.name for it in response.ranked_items]
    assert "Within Budget Phone" in passed_names
    assert "Overbudget Phone Pro" not in passed_names

    disqualified = response.disqualified_items[0]
    assert disqualified.name == "Overbudget Phone Pro"
    assert not disqualified.passed_filters
    assert any("Exceeds maximum budget" in r for r in disqualified.disqualification_reasons)

    # Top pick must be the passing item
    assert response.top_pick is not None
    assert response.top_pick.name == "Within Budget Phone"


def test_deterministic_hard_filters_ram():
    """Verifies that candidates with insufficient RAM are disqualified."""
    raw_products = [
        {
            "name": "Budget 4GB Phone",
            "price": "₹12,999",
            "ram": "4GB",
            "storage": "64GB",
            "rating": "4.0"
        },
        {
            "name": "Power 8GB Phone",
            "price": "₹18,999",
            "ram": "8GB",
            "storage": "128GB",
            "rating": "4.3"
        }
    ]

    req = ProductRequirements(
        category="smartphone",
        budget_max=20000,
        minimum_ram=8
    )

    response = rank_extracted_items(raw_products, req)
    assert response.passed_count == 1
    assert response.top_pick.name == "Power 8GB Phone"

    disqualified = response.disqualified_items[0]
    assert disqualified.name == "Budget 4GB Phone"
    assert any("RAM constraint failed" in r for r in disqualified.disqualification_reasons)


# ── 4. DETERMINISTIC WEIGHTED SCORING ───────────────────────────────────────

def test_deterministic_weighted_scoring_calculation():
    """Verifies that final scores match the mathematical weighted formula without LLM drift."""
    raw_products = [
        {
            "name": "Samsung Galaxy M34 5G",
            "price": "₹19,999",
            "ram": "8GB",
            "storage": "128GB",
            "rating": "4.5",
            "brand": "Samsung"
        },
        {
            "name": "Generic Value Phone",
            "price": "₹22,999",
            "ram": "6GB",
            "storage": "128GB",
            "rating": "3.8",
            "brand": "Other"
        }
    ]

    req = ProductRequirements(
        category="smartphone",
        budget_max=25000,
        minimum_ram=6,
        preferred_brands=["Samsung"],
        priorities=["price", "rating"]
    )

    response = rank_extracted_items(raw_products, req)
    assert response.passed_count == 2

    top = response.ranked_items[0]
    assert top.name == "Samsung Galaxy M34 5G"
    other = response.ranked_items[1] if len(response.ranked_items) > 1 else response.alternative_items[0]
    assert top.final_score > other.final_score

    # Check breakdown transparency
    bd = top.score_breakdown
    assert bd is not None
    assert bd.price_score > 0
    assert bd.spec_score > 0
    assert bd.rating_score == 90.0  # 4.5 / 5.0 * 100
    assert bd.preference_score > 50  # Samsung brand match bonus

    # Verify score calculation: W_price * S_price + W_specs * S_specs + W_rating * S_rating + W_pref * S_pref
    expected = round(
        (DEFAULT_PRODUCT_WEIGHTS["price"] * bd.price_score) +
        (DEFAULT_PRODUCT_WEIGHTS["specs"] * bd.spec_score) +
        (DEFAULT_PRODUCT_WEIGHTS["rating"] * bd.rating_score) +
        (DEFAULT_PRODUCT_WEIGHTS["preference"] * bd.preference_score),
        2
    )
    assert top.final_score == expected


# ── 5. MISSING VALUES & TRANSPARENCY ────────────────────────────────────────

def test_missing_values_handled_without_hallucination():
    """Ensures missing price or rating uses transparent baselines and does NOT fabricate 5-star ratings."""
    raw_products = [
        {
            "name": "Unrated Product",
            "price": "₹15,000",
            "ram": "8GB",
            "storage": "128GB",
            # No rating provided
        }
    ]

    req = ProductRequirements(category="smartphone", budget_max=20000)
    response = rank_extracted_items(raw_products, req)
    assert response.passed_count == 1

    item = response.ranked_items[0]
    assert item.rating is None
    # Missing rating receives neutral 65 baseline, not 100
    assert item.score_breakdown.rating_score == 65.0


# ── 6. DEDUPLICATION ────────────────────────────────────────────────────────

def test_record_deduplication():
    """Verifies that duplicate items across pages or DOM selectors are deduplicated and merged."""
    raw_items = [
        {
            "name": "Apple iPhone 13 (128GB)",
            "price": "₹49,999",
            "link": "https://www.amazon.in/dp/B09G9BL5CP",
            "rating": "4.6"
        },
        {
            "name": "Apple iPhone 13 (128GB)",
            "price": "₹49,999",
            "link": "https://www.amazon.in/dp/B09G9BL5CP",
            "ram": "4GB"  # Complementary field
        }
    ]

    deduped = deduplicate_items(raw_items)
    assert len(deduped) == 1
    # Complementary field was retained
    assert deduped[0]["ram"] == "4GB"
    assert deduped[0]["rating"] == "4.6"


# ── 7. URL SANITIZATION ─────────────────────────────────────────────────────

def test_url_sanitization():
    """Rejects javascript:, data: URIs and malformed links while keeping valid HTTP/HTTPS URLs."""
    domain, clean = clean_source_url("javascript:alert(1)")
    assert domain == ""
    assert clean == ""

    domain, clean = clean_source_url("https://www.amazon.in/dp/B09G9BL5CP")
    assert domain == "amazon.in"
    assert clean == "https://www.amazon.in/dp/B09G9BL5CP"


# ── 8. HOTEL RESEARCH & CRITERIA ISOLATION ──────────────────────────────────

def test_hotel_research_and_scoring():
    """Verifies that hotel research compares hotel-specific attributes and enforces hotel criteria."""
    raw_hotels = [
        {
            "name": "Grand Palace Hotel & Resort",
            "price": "₹4,200",
            "rating": "4.6",
            "location": "Central Jaipur",
            "amenities": ["Free Wi-Fi", "Swimming Pool", "Complimentary Breakfast"],
            "url": "https://www.booking.com/hotel/in/grand-palace.html"
        },
        {
            "name": "Luxury Heritage Villa",
            "price": "₹9,500",  # Exceeds budget
            "rating": "4.8",
            "location": "Jaipur",
            "amenities": ["Free Wi-Fi", "Pool", "Spa"]
        },
        {
            "name": "Budget Motel",
            "price": "₹1,800",
            "rating": "3.2",  # Below min rating
            "location": "Jaipur",
            "amenities": ["Free Wi-Fi"]
        }
    ]

    req = HotelRequirements(
        category="hotel",
        budget_max=6000,
        min_rating=4.0,
        required_amenities=["wifi", "pool"]
    )

    response = rank_extracted_items(raw_hotels, req)

    # 1 hotel passes, 2 disqualified (one for budget, one for rating)
    assert response.passed_count == 1
    assert response.disqualified_count == 2

    top = response.top_pick
    assert top is not None
    assert top.name == "Grand Palace Hotel & Resort"
    assert top.category == "hotel"
    assert top.score_breakdown.amenities_score > 0

    disqualified_names = [d.name for d in response.disqualified_items]
    assert "Luxury Heritage Villa" in disqualified_names
    assert "Budget Motel" in disqualified_names


def test_product_vs_hotel_criteria_isolation():
    """Ensures that product requirements do not bleed into hotel rankings, and vice versa."""
    raw_hotels = [
        {
            "name": "Seaside Resort",
            "price": "₹3,500",
            "rating": "4.5",
            "amenities": ["Free Wi-Fi", "Pool"]
        }
    ]

    # Hotel requirements must not check RAM/storage
    hotel_req = HotelRequirements(category="hotel", budget_max=5000)
    response = rank_extracted_items(raw_hotels, hotel_req)
    assert response.passed_count == 1
    assert response.ranked_items[0].ram_gb is None
    assert "amenities" in response.weights_used
    assert "specs" not in response.weights_used


# ── 9. API ENDPOINT INTEGRATION ─────────────────────────────────────────────

def test_api_recommend_rank_endpoint():
    """Verifies the POST /recommend/rank endpoint end-to-end via TestClient."""
    payload = {
        "items": [
            {
                "name": "Redmi Note 13 5G",
                "price": "₹17,999",
                "ram": "8GB",
                "storage": "256GB",
                "rating": "4.3",
                "brand": "Xiaomi",
                "url": "https://www.amazon.in/dp/B0CQG5D36V"
            },
            {
                "name": "Flagship Ultra Pro",
                "price": "₹39,999",
                "ram": "12GB",
                "storage": "256GB",
                "rating": "4.8"
            }
        ],
        "requirements": {
            "category": "smartphone",
            "budget_max": 25000,
            "minimum_ram": 8
        }
    }

    resp = client.post("/recommend/rank", json=payload)
    assert resp.status_code == 200

    data = resp.json()
    assert data["category"] == "smartphone"
    assert data["total_extracted"] == 2
    assert data["passed_count"] == 1
    assert data["disqualified_count"] == 1
    assert data["top_pick"]["name"] == "Redmi Note 13 5G"
    assert data["top_pick"]["final_score"] > 0
    assert "weights_used" in data


# ── 10. FLIGHT EXTRACTION & RANKING (MAKEMYTRIP / TRAVEL ENGINE) ─────────────

def test_makemytrip_flight_extraction_and_ranking():
    """
    Verifies that flight listings from MakeMyTrip (e.g. IndiGo DEL-BOM, Air India AI 2587)
    are parsed into structured items, verified against travel budgets, and ranked deterministically.
    """
    raw_flights = [
        {
            "name": "IndiGo 6E-6004 (DEL → BOM)",
            "title": "IndiGo 6E-6004 (DEL → BOM)",
            "category": "flight",
            "airline": "IndiGo",
            "flight_code": "6E-6004",
            "route": "DEL → BOM",
            "price": "₹ 15,987",
            "rating": "4.2",
            "specs": "05h 10m • 1 stop • Dep: 05:10 Arr: 10:20",
            "stops": "1 stop",
            "duration": "05h 10m",
            "url": "https://www.makemytrip.com/flight/search?itinerary=DEL-BOM-25/11/2026"
        },
        {
            "name": "Air India AI 2587 (DEL → BOM)",
            "title": "Air India AI 2587 (DEL → BOM)",
            "category": "flight",
            "airline": "Air India",
            "flight_code": "AI 2587",
            "route": "DEL → BOM",
            "price": "₹ 16,814",
            "rating": "4.4",
            "specs": "02h 25m • Non stop • Dep: 12:00 Arr: 14:25",
            "stops": "Non stop",
            "duration": "02h 25m",
            "url": "https://www.makemytrip.com/flight/search?itinerary=DEL-BOM-25/11/2026"
        }
    ]

    req = FlightRequirements(
        category="flight",
        budget_max=20000,
        preferred_airlines=["Air India", "IndiGo"]
    )

    response = rank_extracted_items(raw_flights, req)

    assert response.category == "flight"
    assert response.total_extracted == 2
    assert response.passed_count == 2
    assert response.disqualified_count == 0

    # Both must pass without requiring RAM or smartphone specs
    for item in response.ranked_items:
        assert item.passed_filters is True
        assert item.numeric_price in [15987.0, 16814.0]
        assert item.airline in ["IndiGo", "Air India"]
        assert item.verification_status == "Verified Factual Grounding"
        assert item.score_breakdown is not None
        assert item.score_breakdown.final_score > 60

    # Air India has non-stop flight (02h 25m) + preferred carrier
    assert response.top_pick is not None


def test_flight_budget_and_stop_constraints():
    """Verifies that budget caps and non-stop constraints disqualify non-compliant flights."""
    raw_flights = [
        {
            "name": "Expensive International Carrier",
            "category": "flight",
            "price": "₹ 45,000",
            "stops": "Non stop",
            "specs": "Non stop • 02h 15m"
        },
        {
            "name": "Connecting Flight with 2 Stops",
            "category": "flight",
            "price": "₹ 8,500",
            "stops": "2 stops",
            "specs": "09h 40m • 2 stops"
        },
        {
            "name": "Affordable Direct Flight",
            "category": "flight",
            "price": "₹ 9,200",
            "stops": "Non stop",
            "specs": "02h 10m • Non stop"
        }
    ]

    # Constraint: max budget 20,000 and 0 stops (non-stop only)
    req = FlightRequirements(
        category="flight",
        budget_max=20000,
        max_stops=0
    )

    response = rank_extracted_items(raw_flights, req)

    assert response.total_extracted == 3
    assert response.passed_count == 1
    assert response.disqualified_count == 2

    # Top pick must be Affordable Direct Flight
    assert response.top_pick.name == "Affordable Direct Flight"
    assert response.top_pick.numeric_price == 9200.0

    # Disqualified items check
    disq_names = [d.name for d in response.disqualified_items]
    assert "Expensive International Carrier" in disq_names
    assert "Connecting Flight with 2 Stops" in disq_names


def test_api_recommend_flight_endpoint():
    """Verifies that POST /recommend/rank supports category='flight' via HTTP API."""
    payload = {
        "items": [
            {
                "title": "SpiceJet SG 8169 (DEL → BOM)",
                "category": "flight",
                "price": "₹12,450",
                "specs": "02h 20m • Non stop",
                "airline": "SpiceJet"
            }
        ],
        "category": "flight",
        "requirements": {
            "budget_max": 15000
        }
    }

    resp = client.post("/recommend/rank", json=payload)
    assert resp.status_code == 200
    data = resp.json()
    assert data["category"] == "flight"
    assert data["passed_count"] == 1
    assert data["top_pick"]["numeric_price"] == 12450.0
