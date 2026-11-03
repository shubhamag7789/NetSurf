from datetime import datetime, timezone
from enum import Enum
from typing import Optional, List, Dict, Any, Union
from pydantic import BaseModel, Field


class UniversalRecord(BaseModel):
    """
    Standard common record structure across all web domains (Phase 2 Section C).
    """
    record_id: str = Field(..., description="Unique deterministic identifier for the extracted record")
    category: str = Field("generic", description="Category: product, flight, hotel, job, movie, article, table, generic")
    title: str = Field(..., description="Canonical title or name of the extracted item")
    description: str = Field("", description="Textual description or snippet summary")
    structured_attributes: Dict[str, Any] = Field(default_factory=dict, description="Category-specific attributes")
    price: Optional[float] = Field(None, description="Normalized numeric price value (null if absent, never 0.0 unless free)")
    currency: str = Field("INR", description="Standard 3-letter currency code (INR, USD, EUR, GBP)")
    raw_price: str = Field("", description="Original verbatim price string extracted from the DOM")
    rating: Optional[float] = Field(None, description="Numeric customer or critic rating (null if absent)")
    source_url: str = Field("", description="Authentic destination URL or canonical page link")
    source_website: str = Field("", description="Store or publisher domain/platform name")
    extraction_timestamp: str = Field(default_factory=lambda: datetime.now(timezone.utc).isoformat())
    evidence: Dict[str, Any] = Field(default_factory=dict, description="Source element references or DOM grounding clues")
    sponsored_status: bool = Field(False, description="Whether the record represents an advertisement or sponsored listing")
    validation_status: str = Field("valid", description="Validation status: valid, incomplete, suspicious")


class ActionType(str, Enum):
    NAVIGATE = "navigate"
    CLICK = "click"
    TYPE = "type"
    FILL_FORM = "fill_form"
    SCROLL = "scroll"
    WAIT = "wait"
    EXTRACT = "extract"
    ASK_USER = "ask_user"
    DONE = "done"
    FAIL = "fail"


class InteractiveElement(BaseModel):
    id: int = Field(..., description="Stable numeric identifier assigned to interactive element")
    tag: str = Field(..., description="HTML tag name, e.g. a, button, input, select")
    role: Optional[str] = Field(None, description="ARIA role or inferred role")
    label: str = Field("", description="Visible text label or aria-label")
    placeholder: Optional[str] = Field(None, description="Input placeholder if any")
    href: Optional[str] = Field(None, description="Hyperlink URL if tag is anchor")
    is_visible: bool = Field(True, description="Whether element is currently visible in viewport")
    is_enabled: bool = Field(True, description="Whether element is enabled and not disabled")


class Observation(BaseModel):
    url: str = Field(..., description="Current page URL")
    title: str = Field("", description="Current page title")
    text_summary: str = Field("", description="Truncated summary of visible page text")
    elements: List[InteractiveElement] = Field(default_factory=list, description="List of interactive elements with stable IDs")
    page_links: Optional[List[Dict[str, Any]]] = Field(default_factory=list, description="Top detected platform/product links with verified URLs")
    error: Optional[str] = Field(None, description="Error encountered during observation if any")


class ActionParams(BaseModel):
    url: Optional[str] = Field(None, description="URL for navigate action")
    id: Optional[int] = Field(None, description="Numeric element ID for click or type action")
    text: Optional[str] = Field(None, description="Text string for type action")
    submit: Optional[bool] = Field(False, description="Whether to press Enter/submit after typing")
    direction: Optional[str] = Field("down", description="Scroll direction: up, down, top, bottom")
    amount: Optional[int] = Field(500, description="Pixel scroll amount")
    ms: Optional[int] = Field(1000, description="Wait duration in milliseconds (bounded <= 3000)")
    fields: Optional[List[str]] = Field(None, description="List of fields to extract, e.g. ['title', 'price', 'rating']")
    data: Optional[Dict[str, Any]] = Field(None, description="Key-value mapping of form field data for fill_form action")
    question: Optional[str] = Field(None, description="Question text for ask_user action")
    summary: Optional[str] = Field(None, description="Summary description for done action")
    reason: Optional[str] = Field(None, description="Failure reason for fail action")


class Action(BaseModel):
    thought: str = Field(..., description="Concise reasoning explaining why this action was chosen")
    action: ActionType = Field(..., description="Strict action type from supported allowlist")
    params: ActionParams = Field(default_factory=ActionParams, description="Parameters tailored for the action")


class TaskStatus(str, Enum):
    PENDING = "pending"
    RUNNING = "running"
    COMPLETED = "completed"
    FAILED = "failed"
    RETRYING = "retrying"
    SKIPPED = "skipped"
    CANCELLED = "cancelled"


class PlannedTask(BaseModel):
    id: int = Field(..., description="1-indexed sequence number of the action step")
    phase_id: int = Field(1, description="Phase index this task belongs to")
    phase_name: str = Field("", description="Title of the phase")
    description: str = Field(..., description="Actionable description of the planned action")
    action: ActionType = Field(..., description="Action to execute")
    params: ActionParams = Field(default_factory=ActionParams, description="Parameters for the action")
    required: bool = Field(True, description="Whether this task is mandatory to achieve the goal")
    status: TaskStatus = Field(TaskStatus.PENDING, description="Execution status")
    skip_reason: Optional[str] = Field(None, description="Reason if step was skipped")
    error: Optional[str] = Field(None, description="Error message if step failed")
    retries: int = Field(0, description="Current retry attempt count")
    max_retries: int = Field(2, description="Maximum retry attempts allowed")
    result: Optional[str] = Field(None, description="Execution outcome summary")


