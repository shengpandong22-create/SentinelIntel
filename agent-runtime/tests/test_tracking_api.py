from uuid import uuid4

import pytest
from httpx import ASGITransport, AsyncClient
from pydantic import SecretStr

from app.config import settings
from app.main import app
from app.schemas.research import ResearchToolResponse
from app.tools.research_gateway import ResearchGatewayError, research_gateway


@pytest.fixture
def anyio_backend() -> str:
    return "asyncio"


def body(*, evidence: bool = True) -> dict[str, object]:
    evidence_id = str(uuid4())
    return {
        "trace_id": str(uuid4()),
        "run_id": str(uuid4()),
        "tool_capability": "x" * 32,
        "story": {
            "schema_version": 1, "story_id": 7, "story_version": 1, "title": "Tracked vulnerability",
            "digest": None, "status": "active", "facts": [], "missing_questions": [], "captured_at": "2026-10-10T00:00:00Z",
        },
        "plan": {
            "schema_version": 1, "plan_id": str(uuid4()), "story_id": 7, "version": 1, "status": "active",
            "why_track": "Wait for patch",
            "questions": [{"question_id": "patch", "question": "Patch?", "resolve_on": ["patch"], "status": "open", "resolved_evidence_ids": []}],
            "source_targets": ["vendor_advisory"],
            "interval_policy": {"min_hours": 6, "max_hours": 168, "no_change_multiplier": 2, "max_no_change_checks": 3},
            "stop_condition": {"all_questions_resolved": True, "stop_after_no_change_checks": None, "deadline_at": None},
            "current_interval_hours": 12, "consecutive_no_change_checks": 0,
            "next_check_at": "2026-10-10T00:00:00Z", "last_checked_at": None,
        },
        "evidence": ([{
            "evidence_id": evidence_id, "source_type": "vendor_advisory", "authority_level": "authoritative",
            "canonical_url": "https://vendor.example/patch", "content_hash": "a" * 64,
            "retrieved_at": "2026-10-10T00:00:00Z", "observations": ["patch"],
        }] if evidence else []),
        "limits": {"max_rounds": 3, "max_tool_calls": 8, "max_generic_searches": 2, "max_evidence_documents": 12,
                   "deadline_ms": 60_000, "max_response_bytes": 2_097_152},
    }


@pytest.mark.anyio
async def test_tracking_fails_closed_when_disabled() -> None:
    payload = body()
    old_token, old_enabled = settings.internal_token, settings.tracking_enabled
    settings.internal_token, settings.tracking_enabled = SecretStr("test-token"), False
    try:
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://testserver") as client:
            response = await client.post("/v1/tracking/story/7", headers={"authorization": "Bearer test-token"}, json=payload)
    finally:
        settings.internal_token, settings.tracking_enabled = old_token, old_enabled
    assert response.status_code == 422
    assert response.json()["error"]["code"] == "tracking_disabled"


@pytest.mark.anyio
async def test_tracking_resolves_only_declared_observation_and_stops() -> None:
    payload = body()
    old_token, old_enabled = settings.internal_token, settings.tracking_enabled
    settings.internal_token, settings.tracking_enabled = SecretStr("test-token"), True
    try:
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://testserver") as client:
            response = await client.post(
                "/v1/tracking/story/7",
                headers={"authorization": "Bearer test-token", "x-trace-id": payload["trace_id"]},
                json=payload,
            )
    finally:
        settings.internal_token, settings.tracking_enabled = old_token, old_enabled
    assert response.status_code == 200
    proposal = response.json()["proposal"]
    assert proposal["decision"] == "stop"
    assert proposal["material_changes"][0]["change_type"] == "patch"
    assert proposal["question_updates"][0]["status"] == "resolved"


@pytest.mark.anyio
async def test_tracking_no_evidence_preserves_question_and_extends_interval() -> None:
    payload = body(evidence=False)
    old_token, old_enabled = settings.internal_token, settings.tracking_enabled
    settings.internal_token, settings.tracking_enabled = SecretStr("test-token"), True
    try:
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://testserver") as client:
            response = await client.post("/v1/tracking/story/7", headers={"authorization": "Bearer test-token"}, json=payload)
    finally:
        settings.internal_token, settings.tracking_enabled = old_token, old_enabled
    assert response.status_code == 200
    proposal = response.json()["proposal"]
    assert proposal["material_changes"] == []
    assert proposal["question_updates"][0]["status"] == "open"
    assert proposal["suggested_interval_hours"] == 24


