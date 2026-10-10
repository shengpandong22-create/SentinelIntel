import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { closeDb, sql } from "@aihot/backend/db";
import { runTrackingPlan } from "@aihot/backend/agents/tracking";
import { createTrackingPlan } from "@aihot/backend/agents/tracking-store";
import { completeResearchRun, startResearchRun } from "@aihot/backend/agents/research-store";
import { DEFAULT_RESEARCH_LIMITS, ResearchProposalSchema } from "@aihot/backend/agents/research-contract";

let storyId: number | null = null;
let planId: string | null = null;
try {
  const [story] = await sql<{ id: number }[]>`
    INSERT INTO stories (public_id, title, first_report_at, latest_at)
    VALUES (${randomUUID()}, 'Phase 5 tracking contract check', now(), now()) RETURNING id`;
  storyId = story!.id;
  const snapshot = {
    schema_version: 1 as const, story_id: storyId, story_version: 1, title: "Phase 5 tracking contract check",
    digest: null, status: "active" as const, facts: [], missing_questions: ["Has a patch shipped?"],
    captured_at: new Date().toISOString(),
  };
  const research = await startResearchRun({
    storyId, traceId: randomUUID(), objective: "Store fixture patch evidence", graphVersion: "phase5-check-v1",
    snapshot, limits: DEFAULT_RESEARCH_LIMITS,
  });
  const evidenceId = randomUUID();
  await completeResearchRun({
    runId: research.id, storyId, provider: "fixture",
    proposal: ResearchProposalSchema.parse({
      claims: [], unknowns: [], conflicts: [], tool_trace: [], summary: "Fixture patch evidence", terminal_status: "completed",
      evidence: [{
        evidence_id: evidenceId, source_type: "vendor_advisory", source_name: "Fixture vendor",
        canonical_url: "https://vendor.example/security/patch", title: "Patch available", excerpt: "Version 2 is fixed.",
        normalized: { tracking_observations: ["patch"] }, content_hash: "c".repeat(64), authority_level: "authoritative",
        published_at: null, source_updated_at: null, retrieved_at: new Date().toISOString(), provenance: { fixture: true },
      }],
    }),
  });
  const plan = await createTrackingPlan({
    storyId, whyTrack: "Wait for an official patch",
    questions: [{ question_id: "patch", question: "Has a patch shipped?", resolve_on: ["patch"], status: "open", resolved_evidence_ids: [] }],
    sourceTargets: ["vendor_advisory"],
    intervalPolicy: { min_hours: 6, max_hours: 168, no_change_multiplier: 2, max_no_change_checks: 3 },
    stopCondition: { all_questions_resolved: true, stop_after_no_change_checks: null, deadline_at: null },
    initialIntervalHours: 12, nextCheckAt: new Date(),
  });
  planId = plan.plan_id;
  const result = await runTrackingPlan(plan.plan_id, plan.version);
  assert.equal(result.status, "stopped");
  assert.equal(result.proposal.material_changes[0]?.change_type, "patch");
  const [unchanged] = await sql<{ version: number; digest: string | null }[]>`SELECT version, digest FROM stories WHERE id = ${storyId}`;
  assert.deepEqual(unchanged, { version: 1, digest: null });
  console.log(JSON.stringify({ ok: true, plan: plan.plan_id, version: result.version, status: result.status, changes: result.proposal.material_changes.length }));
} finally {
  if (planId) await sql`DELETE FROM tracking_plans WHERE public_id = ${planId}`;
  if (storyId) {
    await sql`DELETE FROM external_evidence WHERE story_id = ${storyId}`;
    await sql`DELETE FROM agent_research_runs WHERE story_id = ${storyId}`;
    await sql`DELETE FROM stories WHERE id = ${storyId}`;
  }
  await closeDb();
}
