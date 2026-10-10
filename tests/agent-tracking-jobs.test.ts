import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import { scheduleDueTrackingPlans } from "@aihot/backend/jobs/tracking";

const plan = (version: number) => ({
  schema_version: 1 as const, plan_id: randomUUID(), story_id: version, version, status: "active" as const,
  why_track: "Track", questions: [{ question_id: "q", question: "Changed?", resolve_on: ["material_update" as const], status: "open" as const, resolved_evidence_ids: [] }],
  source_targets: ["vendor_advisory" as const],
  interval_policy: { min_hours: 1, max_hours: 24, no_change_multiplier: 2, max_no_change_checks: 3 },
  stop_condition: { all_questions_resolved: true, stop_after_no_change_checks: null, deadline_at: null },
  current_interval_hours: 1, consecutive_no_change_checks: 0, next_check_at: new Date().toISOString(), last_checked_at: null,
});

test("tracking schedule is inert while its switch is off", async () => {
  let listed = false;
  const result = await scheduleDueTrackingPlans(new Date(), 50, {
    enabled: false,
    listDue: async () => { listed = true; return []; },
  });
  assert.deepEqual(result, { due: 0, enqueued: 0 });
  assert.equal(listed, false);
});

test("tracking schedule uses plan id plus version as the singleton identity", async () => {
  const due = [plan(2), plan(4)];
  const sent: Array<{ name: string; data: object; key: string | undefined }> = [];
  const result = await scheduleDueTrackingPlans(new Date(), 50, {
    enabled: true,
    listDue: async () => due,
    send: async (name, data, options) => {
      sent.push({ name, data, key: options?.singletonKey });
      return sent.length === 1 ? randomUUID() : null;
    },
  });
  assert.deepEqual(result, { due: 2, enqueued: 1 });
  assert.deepEqual(sent.map((item) => item.name), ["agent.tracking", "agent.tracking"]);
  assert.deepEqual(sent.map((item) => item.key), due.map((item) => `${item.plan_id}:${item.version}`));
  assert.deepEqual(sent.map((item) => item.data), due.map((item) => ({ planPublicId: item.plan_id, expectedVersion: item.version })));
});
