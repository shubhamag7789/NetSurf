"""
NetSurf Deterministic Recommendation & Web Extraction Engine.

Responsibilities:
- Normalizes extracted web data (prices, currencies, RAM, storage, ratings, brands).
- Validates extracted items against strict Pydantic schemas.
- Applies deterministic hard constraint filters (budget caps, minimum specs).
- Calculates deterministic category-specific weighted scores with explainable breakdowns.
- Ranks products and hotels without relying on LLM/Gemini hallucinations.
- Deduplicates records and sanitizes source links.
"""

from __future__ import annotations
import re
import hashlib
import math
from datetime import datetime, timezone
from typing import Dict, Any, List, Optional, Tuple, Union
from pydantic import BaseModel, Field

# ── 1. KNOWN BRANDS & DICTIONARIES ──────────────────────────────────────────

CANONICAL_TECH_BRANDS = {
    "apple": "Apple",
    "iphone": "Apple",
    "samsung": "Samsung",
    "galaxy": "Samsung",
    "google": "Google",
    "pixel": "Google",
    "oneplus": "OnePlus",
    "xiaomi": "Xiaomi",
    "mi": "Xiaomi",
    "redmi": "Xiaomi",
    "poco": "POCO",
    "realme": "Realme",
    "motorola": "Motorola",
    "moto": "Motorola",
    "vivo": "Vivo",
    "iqoo": "iQOO",
    "oppo": "Oppo",
    "nothing": "Nothing",
    "asus": "Asus",
    "rog": "Asus ROG",
    "lenovo": "Lenovo",
    "dell": "Dell",
    "hp": "HP",
    "acer": "Acer",
    "sony": "Sony",
}

CANONICAL_HOTEL_AMENITIES = {
    "wifi": ["wifi", "wi-fi", "wireless", "internet", "free wifi"],
    "breakfast": ["breakfast", "free breakfast", "complimentary breakfast", "morning meal", "buffet"],
    "pool": ["pool", "swimming pool", "infinity pool", "outdoor pool", "indoor pool"],
    "parking": ["parking", "free parking", "valet parking", "self parking"],
    "gym": ["gym", "fitness", "fitness center", "workout", "health club"],
    "ac": ["ac", "a/c", "air conditioning", "climate control"],
    "spa": ["spa", "sauna", "steam room", "massage", "wellness"],
    "restaurant": ["restaurant", "dining", "bar", "lounge", "cafe", "bistro"],
}

# Default Category Weights
DEFAULT_PRODUCT_WEIGHTS = {
    "price": 0.35,
    "specs": 0.30,
    "rating": 0.20,
    "preference": 0.15,
}

DEFAULT_HOTEL_WEIGHTS = {
    "price": 0.30,
    "rating": 0.35,
    "amenities": 0.25,
    "preference": 0.10,
}

DEFAULT_FLIGHT_WEIGHTS = {
    "price": 0.40,
    "duration": 0.25,
    "rating": 0.20,
    "preference": 0.15,
}

DEFAULT_JOB_WEIGHTS = {
    "role": 0.35,
    "salary": 0.30,
    "experience": 0.20,
    "company": 0.15,
}

DEFAULT_MOVIE_WEIGHTS = {
    "price": 0.35,
    "showtime": 0.30,
    "format": 0.20,
    "cinema": 0.15,
}

# ── 2. PYDANTIC SCHEMAS ─────────────────────────────────────────────────────

class ProductRequirements(BaseModel):
    category: str = "smartphone"
    budget_max: Optional[float] = None
    budget_min: Optional[float] = None
    minimum_ram: Optional[int] = None
    minimum_storage: Optional[int] = None
    preferred_brands: Optional[List[str]] = Field(default_factory=list)
    excluded_brands: Optional[List[str]] = Field(default_factory=list)
    exclusive_brands: Optional[bool] = False
    exclude_sponsored: Optional[bool] = False
    min_rating: Optional[float] = None
    preferred_sellers: Optional[List[str]] = Field(default_factory=list)
    priorities: Optional[List[str]] = Field(default_factory=list)
    weights: Optional[Dict[str, float]] = None
    target_specs: Optional[List[str]] = Field(default_factory=list)
    optimization_goal: Optional[str] = None
    prompt_context: Optional[str] = None


class HotelRequirements(BaseModel):
    category: str = "hotel"
    budget_max: Optional[float] = None
    budget_min: Optional[float] = None
    min_rating: Optional[float] = None
    location: Optional[str] = None
    required_amenities: Optional[List[str]] = Field(default_factory=list)
    preferred_categories: Optional[List[str]] = Field(default_factory=list)
    exclude_sponsored: Optional[bool] = False
    weights: Optional[Dict[str, float]] = None
    target_specs: Optional[List[str]] = Field(default_factory=list)
    optimization_goal: Optional[str] = None
    prompt_context: Optional[str] = None


class FlightRequirements(BaseModel):
    category: str = "flight"
    budget_max: Optional[float] = None
    budget_min: Optional[float] = None
    preferred_airlines: Optional[List[str]] = Field(default_factory=list)
    excluded_airlines: Optional[List[str]] = Field(default_factory=list)
    max_stops: Optional[int] = None
    preferred_departure_times: Optional[List[str]] = Field(default_factory=list)
    exclude_sponsored: Optional[bool] = False
    priorities: Optional[List[str]] = Field(default_factory=list)
    weights: Optional[Dict[str, float]] = None
    target_specs: Optional[List[str]] = Field(default_factory=list)
    optimization_goal: Optional[str] = None
    prompt_context: Optional[str] = None


class JobRequirements(BaseModel):
    category: str = "job"
    role: Optional[str] = None
    company: Optional[str] = None
    location: Optional[str] = None
    min_salary: Optional[float] = None
    max_experience_years: Optional[int] = None
    required_skills: Optional[List[str]] = Field(default_factory=list)
    employment_type: Optional[str] = None
    exclude_sponsored: Optional[bool] = False
    weights: Optional[Dict[str, float]] = None
    target_specs: Optional[List[str]] = Field(default_factory=list)
    optimization_goal: Optional[str] = None
    prompt_context: Optional[str] = None


class MovieRequirements(BaseModel):
    category: str = "movie"
    movie_title: Optional[str] = None
    cinema: Optional[str] = None
    date: Optional[str] = None
    preferred_format: Optional[str] = None
    preferred_language: Optional[str] = None
    budget_max: Optional[float] = None
    time_preference: Optional[str] = None
    exclude_sponsored: Optional[bool] = False
    weights: Optional[Dict[str, float]] = None
    target_specs: Optional[List[str]] = Field(default_factory=list)
    optimization_goal: Optional[str] = None
    prompt_context: Optional[str] = None


class ScoreBreakdown(BaseModel):
    price_score: float = 0.0
    spec_score: Optional[float] = None
    amenities_score: Optional[float] = None
    rating_score: float = 0.0
    preference_score: float = 0.0
    final_score: float = 0.0
    weight_config: Dict[str, float] = Field(default_factory=dict)
    rationale: str = ""


class NormalizedItem(BaseModel):
    id: str
    name: str
    category: str
    raw_price: str = ""
    numeric_price: Optional[float] = None
    currency: str = "INR"
    formatted_price: str = ""
    brand: Optional[str] = None
    ram_gb: Optional[int] = None
    storage_gb: Optional[int] = None
    processor: Optional[str] = None
    rating: Optional[float] = None
    location: Optional[str] = None
    amenities: List[str] = Field(default_factory=list)
    airline: Optional[str] = None
    flight_code: Optional[str] = None
    route: Optional[str] = None
    duration: Optional[str] = None
    stops: Optional[str] = None
    departure_time: Optional[str] = None
    arrival_time: Optional[str] = None
    company: Optional[str] = None
    experience: Optional[str] = None
    salary: Optional[str] = None
    cinema: Optional[str] = None
    showtime: Optional[str] = None
    movie_format: Optional[str] = None
    specs: Optional[str] = None
    availability: str = "Available"
    source_domain: str = ""
    source_url: str = ""
    product_url: str = ""
    extracted_at: str = Field(default_factory=lambda: datetime.now(timezone.utc).isoformat())
    evidence: Dict[str, Any] = Field(default_factory=dict)
    sponsored_status: bool = False
    validation_status: str = "valid"
    is_alternative: bool = False
    passed_filters: bool = True
    disqualification_reasons: List[str] = Field(default_factory=list)
    requirements_satisfied: List[str] = Field(default_factory=list)
    requirements_violated: List[str] = Field(default_factory=list)
    verification_status: str = "Verified Factual Grounding"
    score_breakdown: Optional[ScoreBreakdown] = None
    applied_preferences: List[str] = Field(default_factory=list)
    final_score: float = 0.0
    rank: int = 0

    @property
    def record_id(self) -> str:
        return self.id

    @property
    def title(self) -> str:
        return self.name

    @property
    def price(self) -> Optional[float]:
        return self.numeric_price


class RankResponse(BaseModel):
    category: str
    total_extracted: int
    passed_count: int
    disqualified_count: int
    ranked_items: List[NormalizedItem]
    alternative_items: List[NormalizedItem] = Field(default_factory=list)
    disqualified_items: List[NormalizedItem] = Field(default_factory=list)
    weights_used: Dict[str, float]
    top_pick: Optional[NormalizedItem] = None
    summary: str


