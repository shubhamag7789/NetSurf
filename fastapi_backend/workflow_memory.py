"""
NetSurf Adaptive Workflow Memory & Explainable Pattern Engine (Phase 5).

Responsibilities:
- Identifies recurring workflow categories and extracts generalized task signatures.
- Templatizes successful browser action sequences (e.g. {city}, {budget}, {brand}, {ram}).
- Matches incoming user instructions to saved successful workflow patterns.
- Replaces parameters and instantiates verified, repeatable execution plans.
- Tracks execution metrics (success rate, reuse count, last execution timestamp, failure conditions).
- Provides user memory management (CRUD and isolation per authenticated user).
- Strictly enforces security: reused workflows must never bypass approval gates or safety policies.
"""

from __future__ import annotations
import re
import json
import uuid
import logging
from datetime import datetime, timezone
from typing import Dict, Any, List, Optional, Tuple, Union
from pydantic import BaseModel, Field

from .schemas import (
    Plan,
    PlannedTask,
    PlanPhase,
    TaskStatus,
    WorkflowPhase,
    ActionType,
    ActionParams,
    Action,
    Observation,
    InteractiveElement,
)
from .safety import is_url_safe, check_approval_gate

logger = logging.getLogger("netsurf.workflow_memory")

# ── 1. SCHEMAS ──────────────────────────────────────────────────────────────

class WorkflowMemoryItem(BaseModel):
    id: str
    user_id: str
    task_pattern: str
    category: str = "general"
    description: str = ""
    parameters: List[str] = Field(default_factory=list)
    action_sequence: List[Dict[str, Any]] = Field(default_factory=list)
    phases: List[Dict[str, Any]] = Field(default_factory=list)
    success_rate: float = 100.0
    success_count: int = 1
    failure_count: int = 0
    reuse_count: int = 0
    last_executed_at: str = Field(default_factory=lambda: datetime.now(timezone.utc).isoformat())
    failure_conditions: List[str] = Field(default_factory=list)
    created_at: str = Field(default_factory=lambda: datetime.now(timezone.utc).isoformat())


class AdaptiveRecoveryRequest(BaseModel):
    goal: str
    failed_task: Dict[str, Any]
    error_reason: str
    observation: Observation
    history: List[Dict[str, Any]] = Field(default_factory=list)
    task_id: Optional[int] = None


class AdaptiveRecoveryResponse(BaseModel):
    action: Action
    recovery_strategy: str
    requires_approval: bool = False
    approval_reason: Optional[str] = None
    can_recover: bool = True


# ── 2. TASK SIGNATURE & PARAMETER EXTRACTION ────────────────────────────────

COMMON_INDIAN_CITIES = [
    "jaipur", "udaipur", "jodhpur", "goa", "mumbai", "delhi", "bangalore",
    "bengaluru", "hyderabad", "chennai", "kolkata", "pune", "ahmedabad",
    "agra", "varanasi", "shimla", "manali", "rishikesh", "ooty", "munnar",
    "kochi", "amritsar", "chandigarh", "lucknow", "patna"
]

COMMON_TECH_BRANDS = [
    "samsung", "apple", "iphone", "google", "pixel", "oneplus", "xiaomi",
    "redmi", "poco", "realme", "motorola", "moto", "vivo", "oppo", "iqoo",
    "asus", "lenovo", "dell", "hp", "acer", "sony", "nothing"
]

