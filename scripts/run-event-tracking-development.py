import argparse
import asyncio
import json
import sys
from pathlib import Path
from time import monotonic

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "agent-runtime"))

from app.agents.tracking_graph import run_tracking_graph  # noqa: E402
from app.schemas.research import ResearchToolResponse  # noqa: E402
from app.schemas.tracking import TrackingTaskRequest  # noqa: E402
from app.tools.research_gateway import ResearchGatewayError, research_gateway  # noqa: E402


async def run_case(row: dict[str, object]) -> dict[str, object]:
    task = TrackingTaskRequest.model_validate(row["input"])
    fixture = row["fixture_gateway"]
    expected_tools = fixture["expected_tools"]
    calls: list[str] = []

    async def fixture_invoke(current_task: TrackingTaskRequest, tool: str, _input: dict[str, object]) -> ResearchToolResponse:
        calls.append(tool)
        if fixture["mode"] == "error":
            raise ResearchGatewayError("frozen fixture gateway error")
        return ResearchToolResponse(
            trace_id=current_task.trace_id,
            run_id=current_task.run_id,
            tool=tool,
            status="ok",
            output={"found": False, "fixture": True},
            evidence=[],
            receipt_ids=[],
            latency_ms=0,
        )

    original = research_gateway.invoke
    research_gateway.invoke = fixture_invoke  # type: ignore[method-assign]
    started = monotonic()
    try:
        proposal = await run_tracking_graph(task)
    finally:
        research_gateway.invoke = original  # type: ignore[method-assign]
    if calls != expected_tools:
        raise RuntimeError(f"{row['case_id']}: expected tools {expected_tools}, observed {calls}")
    return {
        "case_id": row["case_id"],
        "proposal": proposal.model_dump(mode="json"),
        "execution": {
            "latency_ms": round((monotonic() - started) * 1000),
            "model_tokens": 0,
            "provider_cost_usd": 0,
            "tool_calls": len(calls),
            "receipt_ids": [],
            "policy_violations": [],
            "core_mutations": 0,
            "stale_commits": 0,
            "duplicate_commits": 0,
        },
    }


async def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--cases", default="datasets/event-tracking/development.jsonl")
    parser.add_argument("--out", default=".data/event-tracking/development-results.jsonl")
    args = parser.parse_args()
    rows = [json.loads(line) for line in (ROOT / args.cases).read_text(encoding="utf-8").splitlines() if line.strip()]
    results = [await run_case(row) for row in rows]
    output = ROOT / args.out
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text("".join(f"{json.dumps(row, separators=(',', ':'))}\n" for row in results), encoding="utf-8")
    print(json.dumps({"ok": True, "cases": len(results), "out": str(output)}))


if __name__ == "__main__":
    asyncio.run(main())
