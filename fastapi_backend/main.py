import logging
from fastapi import FastAPI, HTTPException, Depends
from fastapi.middleware.cors import CORSMiddleware
from typing import Dict, Any, Optional

from .config import settings
from .schemas import (
    HealthResponse,
    PlanRequest,
    Plan,
    StepRequest,
    StepResponse,
    Action,
    ActionType,
    ActionParams,
    RankRequest,
    TaskClassification
)
from .planner import generate_plan, plan_next_step, classify_task_request
from .safety import check_approval_gate, is_captcha_detected, is_url_safe
from .verifier import verify_action, VerificationResult, validate_completion
from .auth import get_optional_current_user
from .auth_routes import router as auth_router
from .user_routes import router as user_router
from .database import create_user_task, get_user_preferences, find_matching_workflow_memory, save_or_update_workflow_memory
from .personalizer import merge_preferences_with_goal
from .recommendation import rank_extracted_items
from .workflow_memory import (
    extract_task_signature,
    templatize_action_sequence,
    instantiate_templated_workflow,
    plan_adaptive_recovery_action,
    AdaptiveRecoveryRequest,
    AdaptiveRecoveryResponse
)
from .qa_service import PageQARequest, PageQAResponse, answer_page_question

# Configure logging
logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(name)s: %(message)s")
logger = logging.getLogger("netsurf.fastapi")

app = FastAPI(
    title="Netsurf Agentic Browser Backend",
    description="Multi-user authentication, session tracking, and reasoning brain for the Netsurf Chrome Extension",
    version="2.0.0"
)

# CORS Middleware configured securely for Chrome extensions and local development
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.ALLOWED_ORIGINS,
    allow_origin_regex=settings.ALLOWED_ORIGIN_REGEX,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# In-memory sliding window rate limiter for sensitive auth endpoints
import time
from collections import defaultdict
from fastapi import Request, Response, status
from fastapi.responses import JSONResponse

RATE_LIMIT_STORE = defaultdict(list)
RATE_LIMIT_WINDOW_SECONDS = 60
RATE_LIMIT_MAX_ATTEMPTS = 60

@app.middleware("http")
async def security_and_rate_limit_middleware(request: Request, call_next):
    path = request.url.path
    if path in ("/auth/login", "/auth/register"):
        client_ip = request.client.host if request.client else "unknown"
        now = time.time()
        # Clean older requests outside window
        RATE_LIMIT_STORE[client_ip] = [t for t in RATE_LIMIT_STORE[client_ip] if now - t < RATE_LIMIT_WINDOW_SECONDS]
        if len(RATE_LIMIT_STORE[client_ip]) >= RATE_LIMIT_MAX_ATTEMPTS:
            return JSONResponse(
                status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                content={"detail": "Too many requests. Please wait a minute before trying again."}
            )
        RATE_LIMIT_STORE[client_ip].append(now)

    response = await call_next(request)

    # Security Headers Injection
    response.headers["X-Content-Type-Options"] = "nosniff"
    response.headers["X-Frame-Options"] = "DENY"
    response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
    response.headers["X-XSS-Protection"] = "1; mode=block"

    return response

# Register authentication and multi-user domain resource routes
app.include_router(auth_router)
app.include_router(user_router)


@app.get("/")
def root():
    """Root endpoint welcoming users and providing health/docs links."""
    return {
        "app": settings.APP_NAME,
        "service": "Netsurf Agentic Backend with Multi-User Authentication",
        "status": "online",
        "model": settings.GEMINI_MODEL,
        "endpoints": {
            "health": "/health",
            "docs": "/docs",
            "auth_register": "POST /auth/register",
            "auth_login": "POST /auth/login",
            "auth_refresh": "POST /auth/refresh",
            "auth_logout": "POST /auth/logout",
            "auth_me": "GET /auth/me",
            "user_tasks": "/user/tasks",
            "user_preferences": "/user/preferences",
            "user_saved": "/user/saved",
            "user_memory": "/user/memory",
            "agent_plan": "POST /agent/plan",
            "agent_step": "POST /agent/step",
            "agent_verify": "POST /agent/verify"
        },
        "instructions": "Netsurf backend is running! Open the Netsurf Chrome Extension side panel to run tasks."
    }


