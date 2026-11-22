import pytest
from datetime import datetime, timezone
from fastapi_backend.schemas import UniversalRecord
from fastapi_backend.recommendation import (
    rank_extracted_items,
    ProductRequirements,
    FlightRequirements,
    HotelRequirements,
    JobRequirements,
    MovieRequirements,
    NormalizedItem,
    normalize_price,
    normalize_rating,
    deduplicate_items
)


class TestUniversalRecordSchema:
    """Test Suite for Phase 2 Section C Universal Record Schema & Data Quality Rules"""

    def test_universal_record_all_fields(self):
        record = UniversalRecord(
            record_id="prod_101",
            category="product",
            title="Samsung Galaxy S24 Ultra",
            description="Flagship smartphone with Snapdragon 8 Gen 3 and 200MP camera",
            structured_attributes={"ram": 12, "storage": 256, "color": "Titanium Gray"},
            price=129999.0,
            currency="INR",
            raw_price="₹1,29,999",
            rating=4.7,
            source_url="https://www.samsung.com/in/smartphones/galaxy-s24-ultra/",
            source_website="Samsung Official Store",
            evidence={"selector": "div.product-card"},
            sponsored_status=False,
            validation_status="valid"
        )
        assert record.record_id == "prod_101"
        assert record.category == "product"
        assert record.price == 129999.0
        assert record.rating == 4.7
        assert record.sponsored_status is False
        assert record.validation_status == "valid"

    def test_missing_price_and_rating_distinguished_from_zero(self):
        """Phase 2 Section D: Never invent missing prices/ratings. Distinguish missing from zero."""
        num_price, currency, fmt = normalize_price(None)
        assert num_price is None
        assert fmt == ""

        zero_price, _, _ = normalize_price(0.0)
        assert zero_price == 0.0

        num_rating = normalize_rating(None, "")
        assert num_rating is None

    def test_deduplication_of_records(self):
        """Phase 2 Section D: Strict deduplication by title/link/specs."""
        raw_records = [
            {"title": "Samsung Galaxy M34 5G", "price": "₹18,999", "link": "https://amazon.in/dp/B01"},
            {"title": "Samsung Galaxy M34 5G", "price": "₹18,999", "link": "https://amazon.in/dp/B01"},
            {"title": "Samsung Galaxy M34 5G", "price": "₹18,999", "link": "https://amazon.in/dp/B01?ref=xyz"},
            {"title": "Apple iPhone 15", "price": "₹69,999", "link": "https://amazon.in/dp/B02"}
        ]
        unique = deduplicate_items(raw_records)
        assert len(unique) == 2
        assert unique[0]["title"] == "Samsung Galaxy M34 5G"
        assert unique[1]["title"] == "Apple iPhone 15"


