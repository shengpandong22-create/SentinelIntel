// Phase 7 admin views with data: with a dev admin session (DEV_AUTH_ROLE set before the config
// module loads — hence the dynamic imports), the five read-only endpoints return the agent tables'
// state, resolve evidence references, and never expose prompt or capability internals.
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, before, test } from "node:test";
import "./setup.ts";

// Must precede any import that transitively loads the config module.
process.env.DEV_AUTH_ROLE = "admin";

const { buildApp } = await import("../apps/api/src/app.ts");
const { closeDb, sql } = await import("@aihot/backend/db");
const { completeResearchRun, failResearchRun, startResearchRun } = await import("@aihot/backend/agents/research-store");
const { applyImpactProposal } = await import("@aihot/backend/agents/impact-store");
const { createTrackingPlan } = await import("@aihot/backend/agents/tracking-store");
const { ImpactTaskSchema } = await import("@aihot/backend/agents/impact-contract");
const { DEFAULT_RESEARCH_LIMITS, ResearchProposalSchema } = await import("@aihot/backend/agents/research-contract");

const T = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;
const app = await buildApp();

let storyId: number;
let failedStoryId: number;
const evidenceId = randomUUID();

function snapshot(id: number) {
  return {
    schema_version: 1 as const, story_id: id, story_version: 1, title: `Admin view story ${T}`,
    digest: null, status: "active" as const, facts: [], missing_questions: [], captured_at: new Date().toISOString(),
  };
}

async function insertStory(title: string): Promise<number> {
  const rows = await sql<{ id: number }[]>`
    INSERT INTO stories (public_id, title, first_report_at, latest_at)
    VALUES (${randomUUID()}, ${title}, now(), now()) RETURNING id`;
  return rows[0]!.id;
}

before(async () => {
  storyId = await insertStory(`Admin view story ${T}`);
  failedStoryId = await insertStory(`Admin failed story ${T}`);

  // A completed research run with one evidence row (referenced later by the impact review view).
  const run = await startResearchRun({
    storyId, traceId: randomUUID(), objective: "Admin view fixture", graphVersion: "phase6-impact-v1",
    snapshot: snapshot(storyId), limits: DEFAULT_RESEARCH_LIMITS,
  });
  await completeResearchRun({
    runId: run.id, storyId, provider: "fixture", model: "fixture-model", promptVersion: "fixture-v1",
    proposal: ResearchProposalSchema.parse({
      claims: [], unknowns: [], conflicts: [], tool_trace: [], summary: "Fixture summary.", terminal_status: "completed",
      evidence: [{
        evidence_id: evidenceId, source_type: "vendor_advisory", source_name: "Vendor", canonical_url: "https://vendor.example/admin-view",
        title: "Admin view advisory", excerpt: "Affected versions in prose.", normalized: {},
        content_hash: "7".repeat(64), authority_level: "authoritative", published_at: null,
        source_updated_at: null, retrieved_at: new Date().toISOString(), provenance: {},
      }],
    }),
  });
  await failResearchRun(
    (await startResearchRun({
      storyId: failedStoryId, traceId: randomUUID(), objective: "Doomed", graphVersion: "phase5-tracking-v1",
      snapshot: snapshot(failedStoryId), limits: DEFAULT_RESEARCH_LIMITS,
    })).id,
    "provider_timeout",
    "the provider did not answer in time",
  );

  await createTrackingPlan({
    storyId,
    whyTrack: "Watching for the vendor patch.",
    questions: [
      { question_id: "q1", question: "Is a fix available?", resolve_on: ["patch"], status: "open", resolved_evidence_ids: [] },
      { question_id: "q2", question: "Did the vendor confirm?", resolve_on: ["vendor_confirmation"], status: "resolved", resolved_evidence_ids: [evidenceId] },
    ],
    sourceTargets: ["vendor_advisory"],
    intervalPolicy: { min_hours: 6, max_hours: 72, no_change_multiplier: 2, max_no_change_checks: 5 },
    stopCondition: { all_questions_resolved: false, stop_after_no_change_checks: 5, deadline_at: null },
    initialIntervalHours: 24,
    nextCheckAt: new Date(Date.now() + 24 * 3600_000),
  });

  // One impact run: a low-confidence row (persists as an explicit unknown-only record) and a
  // medium row (never persists; it goes to the human-review queue). Both surface in the review views.
  const task = ImpactTaskSchema.parse({
    trace_id: randomUUID(), run_id: randomUUID(), tool_capability: "x".repeat(32),
    story: snapshot(storyId),
    source_parameters: { cve_id: null, vendor: "acme" },
    evidence: [{
      evidence_id: evidenceId, source_type: "vendor_advisory", authority_level: "authoritative" as const,
      canonical_url: "https://vendor.example/admin-view", content_hash: "a".repeat(64),
      retrieved_at: new Date().toISOString(), observations: ["material_update" as const],
    }],
    limits: DEFAULT_RESEARCH_LIMITS,
  });
  await applyImpactProposal({
    task,
    proposal: {
      new_evidence: [],
      impact_rows: [
        {
          vendor: "Acme", product: `Review Widget ${T}`, models: [], cve_id: null,
          affected_range: { raw: "all builds before 2024", supported: false }, fixed_range: null,
          mitigations: [], confidence: "low" as const, evidence_ids: [evidenceId],
        },
        {
          vendor: "Acme", product: `Medium Widget ${T}`, models: [`MW-${T}`], cve_id: null,
          affected_range: { raw: ">=10.0,<10.2", supported: true }, fixed_range: null,
          mitigations: [], confidence: "medium" as const, evidence_ids: [evidenceId],
        },
      ],
      exploit_status: { poc: "unknown" as const, known_exploited: "unknown" as const },
      known_exploited_evidence_ids: [],
      unknowns: ["No machine-readable versions were published."],
      decision: "propose" as const, decision_reason: "Products named; confidence below high.", tool_trace: [],
    },
  });
});