@app.get("/health", response_model=HealthResponse)
def health_check():
    """Health check endpoint pings model connection and reports app status."""
    has_key = bool(settings.GEMINI_API_KEY and not settings.GEMINI_API_KEY.startswith("your-"))
    return HealthResponse(
        status="ok",
        app=settings.APP_NAME,
        model=settings.GEMINI_MODEL,
        has_api_key=has_key,
        mode="full" if has_key else "degraded",
        warning=None if has_key else
        "No GEMINI_API_KEY configured: using built-in heuristic planning. Set GEMINI_API_KEY in .env for full quality.",
    )


@app.post("/agent/classify", response_model=TaskClassification)
def classify_task(request: PlanRequest, current_user: Optional[Dict[str, Any]] = Depends(get_optional_current_user)):
    """Classifies user natural-language request into structured task intent, platform, parameters, and confirmation gates."""
    if not request.goal or not request.goal.strip():
        raise HTTPException(status_code=400, detail="Goal cannot be empty")
    user_prefs = None
    if current_user and current_user.get("id"):
        try:
            user_prefs = get_user_preferences(current_user["id"])
        except Exception:
            pass
    elif request.preferences:
        user_prefs = request.preferences
    return classify_task_request(request.goal.strip(), request.observation, user_prefs)


@app.post("/agent/plan", response_model=Plan)
def create_plan(request: PlanRequest, current_user: Optional[Dict[str, Any]] = Depends(get_optional_current_user)):
    """Generates an initial high-level sequence of steps for the goal with personalization (Phase 3)."""
    if not request.goal or not request.goal.strip():
        raise HTTPException(status_code=400, detail="Goal cannot be empty")
    
    # Retrieve user preferences from DB if logged in, or from request if guest
    user_prefs = None
    if current_user and current_user.get("id"):
        try:
            user_prefs = get_user_preferences(current_user["id"])
        except Exception as e:
            logger.warning(f"Failed to fetch preferences for user {current_user['id']}: {e}")
    elif request.preferences:
        user_prefs = request.preferences

    # Check if workflow memory reuse is enabled
    memory_enabled = True
    if user_prefs and user_prefs.get("enable_workflow_memory") is not None:
        memory_enabled = str(user_prefs.get("enable_workflow_memory")).lower() not in ["false", "0"]

    plan = None
    if memory_enabled and current_user and current_user.get("id"):
        category, pattern, params = extract_task_signature(request.goal.strip())
        matched_mem = find_matching_workflow_memory(current_user["id"], pattern)
        if matched_mem and matched_mem.get("action_sequence"):
            logger.info(f"Reusing verified workflow pattern '{pattern}' for user {current_user['id']}")
            plan = instantiate_templated_workflow(matched_mem, request.goal.strip(), params)
            plan.memory_reused = True
            plan.memory_pattern = pattern

    if plan is None:
        plan = generate_plan(request.goal.strip(), request.observation, user_preferences=user_prefs)
    
    # Associate task with authenticated user if logged in
    if current_user and current_user.get("id"):
        try:
            create_user_task(
                user_id=current_user["id"],
                goal=request.goal.strip(),
                domain=getattr(request.observation, "url", None),
                status="in_progress",
                plan=plan.model_dump() if hasattr(plan, "model_dump") else plan.dict()
            )
        except Exception as e:
            logger.warning(f"Failed to record task for user {current_user['id']}: {e}")

    return plan


