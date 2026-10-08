from uuid import uuid4

import pytest
from httpx import ASGITransport, AsyncClient

from app.main import app


@pytest.fixture
def anyio_backend() -> str:
    return "asyncio"


@pytest.mark.anyio
async def test_health() -> None:
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://testserver") as client:
        response = await client.get("/health")
    assert response.status_code == 200
    assert response.json() == {"ok": True, "service": "sentinelintel-agent-runtime", "version": "0.1.0"}


@pytest.mark.anyio
async def test_structured_task_preserves_trace_and_runs_graph() -> None:
    trace_id = str(uuid4())
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://testserver") as client:
        response = await client.post("/v1/tasks/test", json={"trace_id": trace_id, "input": "hello"})
    assert response.status_code == 200
    assert response.json() == {
        "trace_id": trace_id,
        "status": "ok",
        "result": {"echo": "hello", "model": "test-stub", "tools": ["echo"]},
    }


@pytest.mark.anyio
@pytest.mark.parametrize(
    ("behavior", "status", "code", "retryable"),
    [("transient_error", 503, "test_transient", True), ("permanent_error", 422, "test_permanent", False)],
)
async def test_structured_errors(behavior: str, status: int, code: str, retryable: bool) -> None:
    trace_id = str(uuid4())
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://testserver") as client:
        response = await client.post("/v1/tasks/test", json={"trace_id": trace_id, "input": "hello", "behavior": behavior})
    assert response.status_code == status
    assert response.json()["error"] == {
        "code": code,
        "message": f"deterministic {behavior.removesuffix('_error')} failure",
        "retryable": retryable,
        "trace_id": trace_id,
    }


@pytest.mark.anyio
async def test_validation_error_is_not_retryable() -> None:
    trace_id = str(uuid4())
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://testserver") as client:
        response = await client.post("/v1/tasks/test", json={"trace_id": trace_id, "input": ""})
    assert response.status_code == 422
    error = response.json()["error"]
    assert error["code"] == "invalid_request"
    assert error["retryable"] is False
    assert error["trace_id"] == trace_id


@pytest.mark.anyio
async def test_header_and_body_trace_ids_must_match() -> None:
    trace_id = str(uuid4())
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://testserver") as client:
        response = await client.post(
            "/v1/tasks/test",
            headers={"x-trace-id": str(uuid4())},
            json={"trace_id": trace_id, "input": "hello"},
        )
    assert response.status_code == 422
    assert response.json()["error"] == {
        "code": "trace_mismatch",
        "message": "header and body trace ids differ",
        "retryable": False,
        "trace_id": trace_id,
    }


def test_external_network_guard_is_active() -> None:
    import socket

    with pytest.raises(AssertionError, match="external network is forbidden"):
        socket.create_connection(("example.com", 80), timeout=0.01)