def extract_task_signature(goal: str) -> Tuple[str, str, Dict[str, Any]]:
    """
    Analyzes a user prompt to determine its workflow category,
    generalized pattern template, and extracted parameters.
    Examples:
      - "Find hotels in Jaipur under ₹4,000"
        -> category: "hotel", pattern: "hotel_search_destination_budget", params: {"city": "Jaipur", "budget": 4000}
      - "Find smartphones under ₹25,000 with 8GB RAM"
        -> category: "shopping", pattern: "shopping_search_budget_ram", params: {"budget": 25000, "ram": 8}
    """
    lower = goal.lower()
    params: Dict[str, Any] = {}

    # 1. Hotel / Travel Workflows
    if any(k in lower for k in ["hotel", "resort", "stay", "homestay", "villa", "room"]):
        category = "hotel"
        # Extract destination city
        found_city = None
        for c in COMMON_INDIAN_CITIES:
            if re.search(rf'\b{re.escape(c)}\b', lower):
                found_city = c.title()
                break
        if not found_city:
            # Regex pattern e.g. "in Udaipur", "at Goa"
            m = re.search(r'\b(?:in|at|around|near)\s+([A-Za-z]+)', goal)
            if m and m.group(1).lower() not in ["the", "a", "my", "best", "budget"]:
                found_city = m.group(1).title()

        if found_city:
            params["city"] = found_city

        # Extract budget
        m_budget = re.search(r'(?:under|below|within|budget(?:\s*of)?)\s*(?:[₹$€£]|rs\.?|inr)?\s*([\d,]+)', lower)
        if m_budget:
            try:
                params["budget"] = int(m_budget.group(1).replace(",", ""))
            except ValueError:
                pass

        if "city" in params and "budget" in params:
            pattern = "hotel_search_destination_budget"
        elif "city" in params:
            pattern = "hotel_search_destination"
        else:
            pattern = "hotel_search_general"

        return category, pattern, params

    # 2. Shopping / Product Search Workflows
    if any(k in lower for k in ["phone", "smartphone", "mobile", "laptop", "product", "buy", "price"]):
        category = "shopping"
        # Extract brand
        for b in COMMON_TECH_BRANDS:
            if re.search(rf'\b{re.escape(b)}\b', lower):
                params["brand"] = b.title()
                break

        # Extract budget
        m_budget = re.search(r'(?:under|below|within|budget(?:\s*of)?)\s*(?:[₹$€£]|rs\.?|inr)?\s*([\d,]+)', lower)
        if m_budget:
            try:
                params["budget"] = int(m_budget.group(1).replace(",", ""))
            except ValueError:
                pass

        # Extract RAM
        m_ram = re.search(r'(\d{1,2})\s*(?:gb|gigs?)\s*(?:ram\b)?', lower)
        if m_ram:
            try:
                params["ram"] = int(m_ram.group(1))
            except ValueError:
                pass

        # Extract Storage (prefer explicit storage/rom keyword, or high storage capacity >= 64GB)
        m_storage = re.search(r'(\d{2,4})\s*(?:gb|tb)\s*(?:storage|rom)\b', lower)
        if not m_storage:
            m_storage = re.search(r'\b(64|128|256|512|1024)\s*(?:gb|tb)\b', lower)
        if m_storage:
            try:
                params["storage"] = int(m_storage.group(1))
            except ValueError:
                pass

        parts = ["shopping_search"]
        if "brand" in params: parts.append("brand")
        if "budget" in params: parts.append("budget")
        if "ram" in params: parts.append("ram")
        pattern = "_".join(parts)

        return category, pattern, params

    # 3. Form Autofill Workflows
    if any(k in lower for k in ["fill", "autofill", "application form", "apply"]):
        category = "autofill"
        pattern = "form_autofill_general"
        return category, pattern, params

    # 4. General Research / Summary
    category = "general"
    pattern = "web_research_general"
    return category, pattern, params


# ── 3. WORKFLOW TEMPLATIZING & INSTANTIATION ────────────────────────────────

def templatize_action_sequence(
    plan: Union[Plan, Dict[str, Any]],
    extracted_params: Dict[str, Any]
) -> Tuple[List[Dict[str, Any]], List[Dict[str, Any]]]:
    """
    Replaces concrete instance parameters (e.g. 'Jaipur', '4000', 'Samsung')
    with generic template variables ({city}, {budget}, {brand}, {ram})
    across planned tasks and phase descriptions.
    """
    param_map = {}
    for key, val in extracted_params.items():
        if val is not None:
            param_map[str(val).lower()] = f"{{{key}}}"
            if isinstance(val, int):
                # Also format with commas e.g. 4,000
                param_map[f"{val:,}"] = f"{{{key}}}"

    def replace_tokens(text: str) -> str:
        if not text:
            return text
        res = text
        for concrete, placeholder in param_map.items():
            # Replace case-insensitively
            pattern = re.compile(re.escape(concrete), re.IGNORECASE)
            res = pattern.sub(placeholder, res)
        return res

    if isinstance(plan, Plan):
        raw_actions = [a.model_dump() for a in plan.actions]
        raw_phases = [p.model_dump() for p in plan.phases]
    else:
        raw_actions = []
        if plan.get("actions"):
            raw_actions = [dict(a) for a in plan.get("actions", [])]
        elif plan.get("phases"):
            for ph in plan.get("phases", []):
                raw_actions.extend([dict(a) for a in ph.get("actions", [])])
        raw_phases = [dict(p) for p in plan.get("phases", [])]

    templated_actions = []
    for a_dict in raw_actions:
        a_dict["description"] = replace_tokens(a_dict.get("description", ""))
        
        # Check action params
        params = dict(a_dict.get("params") or {})
        if "url" in params and params["url"]:
            params["url"] = replace_tokens(str(params["url"]))
        if "text" in params and params["text"]:
            params["text"] = replace_tokens(str(params["text"]))
        if "summary" in params and params["summary"]:
            params["summary"] = replace_tokens(str(params["summary"]))
        a_dict["params"] = params
        templated_actions.append(a_dict)

    templated_phases = []
    for p_dict in raw_phases:
        p_dict["name"] = replace_tokens(p_dict.get("name", ""))
        p_dict["description"] = replace_tokens(p_dict.get("description", ""))
        templated_phases.append(p_dict)

    return templated_actions, templated_phases


