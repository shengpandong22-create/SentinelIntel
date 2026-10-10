from typing import TypedDict
from uuid import UUID

from langgraph.graph import END, START, StateGraph

from app.schemas.tracking import TrackingChange, TrackingProposal, TrackingQuestionUpdate, TrackingTaskRequest


class TrackingState(TypedDict, total=False):
    trace_id: UUID
    task: TrackingTaskRequest
    proposal: TrackingProposal


async def compare_evidence(state: TrackingState) -> dict[str, TrackingProposal]:
    task = state["task"]
    evidence_by_observation: dict[str, list[UUID]] = {}
    for evidence in task.evidence:
        for observation in evidence.observations:
            evidence_by_observation.setdefault(observation, []).append(evidence.evidence_id)

    changes: list[TrackingChange] = []
    updates: list[TrackingQuestionUpdate] = []
    for question in task.plan.questions:
        if question.status == "resolved":
            continue
        matched_type = next((kind for kind in question.resolve_on if evidence_by_observation.get(kind)), None)
        if matched_type is None:
            updates.append(TrackingQuestionUpdate(
                question_id=question.question_id,
                status="open",
                reason="No authoritative evidence in the supplied snapshot resolves this question.",
                evidence_ids=[],
            ))
            continue
        ids = list(dict.fromkeys(evidence_by_observation[matched_type]))
        changes.append(TrackingChange(
            change_key=f"{question.question_id}:{matched_type}:{ids[0]}",
            change_type=matched_type,
            summary=f"Authoritative evidence resolves tracking question {question.question_id}.",
            before={"question_status": "open"},
            after={"question_status": "resolved", "observation": matched_type},
            evidence_ids=ids,
        ))
        updates.append(TrackingQuestionUpdate(
            question_id=question.question_id,
            status="resolved",
            reason="A declared target observation is present in stored Evidence.",
            evidence_ids=ids,
        ))

    projected_status = {question.question_id: question.status for question in task.plan.questions}
    projected_status.update({update.question_id: update.status for update in updates})
    all_resolved = all(status == "resolved" for status in projected_status.values())
    next_no_change = task.plan.consecutive_no_change_checks + (0 if changes else 1)
    stop_for_no_change = (
        task.plan.stop_condition.stop_after_no_change_checks is not None
        and next_no_change >= task.plan.stop_condition.stop_after_no_change_checks
    )
    should_stop = (task.plan.stop_condition.all_questions_resolved and all_resolved) or stop_for_no_change
    if should_stop:
        decision = "stop"
        interval = None
    else:
        decision = "continue"
        interval = task.plan.current_interval_hours
        if not changes:
            interval = min(
                task.plan.interval_policy.max_hours,
                max(task.plan.interval_policy.min_hours, round(interval * task.plan.interval_policy.no_change_multiplier)),
            )

    return {"proposal": TrackingProposal(
        material_changes=changes,
        question_updates=updates,
        decision=decision,
        suggested_interval_hours=interval,
        decision_reason=(
            "A declared stop condition is satisfied."
            if should_stop
            else "Open questions remain; continue within the deterministic interval policy."
        ),
        tool_trace=[],
    )}


builder = StateGraph(TrackingState)
builder.add_node("compare_evidence", compare_evidence)
builder.add_edge(START, "compare_evidence")
builder.add_edge("compare_evidence", END)
graph = builder.compile()


async def run_tracking_graph(task: TrackingTaskRequest) -> TrackingProposal:
    state = await graph.ainvoke({"trace_id": task.trace_id, "task": task})
    return state["proposal"]
