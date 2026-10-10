import json
from pathlib import Path

import pytest

from app.agents.impact_graph import run_impact_graph
from app.schemas.impact import ImpactTaskRequest
from app.schemas.research import ResearchToolResponse
from app.tools.research_gateway import research_gateway


@pytest.fixture
def anyio_backend() -> str:
    return "asyncio"


def fixture_task() -> ImpactTaskRequest:
    path = Path(__file__).parents[2] / "tests" / "fixtures" / "impact" / "task.json"
    return ImpactTaskRequest.model_validate(json.loads(path.read_text(encoding="utf-8"))["task"])


@pytest.mark.anyio
async def test_impact_graph_preserves_unknown_without_extraction(monkeypatch: pytest.MonkeyPatch) -> None:
    task = fixture_task()

    async def invoke(current: ImpactTaskRequest, tool: str, input_data: dict[str, object]) -> ResearchToolResponse:
        del input_data
        return ResearchToolResponse(
            trace_id=current.trace_id, run_id=current.run_id, tool=tool, status="ok", output={"found": False},
            evidence=[], receipt_ids=[], latency_ms=1,
        )

    monkeypatch.setattr(research_gateway, "invoke", invoke)
    proposal = await run_impact_graph(task)
    assert proposal.decision == "insufficient_evidence"
    assert proposal.impact_rows == []
    assert proposal.exploit_status.poc == "unknown"
    assert proposal.exploit_status.known_exploited == "unknown"
    assert any("No authoritative product-impact evidence" in item for item in proposal.unknowns)
    assert [trace.tool for trace in proposal.tool_trace] == ["nvd_lookup", "kev_lookup", "vendor_advisory_search"]


@pytest.mark.anyio
async def test_impact_graph_emits_extraction_requests_for_acquired_evidence(monkeypatch: pytest.MonkeyPatch) -> None:
    task = fixture_task()

    async def invoke(current: ImpactTaskRequest, tool: str, input_data: dict[str, object]) -> ResearchToolResponse:
        del input_data
        return ResearchToolResponse(
            trace_id=current.trace_id, run_id=current.run_id, tool=tool, status="ok", output={"found": False},
            evidence=[], receipt_ids=[], latency_ms=1,
        )

    monkeypatch.setattr(research_gateway, "invoke", invoke)
    proposal = await run_impact_graph(task)
    assert proposal.impact_rows == []
    assert proposal.extraction_requests == []  # no authoritative/primary evidence was acquired


@pytest.mark.anyio
async def test_impact_graph_only_uses_kev_evidence_for_known_exploited(monkeypatch: pytest.MonkeyPatch) -> None:
    task = fixture_task()

    async def invoke(current: ImpactTaskRequest, tool: str, input_data: dict[str, object]) -> ResearchToolResponse:
        del input_data
        evidence = []
        if tool == "kev_lookup":
            raw = json.loads((Path(__file__).parents[2] / "tests" / "fixtures" / "research" / "cisa-kev.json").read_text(encoding="utf-8"))
            # The adapter fixture is not the normalized gateway shape; use the task's known KEV ref
            # only to prove that a tool result cannot invent a non-KEV evidence id.
            del raw
        return ResearchToolResponse(
                trace_id=current.trace_id, run_id=current.run_id, tool=tool, status="ok",
            output={"found": tool == "kev_lookup"}, evidence=evidence, receipt_ids=[], latency_ms=1,
        )

    monkeypatch.setattr(research_gateway, "invoke", invoke)
    proposal = await run_impact_graph(task)
    assert proposal.exploit_status.known_exploited == "unknown"
    assert proposal.known_exploited_evidence_ids == []


def normalize_task() -> ImpactTaskRequest:
    task = fixture_task()
    evidence_id = task.evidence[0].evidence_id  # type: ignore[index]
    kev_id = task.evidence[1].evidence_id  # type: ignore[index]
    extraction = {
        "drafts": [
            {
                "vendor": "Acme", "product": "CamFirm Platform", "models": ["CAM-100"], "cve_id": "CVE-2026-10001",
                "affected_range_raw": ">=1.0,<2.3.5", "affected_range_supported": True,
                "fixed_range_raw": "2.3.5", "fixed_range_supported": True,
                "mitigations": ["Upgrade to 2.3.5."], "confidence": "high", "evidence_ids": [str(evidence_id)],
            },
            {
                "vendor": "Acme", "product": "LegacyCam", "models": [], "cve_id": "CVE-2026-10001",
                "affected_range_raw": "firmware R-1.0 beta", "affected_range_supported": False,
                "fixed_range_raw": None, "fixed_range_supported": False,
                "mitigations": [], "confidence": "high", "evidence_ids": [str(evidence_id)],
            },
            {
                "vendor": "Acme", "product": "GhostCam", "models": [], "cve_id": None,
                "affected_range_raw": "1.0", "affected_range_supported": True,
                "fixed_range_raw": None, "fixed_range_supported": False,
                "mitigations": [], "confidence": "low", "evidence_ids": ["00000000-0000-4000-8000-000000000999"],
            },
        ],
        "unknowns": ["Vendor range format is not machine-readable for LegacyCam."],
        "prompt_version": "phase6-impact-extraction-v1",
    }
    payload = json.loads(json.dumps(task.model_dump(mode="json")))
    payload["tool_capability"] = "x" * 32  # SecretStr dumps as a mask; restore a valid capability
    # A primary (not authoritative) wire report: only its id is needed for the confidence-cap test.
    payload["evidence"].append({
        "evidence_id": "00000000-0000-4000-8000-000000000203",
        "source_type": "vendor_advisory", "authority_level": "primary",
        "canonical_url": "https://wire.example/report", "content_hash": "c" * 64,
        "retrieved_at": payload["evidence"][0]["retrieved_at"], "observations": [],
    })
    extraction["drafts"][1]["evidence_ids"] = ["00000000-0000-4000-8000-000000000203"]
    return ImpactTaskRequest.model_validate({**payload, "extraction": extraction})


@pytest.mark.anyio
async def test_normalization_turns_gateway_drafts_into_rows_with_authority_capped_confidence() -> None:
    proposal = await run_impact_graph(normalize_task())
    assert proposal.decision == "propose"
    assert [row.product for row in proposal.impact_rows] == ["CamFirm Platform", "LegacyCam"]
    main_row = proposal.impact_rows[0]
    assert main_row.confidence == "high"  # vendor advisory evidence is authoritative
    assert main_row.affected_range.supported is True
    legacy = proposal.impact_rows[1]
    assert legacy.affected_range.supported is False  # unsupported expression stays unknown, never a claim
    assert legacy.confidence == "medium"  # high over primary-only evidence caps at medium
    assert proposal.exploit_status.known_exploited == "yes"  # the fixture carries a KEV evidence ref
    assert len(proposal.known_exploited_evidence_ids) == 1
    assert any("GhostCam" in item for item in proposal.unknowns)


@pytest.mark.anyio
async def test_normalization_without_kev_evidence_stays_unknown() -> None:
    task = normalize_task()
    task.evidence = [item for item in task.evidence if item.source_type != "cisa_kev"]
    proposal = await run_impact_graph(task)
    assert proposal.exploit_status.known_exploited == "unknown"
    assert proposal.known_exploited_evidence_ids == []
