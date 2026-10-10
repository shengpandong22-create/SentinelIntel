from typing import Literal
from uuid import UUID

from pydantic import Field, SecretStr, model_validator

from .research import ResearchEvidence, ResearchLimits, ResearchToolTrace, StoryResearchSnapshot, StrictModel
from .tracking import TrackingEvidenceRef

# Phase 6 Product Impact Agent contract (docs/00-sentinelintel/07-Phase6-Product-Impact-Plan.md).
#
# Python proposes extraction-grounded impact rows; TypeScript owns entity identity, the deterministic
# version matcher, evidence linkage checks, confidence routing, and persistence. Range expressions are
# passed through as raw text plus a supported flag — the matcher that validates that flag lives on the
# TypeScript side. The LLM is only reachable through the TypeScript model gateway; it never computes
# version ranges and never concludes "unaffected" from absence. PoC status is unknown-only in Phase 6.

ImpactConfidence = Literal["high", "medium", "low"]


class ImpactRange(StrictModel):
    raw: str = Field(min_length=1, max_length=200)
    supported: bool


class ImpactExploitStatus(StrictModel):
    # Phase 6 has no allowlisted PoC source, so poc is unknown-only and other values do not parse.
    poc: Literal["unknown"]
    known_exploited: Literal["unknown", "yes", "no"]


class ImpactRow(StrictModel):
    vendor: str = Field(min_length=1, max_length=200)
    product: str = Field(min_length=1, max_length=200)
    models: list[str] = Field(default_factory=list, max_length=50)
    cve_id: str | None = Field(default=None, pattern=r"^CVE-\d{4}-\d{4,}$")
    affected_range: ImpactRange
    fixed_range: ImpactRange | None = None
    mitigations: list[str] = Field(default_factory=list, max_length=20)
    confidence: ImpactConfidence
    evidence_ids: list[UUID] = Field(min_length=1, max_length=20)


class ImpactExtractionRequest(StrictModel):
    request_id: UUID
    evidence_ids: list[UUID] = Field(min_length=1, max_length=12)
    focus: Literal["product_versions", "mitigation", "exploit_status"]
    instructions: str = Field(min_length=1, max_length=2_000)


class ImpactExtractionRowDraft(StrictModel):
    vendor: str = Field(min_length=1, max_length=200)
    product: str = Field(min_length=1, max_length=200)
    models: list[str] = Field(default_factory=list, max_length=50)
    cve_id: str | None = Field(default=None, pattern=r"^CVE-\d{4}-\d{4,}$")
    affected_range_raw: str | None = Field(default=None, max_length=200)
    affected_range_supported: bool
    fixed_range_raw: str | None = Field(default=None, max_length=200)
    fixed_range_supported: bool
    mitigations: list[str] = Field(default_factory=list, max_length=20)
    confidence: ImpactConfidence
    evidence_ids: list[UUID] = Field(min_length=1, max_length=20)


class ImpactExtraction(StrictModel):
    # Gateway-executed extraction drafts. Supported flags come from the deterministic TypeScript
    # matcher — the model never decides support, and unsupported expressions surface as unknown.
    drafts: list[ImpactExtractionRowDraft] = Field(max_length=20)
    unknowns: list[str] = Field(default_factory=list, max_length=50)
    prompt_version: str = Field(min_length=1, max_length=100)


class ImpactProposal(StrictModel):
    new_evidence: list[ResearchEvidence] = Field(max_length=12)
    impact_rows: list[ImpactRow] = Field(max_length=20)
    exploit_status: ImpactExploitStatus
    known_exploited_evidence_ids: list[UUID] = Field(default_factory=list, max_length=20)
    unknowns: list[str] = Field(default_factory=list, max_length=50)
    decision: Literal["propose", "insufficient_evidence"]
    decision_reason: str = Field(min_length=1, max_length=4_000)
    tool_trace: list[ResearchToolTrace] = Field(max_length=8)
    extraction_requests: list[ImpactExtractionRequest] = Field(default_factory=list, max_length=12)

    @model_validator(mode="after")
    def internally_consistent(self) -> "ImpactProposal":
        keys = [f"{row.vendor}::{row.product}".lower() for row in self.impact_rows]
        if len(set(keys)) != len(keys):
            raise ValueError("duplicate impact row for vendor and product")
        if self.exploit_status.known_exploited == "yes" and not self.known_exploited_evidence_ids:
            raise ValueError("known_exploited yes lacks KEV evidence")
        if self.exploit_status.known_exploited != "yes" and self.known_exploited_evidence_ids:
            raise ValueError("known_exploited evidence present without yes")
        if self.decision == "propose" and not self.impact_rows and not self.unknowns:
            raise ValueError("proposing without impact rows or unknowns")
        return self


class ImpactSourceParameters(StrictModel):
    cve_id: str | None = Field(default=None, pattern=r"^CVE-\d{4}-\d{4,}$")
    vendor: str | None = Field(default=None, min_length=1, max_length=200, pattern=r"^[A-Za-z0-9][A-Za-z0-9 ._-]*$")


class ImpactTaskRequest(StrictModel):
    trace_id: UUID
    run_id: UUID
    tool_capability: SecretStr = Field(min_length=32)
    story: StoryResearchSnapshot
    source_parameters: ImpactSourceParameters = Field(default_factory=ImpactSourceParameters)
    # Evidence refs reuse the tracking shape; observations drive tracking routing only and are ignored
    # by impact validation, which checks evidence existence and story locality instead.
    evidence: list[TrackingEvidenceRef] = Field(default_factory=list, max_length=100)
    limits: ResearchLimits
    # Present only in the normalization call: gateway-executed extraction drafts to turn into rows.
    extraction: ImpactExtraction | None = None


class ImpactTaskResponse(StrictModel):
    trace_id: UUID
    run_id: UUID
    proposal: ImpactProposal
