from datetime import datetime
from typing import Literal
from uuid import UUID

from pydantic import Field, HttpUrl, SecretStr, model_validator

from .research import ResearchEvidence, ResearchLimits, ResearchToolTrace, StoryResearchSnapshot, StrictModel


class TrackingQuestion(StrictModel):
    question_id: str = Field(min_length=1, max_length=100)
    question: str = Field(min_length=1, max_length=2_000)
    resolve_on: list[Literal["vendor_confirmation", "patch", "procurement_award", "material_update"]] = Field(min_length=1, max_length=4)
    status: Literal["open", "resolved"]
    resolved_evidence_ids: list[UUID] = Field(default_factory=list, max_length=20)

    @model_validator(mode="after")
    def resolution_is_evidenced(self) -> "TrackingQuestion":
        if self.status == "open" and self.resolved_evidence_ids:
            raise ValueError(f"open question has resolution evidence: {self.question_id}")
        if self.status == "resolved" and not self.resolved_evidence_ids:
            raise ValueError(f"resolved question lacks evidence: {self.question_id}")
        return self


class TrackingIntervalPolicy(StrictModel):
    min_hours: int = Field(ge=1, le=24 * 30)
    max_hours: int = Field(ge=1, le=24 * 365)
    no_change_multiplier: float = Field(ge=1, le=10)
    max_no_change_checks: int = Field(ge=1, le=100)

    @model_validator(mode="after")
    def valid_range(self) -> "TrackingIntervalPolicy":
        if self.min_hours > self.max_hours:
            raise ValueError("tracking interval min exceeds max")
        return self


class TrackingStopCondition(StrictModel):
    all_questions_resolved: bool
    stop_after_no_change_checks: int | None = Field(default=None, ge=1, le=100)
    deadline_at: datetime | None = None


class TrackingSourceParameters(StrictModel):
    cve_id: str | None = Field(default=None, pattern=r"^CVE-\d{4}-\d{4,}$")
    vendor: Literal["cisco", "fortinet", "hikvision", "microsoft"] | None = None
    ted_procedure_id: str | None = Field(default=None, min_length=1, max_length=200, pattern=r"^[A-Za-z0-9][A-Za-z0-9._:/-]*$")


class TrackingPlanSnapshot(StrictModel):
    schema_version: Literal[1]
    plan_id: UUID
    story_id: int = Field(gt=0)
    version: int = Field(gt=0)
    status: Literal["active", "paused", "stopped"]
    why_track: str = Field(min_length=1, max_length=4_000)
    questions: list[TrackingQuestion] = Field(min_length=1, max_length=100)
    source_targets: list[Literal["nvd", "cisa_kev", "vendor_advisory", "official_procurement"]] = Field(min_length=1, max_length=20)
    source_parameters: TrackingSourceParameters = Field(default_factory=TrackingSourceParameters)
    interval_policy: TrackingIntervalPolicy
    stop_condition: TrackingStopCondition
    current_interval_hours: int = Field(ge=1, le=24 * 365)
    consecutive_no_change_checks: int = Field(ge=0, le=100)
    next_check_at: datetime | None
    last_checked_at: datetime | None

    @model_validator(mode="after")
    def internally_consistent(self) -> "TrackingPlanSnapshot":
        if len({question.question_id for question in self.questions}) != len(self.questions):
            raise ValueError("duplicate tracking question id")
        if not self.interval_policy.min_hours <= self.current_interval_hours <= self.interval_policy.max_hours:
            raise ValueError("current tracking interval is outside policy")
        if self.status == "active" and self.next_check_at is None:
            raise ValueError("active tracking plan requires next_check_at")
        if self.status == "stopped" and self.next_check_at is not None:
            raise ValueError("stopped tracking plan cannot have next_check_at")
        return self


class TrackingEvidenceRef(StrictModel):
    evidence_id: UUID
    source_type: str = Field(min_length=1, max_length=64)
    authority_level: Literal["authoritative", "primary", "secondary"]
    canonical_url: HttpUrl
    content_hash: str = Field(pattern=r"^[0-9a-f]{64}$")
    retrieved_at: datetime
    observations: list[Literal["vendor_confirmation", "patch", "procurement_award", "material_update"]] = Field(max_length=4)
    # Frozen evidence content (official title and the load-bearing excerpt) so independent reviewers
    # can verify impact claims without network access. Empty for pure routing refs.
    title: str = Field(default="", max_length=1_000)
    excerpt: str = Field(default="", max_length=5_000)


class TrackingChange(StrictModel):
    change_key: str = Field(min_length=1, max_length=160)
    change_type: Literal["vendor_confirmation", "patch", "procurement_award", "material_update"]
    summary: str = Field(min_length=1, max_length=4_000)
    before: dict[str, object]
    after: dict[str, object]
    evidence_ids: list[UUID] = Field(min_length=1, max_length=20)


class TrackingQuestionUpdate(StrictModel):
    question_id: str = Field(min_length=1, max_length=100)
    status: Literal["open", "resolved"]
    reason: str = Field(min_length=1, max_length=2_000)
    evidence_ids: list[UUID] = Field(max_length=20)

    @model_validator(mode="after")
    def resolution_is_evidenced(self) -> "TrackingQuestionUpdate":
        if self.status == "resolved" and not self.evidence_ids:
            raise ValueError(f"resolved question lacks evidence: {self.question_id}")
        return self


class TrackingProposal(StrictModel):
    new_evidence: list[ResearchEvidence] = Field(max_length=12)
    material_changes: list[TrackingChange] = Field(max_length=50)
    question_updates: list[TrackingQuestionUpdate] = Field(max_length=100)
    decision: Literal["continue", "stop", "insufficient_evidence"]
    suggested_interval_hours: int | None = Field(default=None, ge=1, le=24 * 365)
    decision_reason: str = Field(min_length=1, max_length=4_000)
    tool_trace: list[ResearchToolTrace] = Field(max_length=8)

    @model_validator(mode="after")
    def internally_consistent(self) -> "TrackingProposal":
        if len({change.change_key for change in self.material_changes}) != len(self.material_changes):
            raise ValueError("duplicate tracking change key")
        if len({update.question_id for update in self.question_updates}) != len(self.question_updates):
            raise ValueError("duplicate tracking question update")
        if self.decision == "stop" and self.suggested_interval_hours is not None:
            raise ValueError("stopped tracking proposal cannot suggest an interval")
        if self.decision != "stop" and self.suggested_interval_hours is None:
            raise ValueError("continuing tracking proposal requires an interval")
        return self


class TrackingTaskRequest(StrictModel):
    trace_id: UUID
    run_id: UUID
    tool_capability: SecretStr = Field(min_length=32)
    story: StoryResearchSnapshot
    plan: TrackingPlanSnapshot
    evidence: list[TrackingEvidenceRef] = Field(max_length=100)
    limits: ResearchLimits

    @model_validator(mode="after")
    def references_are_local(self) -> "TrackingTaskRequest":
        if self.story.story_id != self.plan.story_id:
            raise ValueError("tracking story and plan mismatch")
        return self


class TrackingTaskResponse(StrictModel):
    trace_id: UUID
    run_id: UUID
    proposal: TrackingProposal