@pytest.mark.anyio
async def test_tracking_acquires_vendor_delta_through_the_bounded_gateway(monkeypatch: pytest.MonkeyPatch) -> None:
    payload = body(evidence=False)
    payload["story"]["title"] = "Cisco CVE-2024-20399"  # type: ignore[index]
    calls: list[str] = []
    evidence_id = str(uuid4())

    async def invoke(task: object, tool: str, input_data: dict[str, object]) -> ResearchToolResponse:
        del task
        calls.append(tool)
        if tool == "vendor_advisory_search":
            return ResearchToolResponse.model_validate({
                "trace_id": payload["trace_id"], "run_id": payload["run_id"], "tool": tool, "status": "ok",
                "output": {"found": True, "candidates": [{"url": "https://sec.cloudapps.cisco.com/security/center/content/CiscoSecurityAdvisory/example"}]},
                "evidence": [], "receipt_ids": [], "latency_ms": 1,
            })
        assert tool == "evidence_fetch"
        return ResearchToolResponse.model_validate({
            "trace_id": payload["trace_id"], "run_id": payload["run_id"], "tool": tool, "status": "ok",
            "output": {"found": True}, "receipt_ids": [], "latency_ms": 1,
            "evidence": [{
                "evidence_id": evidence_id, "source_type": "vendor_advisory", "source_name": "Cisco Security Advisory",
                "canonical_url": "https://sec.cloudapps.cisco.com/security/center/content/CiscoSecurityAdvisory/example",
                "title": "Cisco patch", "excerpt": "Software update fixes CVE-2024-20399.",
                "normalized": {"tracking_observations": ["vendor_confirmation", "patch"]},
                "content_hash": "d" * 64, "authority_level": "authoritative", "published_at": None,
                "source_updated_at": None, "retrieved_at": "2026-10-10T00:00:00Z", "provenance": {"fixture": True},
            }],
        })

    monkeypatch.setattr(research_gateway, "invoke", invoke)
    old_token, old_enabled = settings.internal_token, settings.tracking_enabled
    settings.internal_token, settings.tracking_enabled = SecretStr("test-token"), True
    try:
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://testserver") as client:
            response = await client.post("/v1/tracking/story/7", headers={"authorization": "Bearer test-token"}, json=payload)
    finally:
        settings.internal_token, settings.tracking_enabled = old_token, old_enabled
    assert response.status_code == 200
    proposal = response.json()["proposal"]
    assert calls == ["vendor_advisory_search", "evidence_fetch"]
    assert proposal["new_evidence"][0]["evidence_id"] == evidence_id
    assert proposal["material_changes"][0]["change_type"] == "patch"
    assert proposal["decision"] == "stop"


@pytest.mark.anyio
async def test_tracking_tool_failure_preserves_unknown_and_is_insufficient(monkeypatch: pytest.MonkeyPatch) -> None:
    payload = body(evidence=False)
    payload["story"]["title"] = "Cisco CVE-2024-20399"  # type: ignore[index]

    async def reject(task: object, tool: str, input_data: dict[str, object]) -> ResearchToolResponse:
        del task, tool, input_data
        raise ResearchGatewayError("fixture failure")

    monkeypatch.setattr(research_gateway, "invoke", reject)
    old_token, old_enabled = settings.internal_token, settings.tracking_enabled
    settings.internal_token, settings.tracking_enabled = SecretStr("test-token"), True
    try:
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://testserver") as client:
            response = await client.post("/v1/tracking/story/7", headers={"authorization": "Bearer test-token"}, json=payload)
    finally:
        settings.internal_token, settings.tracking_enabled = old_token, old_enabled
    proposal = response.json()["proposal"]
    assert proposal["decision"] == "insufficient_evidence"
    assert proposal["material_changes"] == []
    assert proposal["question_updates"][0]["status"] == "open"
    assert proposal["tool_trace"][0]["status"] == "error"