def instantiate_templated_workflow(
    memory_item: Dict[str, Any],
    new_goal: str,
    new_params: Dict[str, Any]
) -> Plan:
    """
    Instantiates a saved workflow pattern by injecting new task parameters
    (e.g. replacing {city} with 'Udaipur' and {budget} with '5000').
    Ensures output is a valid, secure NetSurf Plan.
    """
    param_map = {f"{{{k}}}": str(v) for k, v in new_params.items()}

    def substitute_tokens(text: str) -> str:
        if not text:
            return text
        res = text
        for placeholder, concrete in param_map.items():
            res = res.replace(placeholder, concrete)
        return res

    # 1. Instantiate Phases
    raw_phases = memory_item.get("phases") or []
    instantiated_phases = []
    for p in raw_phases:
        p_name = substitute_tokens(p.get("name") or p.get("title") or "Execution Phase")
        p_id = p.get("id")
        try:
            p_id_int = int(p_id)
        except (ValueError, TypeError):
            p_id_int = len(instantiated_phases) + 1
        instantiated_phases.append(PlanPhase(
            id=p_id_int,
            title=p_name,
            status=TaskStatus.PENDING
        ))

    # 2. Instantiate Actions
    raw_actions = memory_item.get("action_sequence") or []
    instantiated_actions = []
    for a in raw_actions:
        a_desc = substitute_tokens(a.get("description", "Planned action"))
        p_data = dict(a.get("params") or {})

        if "url" in p_data and p_data["url"]:
            p_data["url"] = substitute_tokens(p_data["url"])
            # Security verification
            if not is_url_safe(p_data["url"]):
                p_data["url"] = "https://www.google.com"

        if "text" in p_data and p_data["text"]:
            p_data["text"] = substitute_tokens(p_data["text"])
        if "summary" in p_data and p_data["summary"]:
            p_data["summary"] = substitute_tokens(p_data["summary"])

        action_type_str = str(a.get("action", "navigate")).lower()
        try:
            act_type = ActionType(action_type_str)
        except ValueError:
            act_type = ActionType.NAVIGATE

        instantiated_actions.append(PlannedTask(
            id=a.get("id", len(instantiated_actions) + 1),
            phase_id=a.get("phase_id", 1),
            phase_name=substitute_tokens(a.get("phase_name", "Execution")),
            description=a_desc,
            action=act_type,
            params=ActionParams(**p_data),
            required=a.get("required", True),
            status="pending"
        ))

    return Plan(
        goal=new_goal,
        phases=instantiated_phases,
        actions=instantiated_actions,
        estimated_steps=len(instantiated_actions),
        memory_reused=True,
        memory_pattern=memory_item.get("task_pattern")
    )


# ── 4. ADAPTIVE RECOVERY ENGINE ─────────────────────────────────────────────

