from typing import TypedDict
from uuid import UUID

from langgraph.graph import END, START, StateGraph

from app.schemas.research import ResearchProposal, ResearchTaskRequest, ResearchToolTrace, ResearchUnknown
from app.tools.research_gateway import ResearchGatewayError, research_gateway


class ResearchState(TypedDict, total=False):
    trace_id: UUID
    task: ResearchTaskRequest
    proposal: ResearchProposal


async def identify_gaps(state: ResearchState) -> dict[str, ResearchProposal]:
    task = state["task"]
    questions = task.snapshot.missing_questions or [task.objective]
    evidence = []
    tool_trace = []
    attempted_sources: list[str] = []
    if task.limits.max_tool_calls > 0:
        try:
            result = await research_gateway.invoke(task, "stub", {"question": questions[0]})
            evidence.extend(result.evidence)
            attempted_sources.append("stub")
            tool_trace.append(ResearchToolTrace(
                sequence=1,
                tool="stub",
                status="ok",
                input_summary={"question": questions[0]},
                evidence_ids=[item.evidence_id for item in result.evidence],
                receipt_ids=result.receipt_ids,
                latency_ms=result.latency_ms,
                error_code=None,
            ))
        except ResearchGatewayError:
            attempted_sources.append("stub")
            tool_trace.append(ResearchToolTrace(
                sequence=1,
                tool="stub",
                status="error",
                input_summary={"question": questions[0]},
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
            claims=[],
            unknowns=unknowns,
            evidence=evidence,
            conflicts=[],
            tool_trace=tool_trace,
            summary="Only deterministic fixture research was attempted; all requested questions remain unknown.",
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