class PlanPhase(BaseModel):
    id: int = Field(..., description="Phase index, 1-indexed")
    title: str = Field(..., description="High-level workflow phase title")
    status: TaskStatus = Field(TaskStatus.PENDING, description="Status of the phase")
    task_ids: List[int] = Field(default_factory=list, description="IDs of tasks in this phase")


class WorkflowPhase(BaseModel):
    id: Union[int, str] = Field(1, description="Phase ID")
    name: str = Field("Execution Phase", description="Phase name")
    title: Optional[str] = None
    description: Optional[str] = ""
    status: str = "pending"
    task_ids: List[int] = Field(default_factory=list)


class CompletionCriteria(BaseModel):
    require_all_required_steps: bool = Field(True, description="All required steps must complete")
    required_fields: List[str] = Field(default_factory=list, description="Extracted records must contain these fields")
    min_records: int = Field(0, description="Minimum number of records required if extracting")
    require_source_urls: bool = Field(True, description="Records must retain source URLs")
    require_verification: bool = Field(True, description="Verification must be successful")
    require_export: bool = Field(False, description="CSV or data export must be generated if requested")


class TaskClassification(BaseModel):
    user_intent: str = Field(..., description="High-level user intent e.g. SEARCH_AND_COMPARE, BOOKING_LOOKUP, JOB_SEARCH, PAGE_QA")
    task_category: str = Field("general", description="Task category: flight, shopping, jobs, movies, hotels, data_extraction, form_autofill, page_qa, general")
    target_website: Optional[str] = Field(None, description="Target website URL if specified or detected")
    target_website_name: Optional[str] = Field(None, description="Human readable name of target site e.g. MakeMyTrip")
    is_already_open: bool = Field(False, description="Whether the active browser page is already on the target platform")
    search_parameters: Dict[str, Any] = Field(default_factory=dict, description="Extracted search parameters (origin, destination, dates, role, etc.)")
    filters_and_preferences: Dict[str, Any] = Field(default_factory=dict, description="Constraints, budget, minimum specs, or brands")
    expected_output: str = Field("", description="Expected output description for user transparency")
    requires_confirmation: bool = Field(False, description="Whether task contains consequential actions needing human confirmation")
    confirmation_reason: Optional[str] = Field(None, description="Reason human confirmation is required")
    summary_text: str = Field("", description="Crisp one-line summary for user display")

    @property
    def target_website_url(self) -> Optional[str]:
        return self.target_website


class Plan(BaseModel):
    goal: str = Field(..., description="Original user goal")
    steps: List[str] = Field(default_factory=list, description="High-level sequence of expected steps (backwards compatible)")
    phases: List[PlanPhase] = Field(default_factory=list, description="Structured workflow phases")
    actions: List[PlannedTask] = Field(default_factory=list, description="Discrete executable action steps")
    completion_criteria: CompletionCriteria = Field(default_factory=CompletionCriteria, description="Goal satisfaction criteria")
    memory_reused: bool = Field(False, description="Whether this plan was adapted from verified workflow memory")
    memory_pattern: Optional[str] = Field(None, description="Matched pattern signature if reused")
    task_classification: Optional[TaskClassification] = Field(None, description="Structured task intent and classification")


class HistoryItem(BaseModel):
    step_number: int
    thought: str
    action: str
    params: Dict[str, Any] = Field(default_factory=dict)
    result: str = ""
    timestamp: Optional[str] = None


class StepRequest(BaseModel):
    goal: str = Field(..., description="User's high-level task goal")
    history: List[Dict[str, Any]] = Field(default_factory=list, description="Chronological log of prior steps")
    observation: Observation = Field(..., description="Current page observation from content script")
    task_id: Optional[int] = Field(None, description="ID of the specific planned task being executed")
    current_task: Optional[PlannedTask] = Field(None, description="PlannedTask currently being evaluated")
    plan: Optional[Plan] = Field(None, description="Full execution plan if available")


class StepResponse(BaseModel):
    action: Action
    requires_approval: bool = False
    approval_reason: Optional[str] = None
    task_status: Optional[TaskStatus] = None
    skip_reason: Optional[str] = None


class PlanRequest(BaseModel):
    goal: str = Field(..., description="User's high-level task goal")
    observation: Optional[Observation] = Field(None, description="Initial page observation if available")
    preferences: Optional[Dict[str, Any]] = Field(None, description="Optional user preferences for personalized planning")


class TaskValidationResult(BaseModel):
    is_complete: bool = False
    is_partial: bool = False
    status: str = "pending"  # "completed", "partial", "failed", "cancelled"
    message: str = ""
    completed_required_count: int = 0
    total_required_count: int = 0
    completed_phases_count: int = 0
    total_phases_count: int = 0
    records_count: int = 0
    details: Dict[str, Any] = Field(default_factory=dict)


class HealthResponse(BaseModel):
    status: str
    app: str
    model: str
    has_api_key: bool
    mode: str = "full"  # "full" | "degraded" (no Gemini key: heuristic planning only)
    warning: Optional[str] = None


class RankRequest(BaseModel):
    items: List[Dict[str, Any]] = Field(default_factory=list, description="Raw extracted items from web pages")
    requirements: Optional[Dict[str, Any]] = Field(default_factory=dict, description="Constraints, budget, specs, brand/amenity priorities")
    category: Optional[str] = Field(None, description="Category: smartphone, laptop, hotel, general_product")
    weights: Optional[Dict[str, float]] = Field(None, description="Optional custom category weights")
    user_goal: Optional[str] = Field(None, description="The original user prompt — used for prompt-driven ranking and category validation")
    answer_text: Optional[str] = Field(None, description="The agent's synthesized answer; items named in it become the rankable tiles")
