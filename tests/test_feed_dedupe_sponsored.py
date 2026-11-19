"""Chronological feeds, dedupe identity and default sponsored exclusion."""
from datetime import datetime, timedelta, timezone

from fastapi.testclient import TestClient

from fastapi_backend.main import app
from fastapi_backend.feed import build_feed, is_feed_request, parse_timestamp
from fastapi_backend.recommendation import deduplicate_items

client = TestClient(app)


def test_parse_timestamp_formats():
    now = datetime(2026, 1, 10, 12, tzinfo=timezone.utc)
    assert parse_timestamp("2026-01-09T10:00:00Z") == datetime(2026, 1, 9, 10, tzinfo=timezone.utc)
    assert parse_timestamp("3 hours ago", now) == now - timedelta(hours=3)
    assert parse_timestamp("Tue, 06 Jan 2026 08:00:00 GMT").day == 6
    assert parse_timestamp(1767996000000).year == 2026  # epoch ms
    assert parse_timestamp("garbage") is None


def test_feed_is_newest_first_deduped_and_undated_last():
    items = [
        {"title": "Old", "url": "https://n.com/a", "published_at": "2026-01-01T00:00:00Z"},
        {"title": "New", "url": "https://n.com/b?utm_source=x", "published_at": "2026-01-05T00:00:00Z"},
        {"title": "New", "url": "https://n.com/b", "published_at": "2026-01-05T00:00:00Z"},  # duplicate
        {"title": "Ad", "url": "https://n.com/ad", "published_at": "2026-01-09T00:00:00Z", "is_sponsored": True},
        {"title": "Undated", "url": "https://n.com/u"},
        {"title": "Mid", "url": "https://n.com/c", "published_at": "2026-01-03T00:00:00Z"},
    ]
    feed = build_feed(items)
    assert [i["title"] for i in feed["ranked_items"]] == ["New", "Mid", "Old", "Undated"]
    assert feed["sponsored_excluded"] == 1 and feed["undated_count"] == 1
    assert feed["ranked_items"][-1]["published_at"] is None  # never fabricated


def test_feed_intent_detection_does_not_hijack_recommendations():
    assert is_feed_request(None, "show me the latest news about AI")
    assert is_feed_request("news", None)
    assert not is_feed_request("smartphone", "Find best smartphone under 30000")


def test_rank_endpoint_feed_vs_recommendation():
    feed_items = [
        {"title": "A", "url": "https://x.com/1", "published_at": "2026-01-01T00:00:00Z"},
        {"title": "B", "url": "https://x.com/2", "published_at": "2026-02-01T00:00:00Z"},
    ]
    res = client.post("/recommend/rank", json={"items": feed_items, "category": "news"}).json()
    assert [i["title"] for i in res["ranked_items"]] == ["B", "A"]

    phones = [
        {"name": "Ad Phone 8GB RAM 128GB", "price": "₹ 10,000", "rating": 4.9, "is_sponsored": True,
         "url": "https://amazon.in/dp/AD"},
        {"name": "Real Phone 8GB RAM 128GB", "price": "₹ 15,000", "rating": 4.2,
         "url": "https://amazon.in/dp/REAL"},
    ]
    res = client.post("/recommend/rank", json={
        "items": phones, "category": "smartphone", "user_goal": "best smartphone under 20000"}).json()
    assert [i["name"] for i in res["ranked_items"]] == ["Real Phone 8GB RAM 128GB"]
    assert any(i["name"].startswith("Ad Phone") for i in res["disqualified_items"])
    # explicit opt-in still possible
    res = client.post("/recommend/rank", json={
        "items": phones, "category": "smartphone", "requirements": {"exclude_sponsored": False},
        "user_goal": "best smartphone under 20000"}).json()
    assert len(res["ranked_items"]) == 2 and res["top_pick"]["name"].startswith("Real")


def test_dedupe_ignores_tracking_params_but_keeps_distinct_listings():
    items = [
        {"title": "Moto G", "url": "https://www.amazon.in/dp/B1?ref=x&tag=y"},
        {"title": "Moto G", "url": "https://amazon.in/dp/B1/"},
        {"title": "Moto G", "url": "https://flipkart.com/p/9"},      # other retailer: kept
        {"title": "Moto G", "url": "https://amazon.in/dp/B2"},       # other listing: kept
    ]
    assert len(deduplicate_items(items)) == 3
