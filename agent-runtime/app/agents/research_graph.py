from typing import TypedDict
from uuid import UUID

from langgraph.graph import END, START, StateGraph

from app.schemas.research import ResearchProposal, ResearchTaskRequest, ResearchUnknown


class ResearchState(TypedDict, total=False):
    trace_id: UUID
    task: ResearchTaskRequest
    proposal: ResearchProposal


async def identify_gaps(state: ResearchState) -> dict[str, ResearchProposal]:
    task = state["task"]
    questions = task.snapshot.missing_questions or [task.objective]
    unknowns = [
        ResearchUnknown(
            question=question,
            attempted_sources=[],
            reason="deterministic foundation has no live research tools enabled",
        )
        for question in questions
    ]
    return {
        "proposal": ResearchProposal(
            claims=[],
            unknowns=unknowns,
            evidence=[],
            conflicts=[],
            tool_trace=[],
            summary="No external research was attempted; all requested questions remain unknown.",
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