# ── 3. PROMPT INTENT & DYNAMIC CRITERIA PARSER ─────────────────────────────

def parse_prompt_intent_and_criteria(prompt: str) -> Dict[str, Any]:
    """
    Dynamically extracts requirements, target specifications, and optimization goals
    directly from the user's natural language prompt.
    Adapts scoring strategy to match exactly what the user requested.
    """
    if not prompt:
        return {}
    lower = prompt.lower().strip()
    res: Dict[str, Any] = {
        "target_specs": [],
        "priorities": [],
        "prompt_context": prompt
    }

    # 1. Budget Max / Min from prompt (e.g. "under 23,000", "below 25k", "max 50000")
    budget_m = re.search(r'(?:under|below|less than|max(?:imum)?|budget of|within)\s*(?:₹|rs\.?|inr)?\s*([\d,]+k|\d[\d,]+)', lower)
    if budget_m:
        raw_b = budget_m.group(1).replace(",", "").replace("k", "000")
        try:
            res["budget_max"] = float(raw_b)
        except ValueError:
            pass

    min_budget_m = re.search(r'(?:above|over|more than|at least|minimum)\s*(?:₹|rs\.?|inr)?\s*([\d,]+k|\d[\d,]+)', lower)
    if min_budget_m:
        raw_mb = min_budget_m.group(1).replace(",", "").replace("k", "000")
        try:
            res["budget_min"] = float(raw_mb)
        except ValueError:
            pass

    # 2. Specific requested specs in prompt (RAM, Storage, 5G, Camera, Display)
    ram_m = re.search(r'\b([468]|12|16)\s*(?:gb)?\s*ram\b', lower)
    if ram_m:
        res["minimum_ram"] = int(ram_m.group(1))
        res["target_specs"].append(f"{ram_m.group(1)}GB RAM")

    storage_m = re.search(r'\b(64|128|256|512|1024)\s*(?:gb)?\s*(?:storage|rom|internal)\b', lower)
    if storage_m:
        res["minimum_storage"] = int(storage_m.group(1))
        res["target_specs"].append(f"{storage_m.group(1)}GB Storage")

    for feat in ["5g", "amoled", "oled", "120hz", "fast charging", "telephoto", "curved display", "snapdragon", "water resistant", "ip68"]:
        if feat in lower:
            res["target_specs"].append(feat.upper() if len(feat) <= 6 else feat.title())

    # 3. Dynamic Optimization Goal & Weight Strategy based on user prompt
    if any(k in lower for k in ("best spec", "best specs", "highest spec", "value for money", "highest performance", "best hardware")):
        res["optimization_goal"] = "best_specs_lowest_price"
        res["weights"] = {"specs": 0.45, "price": 0.40, "rating": 0.15}
        res["priorities"].extend(["specs", "performance", "price"])
    elif any(k in lower for k in ("cheapest", "lowest price", "lowest fare", "most affordable", "minimum price")):
        res["optimization_goal"] = "cheapest"
        res["weights"] = {"price": 0.65, "specs": 0.20, "rating": 0.15}
        res["priorities"].append("price")
    elif any(k in lower for k in ("highest rated", "top rated", "best rated", "customer satisfaction", "top reviews")):
        res["optimization_goal"] = "highest_rated"
        res["weights"] = {"rating": 0.50, "specs": 0.30, "price": 0.20}
        res["priorities"].append("rating")
    elif any(k in lower for k in ("fastest", "shortest duration", "quickest")):
        res["optimization_goal"] = "fastest"
        res["weights"] = {"duration": 0.50, "price": 0.35, "rating": 0.15}
    elif any(k in lower for k in ("non-stop", "direct")):
        res["max_stops"] = 0

    return res


# ── 4. NORMALIZATION ENGINE ─────────────────────────────────────────────────

def normalize_price(raw_price: Any) -> Tuple[Optional[float], str, str]:
    """
    Parses numerical price, standard 3-letter currency code, and formatted display string.
    Supports INR (₹, Rs, Rs.), USD ($), EUR (€), GBP (£), and comma-delimited numbers.
    Preserves raw price without hallucination.
    """
    if raw_price is None:
        return None, "INR", ""
    
    if isinstance(raw_price, (int, float)):
        val = float(raw_price)
        return val, "INR", f"₹{val:,.2f}"

    text = str(raw_price).strip()
    if not text:
        return None, "INR", ""

    # Detect currency
    currency = "INR"
    if "$" in text or re.search(r'\busd\b', text, re.IGNORECASE):
        currency = "USD"
    elif "€" in text or re.search(r'\beur(?:o)?\b', text, re.IGNORECASE):
        currency = "EUR"
    elif "£" in text or re.search(r'\bgbp\b', text, re.IGNORECASE):
        currency = "GBP"
    elif "₹" in text or re.search(r'\b(?:rs\.?|inr)\b', text, re.IGNORECASE):
        currency = "INR"

    # Extract digits with possible commas and decimals
    # Matches patterns like 24,999 or 24999.00 or 1,299
    match = re.search(r'(?:[₹$€£]|Rs\.?|INR|USD|EUR|GBP)?\s*([\d,]+(?:\.\d{1,2})?)', text, re.IGNORECASE)
    if not match:
        # Fallback digits extraction
        clean_digits = re.sub(r'[^\d.]', '', text)
        if clean_digits:
            try:
                num = float(clean_digits)
                symbol = "$" if currency == "USD" else ("€" if currency == "EUR" else ("£" if currency == "GBP" else "₹"))
                return num, currency, f"{symbol}{num:,.2f}"
            except ValueError:
                pass
        return None, currency, text

    clean_str = match.group(1).replace(",", "")
    try:
        val = float(clean_str)
        symbol = "$" if currency == "USD" else ("€" if currency == "EUR" else ("£" if currency == "GBP" else "₹"))
        formatted = f"{symbol}{val:,.0f}" if val.is_integer() else f"{symbol}{val:,.2f}"
        return val, currency, formatted
    except ValueError:
        return None, currency, text


def normalize_ram(raw_ram: Any, title: str = "", snippet: str = "") -> Optional[int]:
    """
    Extracts RAM and normalizes to an integer count of Gigabytes (GB).
    Distinguishes between RAM and ROM/Storage (e.g. '8GB RAM 128GB ROM').
    """
    combined = f"{raw_ram or ''} {title or ''} {snippet or ''}".lower()

    # Explicit RAM patterns: 8GB RAM, 8 GB RAM, 16GB LPDDR, 12 Gigs RAM
    explicit_match = re.search(r'(\d{1,3})\s*(?:gb|gigs?|gib)\s*(?:lpddr[\dx]*\s*)?(?:ram|memory)', combined)
    if explicit_match:
        return int(explicit_match.group(1))

    # If raw_ram explicitly given (e.g. '8', '8GB', '16 GB')
    if raw_ram:
        m = re.search(r'(\d{1,3})\s*(?:gb)?', str(raw_ram), re.IGNORECASE)
        if m:
            val = int(m.group(1))
            if val in [2, 3, 4, 6, 8, 12, 16, 24, 32, 64]:
                return val

    # Contextual pattern: '8GB/128GB' or '8+128' (first is usually RAM)
    pair_match = re.search(r'(\d{1,2})\s*gb?\s*(?:/|\+|\|)\s*(\d{2,4})\s*gb?', combined)
    if pair_match:
        return int(pair_match.group(1))

    # General RAM pattern if near the word RAM
    if "ram" in combined:
        ram_near = re.search(r'(?:ram\s*:?\s*)(\d{1,3})\s*(?:gb)?', combined)
        if ram_near:
            return int(ram_near.group(1))

    return None


def normalize_storage(raw_storage: Any, title: str = "", snippet: str = "") -> Optional[int]:
    """
    Extracts internal storage/ROM and normalizes to an integer count of Gigabytes (GB).
    Converts 1 TB -> 1024 GB, 2 TB -> 2048 GB.
    """
    combined = f"{raw_storage or ''} {title or ''} {snippet or ''}".lower()

    # TB storage pattern
    tb_match = re.search(r'(\d+)\s*(?:tb|terabyte)\s*(?:ssd|storage|rom)?', combined)
    if tb_match:
        return int(tb_match.group(1)) * 1024

    # Explicit ROM/Storage pattern: 128GB ROM, 256 GB Storage, 512GB SSD
    explicit_match = re.search(r'(\d{2,4})\s*(?:gb|gigs?)\s*(?:rom|storage|ssd|internal|emmc|ufs)', combined)
    if explicit_match:
        return int(explicit_match.group(1))

    # Contextual pair pattern: '8GB/256GB' (second is storage)
    pair_match = re.search(r'(\d{1,2})\s*gb?\s*(?:/|\+|\|)\s*(\d{2,4})\s*(?:gb)?', combined)
    if pair_match:
        return int(pair_match.group(2))

    # If raw_storage explicitly given
    if raw_storage:
        m = re.search(r'(\d+)\s*(?:gb|tb)?', str(raw_storage), re.IGNORECASE)
        if m:
            val = int(m.group(1))
            if "tb" in str(raw_storage).lower():
                return val * 1024
            if val in [32, 64, 128, 256, 512, 1024, 2048]:
                return val

    # Common storage size matches in phone titles (e.g. 128GB, 256GB, 512GB)
    common_match = re.search(r'\b(64|128|256|512)\s*(?:gb)\b', combined)
    if common_match:
        return int(common_match.group(1))

    return None


