"""
NetSurf User-Owned Domain Resources API Routes
Enforces strict per-user authorization:
- User Tasks (GET, POST, GET {id}, DELETE {id})
- User Preferences (GET, PUT)
- User Saved Items (GET, POST, DELETE {id})
- User Workflow Memory (GET, POST)
"""

from fastapi import APIRouter, HTTPException, Depends, status
from pydantic import BaseModel, Field
from typing import Dict, Any, List, Optional
import json

from .auth import get_current_user
from .price_tracker import check_single_tracked_item, check_all_tracked_items
from .database import (
    create_user_task,
    get_user_tasks,
    get_user_task,
    delete_user_task,
    get_user_preferences,
    update_user_preferences,
    reset_user_preferences,
    create_user_saved_item,
    get_user_saved_items,
    get_user_saved_item,
    update_user_saved_item,
    delete_user_saved_item,
    add_price_observation,
    get_price_history_for_item,
    get_all_active_trackers,
    create_user_workflow_memory,
    get_user_workflow_memory,
    get_user_workflow_memory_item,
    delete_user_workflow_memory_item,
    clear_user_workflow_memory,
    save_or_update_workflow_memory,
    increment_workflow_memory_reuse,
    find_matching_workflow_memory
)

router = APIRouter(prefix="/user", tags=["User Resources"])

# ── REQUEST / RESPONSE MODELS ───────────────────────────────────────────────

class CreateTaskRequest(BaseModel):
    goal: str = Field(..., min_length=1)
    domain: Optional[str] = None
    status: str = "completed"
    plan: Optional[Any] = None
    results: Optional[Any] = None

class ShoppingPreferences(BaseModel):
    min_budget: Optional[float] = None
    max_budget: Optional[float] = None
    preferred_brands: Optional[List[str]] = Field(default_factory=list)
    excluded_brands: Optional[List[str]] = Field(default_factory=list)
    min_rating: Optional[float] = None
    preferred_sellers: Optional[List[str]] = Field(default_factory=list)
    exclusive_brands: Optional[bool] = False
    min_ram: Optional[int] = None
    min_storage: Optional[int] = None
    product_categories: Optional[List[str]] = Field(default_factory=list)
    priorities: Optional[List[str]] = Field(default_factory=lambda: ["price", "performance", "battery", "camera", "rating"])

class TravelPreferences(BaseModel):
    preferred_destinations: Optional[List[str]] = Field(default_factory=list)
    preferred_airlines: Optional[List[str]] = Field(default_factory=list)
    excluded_airlines: Optional[List[str]] = Field(default_factory=list)
    max_budget: Optional[float] = None
    max_stops: Optional[int] = None
    preferred_departure_times: Optional[List[str]] = Field(default_factory=list)
    hotel_budget: Optional[float] = None
    min_hotel_rating: Optional[float] = None
    amenities: Optional[List[str]] = Field(default_factory=list)
    num_guests: Optional[int] = 2
    preferred_hotel_categories: Optional[List[str]] = Field(default_factory=list)

class JobPreferences(BaseModel):
    preferred_roles: Optional[List[str]] = Field(default_factory=list)
    preferred_locations: Optional[List[str]] = Field(default_factory=list)
    experience_level: Optional[str] = None
    min_salary: Optional[float] = None

class MoviePreferences(BaseModel):
    preferred_languages: Optional[List[str]] = Field(default_factory=list)
    preferred_formats: Optional[List[str]] = Field(default_factory=list)
    preferred_cinemas: Optional[List[str]] = Field(default_factory=list)

class GeneralPreferences(BaseModel):
    preferred_websites: Optional[List[str]] = Field(default_factory=list)
    default_currency: Optional[str] = "INR"
    language: Optional[str] = "English"
    search_preferences: Optional[Dict[str, Any]] = Field(default_factory=dict)

class PreferencesUpdateRequest(BaseModel):
    preferred_job_roles: Optional[List[str]] = None
    preferred_locations: Optional[List[str]] = None
    product_preferences: Optional[Dict[str, Any]] = None
    shopping: Optional[ShoppingPreferences] = None
    travel: Optional[TravelPreferences] = None
    jobs: Optional[JobPreferences] = None
    movies: Optional[MoviePreferences] = None
    general: Optional[GeneralPreferences] = None
    enable_workflow_memory: Optional[bool] = None

