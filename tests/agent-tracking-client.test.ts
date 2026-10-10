import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import { AgentRuntimeError, runAgentTrackingTask } from "@aihot/backend/agents/client";
import { TrackingTaskSchema } from "@aihot/backend/agents/tracking-contract";

function task() {
  return TrackingTaskSchema.parse({
    trace_id: randomUUID(), run_id: randomUUID(), tool_capability: "x".repeat(32),
    story: { schema_version: 1, story_id: 7, story_version: 1, title: "Tracked", digest: null,
      status: "active", facts: [], missing_questions: [], captured_at: new Date().toISOString() },
    plan: { schema_version: 1, plan_id: randomUUID(), story_id: 7, version: 1, status: "active", why_track: "Wait",
      questions: [{ question_id: "patch", question: "Patch?", resolve_on: ["patch"], status: "open", resolved_evidence_ids: [] }],
      source_targets: ["vendor_advisory"],
      interval_policy: { min_hours: 6, max_hours: 168, no_change_multiplier: 2, max_no_change_checks: 3 },
      stop_condition: { all_questions_resolved: true, stop_after_no_change_checks: null, deadline_at: null },
      current_interval_hours: 12, consecutive_no_change_checks: 0, next_check_at: new Date().toISOString(), last_checked_at: null },
    evidence: [],
  });
}

test("tracking client fails closed behind its independent switch", async () => {
  await assert.rejects(runAgentTrackingTask(task(), { trackingEnabled: false }), (error: unknown) => {
    assert(error instanceof AgentRuntimeError);
    assert.equal(error.code, "tracking_disabled");
    return true;
  });
});

test("tracking client correlates ids and validates the proposal", async () => {
  const input = task();
  const result = await runAgentTrackingTask(input, {
    trackingEnabled: true, internalToken: "test-token", retries: 0,
    fetch: async (url, init) => {
      assert.equal(String(url), "http://127.0.0.1:8000/v1/tracking/story/7");
      assert.equal((init?.headers as Record<string, string>).authorization, "Bearer test-token");
      return new Response(JSON.stringify({
        trace_id: input.trace_id, run_id: input.run_id,
        proposal: { material_changes: [],
          question_updates: [{ question_id: "patch", status: "open", reason: "No evidence", evidence_ids: [] }],
          decision: "continue", suggested_interval_hours: 24, decision_reason: "Continue", tool_trace: [] },
      }), { status: 200, headers: { "content-type": "application/json" } });
    },
  });
  assert.equal(result.proposal.suggested_interval_hours, 24);
});

test("tracking client rejects runtime responses with mismatched ids", async () => {
  const input = task();
  await assert.rejects(runAgentTrackingTask(input, {
    trackingEnabled: true, internalToken: "test-token", retries: 0,
    fetch: async () => new Response(JSON.stringify({
      trace_id: randomUUID(), run_id: input.run_id,
      proposal: { material_changes: [], question_updates: [], decision: "continue", suggested_interval_hours: 24,
        decision_reason: "Continue", tool_trace: [] },
    }), { status: 200, headers: { "content-type": "application/json" } }),
  }), /Invalid tracking runtime response/);
});