class TestMandatorySamsungScenario:
    """
    Phase 2 Section G: Mandatory End-to-End Test Scenario
    'Find me the best Samsung smartphones under ₹23,000'
    """

    @pytest.fixture
    def smartphone_dataset(self):
        return [
            {
                "title": "Samsung Galaxy M34 5G (Prism Blue, 8GB RAM, 128GB Storage)",
                "brand": "Samsung",
                "price": "₹18,999",
                "ram": "8 GB",
                "storage": "128 GB",
                "rating": "4.3",
                "url": "https://www.amazon.in/dp/B0CBV4B3P3",
                "sponsored_status": False
            },
            {
                "title": "Samsung Galaxy A15 5G (Blue, 6GB RAM, 128GB Storage)",
                "brand": "Samsung",
                "price": "₹19,499",
                "ram": "6 GB",
                "storage": "128 GB",
                "rating": "4.1",
                "url": "https://www.amazon.in/dp/B0CP27H811",
                "sponsored_status": False
            },
            {
                "title": "Samsung Galaxy F54 5G (Meteor Blue, 8GB RAM, 256GB)",
                "brand": "Samsung",
                "price": "₹24,999",
                "ram": "8 GB",
                "storage": "256 GB",
                "rating": "4.4",
                "url": "https://www.flipkart.com/samsung-galaxy-f54-5g",
                "sponsored_status": False
            },
            {
                "title": "Xiaomi Redmi Note 13 5G (Prism Gold, 6GB RAM, 128GB)",
                "brand": "Xiaomi",
                "price": "₹17,999",
                "ram": "6 GB",
                "storage": "128 GB",
                "rating": "4.2",
                "url": "https://www.amazon.in/dp/B0CQ2W5Z7D",
                "sponsored_status": False
            },
            {
                "title": "Realme Narzo 60 5G (Mars Orange, 8GB RAM, 128GB)",
                "brand": "Realme",
                "price": "₹16,499",
                "ram": "8 GB",
                "storage": "128 GB",
                "rating": "4.2",
                "url": "https://www.amazon.in/dp/B0C77J2K9R",
                "sponsored_status": False
            },
            {
                "title": "Sponsored: Samsung Galaxy M14 5G (Berry Blue, 6GB RAM, 128GB)",
                "brand": "Samsung",
                "price": "₹13,990",
                "ram": "6 GB",
                "storage": "128 GB",
                "rating": "4.2",
                "url": "https://www.amazon.in/dp/B0BZX1R76H",
                "sponsored_status": True
            },
            {
                "title": "Sponsored: OnePlus Nord CE 3 5G (Aqua Surge, 8GB, 128GB)",
                "brand": "OnePlus",
                "price": "₹24,999",
                "ram": "8 GB",
                "storage": "128 GB",
                "rating": "4.4",
                "url": "https://www.amazon.in/dp/B0C3NW8Z54",
                "sponsored_status": True
            }
        ]

    def test_strict_budget_enforcement_and_brand_partitioning(self, smartphone_dataset):
        """
        Enforce:
        1. Strict budget max ₹23,000 (items > ₹23k are disqualified).
        2. Preferred brand Samsung prioritized in ranked_items.
        3. Non-Samsung under ₹23k placed into alternative_items.
        4. Sponsored items marked and bounded by budget (OnePlus Nord CE 3 > ₹23k must be disqualified).
        5. Score breakdown provides transparent rationale.
        """
        reqs = ProductRequirements(
            budget_max=23000.0,
            preferred_brands=["Samsung"]
        )

        response = rank_extracted_items(smartphone_dataset, reqs)

        # 1. Budget enforcement
        disqualified_names = [it.name for it in response.disqualified_items]
        assert any("Galaxy F54" in name for name in disqualified_names)
        assert any("OnePlus Nord CE 3" in name for name in disqualified_names)

        for disq in response.disqualified_items:
            assert disq.numeric_price > 23000.0
            assert any("Exceeds maximum budget" in r for r in disq.disqualification_reasons)
            assert disq.final_score == 0.0

        # 2. Preferred brand prioritization
        assert len(response.ranked_items) > 0
        for item in response.ranked_items:
            assert item.brand.lower() == "samsung"
            assert item.numeric_price <= 23000.0

        # Top pick must be a Samsung smartphone within budget
        assert response.top_pick is not None
        assert response.top_pick.brand == "Samsung"
        assert response.top_pick.numeric_price <= 23000.0
        assert response.top_pick.score_breakdown is not None
        assert response.top_pick.score_breakdown.final_score > 0
        assert "Matches preferred brand" in response.top_pick.requirements_satisfied[0] or any("Matches preferred brand" in r for r in response.top_pick.requirements_satisfied)

        # 3. Alternatives separation: non-Samsung under ₹23,000 separated
        assert len(response.alternative_items) > 0
        alt_brands = [it.brand for it in response.alternative_items]
        assert "Xiaomi" in alt_brands
        assert "Realme" in alt_brands
        for alt in response.alternative_items:
            assert alt.numeric_price <= 23000.0
            assert alt.is_alternative is True

        # 4. Sponsored item verification: Galaxy M14 has sponsored_status: True
        sponsored_samsung = next(it for it in response.ranked_items if "Galaxy M14" in it.name)
        assert sponsored_samsung.sponsored_status is True
        assert sponsored_samsung.numeric_price == 13990.0


class TestFlightScenario:
    """Phase 2 Section G: Flight Search Scenario (Delhi to Mumbai MakeMyTrip Simulation)"""

    @pytest.fixture
    def make_my_trip_flight_dataset(self):
        return [
            {
                "title": "IndiGo 6E-6004 (DEL → BOM)",
                "category": "flight",
                "airline": "IndiGo",
                "flight_code": "6E-6004",
                "route": "DEL → BOM",
                "departure_time": "05:10",
                "arrival_time": "10:20",
                "duration": "05h 10m",
                "stops": "1 stop - IDR",
                "price": "₹ 15,987",
                "rating": None,
                "url": "https://www.makemytrip.com/flight/search?itinerary=DEL-BOM-25/11/2026"
            },
            {
                "title": "Air India AI 2587 (DEL → BOM)",
                "category": "flight",
                "airline": "Air India",
                "flight_code": "AI 2587",
                "route": "DEL → BOM",
                "departure_time": "12:00",
                "arrival_time": "14:25",
                "duration": "02h 25m",
                "stops": "Non stop",
                "price": "₹ 16,814",
                "rating": None,
                "url": "https://www.makemytrip.com/flight/search?itinerary=DEL-BOM-25/11/2026"
            },
            {
                "title": "SpiceJet SG 8169 (DEL → BOM)",
                "category": "flight",
                "airline": "SpiceJet",
                "flight_code": "SG 8169",
                "route": "DEL → BOM",
                "departure_time": "18:30",
                "arrival_time": "21:00",
                "duration": "02h 30m",
                "stops": "Non stop",
                "price": "₹ 15,450",
                "rating": None,
                "url": "https://www.makemytrip.com/flight/search?itinerary=DEL-BOM-25/11/2026"
            }
        ]

    def test_flight_scoring_and_non_stop_preference(self, make_my_trip_flight_dataset):
        """Verify flight ranking prioritizes direct flight and preferred airline"""
        reqs = FlightRequirements(
            preferred_airlines=["Air India"],
            max_stops=0
        )

        response = rank_extracted_items(make_my_trip_flight_dataset, reqs, category="flight")

        assert response.total_extracted == 3
        # 1 stop flight (IndiGo) should be disqualified because max_stops=0 (Non-stop only required)
        disq_codes = [it.flight_code for it in response.disqualified_items]
        assert "6E-6004" in disq_codes

        # Passing non-stop flights: preferred carrier in ranked_items, other carrier in alternative_items
        passing_codes = [it.flight_code for it in response.ranked_items]
        assert "AI 2587" in passing_codes

        alt_codes = [it.flight_code for it in response.alternative_items]
        assert "SG 8169" in alt_codes

        # Air India gets preferred airline bonus
        top_flight = response.top_pick
        assert top_flight is not None
        assert top_flight.airline == "Air India"
        assert top_flight.flight_code == "AI 2587"
        assert "Non stop" in (top_flight.stops or "")
        assert top_flight.score_breakdown is not None
        assert "Air India" in top_flight.score_breakdown.rationale


