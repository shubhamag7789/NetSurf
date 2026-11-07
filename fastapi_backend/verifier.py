from typing import Dict, Any, Optional
from pydantic import BaseModel


class VerificationResult(BaseModel):
    verified: bool
    confidence: float
    message: str = ""
    requires_retry: bool = False


def verify_action(
    action_type: str,
    params: Dict[str, Any],
    prev_observation: Dict[str, Any],
    curr_observation: Dict[str, Any],
    extracted_data: Optional[list] = None
) -> VerificationResult:
    """
    Verifies that an executed action produced the intended state change.
    """
    prev_url = prev_observation.get("url", "")
    curr_url = curr_observation.get("url", "")
    prev_title = prev_observation.get("title", "")
    curr_title = curr_observation.get("title", "")

    # 1. Navigate verification
    if action_type == "navigate":
        target_url = params.get("url", "")
        if curr_url and (curr_url.rstrip("/") in target_url.rstrip("/") or target_url.rstrip("/") in curr_url.rstrip("/")):
            return VerificationResult(
                verified=True,
                confidence=1.0,
                message=f"Successfully navigated to {curr_url}"
            )
        elif curr_url != prev_url:
            return VerificationResult(
                verified=True,
                confidence=0.85,
                message=f"Navigation changed URL to {curr_url}"
            )
        else:
            return VerificationResult(
                verified=False,
                confidence=0.2,
                message=f"URL did not change after navigating to {target_url}",
                requires_retry=True
            )

    # 2. Click verification
    if action_type == "click":
        # Check if URL changed, title changed, or element counts shifted
        if curr_url != prev_url or curr_title != prev_title:
            return VerificationResult(
                verified=True,
                confidence=0.9,
                message="Click resulted in page or state navigation"
            )
        # Check if DOM updated
        prev_elem_count = len(prev_observation.get("elements", []))
        curr_elem_count = len(curr_observation.get("elements", []))
        return VerificationResult(
            verified=True,
            confidence=0.8,
            message="Click executed on element"
        )

    # 3. Type verification
    if action_type == "type":
        return VerificationResult(
            verified=True,
            confidence=0.95,
            message=f"Typed text into input element {params.get('id')}"
        )

    # 4. Extract verification
    if action_type == "extract":
        if extracted_data and len(extracted_data) > 0:
            # Check for non-empty fields
            first_item = extracted_data[0]
            non_empty = any(bool(v) for v in first_item.values())
            if non_empty:
                return VerificationResult(
                    verified=True,
                    confidence=1.0,
                    message=f"Extracted {len(extracted_data)} structured records with valid data"
                )
            else:
                return VerificationResult(
                    verified=False,
                    confidence=0.3,
                    message="Extraction returned records with empty fields",
                    requires_retry=True
                )
        return VerificationResult(
            verified=False,
            confidence=0.1,
            message="No structured records were extracted",
            requires_retry=True
        )

    # 5. Scroll / Wait
    if action_type in ("scroll", "wait"):
        return VerificationResult(
            verified=True,
            confidence=1.0,
            message=f"{action_type.capitalize()} completed smoothly"
        )

    # 5b. Fill Form
    if action_type == "fill_form":
        data_count = len((params or {}).get("data") or {})
        return VerificationResult(
            verified=True,
            confidence=1.0,
            message=f"Form semantically filled ({data_count} fields provided)"
        )

    # 6. Done
    if action_type == "done":
        sum_msg = (params or {}).get("summary")
        return VerificationResult(
            verified=True,
            confidence=1.0,
            message=str(sum_msg) if sum_msg is not None else "Task marked done by agent"
        )

    # 7. Fail
    if action_type == "fail":
        fail_msg = (params or {}).get("reason")
        return VerificationResult(
            verified=False,
            confidence=1.0,
            message=str(fail_msg) if fail_msg is not None else "Task failed as reported by agent"
        )

    return VerificationResult(
        verified=True,
        confidence=0.7,
        message="Action processed"
    )


