from uuid import uuid4

import pytest

from app.agents.tracking_graph import run_tracking_graph
from app.schemas.tracking import TrackingTaskRequest


def task(*, questions: list[dict[str, object]], evidence: list[dict[str, object]], no_change: int = 0, stop_after: int | None = None) -> TrackingTaskRequest:
    return TrackingTaskRequest.model_validate({
        "trace_id": str(uuid4()), "run_id": str(uuid4()), "tool_capability": "x" * 32,
        "story": {"schema_version": 1, "story_id": 7, "story_version": 1, "title": "Tracked event", "digest": None,
                  "status": "active", "facts": [], "missing_questions": [], "captured_at": "2026-10-10T00:00:00Z"},
        "plan": {"schema_version": 1, "plan_id": str(uuid4()), "story_id": 7, "version": 1, "status": "active",
                 "why_track": "Track material progress", "questions": questions,
                 "source_targets": ["vendor_advisory"],
                 "interval_policy": {"min_hours": 6, "max_hours": 168, "no_change_multiplier": 2, "max_no_change_checks": 3},
                 "stop_condition": {"all_questions_resolved": True, "stop_after_no_change_checks": stop_after, "deadline_at": None},
                 "current_interval_hours": 12, "consecutive_no_change_checks": no_change,
                 "next_check_at": "2026-10-10T00:00:00Z", "last_checked_at": None},
        "evidence": evidence,
    })


def question(identifier: str, change_type: str, status: str = "open", evidence_ids: list[str] | None = None) -> dict[str, object]:
    return {"question_id": identifier, "question": f"Has {identifier} happened?", "resolve_on": [change_type],
            "status": status, "resolved_evidence_ids": evidence_ids or []}


def evidence(change_type: str, source_type: str) -> dict[str, object]:
    return {"evidence_id": str(uuid4()), "source_type": source_type, "authority_level": "authoritative",
            "canonical_url": f"https://official.example/{uuid4()}", "content_hash": "a" * 64,
            "retrieved_at": "2026-10-10T00:00:00Z", "observations": [change_type]}


@pytest.mark.anyio
async def test_vulnerability_confirmation_then_patch_is_two_bounded_transitions() -> None:
    confirmation = evidence("vendor_confirmation", "vendor_advisory")
    first = await run_tracking_graph(task(
        questions=[question("confirmation", "vendor_confirmation"), question("patch", "patch")],
        evidence=[confirmation],
    ))
    assert first.decision == "continue"
    assert [change.change_type for change in first.material_changes] == ["vendor_confirmation"]
    assert [update.status for update in first.question_updates] == ["resolved", "open"]

    patch = evidence("patch", "vendor_advisory")
    second = await run_tracking_graph(task(
        questions=[question("confirmation", "vendor_confirmation", "resolved", [confirmation["evidence_id"]]), question("patch", "patch")],
        evidence=[confirmation, patch],
    ))
    assert second.decision == "stop"
    assert [change.change_type for change in second.material_changes] == ["patch"]


@pytest.mark.anyio
async def test_procurement_notice_to_award_resolves_only_with_official_award_observation() -> None:
    award = evidence("procurement_award", "official_procurement")
    proposal = await run_tracking_graph(task(questions=[question("award", "procurement_award")], evidence=[award]))
    assert proposal.decision == "stop"
    assert proposal.material_changes[0].change_type == "procurement_award"
    assert [str(item) for item in proposal.material_changes[0].evidence_ids] == [award["evidence_id"]]


@pytest.mark.anyio
async def test_no_progress_extends_then_stops_at_declared_threshold() -> None:
    first = await run_tracking_graph(task(questions=[question("award", "procurement_award")], evidence=[], no_change=0, stop_after=2))
    assert first.decision == "continue"
    assert first.suggested_interval_hours == 24
    second = await run_tracking_graph(task(questions=[question("award", "procurement_award")], evidence=[], no_change=1, stop_after=2))
    assert second.decision == "stop"
    assert second.material_changes == []