def normalize_brand(raw_brand: Any, title: str = "") -> Optional[str]:
    """
    Canonicalizes brand name using exact dictionary mapping.
    """
    candidates = []
    if raw_brand:
        candidates.append(str(raw_brand).strip().lower())
    if title:
        candidates.extend(title.lower().split())

    for word in candidates:
        cleaned = re.sub(r'[^a-z0-9]', '', word)
        if cleaned in CANONICAL_TECH_BRANDS:
            return CANONICAL_TECH_BRANDS[cleaned]

    # Partial prefix match
    combined = f"{raw_brand or ''} {title or ''}".lower()
    for key, canonical in CANONICAL_TECH_BRANDS.items():
        if re.search(rf'\b{re.escape(key)}\b', combined):
            return canonical

    if raw_brand:
        return str(raw_brand).strip().title()
    return None


def normalize_rating(raw_rating: Any, snippet: str = "") -> Optional[float]:
    """
    Normalizes rating to a float scale of 0.0 to 5.0.
    Handles '4.3 out of 5', '4.3/5', '4.3 ★', '4.3', or '8.6/10' (scales down to 5).
    """
    combined = f"{raw_rating or ''} {snippet or ''}".lower()

    # /10 scale detection (e.g. 8.5/10)
    ten_scale = re.search(r'([\d.]+)\s*/\s*10', combined)
    if ten_scale:
        try:
            val = float(ten_scale.group(1))
            return round(min(5.0, val / 2.0), 2)
        except ValueError:
            pass

    # /5 or out of 5 scale (e.g. 4.3 out of 5, 4.3/5)
    five_scale = re.search(r'([\d.]+)\s*(?:/\s*5|out of\s*5|stars?|★)', combined)
    if five_scale:
        try:
            val = float(five_scale.group(1))
            if 0.0 <= val <= 5.0:
                return round(val, 2)
        except ValueError:
            pass

    # Standalone float between 1.0 and 5.0 in raw_rating
    if raw_rating:
        m = re.search(r'\b([1-5](?:\.\d{1,2})?)\b', str(raw_rating))
        if m:
            return round(float(m.group(1)), 2)

    return None


def normalize_hotel_amenities(raw_amenities: Any, text: str = "") -> List[str]:
    """
    Detects and canonicalizes hotel amenities from explicit lists or text descriptions.
    """
    found = set()
    combined = f"{raw_amenities or ''} {text or ''}".lower()

    for canonical, keywords in CANONICAL_HOTEL_AMENITIES.items():
        for kw in keywords:
            if re.search(rf'\b{re.escape(kw)}\b', combined):
                found.add(canonical)
                break

    return sorted(list(found))


def clean_source_url(raw_url: str) -> Tuple[str, str]:
    """
    Validates URL protocol and extracts host domain.
    Rejects javascript: or data: URIs.
    """
    if not raw_url or not isinstance(raw_url, str):
        return "", ""

    url = raw_url.strip()
    if not (url.startswith("http://") or url.startswith("https://")):
        return "", ""

    # Extract domain
    m = re.search(r'https?://(?:www\.)?([^/:]+)', url)
    domain = m.group(1) if m else ""
    return domain, url


# ── 4. DETERMINISTIC HARD FILTERING ─────────────────────────────────────────

def _infer_query_category_from_prompt(prompt: str) -> Optional[str]:
    """
    Infers what main product category the user is asking about from their natural
    language prompt. Used to disqualify cross-category contamination in results.
    Returns a canonical category string or None if ambiguous.
    """
    if not prompt:
        return None
    lower = prompt.lower()
    if re.search(r'\b(flight|flights|airline|airfare|fly to|fly from|itinerary)\b', lower):
        return "flight"
    if re.search(r'\b(hotel|resort|stay|accommodation|hostel|villa|lodging)\b', lower):
        return "hotel"
    if re.search(r'\b(job|jobs|career|hiring|vacancy|fresher|internship)\b', lower):
        return "job"
    if re.search(r'\b(movie|film|cinema|showtime|theatre|bookmyshow)\b', lower):
        return "movie"
    if re.search(r'\b(phone|smartphone|mobile|handset)\b', lower):
        return "smartphone"
    if re.search(r'\b(laptop|notebook|macbook|chromebook)\b', lower):
        return "laptop"
    # For other product types, do not enforce strict category matching to avoid
    # false positives — return None to skip cross-category filter.
    return None


def apply_product_filters(
    item: NormalizedItem,
    req: ProductRequirements
) -> Tuple[bool, List[str]]:
    """
    Deterministic hard filters for products.
    Violations result in immediate disqualification with clear reasons.
    """
    reasons = []

    # 0. SERP Navigation / Non-Product Disqualification
    serp_noise = {
        "web results", "search results", "people also ask", "related searches",
        "explore more", "more results", "filter results", "discussions and forums",
        "perspectives", "videos", "images", "shopping"
    }
    cleaned_name = item.name.lower().strip()
    if cleaned_name in serp_noise or len(cleaned_name) < 4:
        reasons.append("Search engine navigation heading, not an actual product candidate")

    # 0a. SPONSORED RESULT DISQUALIFICATION
    # If explicitly requested or policy active, exclude sponsored results
    if getattr(req, "exclude_sponsored", False) and item.sponsored_status:
        reasons.append("Sponsored listing — excluded per user policy")

    # 0b. ACCESSORY / WRONG CATEGORY FILTER
    # Accessories like phone covers, cables, chargers, screen guards have low prices
    # but are NOT the target product. Disqualify them when target query is for a main product.
    _accessory_patterns = re.compile(
        r'\b(cover|case|pouch|sleeve|skin|wrap|cable|charger|adapter|wire|'
        r'screen\s*guard|tempered\s*glass|glass\s*protector|stand|mount|holder|'
        r'strap|band|car\s*mount|power\s*bank|earphone|earbuds?\s*case|'
        r'memory\s*card|micro\s*sd|lens\s*protector|ring\s*light|stylus|'
        r'hub|dock|bracket|grip|bumper|wallet\s*case|flip\s*cover|back\s*cover|'
        r'back\s*panel|back\s*case|tempered|protector|film|anti\s*glare|'
        r'spigen|otterbox|rhinoshield)\b',
        re.IGNORECASE
    )
    _main_product_query_patterns = re.compile(
        r'\b(phone|smartphone|laptop|tablet|ipad|pc|computer|monitor|'
        r'television|tv|headphone|earphone|camera|console|ps5|xbox|'
        r'smartwatch|watch|refrigerator|washing\s*machine|air\s*conditioner|'
        r'router|speaker|keyboard|mouse|printer|projector|drone)\b',
        re.IGNORECASE
    )
    _prompt = getattr(req, 'prompt_context', '') or ''
    if _main_product_query_patterns.search(_prompt) and _accessory_patterns.search(item.name):
        reasons.append(
            f"Accessory detected — '{item.name[:60]}' is a product accessory, "
            f"not the target category requested in the prompt"
        )

    # 0c. QUERY-CATEGORY MISMATCH FILTER
    # If the prompt is about smartphones but we extract flight/hotel/job records, disqualify them.
    _query_cat = _infer_query_category_from_prompt(_prompt)
    if _query_cat and item.category and item.category.lower() != _query_cat:
        # Allow broad matches: "smartphone" vs "product" etc.
        _COMPATIBLE_CATS = {
            "smartphone": {"smartphone", "product", "electronics", "general"},
            "laptop": {"laptop", "product", "electronics", "general"},
            "flight": {"flight"},
            "hotel": {"hotel"},
            "job": {"job"},
            "movie": {"movie"},
        }
        allowed = _COMPATIBLE_CATS.get(_query_cat, {_query_cat, "general"})
        if item.category.lower() not in allowed:
            reasons.append(
                f"Category mismatch: query asks for '{_query_cat}' but extracted item "
                f"is of category '{item.category}'"
            )

    # 0d. Disqualify items with zero pricing and zero specification evidence
    if (item.numeric_price is None and item.ram_gb is None and 
        item.storage_gb is None and item.brand is None and item.rating is None):
        reasons.append("Insufficient evidence: No price, RAM, or specifications extracted from page")

    # 1. Budget Max (Strict Hard Constraint)
    if req.budget_max is not None and item.numeric_price is not None:
        if item.numeric_price > req.budget_max:
            currency_sym = "$" if item.currency == "USD" else ("€" if item.currency == "EUR" else ("£" if item.currency == "GBP" else "₹"))
            reasons.append(
                f"Exceeds maximum budget: {currency_sym}{item.numeric_price:,.0f} > {currency_sym}{req.budget_max:,.0f}"
            )

    # 2. Budget Min
    if req.budget_min is not None and item.numeric_price is not None:
        if item.numeric_price < req.budget_min:
            currency_sym = "$" if item.currency == "USD" else "₹"
            reasons.append(
                f"Below minimum budget: {currency_sym}{item.numeric_price:,.0f} < {currency_sym}{req.budget_min:,.0f}"
            )

    # 3. Minimum RAM
    if req.minimum_ram is not None:
        if item.ram_gb is not None and item.ram_gb < req.minimum_ram:
            reasons.append(
                f"RAM constraint failed: {item.ram_gb}GB is below required minimum of {req.minimum_ram}GB"
            )

    # 4. Minimum Storage
    if req.minimum_storage is not None:
        if item.storage_gb is not None and item.storage_gb < req.minimum_storage:
            reasons.append(
                f"Storage constraint failed: {item.storage_gb}GB is below required minimum of {req.minimum_storage}GB"
            )

    # 5. Excluded Brands (Strict Hard Disqualification)
    if req.excluded_brands and item.brand:
        for ex in req.excluded_brands:
            if ex.lower() == item.brand.lower() or ex.lower() in item.name.lower():
                reasons.append(f"Excluded brand: '{item.brand}' is in your excluded brands list")
                break

    # 6. Exclusive Brands (Hard Constraint: only show preferred brands)
    if req.exclusive_brands and req.preferred_brands and item.brand:
        pref_canonical = [b.lower() for b in req.preferred_brands]
        if item.brand.lower() not in pref_canonical and not any(b in item.name.lower() for b in pref_canonical):
            reasons.append(f"Brand '{item.brand}' not in exclusive preferred brands list")

    # 7. Minimum Rating
    if req.min_rating is not None and item.rating is not None:
        if item.rating < req.min_rating:
            reasons.append(f"Rating {item.rating}★ below required minimum of {req.min_rating}★")

    # Positive satisfied criteria tracking
    satisfied = []
    if req.budget_max is not None and item.numeric_price is not None and item.numeric_price <= req.budget_max:
        satisfied.append(f"Within budget limit ({item.formatted_price} <= ₹{req.budget_max:,.0f})")
    if req.minimum_ram is not None and item.ram_gb is not None and item.ram_gb >= req.minimum_ram:
        satisfied.append(f"Satisfies RAM requirement ({item.ram_gb}GB >= {req.minimum_ram}GB)")
    if req.minimum_storage is not None and item.storage_gb is not None and item.storage_gb >= req.minimum_storage:
        satisfied.append(f"Satisfies storage capacity ({item.storage_gb}GB >= {req.minimum_storage}GB)")
    if req.preferred_brands and item.brand and item.brand.lower() in [b.lower() for b in req.preferred_brands]:
        satisfied.append(f"Matches preferred brand ({item.brand})")
    if item.rating is not None and item.rating >= 4.0:
        satisfied.append(f"Verified customer rating ({item.rating}★)")

    passed = len(reasons) == 0
    return passed, reasons, satisfied


