import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, before, test } from "node:test";
import { closeDb, sql } from "@aihot/backend/db";
import { createTrackingPlan, applyTrackingProposal, listDueTrackingPlans } from "@aihot/backend/agents/tracking-store";
import { completeResearchRun, startResearchRun } from "@aihot/backend/agents/research-store";
import { DEFAULT_RESEARCH_LIMITS, ResearchProposalSchema } from "@aihot/backend/agents/research-contract";
import { tag } from "./setup.ts";

const T = tag();
let storyId: number;
let noChangeStoryId: number;
const planIds: string[] = [];

function storySnapshot(id: number, version = 1) {
  return {
    schema_version: 1 as const, story_id: id, story_version: version, title: `Tracking story ${T}`,
    digest: null, status: "active" as const, facts: [], missing_questions: [], captured_at: new Date().toISOString(),
  };
}

const intervalPolicy = { min_hours: 6, max_hours: 168, no_change_multiplier: 2, max_no_change_checks: 3 };

before(async () => {
  const rows = await sql<{ id: number }[]>`
    INSERT INTO stories (public_id, title, first_report_at, latest_at) VALUES
      (${randomUUID()}, ${`Tracking story ${T}`}, now(), now()),
      (${randomUUID()}, ${`No-change story ${T}`}, now(), now())
    RETURNING id`;
  storyId = rows[0]!.id;
  noChangeStoryId = rows[1]!.id;
});

after(async () => {
  await sql`DELETE FROM tracking_plans WHERE story_id = ANY(${[storyId, noChangeStoryId]})`;
  await sql`DELETE FROM external_evidence WHERE story_id = ${storyId}`;
  await sql`DELETE FROM agent_research_runs WHERE story_id = ${storyId}`;
  await sql`DELETE FROM stories WHERE id = ANY(${[storyId, noChangeStoryId]})`;
  await closeDb();
});

async function storedEvidence() {
  const run = await startResearchRun({
    storyId, traceId: randomUUID(), objective: "Create tracking evidence", graphVersion: "tracking-test",
    snapshot: storySnapshot(storyId), limits: DEFAULT_RESEARCH_LIMITS,
  });
  const evidenceId = randomUUID();
  const proposal = ResearchProposalSchema.parse({
    claims: [], unknowns: [], conflicts: [], tool_trace: [], summary: "Stored evidence", terminal_status: "completed",
    evidence: [{
      evidence_id: evidenceId, source_type: "vendor_advisory", source_name: "Vendor", canonical_url: "https://vendor.example/patch",
      title: "Patch available", excerpt: "Version 2 fixes the issue.", normalized: {}, content_hash: "b".repeat(64),
      authority_level: "authoritative", published_at: null, source_updated_at: null,
      retrieved_at: new Date().toISOString(), provenance: { fixture: true },
    }],
  });
  await completeResearchRun({ runId: run.id, storyId, proposal, provider: "fixture" });
  return evidenceId;
}

