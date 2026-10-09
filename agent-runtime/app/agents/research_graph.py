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


VENDOR_ALIASES = {
    "cisco": ("cisco",),
    "fortinet": ("fortinet", "fortigate", "fortios"),
    "hikvision": ("hikvision", "海康威视"),
    "microsoft": ("microsoft", "windows"),
}


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
    lower_research_text = research_text.lower()
    vendor = next((key for key, aliases in VENDOR_ALIASES.items() if any(alias in lower_research_text for alias in aliases)), None)
    planned = [
        ("nvd_lookup", {"cve_id": cve_id}),
        ("kev_lookup", {"cve_id": cve_id}),
    ] if cve_id else [("stub", {"question": questions[0]})]
    if vendor and cve_id:
        planned.append(("vendor_advisory_search", {"vendor": vendor, "query": cve_id, "candidate_urls": []}))
    sequence = 0
    advisory_candidates: list[str] = []
    for tool, input_data in planned[:task.limits.max_tool_calls]:
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
            if tool == "vendor_advisory_search" and sequence < task.limits.max_tool_calls:
                candidates = result.output.get("candidates")
                first = candidates[0] if isinstance(candidates, list) and candidates else None
                if isinstance(first, dict) and isinstance(first.get("url"), str) and vendor is not None:
                    sequence += 1
                    fetch_input = {"vendor": vendor, "url": first["url"]}
                    try:
                        fetched = await research_gateway.invoke(task, "evidence_fetch", fetch_input)
                    except ResearchGatewayError:
                        attempted_sources.append("evidence_fetch")
                        tool_trace.append(ResearchToolTrace(
                            sequence=sequence,
                            tool="evidence_fetch",
                            status="error",
                            input_summary=fetch_input,
                            evidence_ids=[],
                            receipt_ids=[],
                            latency_ms=0,
                            error_code="tool_gateway_error",
                        ))
                        continue
                    evidence.extend(fetched.evidence)
                    attempted_sources.append("evidence_fetch")
                    tool_trace.append(ResearchToolTrace(
                        sequence=sequence,
                        tool="evidence_fetch",
                        status="ok",
                        input_summary=fetch_input,
                        evidence_ids=[item.evidence_id for item in fetched.evidence],
                        receipt_ids=fetched.receipt_ids,
                        latency_ms=fetched.latency_ms,
                        error_code=None,
                    ))
                    if fetched.output.get("found") is True and fetched.evidence:
                        claims.append(ResearchClaim(
                            claim_id=f"vendor_advisory:{vendor}:{cve_id}",
                            text=f"{vendor.title()} published an official advisory referencing {cve_id}.",
                            criticality="critical",
                            status="confirmed",
                            confidence=1.0,
                            evidence_ids=[item.evidence_id for item in fetched.evidence],
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
