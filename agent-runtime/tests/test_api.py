from uuid import uuid4

import pytest
from httpx import ASGITransport, AsyncClient
from pydantic import SecretStr

from app.config import settings
from app.main import app
from app.schemas.research import ResearchProposal


@pytest.fixture
def anyio_backend() -> str:
    return "asyncio"


@pytest.mark.anyio
async def test_health() -> None:
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://testserver") as client:
        response = await client.get("/health")
    assert response.status_code == 200
    assert response.json() == {"ok": True, "service": "sentinelintel-agent-runtime", "version": "0.1.0"}


@pytest.mark.anyio
async def test_structured_task_preserves_trace_and_runs_graph() -> None:
    trace_id = str(uuid4())
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://testserver") as client:
        response = await client.post("/v1/tasks/test", json={"trace_id": trace_id, "input": "hello"})
    assert response.status_code == 200
    assert response.json() == {
        "trace_id": trace_id,
        "status": "ok",
        "result": {"echo": "hello", "model": "test-stub", "tools": ["echo"]},
    }


@pytest.mark.anyio
@pytest.mark.parametrize(
    ("behavior", "status", "code", "retryable"),
    [("transient_error", 503, "test_transient", True), ("permanent_error", 422, "test_permanent", False)],
)
async def test_structured_errors(behavior: str, status: int, code: str, retryable: bool) -> None:
    trace_id = str(uuid4())
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://testserver") as client:
        response = await client.post("/v1/tasks/test", json={"trace_id": trace_id, "input": "hello", "behavior": behavior})
    assert response.status_code == status
    assert response.json()["error"] == {
        "code": code,
        "message": f"deterministic {behavior.removesuffix('_error')} failure",
        "retryable": retryable,
        "trace_id": trace_id,
    }


@pytest.mark.anyio
async def test_validation_error_is_not_retryable() -> None:
    trace_id = str(uuid4())
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://testserver") as client:
        response = await client.post("/v1/tasks/test", json={"trace_id": trace_id, "input": ""})
    assert response.status_code == 422
    error = response.json()["error"]
    assert error["code"] == "invalid_request"
    assert error["retryable"] is False
    assert error["trace_id"] == trace_id


@pytest.mark.anyio
async def test_header_and_body_trace_ids_must_match() -> None:
    trace_id = str(uuid4())
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://testserver") as client:
        response = await client.post(
            "/v1/tasks/test",
            headers={"x-trace-id": str(uuid4())},
            json={"trace_id": trace_id, "input": "hello"},
        )
    assert response.status_code == 422
    assert response.json()["error"] == {
        "code": "trace_mismatch",
        "message": "header and body trace ids differ",
        "retryable": False,
        "trace_id": trace_id,
    }


def test_external_network_guard_is_active() -> None:
    import socket

    with pytest.raises(AssertionError, match="external network is forbidden"):
        socket.create_connection(("example.com", 80), timeout=0.01)


def research_body(trace_id: str, run_id: str, story_id: int = 7) -> dict[str, object]:
    return {
        "trace_id": trace_id,
        "run_id": run_id,
        "objective": "Confirm affected versions",
        "snapshot": {
            "schema_version": 1,
            "story_id": story_id,
            "story_version": 1,
            "title": "Test vulnerability",
            "digest": None,
            "status": "active",
            "facts": [],
            "missing_questions": ["Which versions are affected?"],
            "captured_at": "2026-10-08T00:00:00Z",
        },
        "limits": {
            "max_rounds": 3,
            "max_tool_calls": 8,
            "max_generic_searches": 2,
            "max_evidence_documents": 12,
            "deadline_ms": 60_000,
            "max_response_bytes": 2_097_152,
        },
    }


@pytest.mark.anyio
async def test_research_is_fail_closed_without_configuration() -> None:
    trace_id = str(uuid4())
    old_token, old_enabled = settings.internal_token, settings.research_enabled
    settings.internal_token, settings.research_enabled = None, False
    try:
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://testserver") as client:
            response = await client.post(
                "/v1/research/story/7",
                json=research_body(trace_id, str(uuid4())),
            )
    finally:
        settings.internal_token, settings.research_enabled = old_token, old_enabled
    assert response.status_code == 422
    assert response.json()["error"]["code"] == "unauthorized"
    assert response.json()["error"]["trace_id"] == trace_id


@pytest.mark.anyio
async def test_research_requires_enabled_switch_after_authentication() -> None:
    trace_id = str(uuid4())
    old_token, old_enabled = settings.internal_token, settings.research_enabled
    settings.internal_token, settings.research_enabled = SecretStr("test-token"), False
    try:
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://testserver") as client:
            response = await client.post(
                "/v1/research/story/7",
                headers={"authorization": "Bearer test-token"},
                json=research_body(trace_id, str(uuid4())),
            )
    finally:
        settings.internal_token, settings.research_enabled = old_token, old_enabled
    assert response.status_code == 422
    assert response.json()["error"]["code"] == "research_disabled"


@pytest.mark.anyio
async def test_deterministic_research_preserves_unknowns_without_network() -> None:
    trace_id, run_id = str(uuid4()), str(uuid4())
    old_token, old_enabled = settings.internal_token, settings.research_enabled
    settings.internal_token, settings.research_enabled = SecretStr("test-token"), True
    try:
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://testserver") as client:
            response = await client.post(
                "/v1/research/story/7",
                headers={"authorization": "Bearer test-token", "x-trace-id": trace_id},
                json=research_body(trace_id, run_id),
            )
    finally:
        settings.internal_token, settings.research_enabled = old_token, old_enabled
    assert response.status_code == 200
    body = response.json()
    assert body["trace_id"] == trace_id
    assert body["run_id"] == run_id
    assert body["proposal"]["terminal_status"] == "insufficient_evidence"
    assert body["proposal"]["claims"] == []
    assert body["proposal"]["evidence"] == []
    assert body["proposal"]["unknowns"][0]["question"] == "Which versions are affected?"


def test_critical_claim_rejects_secondary_only_evidence() -> None:
    evidence_id = str(uuid4())
    with pytest.raises(ValueError, match="lacks authoritative or primary evidence"):
        ResearchProposal.model_validate({
            "claims": [{
                "claim_id": "critical",
                "text": "Exploitation is confirmed.",
                "criticality": "critical",
                "status": "confirmed",
                "confidence": 0.9,
                "evidence_ids": [evidence_id],
            }],
            "unknowns": [],
            "evidence": [{
                "evidence_id": evidence_id,
                "source_type": "web_source",
                "source_name": "Secondary report",
                "canonical_url": "https://example.com/report",
                "title": "Report",
                "excerpt": None,
                "normalized": {},
                "content_hash": "b" * 64,
                "authority_level": "secondary",
                "published_at": None,
                "source_updated_at": None,
                "retrieved_at": "2026-10-08T00:00:00Z",
                "provenance": {},
            }],
            "conflicts": [],
            "tool_trace": [],
            "summary": "Unsupported",
            "terminal_status": "completed",
        })
