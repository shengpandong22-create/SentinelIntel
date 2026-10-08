from uuid import UUID

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse

from app.agents.test_graph import AgentTaskError, run_test_graph
from app.config import settings
from app.observability import trace_event
from app.schemas import ErrorBody, ErrorEnvelope, TestTaskRequest, TestTaskResponse

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


@app.post("/v1/tasks/test", response_model=TestTaskResponse)
async def test_task(task: TestTaskRequest, request: Request) -> TestTaskResponse:
    header_trace = request.headers.get("x-trace-id")
    if header_trace is not None and header_trace != str(task.trace_id):
        raise AgentTaskError("trace_mismatch", "header and body trace ids differ", False, task.trace_id)
    trace_event("task_started", task.trace_id, task="test")
    result = await run_test_graph(task.trace_id, task.input, task.behavior, task.delay_ms)
    trace_event("task_completed", task.trace_id, task="test")
    return TestTaskResponse(trace_id=task.trace_id, result=result)
