import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, before, test } from "node:test";
import { closeDb, sql } from "@aihot/backend/db";
import { applyImpactProposal, listCurrentImpacts, resolveOrCreateEntity } from "@aihot/backend/agents/impact-store";
import { ImpactTaskSchema } from "@aihot/backend/agents/impact-contract";
import { DEFAULT_RESEARCH_LIMITS, ResearchProposalSchema } from "@aihot/backend/agents/research-contract";
import { completeResearchRun, startResearchRun } from "@aihot/backend/agents/research-store";
import { tag } from "./setup.ts";

const T = tag();
let storyId: number;

function storySnapshot(id: number, version = 1) {
  return {
    schema_version: 1 as const, story_id: id, story_version: version, title: `Impact story ${T}`,
    digest: null, status: "active" as const, facts: [], missing_questions: [], captured_at: new Date().toISOString(),
  };
}

function impactTask(evidenceIds: string[]) {
  return ImpactTaskSchema.parse({
    trace_id: randomUUID(), run_id: randomUUID(), tool_capability: "x".repeat(32),
    story: storySnapshot(storyId),
    source_parameters: { cve_id: "CVE-2026-10001", vendor: "acme" },
    evidence: evidenceIds.map((id, index) => ({
      evidence_id: id,
      source_type: index === 0 ? "vendor_advisory" : "cisa_kev",
      authority_level: "authoritative" as const,
      canonical_url: `https://vendor.example/advisory-${index}`,
      content_hash: "a".repeat(64),
      retrieved_at: new Date().toISOString(),
      observations: index === 0 ? ["vendor_confirmation" as const] : ["material_update" as const],
    })),
    limits: DEFAULT_RESEARCH_LIMITS,
  });
}

function impactProposal(evidenceId: string) {
  return {
    new_evidence: [],
    impact_rows: [{
      vendor: "Acme", product: `CamFirm Platform ${T}`, models: ["CAM-100"],
      cve_id: "CVE-2026-10001",
      affected_range: { raw: ">=1.0,<2.3.5", supported: true },
      fixed_range: { raw: "2.3.5", supported: true },
      mitigations: ["Upgrade to firmware 2.3.5."],
      confidence: "high" as const,
      evidence_ids: [evidenceId],
    }],
    exploit_status: { poc: "unknown" as const, known_exploited: "unknown" as const },
    known_exploited_evidence_ids: [],
    unknowns: [],
    decision: "propose" as const,
    decision_reason: "Official advisory states affected and fixed versions.",
    tool_trace: [],
  };
}

before(async () => {
  const rows = await sql<{ id: number }[]>`
    INSERT INTO stories (public_id, title, first_report_at, latest_at)
    VALUES (${randomUUID()}, ${`Impact story ${T}`}, now(), now())
    RETURNING id`;
  storyId = rows[0]!.id;
});

after(async () => {
  await sql`DELETE FROM product_impacts WHERE story_id = ${storyId}`;
  await sql`DELETE FROM impact_human_reviews WHERE story_id = ${storyId}`;
  await sql`DELETE FROM story_entities WHERE story_id = ${storyId}`;
  await sql`DELETE FROM external_evidence WHERE story_id = ${storyId}`;
  await sql`DELETE FROM agent_research_runs WHERE story_id = ${storyId}`;
  await sql`DELETE FROM stories WHERE id = ${storyId}`;
  await closeDb();
});

async function storedEvidence() {
  const run = await startResearchRun({
    storyId, traceId: randomUUID(), objective: "Create impact evidence", graphVersion: "impact-test",
    snapshot: storySnapshot(storyId), limits: DEFAULT_RESEARCH_LIMITS,
  });
  const evidenceId = randomUUID();
  const proposal = ResearchProposalSchema.parse({
    claims: [], unknowns: [], conflicts: [], tool_trace: [], summary: "Stored advisory", terminal_status: "completed",
    evidence: [{
      evidence_id: evidenceId, source_type: "vendor_advisory", source_name: "Vendor", canonical_url: "https://vendor.example/advisory",
      title: "Affected versions listed", excerpt: "Versions 1.0 to 2.3.4 are affected; 2.3.5 fixes it.",
      normalized: {}, content_hash: "b".repeat(64), authority_level: "authoritative",
      published_at: null, source_updated_at: null, retrieved_at: new Date().toISOString(), provenance: { fixture: true },
    }],
  });
  await completeResearchRun({ runId: run.id, storyId, proposal, provider: "fixture" });
  return evidenceId;
}