@app.post("/agent/personalize")
def personalize_task_endpoint(payload: Dict[str, Any], current_user: Optional[Dict[str, Any]] = Depends(get_optional_current_user)):
    """
    Personalization analysis endpoint: classifies task category, extracts explicit criteria,
    and merges saved user preferences with strict priority overrides.
    """
    goal = payload.get("goal", "").strip()
    if not goal:
        raise HTTPException(status_code=400, detail="Goal cannot be empty")
    
    user_prefs = None
    if current_user and current_user.get("id"):
        try:
            user_prefs = get_user_preferences(current_user["id"])
        except Exception as e:
            logger.warning(f"Failed to fetch preferences for user {current_user['id']}: {e}")
    elif payload.get("preferences"):
        user_prefs = payload["preferences"]
    
    return merge_preferences_with_goal(goal, user_prefs)


@app.post("/agent/step", response_model=StepResponse)
def get_next_step(request: StepRequest):
    """
    Evaluates current observation and execution history, returning the next validated action.
    Enforces CAPTCHA checks and evaluates the human approval gate.
    """
    if not request.goal or not request.goal.strip():
        raise HTTPException(status_code=400, detail="Goal cannot be empty")

    # 1. Anti-bot / CAPTCHA guard
    if is_captcha_detected(request.observation.text_summary):
        return StepResponse(
            action=Action(
                thought="Detected CAPTCHA or bot verification challenge on page. Halting per safety policy.",
                action=ActionType.FAIL,
                params=ActionParams(reason="CAPTCHA or bot verification detected on current page.")
            ),
            requires_approval=False
        )

    # 2. Plan next action using Gemini / fallback
    action = plan_next_step(
        request.goal,
        request.history,
        request.observation,
        current_task=request.current_task,
        plan=request.plan
    )

    # 3. Lookup target element label if ID is present
    element_label = ""
    element_tag = ""
    if action.params.id is not None:
        for el in request.observation.elements:
            if el.id == action.params.id:
                element_label = el.label
                element_tag = el.tag
                break

    # 4. Check approval gate
    requires_approval, approval_reason = check_approval_gate(action, element_label, element_tag)

    return StepResponse(
        action=action,
        requires_approval=requires_approval,
        approval_reason=approval_reason
    )


@app.post("/agent/verify", response_model=VerificationResult)
def verify_execution(payload: Dict[str, Any]):
    """Verifies that an executed action produced the intended outcome."""
    action_type = payload.get("action_type", "")
    params = payload.get("params", {})
    prev_obs = payload.get("prev_observation", {})
    curr_obs = payload.get("curr_observation", {})
    extracted_data = payload.get("extracted_data")

    result = verify_action(action_type, params, prev_obs, curr_obs, extracted_data)
    return result


@app.post("/agent/validate_completion")
def validate_task_completion(payload: Dict[str, Any]):
    """Enforces completion condition checks across plan actions and records."""
    plan = payload.get("plan", {})
    extracted_data = payload.get("extracted_data", [])
    history = payload.get("history", [])
    export_generated = payload.get("export_generated", False)
    return validate_completion(plan, extracted_data, history, export_generated)


@app.post("/agent/recover", response_model=AdaptiveRecoveryResponse)
def recover_failed_action(
    request: AdaptiveRecoveryRequest,
    current_user: Optional[Dict[str, Any]] = Depends(get_optional_current_user)
):
    """
    Adaptive Recovery Endpoint (Phase 5).
    Re-examines current page observation after action failure and generates
    a contextual alternative strategy without blind repeated retries.
    """
    recovery = plan_adaptive_recovery_action(
        goal=request.goal,
        failed_task=request.failed_task,
        error_reason=request.error_reason,
        observation=request.observation,
        history=request.history
    )
    return recovery


