import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { AgentRuntimeError, runAgentImpactTask } from "@aihot/backend/agents/client";
import { ImpactTaskSchema } from "@aihot/backend/agents/impact-contract";

const fixture = JSON.parse(readFileSync(new URL("./fixtures/impact/task.json", import.meta.url), "utf8"));

test("impact client fails closed behind its independent switch", async () => {
  const task = ImpactTaskSchema.parse(fixture.task);
  await assert.rejects(runAgentImpactTask(task, { productImpactEnabled: false }), (error: unknown) => {
    assert(error instanceof AgentRuntimeError);
    assert.equal(error.code, "impact_disabled");
    return true;
  });
});

test("impact client correlates ids and validates the proposal", async () => {
  const task = ImpactTaskSchema.parse(fixture.task);
  const result = await runAgentImpactTask(task, {
    productImpactEnabled: true, internalToken: "test-token", retries: 0,
    fetch: async (url, init) => {
      assert.equal(String(url), "http://127.0.0.1:8000/v1/impact/story/9001");
      assert.equal((init?.headers as Record<string, string>).authorization, "Bearer test-token");
      return new Response(JSON.stringify({ trace_id: task.trace_id, run_id: task.run_id, proposal: fixture.proposal }),
        { status: 200, headers: { "content-type": "application/json" } });
    },
  });
  assert.equal(result.proposal.impact_rows[0]?.product, "Acme CamFirm Platform");
});

test("impact client rejects mismatched response identity", async () => {
  const task = ImpactTaskSchema.parse(fixture.task);
  await assert.rejects(runAgentImpactTask(task, {
    productImpactEnabled: true, internalToken: "test-token", retries: 0,
    fetch: async () => new Response(JSON.stringify({ ...fixture, trace_id: crypto.randomUUID(), run_id: task.run_id, proposal: fixture.proposal }),
      { status: 200, headers: { "content-type": "application/json" } }),
  }), /Invalid impact runtime response/);
});