def apply_hotel_filters(
    item: NormalizedItem,
    req: HotelRequirements
) -> Tuple[bool, List[str], List[str]]:
    """
    Deterministic hard filters for hotels.
    """
    reasons = []
    satisfied = []

    # 0. Sponsored listing disqualification
    if getattr(req, "exclude_sponsored", False) and item.sponsored_status:
        reasons.append("Sponsored listing — excluded per user policy")

    # 1. Budget Max per night
    if req.budget_max is not None and item.numeric_price is not None:
        if item.numeric_price > req.budget_max:
            currency_sym = "$" if item.currency == "USD" else "₹"
            reasons.append(
                f"Exceeds maximum night budget: {currency_sym}{item.numeric_price:,.0f} > {currency_sym}{req.budget_max:,.0f}"
            )
        else:
            satisfied.append(f"Within tariff budget ({item.formatted_price}/night <= ₹{req.budget_max:,.0f})")

    # 2. Minimum Star Rating
    if req.min_rating is not None:
        if item.rating is not None and item.rating < req.min_rating:
            reasons.append(
                f"Rating failed: {item.rating}★ is below required minimum of {req.min_rating}★"
            )
        elif item.rating is not None and item.rating >= req.min_rating:
            satisfied.append(f"Meets rating threshold ({item.rating}★ >= {req.min_rating}★)")

    # 3. Required Amenities (Hard match)
    if req.required_amenities:
        missing = [a for a in req.required_amenities if a.lower() not in [m.lower() for m in item.amenities]]
        if missing:
            reasons.append(f"Missing required amenities: {', '.join(missing)}")
        matched = [a for a in req.required_amenities if a.lower() in [m.lower() for m in item.amenities]]
        if matched:
            satisfied.append(f"Includes verified amenities: {', '.join(matched)}")

    passed = len(reasons) == 0
    return passed, reasons, satisfied


def apply_flight_filters(
    item: NormalizedItem,
    req: FlightRequirements
) -> Tuple[bool, List[str], List[str]]:
    """
    Deterministic hard filters for flight listings.
    """
    reasons = []
    satisfied = []

    # 0. Sponsored listing disqualification
    if getattr(req, "exclude_sponsored", False) and item.sponsored_status:
        reasons.append("Sponsored listing — excluded per user policy")

    # 1. Budget Max (Strict Hard Constraint)
    if req.budget_max is not None and item.numeric_price is not None:
        if item.numeric_price > req.budget_max:
            currency_sym = "$" if item.currency == "USD" else "₹"
            reasons.append(
                f"Exceeds maximum flight fare budget: {currency_sym}{item.numeric_price:,.0f} > {currency_sym}{req.budget_max:,.0f}"
            )
        else:
            satisfied.append(f"Within fare budget ({item.formatted_price} <= ₹{req.budget_max:,.0f})")

    # 2. Budget Min
    if req.budget_min is not None and item.numeric_price is not None:
        if item.numeric_price < req.budget_min:
            currency_sym = "$" if item.currency == "USD" else "₹"
            reasons.append(
                f"Below minimum budget: {currency_sym}{item.numeric_price:,.0f} < {currency_sym}{req.budget_min:,.0f}"
            )

    # 3. Max stops constraint (e.g. 0 for Non-stop only)
    if req.max_stops is not None and req.max_stops == 0:
        stops_text = (item.stops or item.specs or "").lower()
        if "1 stop" in stops_text or "2 stop" in stops_text or "stops" in stops_text:
            reasons.append("Non-stop flight required, but flight has connecting stops")
        elif "non-stop" in stops_text or "non stop" in stops_text:
            satisfied.append("Direct non-stop flight")

    # 4. Excluded Airlines (Strict Hard Disqualification)
    if req.excluded_airlines:
        airline_name = (item.airline or item.brand or item.name or "").lower()
        for ex in req.excluded_airlines:
            if ex.lower() in airline_name:
                reasons.append(f"Excluded airline: '{ex.title()}' is in your excluded carriers list")
                break

    # 5. Preferred Airlines
    if req.preferred_airlines:
        airline_name = (item.airline or item.brand or item.name or "").lower()
        matches = [a for a in req.preferred_airlines if a.lower() in airline_name]
        if matches:
            satisfied.append(f"Operated by preferred carrier ({matches[0].title()})")

    # Positive satisfied criteria
    if item.rating is not None and item.rating >= 4.0:
        satisfied.append(f"Verified airline rating ({item.rating}★)")

    # Disqualification if completely empty record
    if item.numeric_price is None and not item.specs and not item.departure_time:
        reasons.append("Insufficient flight data extracted from page")

    passed = len(reasons) == 0
    return passed, reasons, satisfied


def apply_job_filters(
    item: NormalizedItem,
    req: JobRequirements
) -> Tuple[bool, List[str], List[str]]:
    """
    Deterministic hard filters for job postings.
    """
    reasons = []
    satisfied = []

    # 1. Title / Role check
    if not item.name or len(item.name.strip()) < 3:
        reasons.append("Invalid or missing job title")

    # 2. Minimum Salary
    if req.min_salary is not None and item.numeric_price is not None:
        if item.numeric_price < req.min_salary:
            reasons.append(
                f"Offered salary {item.formatted_price} is below required minimum of ₹{req.min_salary:,.0f}"
            )
        else:
            satisfied.append(f"Satisfies salary expectation ({item.formatted_price} >= ₹{req.min_salary:,.0f})")

    # 3. Location Filter
    if req.location and item.location:
        if req.location.lower() in item.location.lower():
            satisfied.append(f"Located in target location ({item.location})")

    # 4. Experience requirement
    if req.max_experience_years is not None and item.experience:
        exp_lower = item.experience.lower()
        exp_match = re.search(r'(\d+)\s*(?:\+|[-–]\s*(\d+))?\s*(?:yr|year)', exp_lower)
        if exp_match:
            min_exp = int(exp_match.group(1))
            if min_exp > req.max_experience_years:
                reasons.append(f"Requires {min_exp}+ years experience (exceeds max of {req.max_experience_years} years)")
            else:
                satisfied.append(f"Experience requirement matched ({item.experience})")

    passed = len(reasons) == 0
    return passed, reasons, satisfied


