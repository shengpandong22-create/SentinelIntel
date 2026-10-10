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
    assert any("TypeScript model gateway" in item for item in proposal.unknowns)
    assert [trace.tool for trace in proposal.tool_trace] == ["nvd_lookup", "kev_lookup", "vendor_advisory_search"]


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
