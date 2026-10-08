# Phase 3 — Python Agent Foundation implementation contract

Status: `COMPLETE`

## Scope

Phase 3 adds only the runtime foundation needed by later agents. It does not implement security
research, tracking, product-impact logic, external tools, persistence, scheduling, or paid model calls.

The runtime is an internal FastAPI service. A single deterministic LangGraph test graph proves the
model-adapter and tool interfaces without external network access. The TypeScript backend owns bounded
HTTP timeout and retry behavior; LangGraph does not become a scheduler or retry engine.

## HTTP contract

- `GET /health` returns `200` with `ok`, `service`, and `version`.
- `POST /v1/tasks/test` accepts a caller-supplied UUID `trace_id`, an `input` string, and optional
  deterministic test behavior.
- A successful call returns the same `trace_id`, `status: "ok"`, and a structured result.
- Errors use `{ "error": { "code", "message", "retryable", "trace_id" } }`.
- Validation errors are non-retryable. Explicit transient test failures are retryable; permanent test
  failures are not.

## Implementation boundaries

- Python 3.12+, FastAPI, Pydantic v2, LangGraph, httpx, pytest.
- No database migration in Phase 3.
- No real model provider or external research tool.
- No inbound public route through the web application.
- No arbitrary URL, SQL, shell, or filesystem tool.
- No change to the existing deterministic worker, scheduling, receipt, or budget systems.

## Acceptance checklist

1. Python unit/API tests prove health, structured success, graph execution, input validation, structured
   retryable/non-retryable errors, trace preservation, and that tests fail any external socket attempt.
2. TypeScript tests prove request/response schema validation, generated and caller-provided trace IDs,
   timeout propagation, bounded retry of retryable failures, and no retry for permanent failures.
3. With the real Python service running, `scripts/check-agent-runtime.ts` sends one TypeScript test task,
   receives a structured result, and verifies end-to-end `trace_id` correlation.
4. Docker Compose contains a healthy `agent` service and existing services receive its internal URL.
5. `docker compose config --quiet`, Python tests, the cross-runtime check, TypeScript typecheck, targeted
   TypeScript tests, and the existing Docker CI path pass without credentials or external service calls.
6. `docs/IMPLEMENTATION_STATUS.md` records commands, results, limitations, and any deviation before the
   phase is called complete.

Phase 4 may replace the deterministic adapters with real research capabilities, but it must preserve
this transport, error, trace, and test boundary unless a separately reviewed change says otherwise.

## Acceptance result

All six acceptance items passed. Local Windows evidence includes Python 7/7, TypeScript client 7/7,
typecheck, native and Compose-network contract checks, Agent image health/dependency checks, production
web build, and web tests 16/16. Canonical Linux GitHub Actions run `37755597908` passed both jobs:
`check` in 1m33s and `docker` in 1m00s. Phase 3 is complete; Phase 4 has not started.
