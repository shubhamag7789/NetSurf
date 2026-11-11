"""
NetSurf Personalization Engine (Phase 3)
Categorizes user goals, extracts explicit task constraints, merges saved user preferences,
and enforces the strict priority rule:
Explicit instructions in the current task ALWAYS override saved preferences.
"""

import re
import json
from typing import Dict, Any, List, Optional, Tuple

SHOPPING_KEYWORDS = [
    "phone", "smartphone", "mobile", "laptop", "macbook", "pc", "computer", "tv", "television",
    "monitor", "tablet", "ipad", "headphone", "earphone", "earbuds", "watch", "smartwatch",
    "camera", "shoes", "sneakers", "clothing", "apparel", "buy", "purchase", "shopping",
    "price", "cost", "cheap", "best deal", "discount", "amazon", "flipkart", "specs", "ram", "storage"
]

TRAVEL_KEYWORDS = [
    "hotel", "resort", "hostel", "stay", "room", "accommodation", "flight", "ticket",
    "travel", "trip", "tour", "vacation", "holiday", "destination", "booking.com", "airbnb",
    "makemytrip", "agoda", "expedia", "checkin", "checkout", "guest"
]

KNOWN_BRANDS = [
    "apple", "iphone", "samsung", "oneplus", "google", "pixel", "xiaomi", "redmi",
    "realme", "vivo", "oppo", "motorola", "moto", "nothing", "iqoo", "sony", "asus",
    "dell", "hp", "lenovo", "acer", "msi", "lg", "boat", "noise", "nike", "adidas", "puma"
]

def classify_task_category(goal: str) -> str:
    """Classifies the task into 'shopping', 'travel', or 'general'."""
    lower = goal.lower()
    
    # Check shopping
    shopping_score = sum(1 for kw in SHOPPING_KEYWORDS if kw in lower)
    # Check travel
    travel_score = sum(1 for kw in TRAVEL_KEYWORDS if kw in lower)
    
    if travel_score > shopping_score and travel_score > 0:
        return "travel"
    if shopping_score > 0:
        return "shopping"
    return "general"

def extract_explicit_criteria(goal: str, category: str) -> Dict[str, Any]:
    """
    Extracts explicit constraints mentioned directly in the user's natural language goal.
    """
    lower = goal.lower()
    criteria: Dict[str, Any] = {}

    # 1. Budget extraction
    # Patterns: under 30000, under 30k, below 25000, max 20000, under ₹30,000, under $500
    budget_pattern = r'(?:under|below|less than|max(?:imum)?|budget(?:\s*of)?|around|upto|up to)\s*(?:₹|rs\.?|\$|€|£)?\s*([0-9]+(?:,[0-9]+)*(?:\.[0-9]+)?|\d+k)\b'
    m_budget = re.search(budget_pattern, lower)
    if m_budget:
        val_str = m_budget.group(1).replace(",", "")
        if val_str.endswith("k"):
            criteria["budget"] = float(val_str[:-1]) * 1000
        else:
            try:
                criteria["budget"] = float(val_str)
            except ValueError:
                pass

    if category == "shopping":
        # Brands
        found_brands = []
        for brand in KNOWN_BRANDS:
            if re.search(rf'\b{brand}\b', lower):
                found_brands.append(brand.capitalize())
        if found_brands:
            criteria["brands"] = found_brands

        # RAM: e.g. 8gb ram, 12 gb, 8 gig
        m_ram = re.search(r'\b([0-9]{1,2})\s*(?:gb|gig)?\s*ram\b', lower)
        if not m_ram:
            m_ram = re.search(r'\b([0-9]{1,2})\s*gb\b', lower)
        if m_ram:
            try:
                criteria["ram"] = int(m_ram.group(1))
            except ValueError:
                pass

        # Storage: e.g. 128gb storage, 256gb rom, 512gb ssd
        m_storage = re.search(r'\b(64|128|256|512|1024|1\s*tb|2\s*tb)\s*(?:gb|tb)?\s*(?:storage|rom|ssd|internal)?\b', lower)
        if m_storage:
            s_val = m_storage.group(1).replace(" ", "")
            if "tb" in s_val:
                criteria["storage"] = 1024 * (int(s_val.replace("tb", "")) or 1)
            else:
                try:
                    criteria["storage"] = int(s_val.replace("gb", ""))
                except ValueError:
                    pass

    elif category == "travel":
        # Destination: e.g. in Goa, in Mumbai, in Paris, to Jaipur
        m_dest = re.search(r'\b(?:in|to|near|at)\s+([A-Za-z\s]{3,25}?)(?:\s+(?:under|for|with|from|between|hotel|resort|flight)|$)', goal)
        if m_dest:
            dest = m_dest.group(1).strip()
            # filter out non-destination words
            if dest.lower() not in ("the", "a", "my", "any", "good", "best", "budget", "luxury"):
                criteria["destination"] = dest.title()

        # Rating: e.g. 4 star, 4.5+ rating
        m_rating = re.search(r'\b([3-5](?:\.[0-9])?)\s*(?:\+|star|stars|rating)\b', lower)
        if m_rating:
            try:
                criteria["min_rating"] = float(m_rating.group(1))
            except ValueError:
                pass

        # Guests: e.g. 2 guests, for 4 people
        m_guests = re.search(r'\b([0-9]{1,2})\s*(?:guests?|people|persons?|adults?)\b', lower)
        if m_guests:
            try:
                criteria["num_guests"] = int(m_guests.group(1))
            except ValueError:
                pass

    return criteria

