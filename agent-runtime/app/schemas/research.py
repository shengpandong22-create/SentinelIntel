from datetime import datetime
from typing import Literal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, HttpUrl, model_validator


class StrictModel(BaseModel):
    model_config = ConfigDict(extra="forbid")


class ResearchLimits(StrictModel):
    max_rounds: int = Field(ge=1, le=3)
    max_tool_calls: int = Field(ge=0, le=8)
    max_generic_searches: int = Field(ge=0, le=2)
    max_evidence_documents: int = Field(ge=0, le=12)
    deadline_ms: int = Field(ge=100, le=300_000)
    max_response_bytes: int = Field(ge=1_024, le=8 * 1024 * 1024)


class SnapshotFact(StrictModel):
    fact_id: int = Field(gt=0)
    public_id: str = Field(min_length=1, max_length=200)
    title: str = Field(min_length=1, max_length=2_000)


class StoryResearchSnapshot(StrictModel):
    schema_version: Literal[1]
    story_id: int = Field(gt=0)
    story_version: int = Field(gt=0)
    title: str = Field(min_length=1, max_length=2_000)
    digest: str | None = Field(max_length=20_000)
    status: Literal["active", "watching", "settled"]
    facts: list[SnapshotFact] = Field(max_length=500)
    missing_questions: list[str] = Field(max_length=100)
    captured_at: datetime


class ResearchEvidence(StrictModel):
    evidence_id: UUID
    source_type: str = Field(min_length=1, max_length=64)
    source_name: str = Field(min_length=1, max_length=200)
    canonical_url: HttpUrl
    title: str = Field(min_length=1, max_length=1_000)
    excerpt: str | None = Field(default=None, max_length=20_000)
    normalized: dict[str, object] = Field(default_factory=dict)
    content_hash: str = Field(pattern=r"^[0-9a-f]{64}$")
    authority_level: Literal["authoritative", "primary", "secondary"]
    published_at: datetime | None = None
    source_updated_at: datetime | None = None
    retrieved_at: datetime
    provenance: dict[str, object] = Field(default_factory=dict)


class ResearchClaim(StrictModel):
    claim_id: str = Field(min_length=1, max_length=100)
    text: str = Field(min_length=1, max_length=4_000)
    criticality: Literal["critical", "noncritical"]
    status: Literal["confirmed", "conflicted"]
    confidence: float = Field(ge=0, le=1)
    evidence_ids: list[UUID] = Field(min_length=1)


class ResearchUnknown(StrictModel):
    question: str = Field(min_length=1, max_length=2_000)
    attempted_sources: list[str] = Field(max_length=20)
    reason: str = Field(min_length=1, max_length=2_000)


class ResearchConflict(StrictModel):
    description: str = Field(min_length=1, max_length=4_000)
    evidence_ids: list[UUID] = Field(min_length=2)


class ResearchToolTrace(StrictModel):
    sequence: int = Field(gt=0)
    tool: Literal["nvd_lookup", "kev_lookup", "vendor_advisory_search", "evidence_fetch", "web_search", "stub"]
    status: Literal["ok", "error", "blocked"]
    input_summary: dict[str, object]
    evidence_ids: list[UUID] = Field(default_factory=list)
    receipt_ids: list[int] = Field(default_factory=list)
    latency_ms: int = Field(ge=0)
    error_code: str | None = Field(default=None, max_length=100)


class ResearchProposal(StrictModel):
    claims: list[ResearchClaim] = Field(max_length=100)
    unknowns: list[ResearchUnknown] = Field(max_length=100)
    evidence: list[ResearchEvidence] = Field(max_length=12)
    conflicts: list[ResearchConflict] = Field(max_length=50)
    tool_trace: list[ResearchToolTrace] = Field(max_length=8)
    summary: str = Field(min_length=1, max_length=10_000)
    terminal_status: Literal["completed", "insufficient_evidence"]

    @model_validator(mode="after")
    def references_are_local(self) -> "ResearchProposal":
        evidence_by_id = {item.evidence_id: item for item in self.evidence}
        known = set(evidence_by_id)
        referenced = [evidence_id for claim in self.claims for evidence_id in claim.evidence_ids]
        referenced.extend(evidence_id for conflict in self.conflicts for evidence_id in conflict.evidence_ids)
        referenced.extend(evidence_id for trace in self.tool_trace for evidence_id in trace.evidence_ids)
        dangling = next((evidence_id for evidence_id in referenced if evidence_id not in known), None)
        if dangling is not None:
            raise ValueError(f"dangling evidence id: {dangling}")
        unsupported = next(
            (
                claim.claim_id
                for claim in self.claims
                if claim.criticality == "critical"
                and claim.status == "confirmed"
                and not any(evidence_by_id[evidence_id].authority_level != "secondary" for evidence_id in claim.evidence_ids)
            ),
            None,
        )
        if unsupported is not None:
            raise ValueError(f"critical claim lacks authoritative or primary evidence: {unsupported}")
        sequences = [trace.sequence for trace in self.tool_trace]
        if len(sequences) != len(set(sequences)):
            raise ValueError("duplicate tool trace sequence")
        return self


class ResearchTaskRequest(StrictModel):
    trace_id: UUID
    run_id: UUID
    objective: str = Field(min_length=1, max_length=2_000)
    snapshot: StoryResearchSnapshot
    limits: ResearchLimits


class ResearchTaskResponse(StrictModel):
    trace_id: UUID
    run_id: UUID
    status: Literal["ok"] = "ok"
    proposal: ResearchProposal
