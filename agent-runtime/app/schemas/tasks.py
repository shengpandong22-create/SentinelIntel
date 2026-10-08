from typing import Literal
from uuid import UUID

from pydantic import BaseModel, Field


TestBehavior = Literal["success", "transient_error", "permanent_error", "delay"]


class TestTaskRequest(BaseModel):
    trace_id: UUID
    input: str = Field(min_length=1, max_length=2_000)
    behavior: TestBehavior = "success"
    delay_ms: int = Field(default=0, ge=0, le=5_000)


class TestTaskResult(BaseModel):
    echo: str
    model: str
    tools: list[str]


class TestTaskResponse(BaseModel):
    trace_id: UUID
    status: Literal["ok"] = "ok"
    result: TestTaskResult


class ErrorBody(BaseModel):
    code: str
    message: str
    retryable: bool
    trace_id: UUID | None


class ErrorEnvelope(BaseModel):
    error: ErrorBody