test("high-confidence rows persist as claims with matcher-checked ranges, then supersede atomically", async () => {
  const evidenceId = await storedEvidence();
  const task = impactTask([evidenceId]);
  const proposal = impactProposal(evidenceId);
  const first = await applyImpactProposal({ task, proposal });
  assert.deepEqual(first, { impactVersion: 1, persistedClaimRows: 1, unknownOnlyRows: 0, humanReviewRows: 0, idempotent: false });
  const retry = await applyImpactProposal({ task, proposal });
  assert.equal(retry.idempotent, true);

  const current = await listCurrentImpacts(storyId);
  assert.equal(current.length, 1);
  assert.equal(current[0]!.product, `CamFirm Platform ${T}`);
  assert.equal(current[0]!.confidence, "high");
  assert.deepEqual((current[0]!.affectedRange as Record<string, unknown>).supported, true);
  assert.deepEqual(current[0]!.exploitStatus, { poc: "unknown", known_exploited: "unknown" });

  const [story] = await sql<{ version: number; digest: string | null }[]>`SELECT version, digest FROM stories WHERE id = ${storyId}`;
  assert.deepEqual(story, { version: 1, digest: null });

  // A review-only run neither supersedes the current claims nor burns an impact version.
  const second = await applyImpactProposal({
    task: { ...task, run_id: randomUUID(), trace_id: randomUUID() },
    proposal: { ...impactProposal(evidenceId), impact_rows: [] as never, unknowns: ["Vendor has not published affected ranges for legacy lines."] },
  });
  assert.deepEqual(second, { impactVersion: 1, persistedClaimRows: 0, unknownOnlyRows: 0, humanReviewRows: 1, idempotent: false });
  const [counts] = await sql<{ current: number; superseded: number }[]>`
    SELECT count(*) FILTER (WHERE status = 'current') AS current,
           count(*) FILTER (WHERE status = 'superseded') AS superseded
    FROM product_impacts WHERE story_id = ${storyId}`;
  assert.deepEqual(counts, { current: 1, superseded: 0 });
});

test("low-confidence rows persist unknowns only and medium rows route to human review", async () => {
  const evidenceId = await storedEvidence();
  const task = impactTask([evidenceId]);
  const base = impactProposal(evidenceId);
  const proposal = {
    ...base,
    impact_rows: [
      { ...base.impact_rows[0]!, product: `LowConf ${T}`, confidence: "low" as const },
      { ...base.impact_rows[0]!, product: `MidConf ${T}`, confidence: "medium" as const },
    ],
  };
  const result = await applyImpactProposal({ task: { ...task, run_id: randomUUID() }, proposal });
  assert.deepEqual(result, { impactVersion: 2, persistedClaimRows: 0, unknownOnlyRows: 1, humanReviewRows: 1, idempotent: false });
  const [unknownRow] = await sql<{ persisted_kind: string; models: string[]; affected_range: unknown }[]>`
    SELECT persisted_kind, models, affected_range FROM product_impacts
    WHERE story_id = ${storyId} AND status = 'current'`;
  assert.equal(unknownRow!.persisted_kind, "unknown_only");
  assert.deepEqual(unknownRow!.models, []);
  assert.equal(unknownRow!.affected_range, null);
  const [review] = await sql<{ reason: string }[]>`
    SELECT reason FROM impact_human_reviews WHERE story_id = ${storyId} ORDER BY id DESC LIMIT 1`;
  assert.match(review!.reason, /MidConf/);
});

test("dangling evidence is rejected and entity identity is reused across runs", async () => {
  const task = impactTask([randomUUID()]);
  await assert.rejects(
    applyImpactProposal({ task, proposal: impactProposal(task.evidence[0]!.evidence_id) }),
    /unstored or cross-story evidence/,
  );
  const entity = await resolveOrCreateEntity("vendor", `Acme ${T}`);
  const again = await resolveOrCreateEntity("vendor", `  acme ${T} `);
  assert.equal(entity.id, again.id);
  assert.equal(again.canonical_name, `Acme ${T}`);
});
