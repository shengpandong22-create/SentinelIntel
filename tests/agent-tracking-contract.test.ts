import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import { TrackingTaskSchema, validateTrackingProposal } from "@aihot/backend/agents/tracking-contract";
import { trackingObservationsForEvidence } from "@aihot/backend/agents/tracking-store";

function fixture() {
  const evidenceId = randomUUID();
  const task = TrackingTaskSchema.parse({
    trace_id: randomUUID(),
    run_id: randomUUID(),
    tool_capability: "x".repeat(32),
    story: {
      schema_version: 1, story_id: 7, story_version: 3, title: "Tracked vulnerability",
      digest: null, status: "active", facts: [], missing_questions: [], captured_at: new Date().toISOString(),
    },
    plan: {
      schema_version: 1, plan_id: randomUUID(), story_id: 7, version: 1, status: "active",
      why_track: "Wait for a vendor patch",
      questions: [{ question_id: "patch", question: "Has a patch shipped?", resolve_on: ["patch"], status: "open", resolved_evidence_ids: [] }],
      source_targets: ["vendor_advisory"],
      interval_policy: { min_hours: 6, max_hours: 168, no_change_multiplier: 2, max_no_change_checks: 3 },
      stop_condition: { all_questions_resolved: true, stop_after_no_change_checks: null, deadline_at: null },
      current_interval_hours: 12, consecutive_no_change_checks: 0,
      next_check_at: new Date().toISOString(), last_checked_at: null,
    },
    evidence: [{
      evidence_id: evidenceId, source_type: "vendor_advisory", authority_level: "authoritative",
      canonical_url: "https://vendor.example/advisory", content_hash: "a".repeat(64), retrieved_at: new Date().toISOString(), observations: ["patch"],
    }],
  });
  return { task, evidenceId };
}

test("accepts an evidence-backed material change and bounded continuation", () => {
  const { task, evidenceId } = fixture();
  const proposal = validateTrackingProposal(task, {
    material_changes: [{
      change_key: "patch-v1", change_type: "patch", summary: "Vendor released a patch.",
      before: { patch: "unknown" }, after: { patch: "available" }, evidence_ids: [evidenceId],
    }],
    question_updates: [{ question_id: "patch", status: "resolved", reason: "Official advisory", evidence_ids: [evidenceId] }],
    decision: "stop", suggested_interval_hours: null, decision_reason: "All questions resolved", tool_trace: [],
  });
  assert.equal(proposal.material_changes[0]!.change_type, "patch");
});

test("rejects dangling evidence, invented questions, arbitrary intervals, and invalid stop shape", () => {
  const { task } = fixture();
  const base = {
    material_changes: [], question_updates: [], decision: "continue" as const,
    suggested_interval_hours: 12, decision_reason: "Continue", tool_trace: [],
  };
  assert.throws(() => validateTrackingProposal(task, {
    ...base,
    material_changes: [{ change_key: "x", change_type: "patch", summary: "x", before: {}, after: {}, evidence_ids: [randomUUID()] }],
  }), /dangling tracking evidence/);
  assert.throws(() => validateTrackingProposal(task, {
    ...base,
    question_updates: [{ question_id: "invented", status: "open", reason: "x", evidence_ids: [] }],
  }), /unknown tracking question/);
  assert.throws(() => validateTrackingProposal(task, { ...base, suggested_interval_hours: 1 }), /outside policy/);
  assert.throws(() => validateTrackingProposal(task, { ...base, decision: "stop", suggested_interval_hours: 12 }), /cannot suggest an interval/);
});

test("rejects resolved questions without evidence and inconsistent plan scheduling", () => {
  const { task } = fixture();
  assert.throws(() => TrackingTaskSchema.parse({
    ...task,
    plan: { ...task.plan, questions: [{ ...task.plan.questions[0], status: "resolved", resolved_evidence_ids: [] }] },
  }), /resolved question lacks evidence/);
  assert.throws(() => TrackingTaskSchema.parse({
    ...task,
    plan: { ...task.plan, status: "active", next_check_at: null },
  }), /requires next_check_at/);
});

test("only source-appropriate primary evidence becomes a tracking observation", () => {
  const normalized = { tracking_observations: ["vendor_confirmation", "patch", "procurement_award", "material_update"] };
  assert.deepEqual(trackingObservationsForEvidence("vendor_advisory", "authoritative", normalized), ["vendor_confirmation", "patch", "material_update"]);
  assert.deepEqual(trackingObservationsForEvidence("official_procurement", "primary", normalized), ["procurement_award", "material_update"]);
  assert.deepEqual(trackingObservationsForEvidence("nvd", "authoritative", normalized), ["material_update"]);
  assert.deepEqual(trackingObservationsForEvidence("vendor_advisory", "secondary", normalized), []);
});