class TestJobScenario:
    """Phase 2 Section C & G: Universal Job Listing Extraction & Evaluation"""

    @pytest.fixture
    def jobs_dataset(self):
        return [
            {
                "title": "Software Development Engineer - Fresher",
                "category": "job",
                "company": "Google",
                "location": "Bangalore",
                "experience": "Fresher / 0-1 years",
                "price": "₹ 18,00,000",
                "url": "https://www.linkedin.com/jobs/view/101"
            },
            {
                "title": "Junior Python Developer",
                "category": "job",
                "company": "Infosys",
                "location": "Pune",
                "experience": "0-1 years",
                "price": "₹ 4,50,000",
                "url": "https://www.naukri.com/job/202"
            },
            {
                "title": "Senior Staff Architect",
                "category": "job",
                "company": "Amazon",
                "location": "Hyderabad",
                "experience": "8+ years",
                "price": "₹ 55,00,000",
                "url": "https://www.amazon.jobs/303"
            }
        ]

    def test_job_portal_fresher_matching(self, jobs_dataset):
        reqs = JobRequirements(
            role="Software Engineer",
            max_experience_years=1,
            min_salary=400000.0
        )

        response = rank_extracted_items(jobs_dataset, reqs, category="job")

        # Senior architect disqualified because 8+ years > 1 year
        disq_titles = [it.name for it in response.disqualified_items]
        assert any("Senior Staff Architect" in t for t in disq_titles)

        # Freshers pass
        passing_titles = [it.name for it in response.ranked_items]
        assert any("Software Development Engineer - Fresher" in t for t in passing_titles)
        assert any("Junior Python Developer" in t for t in passing_titles)

        # Top pick is Google SDE
        assert response.top_pick.company == "Google"
        assert response.top_pick.numeric_price == 1800000.0


class TestMovieScenario:
    """Phase 2 Section C & G: Movie Ticket & Showtime Evaluation"""

    @pytest.fixture
    def movie_dataset(self):
        return [
            {
                "title": "Oppenheimer",
                "category": "movie",
                "cinema": "PVR Director's Cut",
                "showtime": "08:15 PM",
                "movie_format": "IMAX 70mm",
                "price": "₹ 950",
                "url": "https://in.bookmyshow.com/cinema/1"
            },
            {
                "title": "Oppenheimer",
                "category": "movie",
                "cinema": "INOX Megaplex",
                "showtime": "07:30 PM",
                "movie_format": "IMAX 3D",
                "price": "₹ 450",
                "url": "https://in.bookmyshow.com/cinema/2"
            },
            {
                "title": "Oppenheimer",
                "category": "movie",
                "cinema": "Cinepolis",
                "showtime": "11:00 AM",
                "movie_format": "2D Standard",
                "price": "₹ 200",
                "url": "https://in.bookmyshow.com/cinema/3"
            }
        ]

    def test_movie_ticket_budget_and_format_selection(self, movie_dataset):
        reqs = MovieRequirements(
            movie_title="Oppenheimer",
            budget_max=600.0,
            preferred_format="IMAX",
            time_preference="evening"
        )

        response = rank_extracted_items(movie_dataset, reqs, category="movie")

        # PVR Director's Cut disqualified because ₹950 > ₹600
        disq = [it.cinema for it in response.disqualified_items]
        assert "PVR Director's Cut" in disq

        # INOX Megaplex is evening IMAX under ₹600 (₹450)
        assert response.top_pick.cinema == "INOX Megaplex"
        assert response.top_pick.numeric_price == 450.0