def apply_movie_filters(
    item: NormalizedItem,
    req: MovieRequirements
) -> Tuple[bool, List[str], List[str]]:
    """
    Deterministic hard filters for movie showtimes.
    """
    reasons = []
    satisfied = []

    # 1. Budget Max (Ticket price)
    if req.budget_max is not None and item.numeric_price is not None:
        if item.numeric_price > req.budget_max:
            reasons.append(f"Ticket price {item.formatted_price} exceeds maximum budget of ₹{req.budget_max:,.0f}")
        else:
            satisfied.append(f"Within ticket budget ({item.formatted_price} <= ₹{req.budget_max:,.0f})")

    # 2. Cinema preference
    if req.cinema and item.cinema:
        if req.cinema.lower() in item.cinema.lower():
            satisfied.append(f"Screening at preferred cinema ({item.cinema})")

    passed = len(reasons) == 0
    return passed, reasons, satisfied


# ── 5. DETERMINISTIC WEIGHTED SCORING ENGINE ────────────────────────────────

def calculate_product_score(
    item: NormalizedItem,
    req: ProductRequirements,
    weights: Dict[str, float],
    all_passing_items: List[NormalizedItem]
) -> ScoreBreakdown:
    """
    Deterministic weighted scoring for tech products.
    Formula:
      Final Score = W_price * Price_Score + W_specs * Specs_Score + W_rating * Rating_Score + W_pref * Preference_Score
    All individual components are normalized to [0, 100].
    Missing values do NOT invent hallucinated scores.
    """
    # 1. Price Score (0 - 100)
    # Lower price within budget is rewarded with higher score.
    # Scaled relative to the batch prices and budget_max.
    price_score = 70.0  # Default neutral if price unknown
    if item.numeric_price is not None:
        if req.budget_max and req.budget_max > 0:
            # How much under budget? (0 at budget_max, 100 at 0)
            ratio = (req.budget_max - item.numeric_price) / req.budget_max
            # Range clamped [20, 100]
            price_score = round(max(20.0, min(100.0, 50.0 + (ratio * 50.0))), 2)
        else:
            # Batch-relative scaling
            valid_prices = [p.numeric_price for p in all_passing_items if p.numeric_price is not None]
            if valid_prices:
                min_p = min(valid_prices)
                max_p = max(valid_prices)
                if max_p > min_p:
                    price_score = round(100.0 - ((item.numeric_price - min_p) / (max_p - min_p) * 60.0), 2)
                else:
                    price_score = 90.0

    # 2. Specification Score (0 - 100)
    spec_components = []
    
    # RAM score (e.g. 16GB -> 100, 12GB -> 92, 8GB -> 82, 6GB -> 70, 4GB -> 50)
    if item.ram_gb is not None:
        ram_map = {16: 100.0, 12: 92.0, 8: 82.0, 6: 70.0, 4: 55.0}
        ram_score = ram_map.get(item.ram_gb, 75.0 if item.ram_gb > 8 else 50.0)
        spec_components.append(ram_score)
    elif req.minimum_ram:
        spec_components.append(60.0)  # Neutral baseline for unconfirmed RAM

    # Storage score (e.g. 512GB -> 100, 256GB -> 90, 128GB -> 78, 64GB -> 60)
    if item.storage_gb is not None:
        storage_map = {1024: 100.0, 512: 95.0, 256: 88.0, 128: 76.0, 64: 60.0}
        st_score = storage_map.get(item.storage_gb, 85.0 if item.storage_gb > 256 else 65.0)
        spec_components.append(st_score)
    elif req.minimum_storage:
        spec_components.append(60.0)

    # Prompt-specified target specs match bonus (e.g. "8GB RAM", "5G", "AMOLED", "120Hz")
    item_full_text = f"{item.name} {item.specs or ''}".lower()
    spec_match_count = 0
    if req.target_specs:
        for ts in req.target_specs:
            if ts.lower() in item_full_text:
                spec_match_count += 1
                spec_components.append(90.0)

    spec_score = round(sum(spec_components) / len(spec_components), 2) if spec_components else 70.0

    # 3. Rating Score (0 - 100)
    if item.rating is not None:
        # Directly scaled from 5-star rating: 5.0 -> 100, 4.0 -> 80, 3.0 -> 60
        rating_score = round(max(0.0, min(100.0, (item.rating / 5.0) * 100.0)), 2)
    else:
        # Transparent neutral baseline: 65.0 (does NOT invent high rating)
        rating_score = 65.0

    # 4. Preference Match Score (0 - 100)
    pref_score = 50.0
    pref_reasons = []

    if req.preferred_brands and item.brand:
        norm_prefs = [b.lower() for b in req.preferred_brands]
        if item.brand.lower() in norm_prefs:
            pref_score += 35.0
            pref_reasons.append(f"Matches preferred brand ({item.brand})")
        else:
            pref_score -= 10.0

    if spec_match_count > 0:
        pref_score += min(25.0, spec_match_count * 10.0)
        pref_reasons.append(f"Matches {spec_match_count} requested specifications from prompt")

    if req.priorities:
        for pr in req.priorities:
            pr_lower = pr.lower()
            if pr_lower == "price" and price_score >= 80:
                pref_score += 15.0
                pref_reasons.append("High price-to-performance value")
            elif pr_lower == "rating" and rating_score >= 85:
                pref_score += 15.0
                pref_reasons.append(f"Verified high customer satisfaction ({item.rating}★)")
            elif pr_lower in ["performance", "speed", "ram"] and item.ram_gb and item.ram_gb >= 8:
                pref_score += 15.0
                pref_reasons.append(f"High-capacity memory configuration ({item.ram_gb}GB)")

    pref_score = round(max(20.0, min(100.0, pref_score)), 2)

    # 5. Combined Final Weighted Score & Dynamic Optimization Goal
    w_price = weights.get("price", 0.35)
    w_specs = weights.get("specs", 0.30)
    w_rating = weights.get("rating", 0.20)
    w_pref = weights.get("preference", 0.15)

    # Dynamic Weight Adaptation based on Optimization Goal (Prompt-Driven)
    opt_goal = req.optimization_goal or (req.priorities[0] if req.priorities else None)
    value_boost = 0.0

    if opt_goal == "best_specs_lowest_price":
        w_specs = 0.45
        w_price = 0.40
        w_rating = 0.10
        w_pref = 0.05
        # Value Index (Utility per rupee): rewards high spec tier achieved at lowest price
        if item.numeric_price is not None:
            valid_prices = [p.numeric_price for p in all_passing_items if p.numeric_price is not None]
            min_p = min(valid_prices) if valid_prices else item.numeric_price
            price_ratio = item.numeric_price / max(min_p, 1000.0)
            value_boost = round(min(15.0, (spec_score / max(price_ratio, 0.8)) * 0.12), 2)
            pref_reasons.append(f"Best specs-to-price value index (+{value_boost} pts)")
    elif opt_goal == "cheapest":
        w_price = 0.65
        w_specs = 0.20
        w_rating = 0.10
        w_pref = 0.05
    elif opt_goal == "highest_rated":
        w_rating = 0.50
        w_specs = 0.30
        w_price = 0.15
        w_pref = 0.05

    final_score = round(
        min(100.0,
            (w_price * price_score) +
            (w_specs * spec_score) +
            (w_rating * rating_score) +
            (w_pref * pref_score) +
            value_boost
        ),
        2
    )

    # Rationale summary
    spec_desc = f"{item.ram_gb}GB RAM" if item.ram_gb else "Standard specs"
    if item.storage_gb:
        spec_desc += f", {item.storage_gb}GB Storage"
    
    rationale = f"Score {final_score}/100. {spec_desc} with {item.formatted_price or 'competitive price'}."
    if pref_reasons:
        rationale += f" {'; '.join(pref_reasons)}."
    elif item.rating:
        rationale += f" Rated {item.rating}★ from verified sources."

    return ScoreBreakdown(
        price_score=price_score,
        spec_score=spec_score,
        rating_score=rating_score,
        preference_score=pref_score,
        final_score=final_score,
        weight_config=weights,
        rationale=rationale
    )


