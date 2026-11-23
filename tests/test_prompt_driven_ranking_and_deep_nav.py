import pytest
from fastapi_backend.planner import classify_task_request, build_structured_plan, ActionType
from fastapi_backend.recommendation import (
    parse_prompt_intent_and_criteria,
    rank_extracted_items,
    ProductRequirements,
    FlightRequirements
)

# ── 1. TEST PROMPT-DRIVEN INTENT & CRITERIA EXTRACTION ───────────────────────

def test_prompt_intent_and_criteria_extraction():
    prompt = "Find the best smartphone with 8GB RAM, 256GB storage, and 5G under 30000 with best specs at lowest price"
    crit = parse_prompt_intent_and_criteria(prompt)
    
    assert crit["budget_max"] == 30000.0
    assert "8GB RAM" in crit["target_specs"]
    assert any("256GB" in s for s in crit["target_specs"])
    assert "5G" in crit["target_specs"]
    assert crit["optimization_goal"] == "best_specs_lowest_price"
    assert "specs" in crit["priorities"]
    assert "price" in crit["priorities"]


def test_prompt_cheapest_flight_criteria():
    prompt = "Find cheapest non-stop flight from Delhi to Mumbai under 6000"
    crit = parse_prompt_intent_and_criteria(prompt)
    
    assert crit["budget_max"] == 6000.0
    assert crit["optimization_goal"] == "cheapest"


# ── 2. TEST PROMPT-DRIVEN RANKING & SPEC-TO-PRICE VALUE WINNER ──────────────

def test_best_specs_lowest_price_wins_over_higher_priced():
    """
    Given a prompt requesting best specs at lowest price under 30,000:
    - Candidate A: 8GB RAM, 256GB ROM, 5G at ₹22,999 (High specs, low price)
    - Candidate B: 8GB RAM, 128GB ROM, 5G at ₹28,999 (Lower specs, higher price)
    - Candidate C: 4GB RAM, 64GB ROM at ₹18,999 (Low specs, cheap)
    Candidate A must be ranked #1 because it delivers the best specs-to-price value.
    """
    prompt = "Find best smartphone with 8GB RAM and 5G under 30000 with best specs at lowest price"
    raw_items = [
        {
            "id": "cand_b",
            "name": "Phone B 5G (8GB RAM, 128GB Storage)",
            "price": "₹ 28,999",
            "rating": 4.2,
            "specs": "8GB RAM • 128GB ROM • 5G",
            "source_website": "Amazon India",
            "url": "https://www.amazon.in/dp/B002"
        },
        {
            "id": "cand_a",
            "name": "Phone A 5G (8GB RAM, 256GB Storage)",
            "price": "₹ 22,999",
            "rating": 4.3,
            "specs": "8GB RAM • 256GB ROM • 5G • 120Hz AMOLED",
            "source_website": "Flipkart",
            "url": "https://www.flipkart.com/p/B001"
        },
        {
            "id": "cand_c",
            "name": "Phone C (4GB RAM, 64GB Storage)",
            "price": "₹ 18,999",
            "rating": 3.9,
            "specs": "4GB RAM • 64GB ROM",
            "source_website": "Croma",
            "url": "https://www.croma.com/p/B003"
        }
    ]

    result = rank_extracted_items(
        raw_items=raw_items,
        requirements={"prompt_context": prompt, "budget_max": 30000.0},
        category="smartphone"
    )

    assert len(result.ranked_items) >= 2
    top_pick = result.ranked_items[0]
    
    # Phone A must be the top recommendation
    assert top_pick.id == "cand_a"
    assert top_pick.numeric_price == 22999.0
    assert top_pick.ram_gb == 8
    assert top_pick.storage_gb == 256
    assert top_pick.final_score > result.ranked_items[1].final_score
    # Rationale explains specs-to-price value
    assert "value" in top_pick.score_breakdown.rationale.lower() or "best" in top_pick.score_breakdown.rationale.lower()


# ── 3. TEST MULTI-SOURCE NORMALIZATION PRESERVES PLATFORMS ──────────────────