test("atomically appends evidence-backed changes, advances once, and leaves Story untouched", async () => {
  const evidenceId = await storedEvidence();
  const plan = await createTrackingPlan({
    storyId, whyTrack: "Wait for a patch",
    questions: [{ question_id: "patch", question: "Has a patch shipped?", resolve_on: ["patch"], status: "open", resolved_evidence_ids: [] }],
    sourceTargets: ["vendor_advisory"], intervalPolicy,
    stopCondition: { all_questions_resolved: true, stop_after_no_change_checks: null, deadline_at: null },
    initialIntervalHours: 12, nextCheckAt: new Date(Date.now() - 1_000),
  });
  planIds.push(plan.plan_id);
  const task = {
    trace_id: randomUUID(), run_id: randomUUID(), tool_capability: "x".repeat(32), story: storySnapshot(storyId), plan,
    evidence: [{ evidence_id: evidenceId, source_type: "vendor_advisory", authority_level: "authoritative" as const,
      canonical_url: "https://vendor.example/patch", content_hash: "b".repeat(64), retrieved_at: new Date().toISOString(), observations: ["patch" as const] }],
  };
  const proposal = {
    material_changes: [{ change_key: "patch-v2", change_type: "patch" as const, summary: "Vendor released version 2.",
      before: { patch: "unknown" }, after: { patch: "v2" }, evidence_ids: [evidenceId] }],
    question_updates: [{ question_id: "patch", status: "resolved" as const, reason: "Official advisory", evidence_ids: [evidenceId] }],
    decision: "stop" as const, suggested_interval_hours: null, decision_reason: "All questions resolved", tool_trace: [],
  };
  const first = await applyTrackingProposal({ task, proposal });
  const retry = await applyTrackingProposal({ task, proposal });
  assert.deepEqual(first, { version: 2, status: "stopped", idempotent: false });
  assert.deepEqual(retry, { version: 2, status: "stopped", idempotent: true });

  const [stored] = await sql<{ status: string; version: number; changes: number; next_check_at: Date | null }[]>`
    SELECT p.status, p.version, p.next_check_at, count(c.id)::int AS changes
    FROM tracking_plans p LEFT JOIN tracking_changes c ON c.plan_id = p.id
    WHERE p.public_id = ${plan.plan_id} GROUP BY p.id`;
  const [story] = await sql<{ version: number; digest: string | null }[]>`SELECT version, digest FROM stories WHERE id = ${storyId}`;
  assert.deepEqual(stored, { status: "stopped", version: 2, changes: 1, next_check_at: null });
  assert.deepEqual(story, { version: 1, digest: null });
  await assert.rejects(
    applyTrackingProposal({ task: { ...task, run_id: randomUUID() }, proposal }),
    /not active|stale/,
  );
});

test("no-change checks extend the interval and stop only at the declared threshold", async () => {
  let plan = await createTrackingPlan({
    storyId: noChangeStoryId, whyTrack: "Wait for award",
    questions: [{ question_id: "award", question: "Was an award published?", resolve_on: ["procurement_award"], status: "open", resolved_evidence_ids: [] }],
    sourceTargets: ["official_procurement"], intervalPolicy,
    stopCondition: { all_questions_resolved: false, stop_after_no_change_checks: 2, deadline_at: null },
    initialIntervalHours: 12, nextCheckAt: new Date(Date.now() - 1_000),
  });
  planIds.push(plan.plan_id);
  const proposal = {
    material_changes: [], question_updates: [{ question_id: "award", status: "open" as const, reason: "No authoritative update", evidence_ids: [] }],
    decision: "continue" as const, suggested_interval_hours: 24, decision_reason: "No material change", tool_trace: [],
  };
  const base = { trace_id: randomUUID(), tool_capability: "x".repeat(32), story: storySnapshot(noChangeStoryId), evidence: [] };
  await applyTrackingProposal({ task: { ...base, run_id: randomUUID(), plan }, proposal });
  const [row] = await sql<{ version: number; next_check_at: Date; last_checked_at: Date; consecutive_no_change_checks: number }[]>`
    SELECT version, next_check_at, last_checked_at, consecutive_no_change_checks
    FROM tracking_plans WHERE public_id = ${plan.plan_id}`;
  assert.equal(row!.consecutive_no_change_checks, 1);
  assert.equal((row!.next_check_at.getTime() - row!.last_checked_at.getTime()) / 3_600_000, 24);

  plan = { ...plan, version: row!.version, current_interval_hours: 24, consecutive_no_change_checks: 1,
    next_check_at: row!.next_check_at.toISOString(), last_checked_at: row!.last_checked_at.toISOString() };
  await applyTrackingProposal({
    task: { ...base, run_id: randomUUID(), plan },
    proposal: { ...proposal, decision: "stop", suggested_interval_hours: null, decision_reason: "No-change stop threshold reached" },
  });
  const [stopped] = await sql<{ status: string; consecutive_no_change_checks: number }[]>`
    SELECT status, consecutive_no_change_checks FROM tracking_plans WHERE public_id = ${plan.plan_id}`;
  assert.deepEqual(stopped, { status: "stopped", consecutive_no_change_checks: 2 });
});

test("due-plan selection is bounded, stable, and excludes stopped plans", async () => {
  const due = await listDueTrackingPlans(new Date(Date.now() + 24 * 3_600_000), 10);
  assert.equal(due.some((plan) => planIds.includes(plan.plan_id)), false);
  await assert.rejects(listDueTrackingPlans(new Date(), 0), /invalid tracking due-plan limit/);
});
