import re
from typing import TypedDict
from uuid import UUID

from langgraph.graph import END, START, StateGraph

from app.schemas.research import ResearchEvidence, ResearchToolTrace
from app.schemas.tracking import TrackingChange, TrackingEvidenceRef, TrackingProposal, TrackingQuestionUpdate, TrackingTaskRequest
from app.tools.research_gateway import ResearchGatewayError, research_gateway


class TrackingState(TypedDict, total=False):
    trace_id: UUID
    task: TrackingTaskRequest
    proposal: TrackingProposal


VENDOR_ALIASES = {
    "cisco": ("cisco",),
    "fortinet": ("fortinet", "fortigate", "fortios"),
    "hikvision": ("hikvision", "海康威视"),
    "microsoft": ("microsoft", "windows"),
}


def observations(item: ResearchEvidence) -> list[str]:
    raw = item.normalized.get("tracking_observations")
    if not isinstance(raw, list) or item.authority_level == "secondary":
        return []
    accepted: list[str] = []
    for value in raw:
        if value not in {"vendor_confirmation", "patch", "procurement_award", "material_update"}:
            continue
        if value in {"vendor_confirmation", "patch"} and item.source_type != "vendor_advisory":
            continue
        if value == "procurement_award" and item.source_type != "official_procurement":
            continue
        accepted.append(value)
    return list(dict.fromkeys(accepted))


def evidence_ref(item: ResearchEvidence) -> TrackingEvidenceRef:
    return TrackingEvidenceRef(
        evidence_id=item.evidence_id,
        source_type=item.source_type,
        authority_level=item.authority_level,
        canonical_url=item.canonical_url,
        content_hash=item.content_hash,
        retrieved_at=item.retrieved_at,
        observations=observations(item),
    )


async def compare_evidence(state: TrackingState) -> dict[str, TrackingProposal]:
    task = state["task"]
    new_evidence: list[ResearchEvidence] = []
    tool_trace: list[ResearchToolTrace] = []
    tool_failed = False
    text = "\n".join(filter(None, [task.story.title, task.story.digest, *(fact.title for fact in task.story.facts)]))
    cve_match = re.search(r"\bCVE-\d{4}-\d{4,}\b", text, re.IGNORECASE)
    cve_id = task.plan.source_parameters.cve_id or (cve_match.group(0).upper() if cve_match else None)
    lowered = text.lower()
    vendor = task.plan.source_parameters.vendor or next((key for key, aliases in VENDOR_ALIASES.items() if any(alias in lowered for alias in aliases)), None)
    planned: list[tuple[str, dict[str, object]]] = []
    if cve_id and "nvd" in task.plan.source_targets:
        planned.append(("nvd_lookup", {"cve_id": cve_id}))
    if cve_id and "cisa_kev" in task.plan.source_targets:
        planned.append(("kev_lookup", {"cve_id": cve_id}))
    if cve_id and vendor and "vendor_advisory" in task.plan.source_targets:
        planned.append(("vendor_advisory_search", {"vendor": vendor, "query": cve_id, "candidate_urls": []}))
    if task.plan.source_parameters.ted_procedure_id and "official_procurement" in task.plan.source_targets:
        planned.append(("ted_procurement_lookup", {"procedure_id": task.plan.source_parameters.ted_procedure_id}))

    advisory_candidates: list[str] = []
    sequence = 0
    for tool, input_data in planned:
        if sequence >= task.limits.max_tool_calls:
            break
        sequence += 1
        if tool == "vendor_advisory_search":
            input_data = {**input_data, "candidate_urls": advisory_candidates[:20]}
        try:
            result = await research_gateway.invoke(task, tool, input_data)
            if tool == "nvd_lookup":
                for item in result.evidence:
                    references = item.normalized.get("references")
                    if isinstance(references, list):
                        advisory_candidates.extend(
                            reference["url"] for reference in references
                            if isinstance(reference, dict) and isinstance(reference.get("url"), str)
                        )
            new_evidence.extend(result.evidence)
            tool_trace.append(ResearchToolTrace(
                sequence=sequence, tool=tool, status="ok", input_summary=input_data,
                evidence_ids=[item.evidence_id for item in result.evidence], receipt_ids=result.receipt_ids,
                latency_ms=result.latency_ms, error_code=None,
            ))
            candidates = result.output.get("candidates") if tool == "vendor_advisory_search" else None
            first = candidates[0] if isinstance(candidates, list) and candidates else None
            if isinstance(first, dict) and isinstance(first.get("url"), str) and vendor and sequence < task.limits.max_tool_calls:
                sequence += 1
                fetch_input = {"vendor": vendor, "url": first["url"]}
                fetched = await research_gateway.invoke(task, "evidence_fetch", fetch_input)
                new_evidence.extend(fetched.evidence)
                tool_trace.append(ResearchToolTrace(
                    sequence=sequence, tool="evidence_fetch", status="ok", input_summary=fetch_input,
                    evidence_ids=[item.evidence_id for item in fetched.evidence], receipt_ids=fetched.receipt_ids,
                    latency_ms=fetched.latency_ms, error_code=None,
                ))
        except ResearchGatewayError:
            tool_failed = True
            tool_trace.append(ResearchToolTrace(
                sequence=sequence, tool=tool, status="error", input_summary=input_data,
                evidence_ids=[], receipt_ids=[], latency_ms=0, error_code="tool_gateway_error",
            ))

    combined_evidence = [*task.evidence, *(evidence_ref(item) for item in new_evidence)]
    evidence_by_observation: dict[str, list[UUID]] = {}
    for evidence in combined_evidence:
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
    if tool_failed and not changes:
        decision = "insufficient_evidence"
        interval = task.plan.current_interval_hours
    elif should_stop:
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
        new_evidence=new_evidence,
        material_changes=changes,
        question_updates=updates,
        decision=decision,
        suggested_interval_hours=interval,
        decision_reason=(
            "A declared stop condition is satisfied."
            if should_stop
            else "Open questions remain; continue within the deterministic interval policy."
        ),
        tool_trace=tool_trace,
    )}


builder = StateGraph(TrackingState)
builder.add_node("compare_evidence", compare_evidence)
builder.add_edge(START, "compare_evidence")
builder.add_edge("compare_evidence", END)
graph = builder.compile()


async def run_tracking_graph(task: TrackingTaskRequest) -> TrackingProposal:
    state = await graph.ainvoke({"trace_id": task.trace_id, "task": task})
    return state["proposal"]