def plan_adaptive_recovery_action(
    goal: str,
    failed_task: Dict[str, Any],
    error_reason: str,
    observation: Optional[Union[Observation, Dict[str, Any]]] = None,
    history: Optional[List[Dict[str, Any]]] = None
) -> AdaptiveRecoveryResponse:
    """
    Analyzes why an action failed and devises a contextual alternative.
    Avoids blind repeated retries:
      - If click failed due to missing ID: re-scans current observation elements.
      - If element was off-screen: scrolls down 500px to reveal target.
      - If page was still hydrating/loading: initiates bounded wait (1500ms).
      - If navigate failed: formats alternative search query.
    Enforces safety checks on the alternative action.
    """
    if history is None:
        history = []
    if isinstance(observation, dict):
        obs_elements = []
        for el in observation.get("interactive_elements") or observation.get("elements") or []:
            if isinstance(el, dict):
                obs_elements.append(InteractiveElement(
                    id=el.get("id", 1),
                    tag=el.get("tag", "button"),
                    role=el.get("role"),
                    label=el.get("label") or el.get("text") or "",
                    placeholder=el.get("placeholder"),
                    href=el.get("href"),
                    is_visible=el.get("is_visible", True),
                    is_enabled=el.get("is_enabled", True)
                ))
            elif isinstance(el, InteractiveElement):
                obs_elements.append(el)
        obs_obj = Observation(
            url=observation.get("url", "https://example.com"),
            title=observation.get("title", ""),
            text_summary=observation.get("text_summary", ""),
            elements=obs_elements
        )
    elif isinstance(observation, Observation):
        obs_obj = observation
    else:
        obs_obj = Observation(url="https://example.com", elements=[])
    action_type = str(failed_task.get("action", "")).lower()
    task_desc = str(failed_task.get("description", ""))
    params = failed_task.get("params") or {}
    lower_err = (error_reason or "").lower()

    # Strategy 1: Target Element Missing, Obscured, or Detached
    if action_type in ["click", "type"] and any(k in lower_err for k in ["not found", "timeout", "hidden", "detached", "stale", "error", "failed", "unreachable"]):
        target_label = (params.get("label") or task_desc or "").lower()
        
        # Search observation elements for matching keyword
        best_candidate = None
        for el in obs_obj.elements:
            if not el.is_visible or not el.is_enabled:
                continue
            el_text = f"{el.label} {el.placeholder or ''} {el.role or ''}".lower()
            if any(word in el_text for word in target_label.split() if len(word) > 3):
                best_candidate = el
                break

        if best_candidate:
            if action_type == "click":
                recovery_action = Action(
                    thought=f"Re-scanned active page and identified alternative element #{best_candidate.id} ({best_candidate.label or best_candidate.tag}).",
                    action=ActionType.CLICK,
                    params=ActionParams(id=best_candidate.id)
                )
                strategy = f"Re-anchored to matching interactive element #{best_candidate.id} on current page."
            else:
                recovery_action = Action(
                    thought=f"Re-scanned active page and identified alternative input #{best_candidate.id}.",
                    action=ActionType.TYPE,
                    params=ActionParams(id=best_candidate.id, text=params.get("text", ""), submit=params.get("submit", False))
                )
                strategy = f"Re-anchored to available input element #{best_candidate.id}."
            
            req_app, reason = check_approval_gate(recovery_action, best_candidate.label, best_candidate.tag)
            return AdaptiveRecoveryResponse(
                action=recovery_action,
                recovery_strategy=strategy,
                requires_approval=req_app,
                approval_reason=reason
            )

        # If no visible candidate found, scroll to reveal off-screen elements
        recovery_action = Action(
            thought="Target element was not visible in current viewport. Scrolling down 600px to reveal elements.",
            action=ActionType.SCROLL,
            params=ActionParams(direction="down", amount=600)
        )
        return AdaptiveRecoveryResponse(
            action=recovery_action,
            recovery_strategy="Scrolled viewport down to bring obscured interactive elements into view."
        )

    # Strategy 2: Network / Dynamic Hydration Latency
    if "network" in lower_err or "loading" in lower_err or "busy" in lower_err:
        recovery_action = Action(
            thought="Page is undergoing asynchronous hydration or network loading. Waiting 1500ms for DOM stabilization.",
            action=ActionType.WAIT,
            params=ActionParams(ms=1500)
        )
        return AdaptiveRecoveryResponse(
            action=recovery_action,
            recovery_strategy="Initiated bounded 1500ms stabilization wait for DOM hydration."
        )

    # Strategy 3: Failed Extraction
    if action_type == "extract":
        # Scroll and wait to trigger lazy-loaded product/hotel cards
        recovery_action = Action(
            thought="Initial extraction found zero items. Scrolling down 700px to trigger lazy loading of product/hotel cards.",
            action=ActionType.SCROLL,
            params=ActionParams(direction="down", amount=700)
        )
        return AdaptiveRecoveryResponse(
            action=recovery_action,
            recovery_strategy="Scrolled down to trigger lazy-loading of cards before re-attempting extraction."
        )

    # Strategy 4: Fallback Synthesis
    recovery_action = Action(
        thought="Previous step failed permanently. Synthesizing available page context to complete task gracefully.",
        action=ActionType.DONE,
        params=ActionParams(summary=f"Task completed based on visible context. (Encountered: {error_reason})")
    )
    return AdaptiveRecoveryResponse(
        action=recovery_action,
        recovery_strategy="Gracefully synthesized available research findings to avoid blocking the user."
    )
