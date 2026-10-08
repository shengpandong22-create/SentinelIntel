import assert from "node:assert/strict";
import test from "node:test";
import { AgentRuntimeError, runAgentTestTask } from "@aihot/backend/agents/client";

const TRACE = "123e4567-e89b-42d3-a456-426614174000";

test("sends a structured test task and preserves a caller trace id", async () => {
  let requestBody: Record<string, unknown> = {};
  const result = await runAgentTestTask("hello", { traceId: TRACE }, {
    fetch: async (_url, init) => {
      requestBody = JSON.parse(String(init?.body));
      return Response.json({ trace_id: TRACE, status: "ok", result: { echo: "hello", model: "test-stub", tools: ["echo"] } });
    },
  });
  assert.equal(requestBody?.trace_id, TRACE);
  assert.equal(result.trace_id, TRACE);
  assert.equal(result.result.echo, "hello");
});

test("generates a trace id when the caller omits one", async () => {
  let generated = "";
  const result = await runAgentTestTask("hello", {}, {
    fetch: async (_url, init) => {
      generated = JSON.parse(String(init?.body)).trace_id;
      return Response.json({ trace_id: generated, status: "ok", result: { echo: "hello", model: "test-stub", tools: [] } });
    },
  });
  assert.match(generated, /^[0-9a-f-]{36}$/);
  assert.equal(result.trace_id, generated);
});

test("retries one retryable failure and then succeeds", async () => {
  let calls = 0;
  const result = await runAgentTestTask("hello", { traceId: TRACE }, {
    retries: 1,
    fetch: async () => {
      calls += 1;
      if (calls === 1) return Response.json({ error: { code: "busy", message: "busy", retryable: true, trace_id: TRACE } }, { status: 503 });
      return Response.json({ trace_id: TRACE, status: "ok", result: { echo: "hello", model: "test-stub", tools: [] } });
    },
  });
  assert.equal(calls, 2);
  assert.equal(result.status, "ok");
});

test("does not retry a permanent failure", async () => {
  let calls = 0;
  await assert.rejects(
    runAgentTestTask("hello", { traceId: TRACE }, {
      retries: 2,
      fetch: async () => {
        calls += 1;
        return Response.json({ error: { code: "bad_task", message: "bad task", retryable: false, trace_id: TRACE } }, { status: 422 });
      },
    }),
    (error: unknown) => error instanceof AgentRuntimeError && error.code === "bad_task" && !error.retryable,
  );
  assert.equal(calls, 1);
});

test("propagates timeout with the task trace id", async () => {
  await assert.rejects(
    runAgentTestTask("hello", { traceId: TRACE }, {
      timeoutMs: 5,
      retries: 0,
      fetch: async (_url, init) => {
        await new Promise((_resolve, reject) => init?.signal?.addEventListener("abort", () => reject(init.signal?.reason), { once: true }));
        throw new Error("unreachable");
      },
    }),
    (error: unknown) => error instanceof AgentRuntimeError && error.code === "timeout" && error.traceId === TRACE,
  );
});

test("rejects a mismatched response trace id", async () => {
  await assert.rejects(
    runAgentTestTask("hello", { traceId: TRACE }, {
      fetch: async () => Response.json({ trace_id: "123e4567-e89b-42d3-a456-426614174001", status: "ok", result: { echo: "hello", model: "test-stub", tools: [] } }),
    }),
    (error: unknown) => error instanceof AgentRuntimeError && error.code === "invalid_response",
  );
});

test("rejects a mismatched error trace id", async () => {
  await assert.rejects(
    runAgentTestTask("hello", { traceId: TRACE }, {
      fetch: async () => Response.json({ error: { code: "busy", message: "busy", retryable: true, trace_id: "123e4567-e89b-42d3-a456-426614174001" } }, { status: 503 }),
    }),
    (error: unknown) => error instanceof AgentRuntimeError && error.code === "invalid_response" && !error.retryable,
  );
});
