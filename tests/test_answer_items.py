"""Answer-derived tiles: items come from the agent's answer, search-result pages become sources."""
from fastapi.testclient import TestClient

from fastapi_backend.main import app
from fastapi_backend.answer_items import parse_answer_items

client = TestClient(app)

ANSWER = """### Detailed Recommendations
1. Poco M8 5G (8GB RAM + 256GB Storage)
- Rating & Reviews: 4.8★ (1.9K reviews)
- Price: ₹27,975.00
- Battery & Charging: 5,520 mAh battery
- Purchase Platform: [Amazon](https://amazon.in/dp/POCO)
2. Redmi 17 5G (8GB RAM + 128GB Storage)
- Rating & Reviews: Not specified
- Price: ₹26,999.00 – ₹28,999.00
- Purchase Platform: [Reliance Digital](https://reliancedigital.in/redmi)

### Comparison Table
| Name / Model | Price & Direct Link | Rating | Key Highlights | Best For |
|---|---|---|---|---|
| **Poco M8 5G** (8GB/256GB) | [₹27,975 (Amazon)](https://amazon.in/dp/POCO) | 4.8★ (1.9K) | AMOLED | Premium |
| **Motorola g57 Power 5G** (8GB/128GB) | [₹23,149 (Amazon)](https://amazon.in/dp/MOTO) | 5.0★ (49) | 7000 mAh | Battery |
"""

SERP = [
    {"title": "Which one is the best smartphone under 30K? : r/techIndia", "price": "Rs. 30",
     "numeric_price": 30, "record_kind": "search_result", "category": "smartphone",
     "url": "https://reddit.com/r/techIndia/x"},
    {"title": "Mobile Phones Between 25000 to 30000 (Nov 2026)", "price": "Check site",
     "record_kind": "search_result", "category": "smartphone", "url": "https://91mobiles.com/list"},
]


def test_parse_table_and_list_merge():
    items = {i["name"]: i for i in parse_answer_items(ANSWER)}
    assert len(items) == 3
    poco = next(i for n, i in items.items() if n.startswith("Poco M8 5G"))
    assert poco["numeric_price"] == 27975.0 and poco["rating"] == 4.8
    assert poco["link"] == "https://amazon.in/dp/POCO" and poco["source_website"] == "amazon.in"
    moto = next(i for n, i in items.items() if n.startswith("Motorola"))
    assert moto["numeric_price"] == 23149.0


def test_instructions_and_prose_are_not_items():
    steps = "1. Open the website\n2. Click apply\n3. Submit the form\nHope this helps."
    assert parse_answer_items(steps) == []
    assert parse_answer_items("") == [] and parse_answer_items(None) == []


def test_rank_uses_answer_items_and_demotes_search_results_to_sources():
    res = client.post("/recommend/rank", json={
        "items": SERP, "category": "smartphone", "answer_text": ANSWER,
        "user_goal": "best smartphone under 30000 rupees",
        "requirements": {"budget_max": 30000}}).json()
    names = [i["name"] for i in res["ranked_items"]]
    assert names and all("r/techIndia" not in n and "Between 25000" not in n for n in names)
    assert any(n.startswith("Poco") for n in names)
    assert {s["url"] for s in res["sources"]} == {"https://reddit.com/r/techIndia/x", "https://91mobiles.com/list"}


def test_search_results_still_shown_when_nothing_better_exists():
    res = client.post("/recommend/rank", json={
        "items": SERP, "category": "smartphone", "user_goal": "best smartphone"}).json()
    assert res["ranked_items"] or res["disqualified_items"]
    assert res.get("sources") == []


def test_untagged_threads_and_listicles_are_detected_without_domain_vocabulary():
    from fastapi_backend.page_kind import looks_like_page_about_items as about
    assert about({"title": "Which one is the best smartphone under 30K? : r/techIndia", "numeric_price": 30,
                  "snippet": "I have been doing some research and these"}, 30000)
    assert about({"title": "Mobile Phones Between 25000 to 30000 (Nov 2026)"})
    assert about({"title": "Top 10 laptops for students 2026"})
    assert about({"title": "Best hotels in Goa under 5000?"})
    assert not about({"title": "Motorola Edge 50 Fusion 5G (8GB RAM, 128GB)", "numeric_price": 20849, "ram": 8}, 30000)
    assert not about({"title": "Senior Python Developer", "company": "Acme"}, None)


def test_untagged_thread_does_not_become_top_pick():
    untagged = [{"title": "Which one is the best smartphone under 30K? : r/techIndia", "price": "Rs. 30",
                 "numeric_price": 30, "snippet": "I have been doing some research",
                 "url": "https://reddit.com/r/techIndia/x"}]
    res = client.post("/recommend/rank", json={
        "items": untagged, "category": "smartphone", "answer_text": ANSWER,
        "user_goal": "best smartphone under 30000 rupees", "requirements": {"budget_max": 30000}}).json()
    assert res["top_pick"] and "r/techIndia" not in res["top_pick"]["name"]
    assert all("r/techIndia" not in i["name"] for i in res["ranked_items"])
    assert res["sources"]
