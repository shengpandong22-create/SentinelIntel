import hmac
from uuid import UUID

from fastapi import FastAPI, Header, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse

from app.agents.test_graph import AgentTaskError, run_test_graph
from app.agents.research_graph import run_research_graph
from app.config import settings
from app.observability import trace_event
from app.schemas import ErrorBody, ErrorEnvelope, ResearchTaskRequest, ResearchTaskResponse, TestTaskRequest, TestTaskResponse

app = FastAPI(title="SentinelIntel Agent Runtime", version=settings.version)


def error_response(status: int, body: ErrorBody) -> JSONResponse:
    return JSONResponse(status_code=status, content=ErrorEnvelope(error=body).model_dump(mode="json"))


@app.exception_handler(AgentTaskError)
async def handle_agent_error(request: Request, error: AgentTaskError) -> JSONResponse:
    del request
    trace_event("task_failed", error.trace_id, code=error.code, retryable=error.retryable)
    return error_response(
        503 if error.retryable else 422,
        ErrorBody(code=error.code, message=str(error), retryable=error.retryable, trace_id=error.trace_id),
    )


@app.exception_handler(RequestValidationError)
async def handle_validation_error(request: Request, error: RequestValidationError) -> JSONResponse:
    trace_id: UUID | None = None
    try:
        raw = await request.json()
        if isinstance(raw, dict) and isinstance(raw.get("trace_id"), str):
            trace_id = UUID(raw["trace_id"])
    except (ValueError, TypeError):
        pass
    return error_response(
        422,
        ErrorBody(code="invalid_request", message=str(error), retryable=False, trace_id=trace_id),
    )


@app.get("/health")
async def health() -> dict[str, str | bool]:
    return {"ok": True, "service": settings.service_name, "version": settings.version}


def authorize_research(authorization: str | None, trace_id: UUID) -> None:
    configured = settings.internal_token.get_secret_value() if settings.internal_token is not None else ""
    supplied = authorization.removeprefix("Bearer ") if authorization and authorization.startswith("Bearer ") else ""
    if not configured or not supplied or not hmac.compare_digest(configured, supplied):
        raise AgentTaskError("unauthorized", "research endpoint authentication failed", False, trace_id)
    if not settings.research_enabled:
        raise AgentTaskError("research_disabled", "security research is disabled", False, trace_id)


@app.post("/v1/tasks/test", response_model=TestTaskResponse)
async def test_task(task: TestTaskRequest, request: Request) -> TestTaskResponse:
    header_trace = request.headers.get("x-trace-id")
    if header_trace is not None and header_trace != str(task.trace_id):
        raise AgentTaskError("trace_mismatch", "header and body trace ids differ", False, task.trace_id)
    trace_event("task_started", task.trace_id, task="test")
    result = await run_test_graph(task.trace_id, task.input, task.behavior, task.delay_ms)
    trace_event("task_completed", task.trace_id, task="test")
    return TestTaskResponse(trace_id=task.trace_id, result=result)


@app.post("/v1/research/story/{story_id}", response_model=ResearchTaskResponse)
async def research_story(
    story_id: int,
    task: ResearchTaskRequest,
    request: Request,
    authorization: str | None = Header(default=None),
) -> ResearchTaskResponse:
    authorize_research(authorization, task.trace_id)
    header_trace = request.headers.get("x-trace-id")
    if header_trace is not None and header_trace != str(task.trace_id):
        raise AgentTaskError("trace_mismatch", "header and body trace ids differ", False, task.trace_id)
    if story_id != task.snapshot.story_id:
        raise AgentTaskError("story_mismatch", "path and snapshot story ids differ", False, task.trace_id)
    trace_event("task_started", task.trace_id, task="security_research", run_id=str(task.run_id))
    proposal = await run_research_graph(task)
    trace_event("task_completed", task.trace_id, task="security_research", run_id=str(task.run_id))
    return ResearchTaskResponse(trace_id=task.trace_id, run_id=task.run_id, proposal=proposal)
