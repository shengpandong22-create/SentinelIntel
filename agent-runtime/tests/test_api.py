from uuid import uuid4

import pytest
from httpx import ASGITransport, AsyncClient
from pydantic import SecretStr

from app.config import settings
from app.main import app
from app.schemas.research import ResearchProposal, ResearchToolResponse
from app.tools.research_gateway import research_gateway


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
        "tool_capability": "test-capability-0123456789-abcdef",
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
async def test_invalid_research_capability_is_not_reflected_in_validation_error() -> None:
    trace_id = str(uuid4())
    body = research_body(trace_id, str(uuid4()))
    body["tool_capability"] = "secret-too-short"
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://testserver") as client:
        response = await client.post("/v1/research/story/7", json=body)
    assert response.status_code == 422
    assert response.json()["error"]["message"] == "request validation failed"
    assert "secret-too-short" not in response.text


@pytest.mark.anyio
async def test_deterministic_research_calls_stub_and_preserves_unknowns_without_external_network(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    trace_id, run_id = str(uuid4()), str(uuid4())
    evidence_id = str(uuid4())

    async def stub_invoke(task: object, tool: str, input_data: dict[str, object]) -> ResearchToolResponse:
        del task
        assert tool == "stub"
        assert input_data == {"question": "Which versions are affected?"}
        return ResearchToolResponse.model_validate({
            "trace_id": trace_id,
            "run_id": run_id,
            "tool": "stub",
            "status": "ok",
            "output": {"answered": False},
            "evidence": [{
                "evidence_id": evidence_id,
                "source_type": "stub_fixture",
                "source_name": "Fixture",
                "canonical_url": "https://fixture.invalid/evidence",
                "title": "Fixture evidence",
                "excerpt": "Which versions are affected?",
                "normalized": {"fixture": True},
                "content_hash": "c" * 64,
                "authority_level": "secondary",
                "published_at": None,
                "source_updated_at": None,
                "retrieved_at": "2026-10-08T00:00:00Z",
                "provenance": {"external_network": False},
            }],
            "receipt_ids": [],
            "latency_ms": 0,
        })

    monkeypatch.setattr(research_gateway, "invoke", stub_invoke)
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
    assert body["proposal"]["evidence"][0]["evidence_id"] == evidence_id
    assert body["proposal"]["tool_trace"][0]["tool"] == "stub"
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


@pytest.mark.anyio
async def test_cve_research_selects_nvd_then_kev_and_builds_supported_claims(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    trace_id, run_id = str(uuid4()), str(uuid4())
    calls: list[str] = []

    async def source_invoke(task: object, tool: str, input_data: dict[str, object]) -> ResearchToolResponse:
        del task
        calls.append(tool)
        assert input_data == {"cve_id": "CVE-2021-44228"}
        evidence_id = str(uuid4())
        return ResearchToolResponse.model_validate({
            "trace_id": trace_id,
            "run_id": run_id,
            "tool": tool,
            "status": "ok",
            "output": {"found": True, "cve_id": "CVE-2021-44228"},
            "evidence": [{
                "evidence_id": evidence_id,
                "source_type": "nvd" if tool == "nvd_lookup" else "cisa_kev",
                "source_name": "Official fixture",
                "canonical_url": "https://nvd.nist.gov/vuln/detail/CVE-2021-44228" if tool == "nvd_lookup" else "https://www.cisa.gov/known-exploited-vulnerabilities-catalog",
                "title": "Official fixture evidence",
                "excerpt": "Fixture",
                "normalized": {"cve_id": "CVE-2021-44228"},
                "content_hash": ("d" if tool == "nvd_lookup" else "e") * 64,
                "authority_level": "authoritative",
                "published_at": None,
                "source_updated_at": None,
                "retrieved_at": "2026-10-08T00:00:00Z",
                "provenance": {"external_network": False},
            }],
            "receipt_ids": [],
            "latency_ms": 0,
        })

    monkeypatch.setattr(research_gateway, "invoke", source_invoke)
    body = research_body(trace_id, run_id)
    body["snapshot"]["title"] = "CVE-2021-44228 investigation"  # type: ignore[index]
    old_token, old_enabled = settings.internal_token, settings.research_enabled
    settings.internal_token, settings.research_enabled = SecretStr("test-token"), True
    try:
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://testserver") as client:
            response = await client.post(
                "/v1/research/story/7",
                headers={"authorization": "Bearer test-token", "x-trace-id": trace_id},
                json=body,
            )
    finally:
        settings.internal_token, settings.research_enabled = old_token, old_enabled
    assert response.status_code == 200
    proposal = response.json()["proposal"]
    assert calls == ["nvd_lookup", "kev_lookup"]
    assert len(proposal["claims"]) == 2
    assert len(proposal["evidence"]) == 2
    assert all(claim["evidence_ids"] for claim in proposal["claims"])


@pytest.mark.anyio
async def test_vendor_cve_research_discovers_then_fetches_official_advisory(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    trace_id, run_id = str(uuid4()), str(uuid4())
    calls: list[str] = []
    advisory_url = "https://sec.cloudapps.cisco.com/security/center/content/CiscoSecurityAdvisory/example"

    async def vendor_invoke(task: object, tool: str, input_data: dict[str, object]) -> ResearchToolResponse:
        del task
        calls.append(tool)
        evidence: list[dict[str, object]] = []
        output: dict[str, object] = {"found": False}
        if tool in ("nvd_lookup", "kev_lookup"):
            output = {"found": False, "cve_id": "CVE-2024-20399"}
            if tool == "nvd_lookup":
                output = {"found": True, "cve_id": "CVE-2024-20399"}
                evidence_id = str(uuid4())
                evidence = [{
                    "evidence_id": evidence_id,
                    "source_type": "nvd",
                    "source_name": "NVD",
                    "canonical_url": "https://nvd.nist.gov/vuln/detail/CVE-2024-20399",
                    "title": "NVD record",
                    "excerpt": "NVD reference fixture.",
                    "normalized": {"references": [{"url": advisory_url}]},
                    "content_hash": "a" * 64,
                    "authority_level": "authoritative",
                    "published_at": None,
                    "source_updated_at": None,
                    "retrieved_at": "2026-10-08T00:00:00Z",
                    "provenance": {"external_network": False},
                }]
        elif tool == "vendor_advisory_search":
            assert input_data == {"vendor": "cisco", "query": "CVE-2024-20399", "candidate_urls": [advisory_url]}
            output = {"found": True, "candidates": [{"title": "Cisco advisory", "url": advisory_url}]}
        elif tool == "evidence_fetch":
            assert input_data == {"vendor": "cisco", "url": advisory_url}
            evidence_id = str(uuid4())
            output = {"found": True, "vendor": "cisco", "cves": ["CVE-2024-20399"]}
            evidence = [{
                "evidence_id": evidence_id,
                "source_type": "vendor_advisory",
                "source_name": "Cisco Security Advisory",
                "canonical_url": advisory_url,
                "title": "Cisco advisory",
                "excerpt": "Cisco published an advisory for CVE-2024-20399.",
                "normalized": {"vendor": "cisco", "cves": ["CVE-2024-20399"]},
                "content_hash": "f" * 64,
                "authority_level": "authoritative",
                "published_at": None,
                "source_updated_at": None,
                "retrieved_at": "2026-10-08T00:00:00Z",
                "provenance": {"external_network": False, "untrusted_content": True},
            }]
        return ResearchToolResponse.model_validate({
            "trace_id": trace_id,
            "run_id": run_id,
            "tool": tool,
            "status": "ok",
            "output": output,
            "evidence": evidence,
            "receipt_ids": [],
            "latency_ms": 0,
        })

    monkeypatch.setattr(research_gateway, "invoke", vendor_invoke)
    body = research_body(trace_id, run_id)
    body["snapshot"]["title"] = "Cisco CVE-2024-20399 investigation"  # type: ignore[index]
    old_token, old_enabled = settings.internal_token, settings.research_enabled
    settings.internal_token, settings.research_enabled = SecretStr("test-token"), True
    try:
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://testserver") as client:
            response = await client.post(
                "/v1/research/story/7",
                headers={"authorization": "Bearer test-token", "x-trace-id": trace_id},
                json=body,
            )
    finally:
        settings.internal_token, settings.research_enabled = old_token, old_enabled
    assert response.status_code == 200
    proposal = response.json()["proposal"]
    assert calls == ["nvd_lookup", "kev_lookup", "vendor_advisory_search", "evidence_fetch"]
    assert len(proposal["claims"]) == 2
    vendor_claim = next(claim for claim in proposal["claims"] if claim["claim_id"] == "vendor_advisory:cisco:CVE-2024-20399")
    vendor_evidence = next(item for item in proposal["evidence"] if item["source_type"] == "vendor_advisory")
    assert vendor_claim["evidence_ids"] == [vendor_evidence["evidence_id"]]