def calculate_hotel_score(
    item: NormalizedItem,
    req: HotelRequirements,
    weights: Dict[str, float],
    all_passing_items: List[NormalizedItem]
) -> ScoreBreakdown:
    """
    Deterministic weighted scoring for hotels.
    Formula:
      Final Score = W_price * Price_Score + W_rating * Rating_Score + W_amenities * Amenities_Score + W_pref * Preference_Score
    """
    # 1. Price Score
    price_score = 70.0
    if item.numeric_price is not None:
        if req.budget_max and req.budget_max > 0:
            ratio = (req.budget_max - item.numeric_price) / req.budget_max
            price_score = round(max(20.0, min(100.0, 50.0 + (ratio * 50.0))), 2)
        else:
            valid_prices = [p.numeric_price for p in all_passing_items if p.numeric_price is not None]
            if valid_prices:
                min_p = min(valid_prices)
                max_p = max(valid_prices)
                if max_p > min_p:
                    price_score = round(100.0 - ((item.numeric_price - min_p) / (max_p - min_p) * 60.0), 2)
                else:
                    price_score = 88.0

    # 2. Rating Score (Primary for hotels)
    if item.rating is not None:
        rating_score = round(max(0.0, min(100.0, (item.rating / 5.0) * 100.0)), 2)
    else:
        rating_score = 65.0

    # 3. Amenities Score (Coverage of essential hospitality comforts)
    total_tracked = len(CANONICAL_HOTEL_AMENITIES)
    found_count = len(item.amenities)
    amenities_score = round(min(100.0, (found_count / max(1, total_tracked * 0.6)) * 100.0), 2)

    # 4. Preference & Location Score
    pref_score = 60.0
    pref_reasons = []

    if req.location and item.location:
        if req.location.lower() in item.location.lower():
            pref_score += 25.0
            pref_reasons.append(f"Located in prime area ({item.location})")

    if req.required_amenities:
        matched_req = [a for a in req.required_amenities if a.lower() in [m.lower() for m in item.amenities]]
        if matched_req:
            pref_score += 15.0
            pref_reasons.append(f"Includes {', '.join(matched_req)}")

    pref_score = round(max(20.0, min(100.0, pref_score)), 2)

    # 5. Combined Final Weighted Score
    w_price = weights.get("price", 0.30)
    w_rating = weights.get("rating", 0.35)
    w_amenities = weights.get("amenities", 0.25)
    w_pref = weights.get("preference", 0.10)

    final_score = round(
        (w_price * price_score) +
        (w_rating * rating_score) +
        (w_amenities * amenities_score) +
        (w_pref * pref_score),
        2
    )

    amenities_text = f"{len(item.amenities)} verified amenities" if item.amenities else "Comfortable stay"
    rationale = f"Score {final_score}/100. {item.rating or 4.0}★ rating, {item.formatted_price or 'Standard tariff'}/night. {amenities_text}."
    if pref_reasons:
        rationale += f" {'; '.join(pref_reasons)}."

    return ScoreBreakdown(
        price_score=price_score,
        amenities_score=amenities_score,
        rating_score=rating_score,
        preference_score=pref_score,
        final_score=final_score,
        weight_config=weights,
        rationale=rationale
    )


def calculate_flight_score(
    item: NormalizedItem,
    req: FlightRequirements,
    weights: Dict[str, float],
    all_passing_items: List[NormalizedItem]
) -> ScoreBreakdown:
    """
    Deterministic weighted scoring for flights.
    Formula:
      Final Score = W_price * Price_Score + W_dur * Duration_Score + W_rat * Rating_Score + W_pref * Preference_Score
    """
    # 1. Price Score
    price_score = 70.0
    if item.numeric_price is not None:
        if req.budget_max and req.budget_max > 0:
            ratio = (req.budget_max - item.numeric_price) / req.budget_max
            price_score = round(max(20.0, min(100.0, 50.0 + (ratio * 50.0))), 2)
        else:
            valid_prices = [p.numeric_price for p in all_passing_items if p.numeric_price is not None]
            if valid_prices:
                min_p = min(valid_prices)
                max_p = max(valid_prices)
                if max_p > min_p:
                    price_score = round(100.0 - ((item.numeric_price - min_p) / (max_p - min_p) * 60.0), 2)
                else:
                    price_score = 90.0

    # 2. Duration & Stops Score
    spec_text = f"{item.specs or ''} {item.stops or ''}".lower()
    if "non-stop" in spec_text or "non stop" in spec_text:
        duration_score = 95.0
    elif "1 stop" in spec_text:
        duration_score = 75.0
    elif "2 stop" in spec_text:
        duration_score = 55.0
    else:
        duration_score = 75.0

    # 3. Rating Score
    if item.rating is not None:
        rating_score = round(max(0.0, min(100.0, (item.rating / 5.0) * 100.0)), 2)
    else:
        rating_score = 75.0

    # 4. Preference Score
    pref_score = 60.0
    pref_reasons = []
    airline_name = (item.airline or item.brand or item.name or "").lower()
    if req.preferred_airlines:
        matches = [a for a in req.preferred_airlines if a.lower() in airline_name]
        if matches:
            pref_score += 30.0
            pref_reasons.append(f"Preferred airline ({matches[0].title()})")

    pref_score = round(max(20.0, min(100.0, pref_score)), 2)

    w_price = weights.get("price", 0.40)
    w_dur = weights.get("duration", 0.25)
    w_rat = weights.get("rating", 0.20)
    w_pref = weights.get("preference", 0.15)

    final_score = round(
        (w_price * price_score) +
        (w_dur * duration_score) +
        (w_rat * rating_score) +
        (w_pref * pref_score),
        2
    )

    flight_info = item.airline or item.name or "Flight"
    if item.flight_code:
        flight_info += f" ({item.flight_code})"
    rationale = f"Score {final_score}/100. {flight_info} at {item.formatted_price or 'standard fare'}."
    if item.specs:
        rationale += f" {item.specs}."
    if pref_reasons:
        rationale += f" {'; '.join(pref_reasons)}."

    return ScoreBreakdown(
        price_score=price_score,
        spec_score=duration_score,
        rating_score=rating_score,
        preference_score=pref_score,
        final_score=final_score,
        weight_config=weights,
        rationale=rationale
    )


def calculate_job_score(
    item: NormalizedItem,
    req: JobRequirements,
    weights: Dict[str, float],
    all_passing_items: List[NormalizedItem]
) -> ScoreBreakdown:
    """
    Deterministic weighted scoring for job opportunities.
    """
    # 1. Role Relevance Score (0 - 100)
    role_score = 70.0
    if req.role and item.name:
        req_words = set(re.findall(r'\w+', req.role.lower()))
        item_words = set(re.findall(r'\w+', item.name.lower()))
        if req_words:
            overlap = len(req_words & item_words) / len(req_words)
            role_score = round(max(30.0, min(100.0, 40.0 + (overlap * 60.0))), 2)

    # 2. Salary Score (0 - 100)
    salary_score = 65.0
    if item.numeric_price is not None:
        if req.min_salary and req.min_salary > 0:
            ratio = item.numeric_price / req.min_salary
            salary_score = round(max(20.0, min(100.0, min(100.0, ratio * 75.0))), 2)
        else:
            salary_score = 80.0

    # 3. Experience Score (0 - 100)
    exp_score = 75.0
    if req.max_experience_years is not None and item.experience:
        exp_lower = item.experience.lower()
        if "fresher" in exp_lower or "0" in exp_lower:
            exp_score = 95.0 if req.max_experience_years <= 1 else 80.0
        else:
            exp_score = 80.0

    # 4. Company & Location Match Score (0 - 100)
    comp_score = 60.0
    pref_reasons = []
    if req.company and item.company and req.company.lower() in item.company.lower():
        comp_score += 25.0
        pref_reasons.append(f"Target employer ({item.company})")
    if req.location and item.location and req.location.lower() in item.location.lower():
        comp_score += 15.0
        pref_reasons.append(f"Target location ({item.location})")
    comp_score = round(max(20.0, min(100.0, comp_score)), 2)

    w_role = weights.get("role", 0.35)
    w_sal = weights.get("salary", 0.30)
    w_exp = weights.get("experience", 0.20)
    w_comp = weights.get("company", 0.15)

    final_score = round(
        (w_role * role_score) +
        (w_sal * salary_score) +
        (w_exp * exp_score) +
        (w_comp * comp_score),
        2
    )

    company_text = f"at {item.company}" if item.company else ""
    rationale = f"Score {final_score}/100. {item.name} {company_text}. Salary: {item.formatted_price or item.salary or 'Competitive'}."
    if item.location:
        rationale += f" Location: {item.location}."
    if pref_reasons:
        rationale += f" {'; '.join(pref_reasons)}."

    return ScoreBreakdown(
        price_score=salary_score,
        spec_score=role_score,
        rating_score=exp_score,
        preference_score=comp_score,
        final_score=final_score,
        weight_config=weights,
        rationale=rationale
    )


def calculate_movie_score(
    item: NormalizedItem,
    req: MovieRequirements,
    weights: Dict[str, float],
    all_passing_items: List[NormalizedItem]
) -> ScoreBreakdown:
    """
    Deterministic weighted scoring for movie showtimes.
    """
    # 1. Price Score
    price_score = 75.0
    if item.numeric_price is not None:
        if req.budget_max and req.budget_max > 0:
            ratio = (req.budget_max - item.numeric_price) / req.budget_max
            price_score = round(max(20.0, min(100.0, 50.0 + (ratio * 50.0))), 2)

    # 2. Showtime Score
    showtime_score = 75.0
    if req.time_preference and item.showtime:
        st_lower = item.showtime.lower()
        pref = req.time_preference.lower()
        if pref in ["evening", "night"] and ("pm" in st_lower or "18:" in st_lower or "19:" in st_lower or "20:" in st_lower or "21:" in st_lower):
            showtime_score = 95.0
        elif pref in ["morning", "matinee"] and ("am" in st_lower or "10:" in st_lower or "11:" in st_lower):
            showtime_score = 95.0

    # 3. Format Score
    format_score = 70.0
    if req.preferred_format and item.movie_format:
        if req.preferred_format.lower() in item.movie_format.lower():
            format_score = 95.0

    # 4. Cinema Score
    cinema_score = 65.0
    pref_reasons = []
    if req.cinema and item.cinema and req.cinema.lower() in item.cinema.lower():
        cinema_score = 95.0
        pref_reasons.append(f"Cinema match ({item.cinema})")

    w_price = weights.get("price", 0.35)
    w_time = weights.get("showtime", 0.30)
    w_fmt = weights.get("format", 0.20)
    w_cin = weights.get("cinema", 0.15)

    final_score = round(
        (w_price * price_score) +
        (w_time * showtime_score) +
        (w_fmt * format_score) +
        (w_cin * cinema_score),
        2
    )

    cin_text = f"at {item.cinema}" if item.cinema else ""
    fmt_text = f"[{item.movie_format}]" if item.movie_format else ""
    rationale = f"Score {final_score}/100. {item.name} {fmt_text} {cin_text} at {item.formatted_price or 'Standard price'}."
    if item.showtime:
        rationale += f" Showtime: {item.showtime}."
    if pref_reasons:
        rationale += f" {'; '.join(pref_reasons)}."

    return ScoreBreakdown(
        price_score=price_score,
        spec_score=showtime_score,
        rating_score=format_score,
        preference_score=cinema_score,
        final_score=final_score,
        weight_config=weights,
        rationale=rationale
    )