@app.post("/agent/learn")
def learn_successful_workflow(
    payload: Dict[str, Any],
    current_user: Optional[Dict[str, Any]] = Depends(get_optional_current_user)
):
    """
    Workflow Memory Learning Endpoint (Phase 5).
    Extracts recurring signatures, templatizes concrete parameters ({city}, {budget}, etc.),
    and persists generalized action sequences into user workflow memory.
    """
    if not current_user or not current_user.get("id"):
        return {"status": "skipped", "reason": "Workflow memory is stored for authenticated users"}

    goal = payload.get("goal", "").strip()
    plan_dict = payload.get("plan", {})
    if not goal or not plan_dict:
        return {"status": "skipped", "reason": "Missing goal or plan"}

    category, pattern, params = extract_task_signature(goal)
    try:
        plan_obj = Plan(**plan_dict)
    except Exception as e:
        logger.warning(f"Failed to parse plan for learning: {e}")
        return {"status": "error", "message": str(e)}

    templated_actions, templated_phases = templatize_action_sequence(plan_obj, params)

    memory_item = save_or_update_workflow_memory(
        user_id=current_user["id"],
        task_pattern=pattern,
        category=category,
        description=f"Automated {category} workflow for {', '.join(params.keys()) or 'general task'}",
        parameters=list(params.keys()),
        action_sequence=templated_actions,
        phases=templated_phases
    )

    return {"status": "learned", "pattern": pattern, "memory_id": memory_item["id"]}


@app.post("/recommend/rank")
def rank_items_endpoint(request: RankRequest):
    """
    Deterministic Web Extraction & Recommendation Endpoint.
    Applies normalization, hard constraint filters, and category-weighted scoring.
    Does NOT rely on Gemini hallucinations for final product or hotel rankings.
    """
    from .feed import is_feed_request, build_feed

    # Chronological feeds are ordered newest-first and bypass recommendation scoring entirely.
    if is_feed_request(request.category or (request.requirements or {}).get("category"), request.user_goal):
        feed = build_feed(request.items)
        feed["sources"] = []
        return feed

    from .answer_items import parse_answer_items

    # Search-result records describe pages ABOUT the items (articles, threads, listicles), not the
    # items themselves. When real item records exist - parsed from the agent's synthesized answer, or
    # extracted from product/listing pages - rank those and keep the search results as cited sources.
    items = list(request.items)
    answer_items = parse_answer_items(request.answer_text or "")
    from .page_kind import looks_like_page_about_items

    budget = (request.requirements or {}).get("budget_max") or (request.requirements or {}).get("max_price")
    try:
        budget = float(budget) if budget else None
    except (TypeError, ValueError):
        budget = None
    # Don't rely on the extension having tagged the record: detect pages-about-items here too.
    serp = [i for i in items if looks_like_page_about_items(i, budget)]
    serp_ids = {id(i) for i in serp}
    real = [i for i in items if id(i) not in serp_ids] + answer_items
    sources: list = []
    if serp and real:
        sources = [{"title": i.get("title") or i.get("name"), "url": i.get("link") or i.get("url") or i.get("product_url"),
                    "domain": i.get("source_website")} for i in serp]
        items = real
    elif answer_items:
        items = items + answer_items

    req_data = dict(request.requirements or {})
    # Sponsored listings are excluded by default; callers must opt in explicitly.
    req_data.setdefault("exclude_sponsored", True)
    if request.weights:
        req_data["weights"] = request.weights
    # Inject user_goal as prompt_context so prompt-driven ranking and category
    # validation work correctly across all sessions.
    if request.user_goal and not req_data.get("prompt_context"):
        req_data["prompt_context"] = request.user_goal
    result = rank_extracted_items(items, req_data, category=request.category).model_dump()
    result["sources"] = sources
    return result


@app.post("/page/qa", response_model=PageQAResponse)
def page_qa_endpoint(request: PageQARequest):
    """
    Grounded question-answering on active webpage content using the RAG pipeline:
    Clean -> Chunk -> Retrieve -> Grounded Answer -> Verifiable Evidence.
    Does NOT hallucinate, guess unvisited URLs, or redirect to Google.
    """
    return answer_page_question(request)


if __name__ == "__main__":
    import uvicorn
    uvicorn.run("fastapi_backend.main:app", host=settings.HOST, port=settings.PORT, reload=True)
