from typing import TypedDict
from uuid import UUID

from langgraph.graph import END, START, StateGraph

from app.schemas.impact import ImpactExploitStatus, ImpactProposal, ImpactTaskRequest
from app.schemas.research import ResearchEvidence, ResearchToolTrace
from app.tools.research_gateway import ResearchGatewayError, research_gateway


class ImpactState(TypedDict, total=False):
    trace_id: UUID
    task: ImpactTaskRequest
    proposal: ImpactProposal


async def gather_impact_evidence(state: ImpactState) -> dict[str, ImpactProposal]:
    task = state["task"]
    cve_id = task.source_parameters.cve_id
    vendor = task.source_parameters.vendor
    planned: list[tuple[str, dict[str, object]]] = []
    if cve_id:
        planned.extend((
            ("nvd_lookup", {"cve_id": cve_id}),
            ("kev_lookup", {"cve_id": cve_id}),
        ))
    if cve_id and vendor:
        planned.append(("vendor_advisory_search", {"vendor": vendor, "query": cve_id, "candidate_urls": []}))

    evidence: list[ResearchEvidence] = []
    traces: list[ResearchToolTrace] = []
    attempted: list[str] = []
    known_exploited = "unknown"
    kev_ids: list[UUID] = []
    advisory_candidates: list[str] = []
    sequence = 0
    for tool, raw_input in planned:
        if sequence >= task.limits.max_tool_calls:
            break
        sequence += 1
        input_data = raw_input
        if tool == "vendor_advisory_search":
            input_data = {**raw_input, "candidate_urls": advisory_candidates[:20]}
        attempted.append(tool)
        try:
            result = await research_gateway.invoke(task, tool, input_data)
            evidence.extend(result.evidence)
            traces.append(ResearchToolTrace(
                sequence=sequence, tool=tool, status="ok", input_summary=input_data,
                evidence_ids=[item.evidence_id for item in result.evidence], receipt_ids=result.receipt_ids,
                latency_ms=result.latency_ms, error_code=None,
            ))
            if tool == "nvd_lookup":
                for item in result.evidence:
                    references = item.normalized.get("references")
                    if isinstance(references, list):
                        advisory_candidates.extend(
                            entry["url"] for entry in references
                            if isinstance(entry, dict) and isinstance(entry.get("url"), str)
                        )
            if tool == "kev_lookup" and result.output.get("found") is True:
                matched_kev_ids = [item.evidence_id for item in result.evidence if item.source_type == "cisa_kev"]
                if matched_kev_ids:
                    known_exploited = "yes"
                    kev_ids.extend(matched_kev_ids)
            if tool == "vendor_advisory_search" and sequence < task.limits.max_tool_calls:
                candidates = result.output.get("candidates")
                first = candidates[0] if isinstance(candidates, list) and candidates else None
                if isinstance(first, dict) and isinstance(first.get("url"), str) and vendor:
                    sequence += 1
                    fetch_input = {"vendor": vendor, "url": first["url"]}
                    attempted.append("evidence_fetch")
                    fetched = await research_gateway.invoke(task, "evidence_fetch", fetch_input)
                    evidence.extend(fetched.evidence)
                    traces.append(ResearchToolTrace(
                        sequence=sequence, tool="evidence_fetch", status="ok", input_summary=fetch_input,
                        evidence_ids=[item.evidence_id for item in fetched.evidence], receipt_ids=fetched.receipt_ids,
                        latency_ms=fetched.latency_ms, error_code=None,
                    ))
        except ResearchGatewayError:
            traces.append(ResearchToolTrace(
                sequence=sequence, tool=tool, status="error", input_summary=input_data,
                evidence_ids=[], receipt_ids=[], latency_ms=0, error_code="tool_gateway_error",
            ))

    # Tool acquisition is deterministic. Semantic extraction is deliberately not guessed here: until
    # the TypeScript model-gateway round trip supplies supported rows, the graph preserves unknowns.
    unknowns = []
    if not cve_id:
        unknowns.append("No CVE identifier was available for structured source lookup.")
    if not evidence:
        unknowns.append("No authoritative product-impact evidence was acquired.")
    unknowns.append("Product, model, and version extraction requires the TypeScript model gateway.")
    return {"proposal": ImpactProposal(
        new_evidence=evidence,
        impact_rows=[],
        exploit_status=ImpactExploitStatus(poc="unknown", known_exploited=known_exploited),
        known_exploited_evidence_ids=kev_ids,
        unknowns=unknowns,
        decision="insufficient_evidence",
        decision_reason=f"Bounded official-source acquisition completed; attempted: {', '.join(attempted) or 'none'}.",
        tool_trace=traces,
    )}


builder = StateGraph(ImpactState)
builder.add_node("gather_impact_evidence", gather_impact_evidence)
builder.add_edge(START, "gather_impact_evidence")
builder.add_edge("gather_impact_evidence", END)
graph = builder.compile()


async def run_impact_graph(task: ImpactTaskRequest) -> ImpactProposal:
    state = await graph.ainvoke({"trace_id": task.trace_id, "task": task})
    return state["proposal"]