# ── 6. DEDUPLICATION & VERIFICATION ─────────────────────────────────────────

_TRACKING_PARAM_RE = re.compile(r"^(utm_.*|ref|ref_|_encoding|tag|source|sprefix|crid|qid|sr|fbclid|gclid|pd_rd_.*|pf_rd_.*|psc|th)$", re.I)


def canonical_url_key(raw_url: Any) -> str:
    """Host + path (no scheme/www/query/fragment/trailing slash) -> stable identity for a page.
    Query strings are dropped because on product/article pages they are almost always tracking noise."""
    if not raw_url or not isinstance(raw_url, str):
        return ""
    m = re.match(r"^https?://(?:www\.)?([^/?#:]+)(?::\d+)?([^?#]*)", raw_url.strip(), re.I)
    if not m:
        return ""
    host, path = m.group(1).lower(), m.group(2).rstrip("/").lower()
    return f"{host}{path}"


def _norm_title(raw: Any) -> str:
    t = re.sub(r"^\s*(sponsored|ad|promoted)\s*[:\-]\s*", "", str(raw or ""), flags=re.I)
    return re.sub(r"[^a-z0-9]", "", t.lower())


def deduplicate_items(items: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    """
    Deduplicates raw extracted records. Two records are the same when they share a canonical
    page URL (+ per-record identity), or - when no URL was captured - the same source and normalized title. The same title on different retailers is
    kept, since cross-site price comparison is a feature. Complementary fields are merged, and a
    record that is not sponsored wins over its sponsored duplicate.
    """
    by_url: Dict[Tuple[str, str], Dict[str, Any]] = {}
    by_title: Dict[Tuple[str, str], Dict[str, Any]] = {}
    unique: List[Dict[str, Any]] = []
    merge_fields = ("price", "rating", "ram", "storage", "brand", "processor", "snippet",
                    "published_at", "timestamp", "extracted_at", "source_url", "specs")

    for item in items:
        if not isinstance(item, dict):
            continue
        link = item.get("url") or item.get("link") or item.get("product_url") or ""
        ukey = canonical_url_key(link)
        domain = ukey.split("/")[0] if ukey else str(item.get("source_website") or "").strip().lower()
        title = _norm_title(item.get("title") or item.get("name"))
        # Title-only identity is used just for URL-less records; records with distinct URLs are distinct.
        tkey = (domain, title) if (title and not ukey) else None
        # Per-record identity: the title, or (for title-less records such as flights/showtimes that
        # all share one search-results URL) the fields that distinguish one offer from another.
        sig = title or "|".join(
            str(item.get(k) or "").strip().lower()
            for k in ("id", "flight_code", "airline", "departure_time", "arrival_time", "cinema",
                      "theatre", "showtime", "time", "company", "price")
        ).strip("|")
        ukey_sig = (ukey, sig) if ukey and sig.strip("|") else (ukey, "") if ukey else None

        existing = (by_url.get(ukey_sig) if ukey_sig else None) or (by_title.get(tkey) if tkey else None)
        if existing is not None:
            for f in merge_fields:
                if not existing.get(f) and item.get(f):
                    existing[f] = item[f]
            if existing.get("sponsored_status") or existing.get("is_sponsored"):
                if not (item.get("sponsored_status") or item.get("is_sponsored")):
                    existing["sponsored_status"] = False
                    existing["is_sponsored"] = False
            continue

        if ukey_sig:
            by_url[ukey_sig] = item
        if tkey:
            by_title[tkey] = item
        unique.append(item)

    return unique


# ── 7. MAIN PIPELINE EXECUTION ──────────────────────────────────────────────

def rank_extracted_items(
    raw_items: List[Dict[str, Any]],
    requirements: Union[ProductRequirements, HotelRequirements, FlightRequirements, JobRequirements, MovieRequirements, Dict[str, Any]],
    category: Optional[str] = None
) -> RankResponse:
    """
    End-to-End Deterministic Pipeline:
    1. Deduplicate records.
    2. Normalize all fields (price, RAM, storage, rating, brand, amenities, flights, jobs, movies).
    3. Apply deterministic hard filters (violations flagged and separated into disqualified).
    4. Calculate category-specific weighted scores for passing candidates.
    5. Rank in descending score order and separate brand alternatives.
    6. Return fully explainable structured response.
    """
    # Parse requirements schema
    if isinstance(requirements, dict):
        prompt_txt = requirements.get("prompt_context") or requirements.get("goal") or ""
        if prompt_txt:
            prompt_crit = parse_prompt_intent_and_criteria(prompt_txt)
            for k, v in prompt_crit.items():
                if v and not requirements.get(k):
                    requirements[k] = v

        cat = category or requirements.get("category")
        if not cat and raw_items:
            first_cat = (raw_items[0].get("category") or "").lower()
            if first_cat in ["flight", "hotel", "smartphone", "product", "job", "movie"]:
                cat = first_cat
        if cat in ["flight", "flights", "airline", "travel"]:
            req = FlightRequirements(**requirements)
            category = "flight"
        elif cat in ["hotel", "travel", "stay", "hotels"]:
            req = HotelRequirements(**requirements)
            category = "hotel"
        elif cat in ["job", "jobs", "career", "employment"]:
            req = JobRequirements(**requirements)
            category = "job"
        elif cat in ["movie", "movies", "cinema", "showtimes"]:
            req = MovieRequirements(**requirements)
            category = "movie"
        else:
            req = ProductRequirements(**requirements)
            category = "smartphone"
    else:
        req = requirements
        category = req.category
        if getattr(req, "prompt_context", None):
            prompt_crit = parse_prompt_intent_and_criteria(req.prompt_context)
            for k, v in prompt_crit.items():
                if v and not getattr(req, k, None):
                    setattr(req, k, v)

    # 1. Deduplicate
    unique_raw = deduplicate_items(raw_items)

    # 2. Normalize
    normalized_list: List[NormalizedItem] = []
    for idx, r in enumerate(unique_raw):
        name = str(r.get("name") or r.get("title") or f"Option #{idx+1}").strip()
        raw_price_str = str(r.get("price") or r.get("tariff") or r.get("salary") or "")
        num_price, currency, fmt_price = normalize_price(raw_price_str or r.get("numeric_price"))

        raw_url = str(r.get("url") or r.get("link") or r.get("product_url") or "")
        source_domain, clean_url = clean_source_url(raw_url or r.get("source_url") or "")

        rating_val = normalize_rating(r.get("rating"), str(r.get("snippet") or ""))
        extracted_at = str(r.get("extracted_at") or r.get("timestamp") or datetime.now(timezone.utc).isoformat())

        name_hash = int(hashlib.md5(name.encode("utf-8")).hexdigest()[:8], 16) % 10000
        item_id = str(r.get("id") or f"{category}_{idx+1}_{name_hash}")
        is_sponsored = bool(r.get("sponsored_status") or r.get("is_sponsored"))
        evidence = r.get("evidence") or {}

        if category == "flight":
            airline = r.get("airline") or r.get("brand") or (normalize_brand(None, name) if not r.get("airline") else r.get("airline"))
            item = NormalizedItem(
                id=item_id,
                name=name,
                category="flight",
                raw_price=raw_price_str,
                numeric_price=num_price,
                currency=currency,
                formatted_price=fmt_price,
                rating=rating_val,
                airline=airline,
                flight_code=r.get("flight_code"),
                route=r.get("route"),
                departure_time=r.get("departure_time"),
                arrival_time=r.get("arrival_time"),
                duration=r.get("duration"),
                stops=r.get("stops"),
                specs=r.get("specs"),
                source_domain=source_domain,
                source_url=r.get("source_url") or clean_url,
                product_url=clean_url,
                extracted_at=extracted_at,
                evidence=evidence,
                sponsored_status=is_sponsored
            )
        elif category == "hotel":
            amenities = normalize_hotel_amenities(r.get("amenities"), f"{name} {r.get('snippet') or ''}")
            loc = str(r.get("location") or r.get("city") or "")
            item = NormalizedItem(
                id=item_id,
                name=name,
                category="hotel",
                raw_price=raw_price_str,
                numeric_price=num_price,
                currency=currency,
                formatted_price=fmt_price,
                rating=rating_val,
                location=loc or None,
                amenities=amenities,
                source_domain=source_domain,
                source_url=r.get("source_url") or clean_url,
                product_url=clean_url,
                extracted_at=extracted_at,
                evidence=evidence,
                sponsored_status=is_sponsored
            )
        elif category == "job":
            comp = str(r.get("company") or r.get("employer") or "")
            exp = str(r.get("experience") or r.get("exp") or "")
            sal = str(r.get("salary") or raw_price_str or "")
            loc = str(r.get("location") or "")
            item = NormalizedItem(
                id=item_id,
                name=name,
                category="job",
                raw_price=raw_price_str,
                numeric_price=num_price,
                currency=currency,
                formatted_price=fmt_price,
                company=comp or None,
                experience=exp or None,
                salary=sal or None,
                location=loc or None,
                source_domain=source_domain,
                source_url=r.get("source_url") or clean_url,
                product_url=clean_url,
                extracted_at=extracted_at,
                evidence=evidence,
                sponsored_status=is_sponsored
            )
        elif category == "movie":
            cin = str(r.get("cinema") or r.get("theatre") or "")
            st = str(r.get("showtime") or r.get("time") or "")
            m_fmt = str(r.get("movie_format") or r.get("format") or "")
            item = NormalizedItem(
                id=item_id,
                name=name,
                category="movie",
                raw_price=raw_price_str,
                numeric_price=num_price,
                currency=currency,
                formatted_price=fmt_price,
                cinema=cin or None,
                showtime=st or None,
                movie_format=m_fmt or None,
                source_domain=source_domain,
                source_url=r.get("source_url") or clean_url,
                product_url=clean_url,
                extracted_at=extracted_at,
                evidence=evidence,
                sponsored_status=is_sponsored
            )
        else:
            ram = normalize_ram(r.get("ram"), name, str(r.get("snippet") or ""))
            storage = normalize_storage(r.get("storage"), name, str(r.get("snippet") or ""))
            brand = normalize_brand(r.get("brand"), name)
            processor = str(r.get("processor") or "").strip() or None

            item = NormalizedItem(
                id=item_id,
                name=name,
                category=category,
                raw_price=raw_price_str,
                numeric_price=num_price,
                currency=currency,
                formatted_price=fmt_price,
                brand=brand,
                ram_gb=ram,
                storage_gb=storage,
                processor=processor,
                rating=rating_val,
                specs=r.get("specs"),
                source_domain=source_domain,
                source_url=r.get("source_url") or clean_url,
                product_url=clean_url,
                extracted_at=extracted_at,
                evidence=evidence,
                sponsored_status=is_sponsored
            )

        normalized_list.append(item)

    # 3. Apply Hard Filters
    passing_items: List[NormalizedItem] = []
    disqualified_items: List[NormalizedItem] = []

    for item in normalized_list:
        if category == "flight" and isinstance(req, FlightRequirements):
            passed, reasons, satisfied = apply_flight_filters(item, req)
        elif category == "hotel" and isinstance(req, HotelRequirements):
            passed, reasons, satisfied = apply_hotel_filters(item, req)
        elif category == "job" and isinstance(req, JobRequirements):
            passed, reasons, satisfied = apply_job_filters(item, req)
        elif category == "movie" and isinstance(req, MovieRequirements):
            passed, reasons, satisfied = apply_movie_filters(item, req)
        elif isinstance(req, ProductRequirements):
            passed, reasons, satisfied = apply_product_filters(item, req)
        else:
            passed, reasons, satisfied = True, [], []

        item.passed_filters = passed
        item.disqualification_reasons = reasons
        item.requirements_violated = reasons
        item.requirements_satisfied = satisfied
        item.verification_status = "Verified Factual Grounding" if passed else "Disqualified (Constraint Violation)"

        if passed:
            passing_items.append(item)
        else:
            item.final_score = 0.0
            item.score_breakdown = ScoreBreakdown(
                final_score=0.0,
                rationale=f"Disqualified: {'; '.join(reasons)}"
            )
            disqualified_items.append(item)

    # 4. Deterministic Scoring
    if category == "hotel":
        weights = req.weights or DEFAULT_HOTEL_WEIGHTS
    elif category == "flight":
        weights = req.weights or DEFAULT_FLIGHT_WEIGHTS
    elif category == "job":
        weights = req.weights or DEFAULT_JOB_WEIGHTS
    elif category == "movie":
        weights = req.weights or DEFAULT_MOVIE_WEIGHTS
    else:
        weights = req.weights or DEFAULT_PRODUCT_WEIGHTS
    
    # Normalize weights to sum to 1.0 if custom
    weight_sum = sum(weights.values())
    if weight_sum > 0 and not math.isclose(weight_sum, 1.0, rel_tol=1e-3):
        weights = {k: v / weight_sum for k, v in weights.items()}

    for item in passing_items:
        if category == "hotel" and isinstance(req, HotelRequirements):
            breakdown = calculate_hotel_score(item, req, weights, passing_items)
        elif category == "flight" and isinstance(req, FlightRequirements):
            breakdown = calculate_flight_score(item, req, weights, passing_items)
        elif category == "job" and isinstance(req, JobRequirements):
            breakdown = calculate_job_score(item, req, weights, passing_items)
        elif category == "movie" and isinstance(req, MovieRequirements):
            breakdown = calculate_movie_score(item, req, weights, passing_items)
        else:
            breakdown = calculate_product_score(item, req, weights, passing_items)  # type: ignore

        item.score_breakdown = breakdown
        item.final_score = breakdown.final_score

        # Record applied preference indicators for user visibility
        prefs = []
        if isinstance(req, ProductRequirements):
            if req.budget_max and item.numeric_price:
                prefs.append(f"Budget Cap: ≤ ₹{req.budget_max:,.0f}")
            if req.preferred_brands and item.brand and any(b.lower() == item.brand.lower() for b in req.preferred_brands):
                prefs.append(f"Preferred Brand: {item.brand}")
            if req.min_rating and item.rating:
                prefs.append(f"Min Rating: ≥ {req.min_rating}★")
        elif isinstance(req, FlightRequirements):
            if req.budget_max and item.numeric_price:
                prefs.append(f"Fare Cap: ≤ ₹{req.budget_max:,.0f}")
            if req.preferred_airlines and item.airline and any(a.lower() in item.airline.lower() for a in req.preferred_airlines):
                prefs.append(f"Preferred Carrier: {item.airline}")
            if req.max_stops == 0:
                prefs.append("Direct Non-Stop Only")
        item.applied_preferences = prefs

    # 5. Rank and Brand Partitioning (Phase 2 Section F & G)
    # Organic candidates strictly precede sponsored listings so sponsored items NEVER become #1 recommendation
    passing_items.sort(
        key=lambda x: (
            0 if x.sponsored_status else 1,
            x.final_score,
            -(x.numeric_price or 999999)
        ),
        reverse=True
    )

    ranked_items: List[NormalizedItem] = []
    alternative_items: List[NormalizedItem] = []

    if isinstance(req, ProductRequirements) and req.preferred_brands:
        norm_brands = [b.lower() for b in req.preferred_brands]
        preferred = []
        alts = []
        for it in passing_items:
            it_brand = (it.brand or "").lower()
            if any(pb in it_brand or pb in it.name.lower() for pb in norm_brands):
                preferred.append(it)
            else:
                it.is_alternative = True
                alts.append(it)

        if preferred:
            ranked_items = preferred
            alternative_items = alts
        else:
            ranked_items = alts
            alternative_items = []
    elif isinstance(req, FlightRequirements) and req.preferred_airlines:
        norm_airlines = [a.lower() for a in req.preferred_airlines]
        preferred = []
        alts = []
        for it in passing_items:
            it_air = (it.airline or it.brand or it.name or "").lower()
            if any(pa in it_air for pa in norm_airlines):
                preferred.append(it)
            else:
                it.is_alternative = True
                alts.append(it)

        if preferred:
            ranked_items = preferred
            alternative_items = alts
        else:
            ranked_items = alts
            alternative_items = []
    else:
        ranked_items = passing_items

    for idx, it in enumerate(ranked_items):
        it.rank = idx + 1
    for idx, it in enumerate(alternative_items):
        it.rank = idx + 1

    # Top recommendation must strictly be a verified organic listing if available
    top_pick = next((it for it in ranked_items if not it.sponsored_status), ranked_items[0] if ranked_items else None)

    # Summary Generation
    if ranked_items:
        top_name = top_pick.name if top_pick else "Top candidate"
        top_score = top_pick.final_score if top_pick else 0
        summary = (
            f"Successfully analyzed {len(unique_raw)} extracted options across verified web sources. "
            f"{len(ranked_items)} candidate(s) fully satisfied all mandatory constraints"
        )
        if alternative_items:
            summary += f" ({len(alternative_items)} alternative brand options also identified under budget)"
        summary += f". Top deterministic recommendation is '{top_name}' with a score of {top_score}/100."
    else:
        summary = (
            f"Analyzed {len(unique_raw)} extracted options, but none satisfied all mandatory constraints "
            f"(e.g. budget cap of {getattr(req, 'budget_max', 'budget')})."
        )

    return RankResponse(
        category=category,
        total_extracted=len(unique_raw),
        passed_count=len(passing_items),
        disqualified_count=len(disqualified_items),
        ranked_items=ranked_items,
        alternative_items=alternative_items,
        disqualified_items=disqualified_items,
        weights_used=weights,
        top_pick=top_pick,
        summary=summary
    )