after(async () => {
  for (const id of [storyId, failedStoryId]) {
    await sql`DELETE FROM product_impacts WHERE story_id = ${id}`;
    await sql`DELETE FROM impact_human_reviews WHERE story_id = ${id}`;
    await sql`DELETE FROM story_entities WHERE story_id = ${id}`;
    await sql`DELETE FROM tracking_changes WHERE story_id = ${id}`;
    await sql`DELETE FROM tracking_plans WHERE story_id = ${id}`;
    await sql`DELETE FROM external_evidence WHERE story_id = ${id}`;
    await sql`DELETE FROM agent_research_runs WHERE story_id = ${id}`;
    await sql`DELETE FROM stories WHERE id = ${id}`;
  }
  await app.close();
  await closeDb();
});

async function get(path: string) {
  const res = await app.inject({ method: "GET", url: path });
  assert.equal(res.statusCode, 200, `${path} -> ${res.statusCode}: ${res.body.slice(0, 200)}`);
  return JSON.parse(res.body);
}

test("agent runs view lists phases, statuses and safe run metadata", async () => {
  const body = await get("/api/admin/agent-runs");
  const ours = body.rows.filter((r: { storyId: number }) => [storyId, failedStoryId].includes(r.storyId));
  assert.ok(ours.length >= 2, "both fixture runs are listed");
  const impact = ours.find((r: { storyId: number }) => r.storyId === storyId);
  assert.equal(impact.agentType, "product-impact");
  assert.equal(impact.status, "completed");
  assert.equal(impact.provider, "fixture");
  assert.ok(impact.startedAt && !impact.completedAt === false);
  assert.equal(typeof impact.traceId, "string");
  const failed = ours.find((r: { storyId: number }) => r.storyId === failedStoryId);
  assert.equal(failed.status, "failed");
  assert.equal(failed.errorCode, "provider_timeout");
  assert.ok(failed.errorDetail.includes("the provider did not answer"));
  // No capability, prompt body, usage or input snapshot anywhere in the payload.
  const serialized = JSON.stringify(body);
  for (const fragment of ["capability", "input_snapshot", "usage", "output_proposal"]) {
    assert.ok(!serialized.includes(fragment), `agent runs leaked ${fragment}`);
  }
});

test("tracking plans view reports status, questions and change state", async () => {
  const body = await get("/api/admin/tracking-plans");
  const plan = body.find((p: { storyId: number }) => p.storyId === storyId);
  assert.ok(plan, "the fixture plan is listed");
  assert.equal(plan.status, "active");
  assert.equal(plan.questionCount, 2);
  assert.equal(plan.openQuestions, 1);
  assert.ok(plan.nextCheckAt);
  assert.equal(plan.lastChangeType, null);
});

test("human reviews view lists open reviews with their payload", async () => {
  const body = await get("/api/admin/human-reviews?status=open");
  const ours = body.filter((r: { storyId: number }) => r.storyId === storyId);
  assert.equal(ours.length, 1, "the medium row is awaiting human review");
  assert.equal(ours[0].status, "open");
  assert.match(ours[0].reason, /Medium Widget/);
  assert.equal(typeof ours[0].payload, "object");
  assert.equal((ours[0].payload as { product: string }).product, `Medium Widget ${T}`);
});

test("product impact review view lists non-claim rows with resolved evidence", async () => {
  const body = await get("/api/admin/product-impact-review");
  const row = body.rows.find((r: { storyId: number }) => r.storyId === storyId);
  assert.ok(row, "the low-confidence row is awaiting review");
  assert.equal(row.product, `Review Widget ${T}`);
  assert.equal(row.confidence, "low");
  assert.equal(row.persistedKind, "unknown_only");
  // An unknown-only record carries no version ranges — the pipeline refused to turn the prose
  // expression into a claim, which is exactly what the review view surfaces.
  assert.equal(row.affectedRange, null);
  assert.ok(row.unknowns.length >= 1);
  assert.equal(row.evidence.length, 1, "evidence is resolved for the reviewer");
  assert.equal(row.evidence[0].url, "https://vendor.example/admin-view");
});

test("eval results view returns the recorded conclusions without computing anything", async () => {
  const body = await get("/api/admin/eval-results");
  assert.ok(Array.isArray(body.records) && body.records.length >= 5);
  for (const record of body.records) {
    assert.ok(record.doc.startsWith("docs/evaluation/"));
    assert.ok(record.status.length > 0);
    assert.ok(Array.isArray(record.limitations));
  }
  // MODEL_REVIEWED records must never be described as human gold.
  assert.ok(!JSON.stringify(body).includes("human gold") || JSON.stringify(body).includes("不是人工标注") || JSON.stringify(body).includes("非 human gold") || JSON.stringify(body).includes("非 human"));
});

test("the admin views never expose the public story DTO's forbidden internals", async () => {
  const bodies = await Promise.all([
    get("/api/admin/agent-runs"),
    get("/api/admin/tracking-plans"),
    get("/api/admin/human-reviews"),
    get("/api/admin/product-impact-review"),
  ]);
  const serialized = JSON.stringify(bodies);
  for (const fragment of ["content_hash", "normalized", "provenance", "capability_hash", "SESSION_SECRET"]) {
    assert.ok(!serialized.includes(fragment), `admin views leaked ${fragment}`);
  }
});
