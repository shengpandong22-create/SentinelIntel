from datetime import UTC, datetime
from uuid import uuid4

import pytest
from pydantic import ValidationError

from app.schemas.tracking import TrackingProposal, TrackingTaskRequest


def task_payload() -> dict[str, object]:
    now = datetime.now(UTC).isoformat()
    evidence_id = str(uuid4())
    return {
        "trace_id": str(uuid4()),
        "run_id": str(uuid4()),
        "tool_capability": "x" * 32,
        "story": {
            "schema_version": 1,
            "story_id": 7,
            "story_version": 1,
            "title": "Tracked vulnerability",
            "digest": None,
            "status": "active",
            "facts": [],
            "missing_questions": [],
            "captured_at": now,
        },
        "plan": {
            "schema_version": 1,
            "plan_id": str(uuid4()),
            "story_id": 7,
            "version": 1,
            "status": "active",
            "why_track": "Wait for patch",
            "questions": [{"question_id": "patch", "question": "Patch?", "resolve_on": ["patch"], "status": "open", "resolved_evidence_ids": []}],
            "source_targets": ["vendor_advisory"],
            "interval_policy": {"min_hours": 6, "max_hours": 168, "no_change_multiplier": 2, "max_no_change_checks": 3},
            "stop_condition": {"all_questions_resolved": True, "stop_after_no_change_checks": None, "deadline_at": None},
            "current_interval_hours": 12,
            "consecutive_no_change_checks": 0,
            "next_check_at": now,
            "last_checked_at": None,
        },
        "evidence": [{
            "evidence_id": evidence_id,
            "source_type": "vendor_advisory",
            "authority_level": "authoritative",
            "canonical_url": "https://vendor.example/advisory",
            "content_hash": "a" * 64,
            "retrieved_at": now,
            "observations": ["patch"],
        }],
        "limits": {"max_rounds": 3, "max_tool_calls": 8, "max_generic_searches": 2, "max_evidence_documents": 12,
                   "deadline_ms": 60_000, "max_response_bytes": 2_097_152},
    }


def test_tracking_task_accepts_consistent_plan() -> None:
    task = TrackingTaskRequest.model_validate(task_payload())
    assert task.story.story_id == task.plan.story_id


def test_tracking_task_rejects_story_mismatch_and_unsupported_source() -> None:
    mismatch = task_payload()
    mismatch["plan"]["story_id"] = 8  # type: ignore[index]
    with pytest.raises(ValidationError, match="mismatch"):
        TrackingTaskRequest.model_validate(mismatch)
    unsupported = task_payload()
    unsupported["plan"]["source_targets"] = ["generic_web"]  # type: ignore[index]
    with pytest.raises(ValidationError):
        TrackingTaskRequest.model_validate(unsupported)


def test_tracking_proposal_requires_evidence_for_resolution_and_bounded_shape() -> None:
    with pytest.raises(ValidationError, match="lacks evidence"):
        TrackingProposal.model_validate({
            "new_evidence": [],
            "material_changes": [],
            "question_updates": [{"question_id": "patch", "status": "resolved", "reason": "guess", "evidence_ids": []}],
            "decision": "stop",
            "suggested_interval_hours": None,
            "decision_reason": "done",
            "tool_trace": [],
        })
    with pytest.raises(ValidationError, match="cannot suggest an interval"):
        TrackingProposal.model_validate({
            "new_evidence": [], "material_changes": [], "question_updates": [], "decision": "stop",
            "suggested_interval_hours": 12, "decision_reason": "done", "tool_trace": [],
        })