def test_multi_source_items_preserve_distinct_platforms():
    multi_site_items = [
        {"id": "p1", "name": "Redmi Note 13", "price": "₹16,999", "source_website": "Amazon India", "url": "https://www.amazon.in/item1"},
        {"id": "p2", "name": "Realme 12 5G", "price": "₹15,499", "source_website": "Flipkart", "url": "https://www.flipkart.com/item2"},
        {"id": "p3", "name": "OnePlus Nord CE4", "price": "₹21,999", "source_website": "Croma", "url": "https://www.croma.com/item3"},
        {"id": "p4", "name": "Samsung Galaxy M34", "price": "₹18,999", "source_website": "Reliance Digital", "url": "https://www.reliancedigital.in/item4"}
    ]

    result = rank_extracted_items(
        raw_items=multi_site_items,
        requirements={"budget_max": 25000.0},
        category="smartphone"
    )

    sources = {item.source_domain for item in result.ranked_items}
    # Confirms distinct platform domains are preserved across multi-site aggregation
    assert len(sources) >= 3


# ── 4. TEST DEEP WEB NAVIGATION CLASSIFICATION & PLAN BUILDER ───────────────

def test_detail_seeking_inquiries_classified_as_deep_authoritative_research():
    inquiries = [
        "Find admission details of IIT Bombay",
        "What are the admission requirements for Stanford University",
        "Find the cancellation policy and refund rules of MakeMyTrip",
        "Find syllabus and eligibility criteria for GATE exam",
        "Get documentation and procedure for passport renewal in India"
    ]

    for q in inquiries:
        classification = classify_task_request(q)
        assert classification.task_category == "research", f"Failed for query: {q}"
        assert classification.user_intent == "DEEP_AUTHORITATIVE_RESEARCH", f"Failed for query: {q}"


def test_deep_authoritative_research_plan_has_auto_destination_navigation():
    goal = "Find admission details of IIT Bombay"
    classification = classify_task_request(goal)
    plan = build_structured_plan(goal)

    assert plan.task_classification.user_intent == "DEEP_AUTHORITATIVE_RESEARCH"
    assert len(plan.phases) == 4
    
    # Confirm Phase 1 searches Google
    phase1_actions = [a for a in plan.actions if a.phase_id == 1]
    assert phase1_actions[0].action == ActionType.NAVIGATE
    assert "google.com/search" in phase1_actions[0].params.url

    # Confirm Phase 2 navigates directly into the authoritative destination website
    phase2_actions = [a for a in plan.actions if a.phase_id == 2]
    nav_destination_action = [a for a in phase2_actions if a.action == ActionType.NAVIGATE][0]
    assert nav_destination_action.params.url == "auto_destination"

    # Confirm Phase 3 extracts grounded content from the destination website
    phase3_actions = [a for a in plan.actions if a.phase_id == 3]
    extract_action = [a for a in phase3_actions if a.action == ActionType.EXTRACT][0]
    assert extract_action is not None

    # Confirm Phase 4 finishes with synthesis citing official site
    phase4_actions = [a for a in plan.actions if a.phase_id == 4]
    done_action = [a for a in phase4_actions if a.action == ActionType.DONE][0]
    assert done_action is not None


# ── 5. TEST MULTI-SITE CROSS-PLATFORM SHOPPING EXPLORATION ───────────────────

def test_general_shopping_query_builds_multi_site_plan():
    """
    When searching for products (e.g. 'best smartphone under 30000', 'cheapest ps5')
    without pinning a single site, NetSurf MUST plan visits to multiple top e-commerce
    sites (Amazon + Flipkart) to extract and compare real candidates across platforms.
    """
    queries = [
        "best smartphone under 30000",
        "find cheapest ps5 console",
        "buy noise cancelling headphones"
    ]
    for q in queries:
        plan = build_structured_plan(q)
        assert len(plan.phases) == 4
        # Phase 1: Store 1 (Amazon)
        phase1_nav = [a for a in plan.actions if a.phase_id == 1 and a.action == ActionType.NAVIGATE][0]
        assert "amazon.in" in phase1_nav.params.url
        phase1_extract = [a for a in plan.actions if a.phase_id == 1 and a.action == ActionType.EXTRACT]
        assert len(phase1_extract) >= 1

        # Phase 2: Store 2 (Flipkart)
        phase2_nav = [a for a in plan.actions if a.phase_id == 2 and a.action == ActionType.NAVIGATE][0]
        assert "flipkart.com" in phase2_nav.params.url
        phase2_extract = [a for a in plan.actions if a.phase_id == 2 and a.action == ActionType.EXTRACT]
        assert len(phase2_extract) >= 1

        # Phase 4: Synthesis & Verified Comparison
        phase4_done = [a for a in plan.actions if a.phase_id == 4 and a.action == ActionType.DONE][0]
        assert phase4_done is not None