class CreateSavedItemRequest(BaseModel):
    item_type: str = Field(..., min_length=1)
    title: str = Field(..., min_length=1)
    content: Optional[Any] = None
    url: Optional[str] = ""
    currency: Optional[str] = "INR"
    initial_price: Optional[float] = None
    current_price: Optional[float] = None
    target_price: Optional[float] = None
    tracking_enabled: Optional[bool] = False

class UpdateSavedItemRequest(BaseModel):
    title: Optional[str] = None
    url: Optional[str] = None
    target_price: Optional[float] = None
    tracking_enabled: Optional[bool] = None
    current_price: Optional[float] = None

class RecordObservationRequest(BaseModel):
    item_id: str
    observed_price: float
    currency: Optional[str] = "INR"
    source_url: Optional[str] = ""
    extraction_status: Optional[str] = "verified"
    note: Optional[str] = ""

class CreateWorkflowMemoryRequest(BaseModel):
    task_pattern: str = Field(..., min_length=1)
    learned_solution: Optional[Any] = None
    category: Optional[str] = "general"
    description: Optional[str] = ""
    parameters: Optional[List[str]] = Field(default_factory=list)
    action_sequence: Optional[List[Dict[str, Any]]] = Field(default_factory=list)
    phases: Optional[List[Dict[str, Any]]] = Field(default_factory=list)

class RecordWorkflowOutcomeRequest(BaseModel):
    memory_id: Optional[str] = None
    task_pattern: Optional[str] = None
    success: bool = True
    failure_condition: Optional[str] = None

# ── TASKS ENDPOINTS ─────────────────────────────────────────────────────────

@router.get("/tasks")
def list_tasks(current_user: Dict[str, Any] = Depends(get_current_user)):
    """Returns only tasks belonging to the authenticated user."""
    tasks = get_user_tasks(current_user["id"])
    for t in tasks:
        if t.get("plan"):
            try:
                t["plan"] = json.loads(t["plan"])
            except Exception:
                pass
        if t.get("results"):
            try:
                t["results"] = json.loads(t["results"])
            except Exception:
                pass
    return tasks

@router.post("/tasks", status_code=status.HTTP_201_CREATED)
def create_task(req: CreateTaskRequest, current_user: Dict[str, Any] = Depends(get_current_user)):
    """Creates a new task associated strictly with the authenticated user."""
    task = create_user_task(
        user_id=current_user["id"],
        goal=req.goal,
        domain=req.domain,
        status=req.status,
        plan=req.plan,
        results=req.results
    )
    return task

@router.get("/tasks/{task_id}")
def get_task(task_id: str, current_user: Dict[str, Any] = Depends(get_current_user)):
    """Retrieves a task ensuring strict user ownership (returns 404 if not found or owned by another user)."""
    task = get_user_task(current_user["id"], task_id)
    if not task:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Task not found or access denied"
        )
    return task

@router.delete("/tasks/{task_id}")
def delete_task(task_id: str, current_user: Dict[str, Any] = Depends(get_current_user)):
    """Deletes a task ensuring strict user ownership."""
    success = delete_user_task(current_user["id"], task_id)
    if not success:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Task not found or access denied"
        )
    return {"status": "deleted", "task_id": task_id}

# ── PREFERENCES ENDPOINTS ───────────────────────────────────────────────────

@router.get("/preferences")
def get_preferences(current_user: Dict[str, Any] = Depends(get_current_user)):
    """Returns personalized browsing & job/product preferences for the authenticated user."""
    return get_user_preferences(current_user["id"])

