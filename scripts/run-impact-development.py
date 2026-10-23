import argparse
import asyncio
import json
import sys
import uuid
from pathlib import Path
from time import monotonic

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "agent-runtime"))

from app.agents.impact_graph import run_impact_graph  # noqa: E402
from app.schemas.impact import ImpactTaskRequest  # noqa: E402
from app.schemas.tracking import TrackingEvidenceRef  # noqa: E402
from pydantic import SecretStr  # noqa: E402


async def run_case(row: dict) -> dict:
    payload = row["input"]
    task = ImpactTaskRequest(
        trace_id=str(uuid.uuid5(uuid.NAMESPACE_URL, f"impact-dev:{row['case_id']}")),
        run_id=str(uuid.uuid5(uuid.NAMESPACE_URL, f"impact-dev-run:{row['case_id']}")),
        tool_capability=SecretStr("fixture-capability-placeholder-0000000001"),
        story={
            "schema_version": 1, "story_id": abs(hash(row["case_id"])) % 100000, "story_version": 1,
            "title": payload["story_title"], "digest": payload["story_digest"], "status": "active",
            "facts": [], "missing_questions": [], "captured_at": "2026-10-10T00:00:00Z",
        },
        source_parameters=payload["source_parameters"],
        evidence=[TrackingEvidenceRef.model_validate(item) for item in payload["evidence"]],
        limits={"max_rounds": 1, "max_tool_calls": 0, "max_generic_searches": 0,
                "max_evidence_documents": 12, "deadline_ms": 60_000, "max_response_bytes": 2_097_152},
        extraction=payload["extraction"],
    )
    started = monotonic()
    proposal = await run_impact_graph(task)
    return {
        "case_id": row["case_id"],
        "proposal": json.loads(proposal.model_dump_json()),
        "execution": {"latency_ms": int((monotonic() - started) * 1000), "tool_calls": 0,
                      "model_tokens": 0, "provider_cost_usd": 0},
    }


async def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--cases", default="datasets/impact/development.jsonl")
    parser.add_argument("--out", default=".data/impact/development-results.jsonl")
    args = parser.parse_args()
    rows = [json.loads(line) for line in (ROOT / args.cases).read_text(encoding="utf-8").splitlines() if line.strip()]
    results = [await run_case(row) for row in rows]
    output = ROOT / args.out
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text("".join(f"{json.dumps(row, separators=(',', ':'))}\n" for row in results), encoding="utf-8")
    print(json.dumps({"ok": True, "cases": len(results), "out": str(output)}))


if __name__ == "__main__":
    asyncio.run(main())