def test_pinned_store_query_targets_single_platform():
    """
    When a specific store is explicitly named (e.g. 'on Amazon'),
    the plan must specifically target that store.
    """
    plan = build_structured_plan("best smartphone under 30000 on Amazon")
    nav_actions = [a for a in plan.actions if a.action == ActionType.NAVIGATE]
    assert all("amazon.in" in a.params.url for a in nav_actions)


# ── 6. TEST SPONSORED DISQUALIFICATION & ACCESSORY FILTERING ─────────────────

def test_sponsored_items_never_ranked_as_top_recommendation():
    """
    Sponsored listings must NEVER appear as the #1 top recommendation.
    Even with lower prices or higher ratings, organic candidates take strict precedence.
    And when exclude_sponsored policy is active, sponsored listings are disqualified.
    """
    prompt = "Find best smartphone under 30000"
    raw_items = [
        {
            "id": "cand_sponsored",
            "name": "Sponsored Brand X Pro (8GB RAM, 256GB)",
            "price": "₹ 19,999",
            "rating": 4.8,
            "specs": "8GB RAM • 256GB ROM",
            "is_sponsored": True,
            "sponsored_status": True,
            "source_website": "Amazon India",
            "url": "https://www.amazon.in/dp/SPON01"
        },
        {
            "id": "cand_organic",
            "name": "Organic Galaxy M34 (8GB RAM, 128GB)",
            "price": "₹ 21,999",
            "rating": 4.4,
            "specs": "8GB RAM • 128GB ROM",
            "is_sponsored": False,
            "source_website": "Amazon India",
            "url": "https://www.amazon.in/dp/ORG01"
        }
    ]

    # 1. By default, organic candidate strictly outranks sponsored candidate as top recommendation
    result = rank_extracted_items(
        raw_items=raw_items,
        requirements={"prompt_context": prompt, "budget_max": 30000.0},
        category="smartphone"
    )

    assert result.top_pick is not None
    assert result.top_pick.id == "cand_organic"
    assert result.top_pick.name == "Organic Galaxy M34 (8GB RAM, 128GB)"
    assert result.ranked_items[0].id == "cand_organic"

    # 2. When explicit exclude_sponsored is requested, sponsored listing is fully disqualified
    result_excluded = rank_extracted_items(
        raw_items=raw_items,
        requirements={"prompt_context": prompt, "budget_max": 30000.0, "exclude_sponsored": True},
        category="smartphone"
    )
    assert any(it.id == "cand_sponsored" for it in result_excluded.disqualified_items)
    disq_item = next(it for it in result_excluded.disqualified_items if it.id == "cand_sponsored")
    assert any("sponsored" in r.lower() for r in disq_item.disqualification_reasons)
    assert result_excluded.top_pick.id == "cand_organic"


def test_accessories_disqualified_when_searching_for_smartphones():
    """
    A low-priced accessory (e.g. phone cover, case, tempered glass) must NOT
    crowd out the target product or become the #1 recommendation.
    """
    prompt = "Find best smartphone under 30000 with best specs at lowest price"
    raw_items = [
        {
            "id": "item_phone_cover",
            "name": "Spigen Rugged Armor Phone Back Cover Case for Galaxy M34",
            "price": "₹ 899",
            "rating": 4.6,
            "specs": "Shock absorption • TPU cover",
            "source_website": "Amazon India",
            "url": "https://www.amazon.in/dp/CASE01"
        },
        {
            "id": "item_actual_phone",
            "name": "Galaxy M34 5G Smartphone (8GB RAM, 128GB Storage)",
            "price": "₹ 21,999",
            "rating": 4.3,
            "specs": "8GB RAM • 128GB ROM • 5G",
            "source_website": "Amazon India",
            "url": "https://www.amazon.in/dp/PHONE01"
        }
    ]

    result = rank_extracted_items(
        raw_items=raw_items,
        requirements={"prompt_context": prompt, "budget_max": 30000.0},
        category="smartphone"
    )

    # Phone cover must be disqualified because it is an accessory
    disqualified_ids = {it.id for it in result.disqualified_items}
    assert "item_phone_cover" in disqualified_ids
    cover_item = next(it for it in result.disqualified_items if it.id == "item_phone_cover")
    assert any("accessory" in r.lower() for r in cover_item.disqualification_reasons)

    # Actual phone must be #1 recommendation despite having a higher price than the cover
    assert result.top_pick is not None
    assert result.top_pick.id == "item_actual_phone"
    assert result.top_pick.numeric_price == 21999.0