@router.put("/preferences")
def update_preferences(req: PreferencesUpdateRequest, current_user: Dict[str, Any] = Depends(get_current_user)):
    """Updates personalized preferences (shopping, travel, general) for the authenticated user."""
    shopping_dict = req.shopping.model_dump(exclude_unset=True) if req.shopping else None
    travel_dict = req.travel.model_dump(exclude_unset=True) if req.travel else None
    jobs_dict = req.jobs.model_dump(exclude_unset=True) if req.jobs else None
    movies_dict = req.movies.model_dump(exclude_unset=True) if req.movies else None
    general_dict = req.general.model_dump(exclude_unset=True) if req.general else None

    updated = update_user_preferences(
        user_id=current_user["id"],
        preferred_job_roles=req.preferred_job_roles,
        preferred_locations=req.preferred_locations,
        product_preferences=req.product_preferences,
        shopping=shopping_dict,
        travel=travel_dict,
        jobs=jobs_dict,
        movies=movies_dict,
        general=general_dict,
        enable_workflow_memory=req.enable_workflow_memory
    )
    return updated

@router.delete("/preferences")
def reset_preferences(current_user: Dict[str, Any] = Depends(get_current_user)):
    """Resets user preferences back to system defaults."""
    return reset_user_preferences(current_user["id"])

# ── SAVED ITEMS & PRICE TRACKING ENDPOINTS (PHASE 6) ────────────────────────

@router.get("/saved")
def list_saved(
    item_type: Optional[str] = None,
    tracking_only: bool = False,
    current_user: Dict[str, Any] = Depends(get_current_user)
):
    """Lists saved items (products, hotels, websites, workflows) belonging to the authenticated user."""
    items = get_user_saved_items(current_user["id"], item_type=item_type, tracking_only=tracking_only)
    return items

@router.post("/saved", status_code=status.HTTP_201_CREATED)
def create_saved(req: CreateSavedItemRequest, current_user: Dict[str, Any] = Depends(get_current_user)):
    """Saves a product, hotel, website, or workflow associated strictly with the authenticated user."""
    item = create_user_saved_item(
        user_id=current_user["id"],
        item_type=req.item_type,
        title=req.title,
        content=req.content,
        url=req.url or "",
        currency=req.currency or "INR",
        initial_price=req.initial_price,
        current_price=req.current_price,
        target_price=req.target_price,
        tracking_enabled=bool(req.tracking_enabled)
    )
    return item

@router.get("/saved/{item_id}")
def get_saved(item_id: str, current_user: Dict[str, Any] = Depends(get_current_user)):
    """Retrieves an individual saved item ensuring strict user isolation."""
    item = get_user_saved_item(current_user["id"], item_id)
    if not item:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Saved item not found or access denied"
        )
    return item

@router.put("/saved/{item_id}")
def update_saved(item_id: str, req: UpdateSavedItemRequest, current_user: Dict[str, Any] = Depends(get_current_user)):
    """Updates price target, tracking toggle, or title for a saved item."""
    updated = update_user_saved_item(
        user_id=current_user["id"],
        item_id=item_id,
        title=req.title,
        url=req.url,
        target_price=req.target_price,
        tracking_enabled=req.tracking_enabled,
        current_price=req.current_price
    )
    if not updated:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Saved item not found or access denied"
        )
    return updated

@router.delete("/saved/{item_id}")
def delete_saved(item_id: str, current_user: Dict[str, Any] = Depends(get_current_user)):
    """Deletes a saved item and cascades to historical price observations."""
    success = delete_user_saved_item(current_user["id"], item_id)
    if not success:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Saved item not found or access denied"
        )
    return {"status": "deleted", "item_id": item_id}

@router.get("/saved/{item_id}/history")
def get_saved_price_history(item_id: str, current_user: Dict[str, Any] = Depends(get_current_user)):
    """Returns the timeline of verified price observations for historical chart rendering."""
    item = get_user_saved_item(current_user["id"], item_id)
    if not item:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Saved item not found or access denied"
        )
    history = get_price_history_for_item(current_user["id"], item_id)
    return {
        "item_id": item_id,
        "title": item.get("title", ""),
        "currency": item.get("currency", "INR"),
        "initial_price": item.get("initial_price"),
        "current_price": item.get("current_price"),
        "target_price": item.get("target_price"),
        "tracking_enabled": item.get("tracking_enabled", False),
        "history": history
    }

@router.post("/saved/{item_id}/check")
def check_single_price(item_id: str, current_user: Dict[str, Any] = Depends(get_current_user)):
    """Triggers an on-demand verified price check against the source website."""
    item = get_user_saved_item(current_user["id"], item_id)
    if not item:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Saved item not found or access denied"
        )
    updated_item, notification = check_single_tracked_item(item, current_user["id"])
    return {
        "item": updated_item,
        "notification": notification
    }