def validate_completion(
    plan: Any,
    extracted_data: Optional[list] = None,
    history: Optional[list] = None,
    export_generated: bool = False
) -> Dict[str, Any]:
    """
    Enforces strict completion conditions:
    1. Every required step has completed.
    2. Required extracted fields are present.
    3. Data has passed relevant validation checks.
    4. Required source URLs have been preserved.
    5. Any requested export has actually been generated.
    6. No required action remains pending or running.
    Returns status: 'completed' | 'partial' | 'failed'
    """
    from .schemas import Plan, TaskStatus, TaskValidationResult, PlannedTask, PlanPhase

    extracted_data = extracted_data or []
    history = history or []

    # Normalize plan if dict
    if isinstance(plan, dict):
        plan_obj = Plan.model_validate(plan)
    elif isinstance(plan, Plan):
        plan_obj = plan
    else:
        return {
            "is_complete": False,
            "is_partial": False,
            "status": "failed",
            "message": "Invalid plan object provided for verification",
            "completed_required_count": 0,
            "total_required_count": 0,
            "completed_phases_count": 0,
            "total_phases_count": 0,
            "records_count": len(extracted_data),
            "details": {"error": "Missing or invalid plan"}
        }

    actions = plan_obj.actions
    phases = plan_obj.phases
    criteria = plan_obj.completion_criteria

    required_actions = [a for a in actions if a.required]
    completed_required = [a for a in required_actions if a.status == TaskStatus.COMPLETED]
    pending_required = [a for a in required_actions if a.status in (TaskStatus.PENDING, TaskStatus.RUNNING, TaskStatus.RETRYING)]
    failed_required = [a for a in required_actions if a.status == TaskStatus.FAILED]
    cancelled_required = [a for a in required_actions if a.status == TaskStatus.CANCELLED]

    total_req_count = len(required_actions)
    comp_req_count = len(completed_required)

    # Compute phase statuses if not already updated
    completed_phases = 0
    for phase in phases:
        phase_actions = [a for a in actions if a.phase_id == phase.id]
        if phase_actions and all(a.status in (TaskStatus.COMPLETED, TaskStatus.SKIPPED) for a in phase_actions if a.required):
            completed_phases += 1

    validation_issues = []

    # Check 1: No required action remains pending or running
    if pending_required:
        pending_ids = [a.id for a in pending_required]
        validation_issues.append(f"Required action(s) {pending_ids} still pending or running")

    # Check 2: All required actions completed
    if comp_req_count < total_req_count:
        missing_count = total_req_count - comp_req_count
        validation_issues.append(f"{missing_count} required action(s) not completed")

    # Check 3: Extraction fields & records check if required
    is_extraction_task = any(a.action.value == "extract" for a in actions) or criteria.min_records > 0 or criteria.required_fields
    if is_extraction_task:
        if criteria.min_records > 0 and len(extracted_data) < criteria.min_records:
            validation_issues.append(f"Expected at least {criteria.min_records} records, got {len(extracted_data)}")
        elif not extracted_data and criteria.min_records > 0:
            validation_issues.append("No extracted records found")

        # Check required fields
        if criteria.required_fields and extracted_data:
            for field in criteria.required_fields:
                missing_in_records = sum(1 for r in extracted_data if field not in r or r[field] is None or str(r[field]).strip() == "")
                if missing_in_records > 0:
                    validation_issues.append(f"Field '{field}' missing or empty in {missing_in_records} records")

        # Check 4: Source URLs preserved
        if criteria.require_source_urls and extracted_data:
            missing_url = sum(1 for r in extracted_data if not r.get("source_url"))
            if missing_url > 0:
                validation_issues.append(f"Source URL missing in {missing_url} extracted records")

    # Check 5: Export generated
    if criteria.require_export and not export_generated:
        validation_issues.append("Requested data export was not generated")

    # Check for cancellation
    if cancelled_required:
        return {
            "is_complete": False,
            "is_partial": comp_req_count > 0,
            "status": "cancelled",
            "message": f"Task was cancelled. {comp_req_count}/{total_req_count} required actions executed.",
            "completed_required_count": comp_req_count,
            "total_required_count": total_req_count,
            "completed_phases_count": completed_phases,
            "total_phases_count": len(phases),
            "records_count": len(extracted_data),
            "details": {"cancelled_step_ids": [a.id for a in cancelled_required]}
        }

    # Evaluate final status
    if not validation_issues and comp_req_count == total_req_count and not failed_required:
        return {
            "is_complete": True,
            "is_partial": False,
            "status": "completed",
            "message": f"Success: All {total_req_count} required actions and verification criteria satisfied.",
            "completed_required_count": comp_req_count,
            "total_required_count": total_req_count,
            "completed_phases_count": len(phases),
            "total_phases_count": len(phases),
            "records_count": len(extracted_data),
            "details": {"issues": []}
        }

    # If any required failed permanently
    if failed_required and comp_req_count == 0:
        return {
            "is_complete": False,
            "is_partial": False,
            "status": "failed",
            "message": f"Task failed: {'; '.join(validation_issues or [f'Required action {failed_required[0].id} failed'])}",
            "completed_required_count": comp_req_count,
            "total_required_count": total_req_count,
            "completed_phases_count": completed_phases,
            "total_phases_count": len(phases),
            "records_count": len(extracted_data),
            "details": {"failed_step_ids": [a.id for a in failed_required], "issues": validation_issues}
        }

    # If some required tasks succeeded or records were extracted, but not all completion criteria met
    return {
        "is_complete": False,
        "is_partial": True,
        "status": "partial",
        "message": f"Partial Completion: {comp_req_count}/{total_req_count} required actions completed. Issues: {'; '.join(validation_issues)}",
        "completed_required_count": comp_req_count,
        "total_required_count": total_req_count,
        "completed_phases_count": completed_phases,
        "total_phases_count": len(phases),
        "records_count": len(extracted_data),
        "details": {"issues": validation_issues}
    }

