import re
from typing import TypedDict
from uuid import UUID

from langgraph.graph import END, START, StateGraph

from app.schemas.research import ResearchClaim, ResearchProposal, ResearchTaskRequest, ResearchToolTrace, ResearchUnknown
from app.tools.research_gateway import ResearchGatewayError, research_gateway


class ResearchState(TypedDict, total=False):
    trace_id: UUID
    task: ResearchTaskRequest
    proposal: ResearchProposal


async def identify_gaps(state: ResearchState) -> dict[str, ResearchProposal]:
    task = state["task"]
    questions = task.snapshot.missing_questions or [task.objective]
    evidence = []
    claims = []
    tool_trace = []
    attempted_sources: list[str] = []
    research_text = "\n".join(filter(None, [
        task.objective,
        task.snapshot.title,
        task.snapshot.digest,
        *(fact.title for fact in task.snapshot.facts),
    ]))
    cve_match = re.search(r"\bCVE-\d{4}-\d{4,}\b", research_text, re.IGNORECASE)
    cve_id = cve_match.group(0).upper() if cve_match else None
    planned = [
        ("nvd_lookup", {"cve_id": cve_id}),
        ("kev_lookup", {"cve_id": cve_id}),
    ] if cve_id else [("stub", {"question": questions[0]})]
    for sequence, (tool, input_data) in enumerate(planned[:task.limits.max_tool_calls], start=1):
        try:
            result = await research_gateway.invoke(task, tool, input_data)
            evidence.extend(result.evidence)
            attempted_sources.append(tool)
            tool_trace.append(ResearchToolTrace(
                sequence=sequence,
                tool=tool,
                status="ok",
                input_summary=input_data,
                evidence_ids=[item.evidence_id for item in result.evidence],
                receipt_ids=result.receipt_ids,
                latency_ms=result.latency_ms,
                error_code=None,
            ))
            if result.output.get("found") is True and result.evidence and cve_id is not None:
                text = (
                    f"CISA KEV lists {cve_id} as a known exploited vulnerability."
                    if tool == "kev_lookup"
                    else f"NVD has an authoritative vulnerability record for {cve_id}."
                )
                claims.append(ResearchClaim(
                    claim_id=f"{tool}:{cve_id}",
                    text=text,
                    criticality="critical",
                    status="confirmed",
                    confidence=1.0,
                    evidence_ids=[item.evidence_id for item in result.evidence],
                ))
        except ResearchGatewayError:
            attempted_sources.append(tool)
            tool_trace.append(ResearchToolTrace(
                sequence=sequence,
                tool=tool,
                status="error",
                input_summary=input_data,
                evidence_ids=[],
                receipt_ids=[],
                latency_ms=0,
                error_code="tool_gateway_error",
            ))
    unknowns = [
        ResearchUnknown(
            question=question,
            attempted_sources=attempted_sources,
            reason="deterministic fixture evidence cannot resolve a real research question",
        )
        for question in questions
    ]
    return {
        "proposal": ResearchProposal(
            claims=claims,
            unknowns=unknowns,
            evidence=evidence,
            conflicts=[],
            tool_trace=tool_trace,
            summary="Deterministic research adapters ran; unresolved semantic questions remain explicit.",
            terminal_status="insufficient_evidence",
        )
    }


builder = StateGraph(ResearchState)
builder.add_node("identify_gaps", identify_gaps)
builder.add_edge(START, "identify_gaps")
builder.add_edge("identify_gaps", END)
graph = builder.compile()


async def run_research_graph(task: ResearchTaskRequest) -> ResearchProposal:
    state = await graph.ainvoke({"trace_id": task.trace_id, "task": task})
    return state["proposal"]