def merge_preferences_with_goal(goal: str, user_preferences: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
    """
    Combines task instructions with saved user preferences.
    ENFORCES STRICT PRIORITY:
    Any constraint explicitly mentioned in the current instruction takes precedence over saved preferences.
    """
    category = classify_task_category(goal)
    explicit = extract_explicit_criteria(goal, category)

    prefs = user_preferences or {}
    shopping_pref = prefs.get("shopping") or {}
    travel_pref = prefs.get("travel") or {}
    general_pref = prefs.get("general") or {}

    applied: Dict[str, Any] = {}
    overrides: Dict[str, Any] = {}
    effective_clauses = []

    currency_symbol = "₹" if general_pref.get("default_currency", "INR") == "INR" else (general_pref.get("default_currency") or "₹")

    if category == "shopping":
        # 1. Budget
        if "budget" in explicit:
            applied["budget"] = explicit["budget"]
            overrides["budget"] = {
                "used": explicit["budget"],
                "saved_preference": shopping_pref.get("max_budget"),
                "reason": "Explicit instruction overrides saved preference"
            }
        elif shopping_pref.get("max_budget"):
            applied["budget"] = shopping_pref["max_budget"]
            effective_clauses.append(f"under {currency_symbol}{int(applied['budget'])}")

        # 2. Brands
        if "brands" in explicit:
            applied["brands"] = explicit["brands"]
            overrides["brands"] = {
                "used": explicit["brands"],
                "saved_preference": shopping_pref.get("preferred_brands"),
                "reason": "Explicit instruction overrides saved preference"
            }
        elif shopping_pref.get("preferred_brands") and len(shopping_pref["preferred_brands"]) > 0:
            applied["brands"] = shopping_pref["preferred_brands"]
            effective_clauses.append(f"Brand: {', '.join(applied['brands'])}")

        # 3. RAM
        if "ram" in explicit:
            applied["min_ram"] = explicit["ram"]
            overrides["min_ram"] = {
                "used": explicit["ram"],
                "saved_preference": shopping_pref.get("min_ram"),
                "reason": "Explicit instruction overrides saved preference"
            }
        elif shopping_pref.get("min_ram"):
            applied["min_ram"] = shopping_pref["min_ram"]
            effective_clauses.append(f"Min {applied['min_ram']}GB RAM")

        # 4. Storage
        if "storage" in explicit:
            applied["min_storage"] = explicit["storage"]
            overrides["min_storage"] = {
                "used": explicit["storage"],
                "saved_preference": shopping_pref.get("min_storage"),
                "reason": "Explicit instruction overrides saved preference"
            }
        elif shopping_pref.get("min_storage"):
            applied["min_storage"] = shopping_pref["min_storage"]
            effective_clauses.append(f"Min {applied['min_storage']}GB Storage")

        # 5. Priorities
        priorities = shopping_pref.get("priorities") or ["price", "performance", "battery", "camera", "rating"]
        applied["priorities"] = priorities
        if priorities and not any(p in goal.lower() for p in ("camera", "battery", "gaming", "performance")):
            top_priorities = priorities[:2]
            effective_clauses.append(f"prioritizing {', '.join(top_priorities)}")

    elif category == "travel":
        # 1. Destination
        if "destination" in explicit:
            applied["destination"] = explicit["destination"]
            overrides["destination"] = {
                "used": explicit["destination"],
                "saved_preference": travel_pref.get("preferred_destinations"),
                "reason": "Explicit instruction overrides saved preference"
            }
        elif travel_pref.get("preferred_destinations") and len(travel_pref["preferred_destinations"]) > 0:
            applied["destination"] = travel_pref["preferred_destinations"][0]
            effective_clauses.append(f"in {applied['destination']}")

        # 2. Hotel Budget
        if "budget" in explicit:
            applied["budget"] = explicit["budget"]
            applied["hotel_budget"] = explicit["budget"]
            overrides["budget"] = {
                "used": explicit["budget"],
                "saved_preference": travel_pref.get("hotel_budget"),
                "reason": "Explicit instruction overrides saved preference"
            }
        elif travel_pref.get("hotel_budget"):
            applied["budget"] = travel_pref["hotel_budget"]
            applied["hotel_budget"] = travel_pref["hotel_budget"]
            effective_clauses.append(f"under {currency_symbol}{int(applied['budget'])}/night")

        # 3. Rating
        if "min_rating" in explicit:
            applied["min_rating"] = explicit["min_rating"]
            applied["min_hotel_rating"] = explicit["min_rating"]
            overrides["min_rating"] = {
                "used": explicit["min_rating"],
                "saved_preference": travel_pref.get("min_hotel_rating"),
                "reason": "Explicit instruction overrides saved preference"
            }
        elif travel_pref.get("min_hotel_rating"):
            applied["min_rating"] = travel_pref["min_hotel_rating"]
            applied["min_hotel_rating"] = travel_pref["min_hotel_rating"]
            effective_clauses.append(f"{applied['min_rating']}+ star rating")

        # 4. Guests
        if "num_guests" in explicit:
            applied["num_guests"] = explicit["num_guests"]
            overrides["num_guests"] = {
                "used": explicit["num_guests"],
                "saved_preference": travel_pref.get("num_guests"),
                "reason": "Explicit instruction overrides saved preference"
            }
        elif travel_pref.get("num_guests"):
            applied["num_guests"] = travel_pref["num_guests"]
            effective_clauses.append(f"for {applied['num_guests']} guests")

        # 5. Amenities
        if travel_pref.get("amenities") and len(travel_pref["amenities"]) > 0:
            applied["amenities"] = travel_pref["amenities"]
            top_amenities = travel_pref["amenities"][:3]
            effective_clauses.append(f"with {', '.join(top_amenities)}")

    # Construct the effective goal string
    if effective_clauses:
        effective_goal = f"{goal.strip()} ({', '.join(effective_clauses)})"
    else:
        effective_goal = goal.strip()

    return {
        "category": category,
        "original_goal": goal.strip(),
        "effective_goal": effective_goal,
        "explicit_criteria": explicit,
        "applied_preferences": applied,
        "overrides": overrides
    }