@router.post("/tracking/check-all")
def check_all_prices(current_user: Dict[str, Any] = Depends(get_current_user)):
    """Triggers a background check across all active price trackers for the user."""
    updated_items, notifications = check_all_tracked_items(current_user["id"])
    return {
        "checked_count": len(updated_items),
        "items": updated_items,
        "notifications": notifications
    }

@router.post("/tracking/record-observation")
def record_price_observation(req: RecordObservationRequest, current_user: Dict[str, Any] = Depends(get_current_user)):
    """Allows side panel / content script to submit an on-page verified price observation."""
    item = get_user_saved_item(current_user["id"], req.item_id)
    if not item:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Saved item not found or access denied"
        )
    obs = add_price_observation(
        item_id=req.item_id,
        user_id=current_user["id"],
        observed_price=req.observed_price,
        currency=req.currency or "INR",
        source_url=req.source_url or item.get("url", ""),
        extraction_status=req.extraction_status or "verified",
        note=req.note or "On-page observation"
    )
    return obs

# ── WORKFLOW MEMORY ENDPOINTS ───────────────────────────────────────────────

@router.get("/memory")
def list_memory(current_user: Dict[str, Any] = Depends(get_current_user)):
    """Returns workflow memory patterns and execution statistics strictly for the authenticated user."""
    memories = get_user_workflow_memory(current_user["id"])
    for m in memories:
        for key in ["learned_solution", "parameters", "action_sequence", "phases", "failure_conditions"]:
            if key in m and isinstance(m[key], str):
                try:
                    m[key] = json.loads(m[key])
                except Exception:
                    pass
    return memories

@router.post("/memory", status_code=status.HTTP_201_CREATED)
def create_memory(req: CreateWorkflowMemoryRequest, current_user: Dict[str, Any] = Depends(get_current_user)):
    """Persists a learned solution pattern associated with the authenticated user."""
    if req.action_sequence:
        mem = save_or_update_workflow_memory(
            user_id=current_user["id"],
            task_pattern=req.task_pattern,
            category=req.category or "general",
            description=req.description or "",
            parameters=req.parameters or [],
            action_sequence=req.action_sequence,
            phases=req.phases or []
        )
    else:
        mem = create_user_workflow_memory(
            user_id=current_user["id"],
            task_pattern=req.task_pattern,
            learned_solution=req.learned_solution or []
        )
    return mem

@router.delete("/memory/{memory_id}")
def delete_memory_item(memory_id: str, current_user: Dict[str, Any] = Depends(get_current_user)):
    """Deletes an individual saved workflow memory item owned by the authenticated user."""
    success = delete_user_workflow_memory_item(current_user["id"], memory_id)
    if not success:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Workflow memory item not found or unauthorized access"
        )
    return {"status": "deleted", "memory_id": memory_id}

@router.delete("/memory")
def clear_all_memory(current_user: Dict[str, Any] = Depends(get_current_user)):
    """Clears all workflow memory patterns belonging to the authenticated user."""
    count = clear_user_workflow_memory(current_user["id"])
    return {"status": "cleared", "deleted_count": count}

@router.post("/memory/record")
def record_outcome(req: RecordWorkflowOutcomeRequest, current_user: Dict[str, Any] = Depends(get_current_user)):
    """Records an execution outcome (success/failure) for workflow pattern reuse tracking."""
    if req.memory_id:
        updated = increment_workflow_memory_reuse(
            user_id=current_user["id"],
            memory_id=req.memory_id,
            success=req.success,
            failure_condition=req.failure_condition
        )
    elif req.task_pattern:
        existing = find_matching_workflow_memory(current_user["id"], req.task_pattern)
        if existing:
            updated = increment_workflow_memory_reuse(
                user_id=current_user["id"],
                memory_id=existing["id"],
                success=req.success,
                failure_condition=req.failure_condition
            )
        else:
            updated = None
    else:
        updated = None

    return {"status": "recorded", "memory": updated}
