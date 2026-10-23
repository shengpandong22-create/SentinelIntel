// Phase 7 unified agent-intelligence read model: populated / empty / partial / failed states,
// unknown preservation, cross-story isolation, public-safe projection, and the read-only invariant
// (loading a story must not write, receipt, or run anything).
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, before, test } from "node:test";
import { closeDb, sql } from "@aihot/backend/db";
import { loadStoryAgentIntelligence } from "@aihot/backend/publication/agent-intelligence";
import { applyImpactProposal } from "@aihot/backend/agents/impact-store";
import { createTrackingPlan } from "@aihot/backend/agents/tracking-store";
import { completeResearchRun, failResearchRun, startResearchRun } from "@aihot/backend/agents/research-store";
import { ImpactTaskSchema } from "@aihot/backend/agents/impact-contract";
import { DEFAULT_RESEARCH_LIMITS, ResearchProposalSchema } from "@aihot/backend/agents/research-contract";
import { tag } from "./setup.ts";

const T = tag();

let fullStoryId: number;
let otherStoryId: number;
let emptyStoryId: number;
let partialStoryId: number;
let failedStoryId: number;
let lateAgentStoryId: number;
let reviewOnlyStoryId: number;
const evidenceNvd = randomUUID();
const evidenceKev = randomUUID();
const otherEvidence = randomUUID();
const evidenceLate = randomUUID();

function storySnapshot(id: number) {
  return {
    schema_version: 1 as const, story_id: id, story_version: 1, title: `Agent intelligence story ${T}`,
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
  fullStoryId = await insertStory(`Full agent story ${T}`);
  otherStoryId = await insertStory(`Other story ${T}`);
  emptyStoryId = await insertStory(`Empty agent story ${T}`);
  partialStoryId = await insertStory(`Partial agent story ${T}`);
  failedStoryId = await insertStory(`Failed agent story ${T}`);
  lateAgentStoryId = await insertStory(`Late agent story ${T}`);
  reviewOnlyStoryId = await insertStory(`Review-only story ${T}`);

  // Populated story: a completed research run storing NVD + KEV evidence, claims, unknowns, a conflict.
  const run = await startResearchRun({
    storyId: fullStoryId, traceId: randomUUID(), objective: "Research the vulnerability", graphVersion: "phase4-stub-v1",
    snapshot: storySnapshot(fullStoryId), limits: DEFAULT_RESEARCH_LIMITS,
  });
  await completeResearchRun({
    runId: run.id, storyId: fullStoryId, provider: "fixture", model: "fixture-model", promptVersion: "fixture-v1",
    proposal: ResearchProposalSchema.parse({
      claims: [{
        claim_id: "c1", text: "The vendor confirmed exploitation in the wild.", criticality: "critical",
        status: "confirmed", confidence: 0.92, evidence_ids: [evidenceNvd],
      }],
      unknowns: [{
        question: "Which legacy builds ship the vulnerable component?", attempted_sources: ["vendor advisory"],
        reason: "The advisory lists only current branches.",
      }],
      conflicts: [{ description: "Advisory and press disagree on the patch date.", evidence_ids: [evidenceNvd, evidenceKev] }],
      tool_trace: [],
      summary: "Vendor confirmed in-the-wild exploitation; a patch is available.",
      terminal_status: "completed",
      evidence: [
        {
          evidence_id: evidenceNvd, source_type: "nvd", source_name: "NVD", canonical_url: "https://nvd.nist.gov/vuln/detail/CVE-2026-9999",
          title: "CVE-2026-9999 detail", excerpt: "Affected versions and fix information.", normalized: { internal: true },
          content_hash: "c".repeat(64), authority_level: "authoritative", published_at: "2026-09-01T00:00:00Z",
          source_updated_at: null, retrieved_at: new Date().toISOString(), provenance: { fetcher: "internal" },
        },
        {
          evidence_id: evidenceKev, source_type: "cisa_kev", source_name: "CISA KEV", canonical_url: "https://www.cisa.gov/known-exploited-vulnerabilities-catalog",
          title: "KEV catalog entry", excerpt: "Listed as known exploited.", normalized: {},
          content_hash: "d".repeat(64), authority_level: "primary", published_at: null,
          source_updated_at: null, retrieved_at: new Date().toISOString(), provenance: {},
        },
      ],
    }),
  });

  // A tracking plan with one open and one resolved question.
  const plan = await createTrackingPlan({
    storyId: fullStoryId,
    whyTrack: "Patch rollout and exploitation reports are still unfolding.",
    questions: [
      { question_id: "q1", question: "Has the vendor shipped the fix to all branches?", resolve_on: ["patch"], status: "open", resolved_evidence_ids: [] },
      { question_id: "q2", question: "Did the vendor confirm the issue?", resolve_on: ["vendor_confirmation"], status: "resolved", resolved_evidence_ids: [evidenceNvd] },
    ],
    sourceTargets: ["nvd", "cisa_kev"],
    intervalPolicy: { min_hours: 6, max_hours: 72, no_change_multiplier: 2, max_no_change_checks: 5 },
    stopCondition: { all_questions_resolved: false, stop_after_no_change_checks: 5, deadline_at: null },
    initialIntervalHours: 12,
    nextCheckAt: new Date(Date.now() + 12 * 3600_000),
  });
  const [planRow] = await sql<{ id: number }[]>`SELECT id FROM tracking_plans WHERE public_id = ${plan.plan_id}::uuid`;
  for (const [key, type, summary] of [
    ["chg-1", "vendor_confirmation", "Vendor confirmed the vulnerability."],
    ["chg-2", "patch", "A fixed build was published."],
  ] as const) {
    await sql`
      INSERT INTO tracking_changes (public_id, plan_id, story_id, run_id, plan_version, change_key, change_type, summary, before_snapshot, after_snapshot, evidence_ids)
      VALUES (${randomUUID()}, ${planRow!.id}, ${fullStoryId}, ${randomUUID()}, 1, ${key}, ${type}, ${summary}, '{}'::jsonb, '{}'::jsonb, ${[evidenceNvd]}::uuid[])`;
  }

  // Impact rows: one high-confidence claims row with a preserved unknown, one medium review row.
  const impactTask = ImpactTaskSchema.parse({
    trace_id: randomUUID(), run_id: randomUUID(), tool_capability: "x".repeat(32),
    story: storySnapshot(fullStoryId),
    source_parameters: { cve_id: "CVE-2026-9999", vendor: "acme" },
    evidence: [evidenceNvd, evidenceKev].map((id, index) => ({
      evidence_id: id,
      source_type: index === 0 ? "nvd" : "cisa_kev",
      authority_level: "authoritative" as const,
      canonical_url: `https://example.invalid/evidence-${index}`,
      content_hash: "a".repeat(64),
      retrieved_at: new Date().toISOString(),
      observations: ["material_update" as const],
    })),
    limits: DEFAULT_RESEARCH_LIMITS,
  });
  await applyImpactProposal({
    task: impactTask,
    proposal: {
      new_evidence: [],
      impact_rows: [
        {
          vendor: "Acme", product: `Widget Platform ${T}`, models: [`WIDGET-${T}`], cve_id: "CVE-2026-9999",
          affected_range: { raw: ">=10.0,<10.2", supported: true }, fixed_range: { raw: "10.2", supported: true },
          mitigations: ["Upgrade to 10.2."], confidence: "high" as const, evidence_ids: [evidenceNvd],
        },
        {
          vendor: "Acme", product: `Legacy Widget ${T}`, models: [], cve_id: null,
          affected_range: { raw: "builds before 2024", supported: false }, fixed_range: null,
          mitigations: [], confidence: "medium" as const, evidence_ids: [evidenceKev],
        },
      ],
      exploit_status: { poc: "unknown" as const, known_exploited: "unknown" as const },
      known_exploited_evidence_ids: [],
      unknowns: ["Whether pre-2024 builds receive a backport is unstated."],
      decision: "propose" as const,
      decision_reason: "Official advisory states affected and fixed versions.",
      tool_trace: [],
    },
  });

  // A second story with its own evidence, to prove the read model never leaks across stories.
  const otherRun = await startResearchRun({
    storyId: otherStoryId, traceId: randomUUID(), objective: "Other story research", graphVersion: "phase4-stub-v1",
    snapshot: storySnapshot(otherStoryId), limits: DEFAULT_RESEARCH_LIMITS,
  });
  await completeResearchRun({
    runId: otherRun.id, storyId: otherStoryId, provider: "fixture",
    proposal: ResearchProposalSchema.parse({
      claims: [], unknowns: [], conflicts: [], tool_trace: [], summary: "Other story summary.", terminal_status: "completed",
      evidence: [{
        evidence_id: otherEvidence, source_type: "vendor_advisory", source_name: "Other Vendor", canonical_url: "https://other.example/advisory",
        title: "Other advisory", excerpt: "Other story evidence.", normalized: {},
        content_hash: "e".repeat(64), authority_level: "primary", published_at: null,
        source_updated_at: null, retrieved_at: new Date().toISOString(), provenance: {},
      }],
    }),
  });

  // Partial story: impact evidence and rows only, no research run, no tracking plan.
  const partialEvidence = randomUUID();
  const partialRun = await startResearchRun({
    storyId: partialStoryId, traceId: randomUUID(), objective: "Store evidence only", graphVersion: "phase6-impact-v1",
    snapshot: storySnapshot(partialStoryId), limits: DEFAULT_RESEARCH_LIMITS,
  });
  await completeResearchRun({
    runId: partialRun.id, storyId: partialStoryId, provider: "fixture",
    proposal: ResearchProposalSchema.parse({
      claims: [], unknowns: [], conflicts: [], tool_trace: [], summary: "Evidence only.", terminal_status: "completed",
      evidence: [{
        evidence_id: partialEvidence, source_type: "vendor_advisory", source_name: "Vendor", canonical_url: "https://vendor.example/partial",
        title: "Partial advisory", excerpt: "Versions stated in prose only.", normalized: {},
        content_hash: "f".repeat(64), authority_level: "authoritative", published_at: null,
        source_updated_at: null, retrieved_at: new Date().toISOString(), provenance: {},
      }],
    }),
  });
  // Remove the run's own research signal by failing a *second* run: the read model shows the latest
  // run state, so point it at a failed one to exercise the partial shape without a research section.
  const partialFail = await startResearchRun({
    storyId: partialStoryId, traceId: randomUUID(), objective: "Later failed attempt", graphVersion: "phase6-impact-v1",
    snapshot: storySnapshot(partialStoryId), limits: DEFAULT_RESEARCH_LIMITS,
  });
  await failResearchRun(partialFail.id, "provider_timeout", "the provider did not answer");
  const partialImpactTask = ImpactTaskSchema.parse({
    trace_id: randomUUID(), run_id: randomUUID(), tool_capability: "x".repeat(32),
    story: storySnapshot(partialStoryId),
    source_parameters: { cve_id: null, vendor: "acme" },
    evidence: [{
      evidence_id: partialEvidence, source_type: "vendor_advisory", authority_level: "authoritative" as const,
      canonical_url: "https://vendor.example/partial", content_hash: "a".repeat(64),
      retrieved_at: new Date().toISOString(), observations: ["material_update" as const],
    }],
    limits: DEFAULT_RESEARCH_LIMITS,
  });
  await applyImpactProposal({
    task: partialImpactTask,
    proposal: {
      new_evidence: [],
      impact_rows: [{
        vendor: "Acme", product: `Partial Widget ${T}`, models: [`PW-${T}`], cve_id: null,
        affected_range: { raw: "unresolvable version range", supported: false }, fixed_range: null,
        mitigations: [], confidence: "high" as const, evidence_ids: [partialEvidence],
      }],
      exploit_status: { poc: "unknown" as const, known_exploited: "unknown" as const },
      known_exploited_evidence_ids: [],
      unknowns: ["The advisory states no version bounds."],
      decision: "propose" as const, decision_reason: "Product named without versions.", tool_trace: [],
    },
  });

  // Failed story: latest run failed.
  const failedRun = await startResearchRun({
    storyId: failedStoryId, traceId: randomUUID(), objective: "Doomed run", graphVersion: "phase4-stub-v1",
    snapshot: storySnapshot(failedStoryId), limits: DEFAULT_RESEARCH_LIMITS,
  });
  await failResearchRun(failedRun.id, "provider_error", "the provider returned an unusable payload");

  // Regression (audit P1): a Phase 4 research run followed by a LATER Phase 6 impact run. The
  // impact agent completes its run with the production proposal shape — claims: [] and the impact
  // decision reason as the summary — so the shared agent_research_runs row would otherwise be
  // parsed as research and published as "completed, no claims", erasing the real research result.
  const lateResearch = await startResearchRun({
    storyId: lateAgentStoryId, traceId: randomUUID(), objective: "Research first", graphVersion: "phase4-stub-v1",
    snapshot: storySnapshot(lateAgentStoryId), limits: DEFAULT_RESEARCH_LIMITS,
  });
  await completeResearchRun({
    runId: lateResearch.id, storyId: lateAgentStoryId, provider: "fixture",
    proposal: ResearchProposalSchema.parse({
      claims: [{
        claim_id: "late1", text: "The Phase 4 research confirmed exploitation in the wild.",
        criticality: "critical", status: "confirmed", confidence: 0.9, evidence_ids: [evidenceLate],
      }],
      unknowns: [], conflicts: [], tool_trace: [],
      summary: "Phase 4 summary that must survive the later impact run.",
      terminal_status: "completed",
      evidence: [{
        evidence_id: evidenceLate, source_type: "nvd", source_name: "NVD", canonical_url: "https://nvd.nist.gov/vuln/detail/CVE-2026-8888",
        title: "CVE-2026-8888 detail", excerpt: "Affected builds listed.", normalized: {},
        content_hash: "1".repeat(64), authority_level: "authoritative", published_at: null,
        source_updated_at: null, retrieved_at: new Date().toISOString(), provenance: {},
      }],
    }),
  });
  const lateImpact = await startResearchRun({
    storyId: lateAgentStoryId, traceId: randomUUID(), objective: "Analyze public product impact for the vulnerability in this Story.",
    graphVersion: "phase6-impact-v1", snapshot: storySnapshot(lateAgentStoryId), limits: DEFAULT_RESEARCH_LIMITS,
  });
  await completeResearchRun({
    runId: lateImpact.id, storyId: lateAgentStoryId, provider: "impact-agent", promptVersion: "phase6-impact-v1",
    proposal: ResearchProposalSchema.parse({
      claims: [],
      unknowns: [{ question: "No machine-readable versions were published.", attempted_sources: ["acquisition"], reason: "No machine-readable versions were published." }],
      evidence: [], conflicts: [], tool_trace: [],
      summary: "Phase 6 impact decision reason that must NOT surface as the research summary.",
      terminal_status: "completed",
    }),
  });

  // Regression (audit P1): a story whose only product-impact signal is an open human review. The
  // deterministic store routes the medium row to impact_human_reviews and persists no impact row,
  // so the review count is the only pending-review signal the public DTO can carry.
  const evidenceReviewOnly = randomUUID();
  const reviewRun = await startResearchRun({
    storyId: reviewOnlyStoryId, traceId: randomUUID(), objective: "Acquire evidence for the impact task",
    graphVersion: "phase6-impact-v1", snapshot: storySnapshot(reviewOnlyStoryId), limits: DEFAULT_RESEARCH_LIMITS,
  });
  await completeResearchRun({
    runId: reviewRun.id, storyId: reviewOnlyStoryId, provider: "impact-agent", promptVersion: "phase6-impact-v1",
    proposal: ResearchProposalSchema.parse({
      claims: [], unknowns: [], conflicts: [], tool_trace: [], summary: "Evidence acquired.", terminal_status: "completed",
      evidence: [{
        evidence_id: evidenceReviewOnly, source_type: "vendor_advisory", source_name: "Vendor",
        canonical_url: "https://vendor.example/review-only", title: "Review-only advisory",
        excerpt: "Versions stated in prose only.", normalized: {},
        content_hash: "2".repeat(64), authority_level: "authoritative", published_at: null,
        source_updated_at: null, retrieved_at: new Date().toISOString(), provenance: {},
      }],
    }),
  });
  const reviewTask = ImpactTaskSchema.parse({
    trace_id: randomUUID(), run_id: randomUUID(), tool_capability: "x".repeat(32),
    story: storySnapshot(reviewOnlyStoryId),
    source_parameters: { cve_id: null, vendor: "acme" },
    evidence: [{
      evidence_id: evidenceReviewOnly, source_type: "vendor_advisory", authority_level: "authoritative" as const,
      canonical_url: "https://vendor.example/review-only", content_hash: "a".repeat(64),
      retrieved_at: new Date().toISOString(), observations: ["material_update" as const],
    }],
    limits: DEFAULT_RESEARCH_LIMITS,
  });
  await applyImpactProposal({
    task: reviewTask,
    proposal: {
      new_evidence: [],
      impact_rows: [{
        vendor: "Acme", product: `Review Only Widget ${T}`, models: [], cve_id: null,
        affected_range: { raw: "builds before 2025", supported: false }, fixed_range: null,
        mitigations: [], confidence: "medium" as const, evidence_ids: [evidenceReviewOnly],
      }],
      exploit_status: { poc: "unknown" as const, known_exploited: "unknown" as const },
      known_exploited_evidence_ids: [],
      unknowns: ["The advisory states no machine-readable versions."],
      decision: "propose" as const, decision_reason: "Product named with a prose version range.", tool_trace: [],
    },
  });
});

after(async () => {
  for (const id of [fullStoryId, otherStoryId, partialStoryId, failedStoryId, emptyStoryId, lateAgentStoryId, reviewOnlyStoryId]) {
    await sql`DELETE FROM product_impacts WHERE story_id = ${id}`;
    await sql`DELETE FROM impact_human_reviews WHERE story_id = ${id}`;
    await sql`DELETE FROM story_entities WHERE story_id = ${id}`;
    await sql`DELETE FROM tracking_changes WHERE story_id = ${id}`;
    await sql`DELETE FROM tracking_plans WHERE story_id = ${id}`;
    await sql`DELETE FROM external_evidence WHERE story_id = ${id}`;
    await sql`DELETE FROM agent_research_runs WHERE story_id = ${id}`;
    await sql`DELETE FROM stories WHERE id = ${id}`;
  }
  await closeDb();
});

const FORBIDDEN_FRAGMENTS = [
  "content_hash", "normalized", "provenance", "tool_trace", "trace_id", "receipt",
  "prompt_version", "input_snapshot", "capability", "error_detail", "usage", "payload",
];

test("populated story assembles every section from one read model", async () => {
  const view = await loadStoryAgentIntelligence(fullStoryId);
  assert.equal(view.present, true);
  assert.ok(view.dataUpdatedAt && !Number.isNaN(Date.parse(view.dataUpdatedAt)));

  assert.equal(view.research?.status, "completed");
  assert.equal(view.research?.summary, "Vendor confirmed in-the-wild exploitation; a patch is available.");
  assert.equal(view.research?.claims.length, 1);
  assert.deepEqual(view.research?.claims[0], {
    claimId: "c1", text: "The vendor confirmed exploitation in the wild.", criticality: "critical",
    status: "confirmed", evidenceIds: [evidenceNvd],
  });
  assert.equal(view.research?.conflictCount, 1);

  assert.equal(view.tracking?.status, "active");
  assert.equal(view.tracking?.whyTrack, "Patch rollout and exploitation reports are still unfolding.");
  assert.deepEqual(view.tracking?.questions.map((q) => q.status), ["open", "resolved"]);
  assert.ok(view.tracking?.lastCheckedAt === null || typeof view.tracking.lastCheckedAt === "string");

  assert.equal(view.timelineChanges.length, 2);
  assert.deepEqual(view.timelineChanges.map((c) => c.changeType), ["patch", "vendor_confirmation"]);
  assert.deepEqual(view.timelineChanges[0]!.evidenceIds, [evidenceNvd]);

  // Persistence semantics: the high row persists as a claims row; the medium row never persists —
  // it lives only in impact_human_reviews (admin-only payload), so the public DTO must not carry it.
  assert.equal(view.productImpact.rows.length, 1);
  const claims = view.productImpact.rows.find((r) => r.product === `Widget Platform ${T}`)!;
  assert.equal(claims.persistedKind, "claims");
  assert.equal(claims.confidence, "high");
  assert.equal(claims.reviewRequired, false);
  assert.deepEqual(claims.affectedRange, { raw: ">=10.0,<10.2", supported: true });
  assert.deepEqual(claims.fixedRange, { raw: "10.2", supported: true });
  assert.deepEqual(claims.models, [`WIDGET-${T}`]);
  assert.equal(claims.cveId, "CVE-2026-9999");
  assert.deepEqual(claims.exploitStatus, { poc: "unknown", knownExploited: "unknown" });
  assert.deepEqual(claims.unknowns, ["Whether pre-2024 builds receive a backport is unstated."]);
  // One open human review for the medium row; its payload stays out of the public projection. The
  // review signal reaches productImpact because the store never persists a medium row.
  assert.equal(view.productImpact.reviewRequiredCount, 1);
  assert.equal(view.reviewRequiredCount, 1);

  assert.equal(view.evidence.length, 2);
  const nvd = view.evidence.find((e) => e.id === evidenceNvd)!;
  assert.deepEqual(nvd, {
    id: evidenceNvd, sourceType: "nvd", sourceName: "NVD", url: "https://nvd.nist.gov/vuln/detail/CVE-2026-9999",
    title: "CVE-2026-9999 detail", excerpt: "Affected versions and fix information.", authorityLevel: "authoritative",
    publishedAt: "2026-09-01T00:00:00.000Z", retrievedAt: nvd.retrievedAt,
  });

  // Unknowns stay verbatim: the research question plus the impact unknown, nothing reworded.
  const researchUnknown = view.unknowns.find((u) => u.source === "research")!;
  assert.equal(researchUnknown.text, "Which legacy builds ship the vulnerable component?");
  assert.equal(researchUnknown.reason, "The advisory lists only current branches.");
  assert.ok(view.unknowns.some((u) => u.text === "Whether pre-2024 builds receive a backport is unstated."));

  // The public projection carries no internal state.
  const serialized = JSON.stringify(view);
  for (const fragment of FORBIDDEN_FRAGMENTS) assert.ok(!serialized.includes(fragment), `leaked ${fragment}`);
  // Human-review payloads are admin-only: the medium row's product must not surface publicly.
  assert.ok(!serialized.includes(`Legacy Widget ${T}`), "leaked human review payload");
});

test("evidence never crosses story boundaries", async () => {
  const view = await loadStoryAgentIntelligence(fullStoryId);
  assert.ok(!view.evidence.some((e) => e.id === otherEvidence));
  const other = await loadStoryAgentIntelligence(otherStoryId);
  assert.deepEqual(other.evidence.map((e) => e.id), [otherEvidence]);
  assert.equal(other.productImpact.rows.length, 0);
  assert.equal(other.present, true);
});

test("story without agent data degrades to the empty state", async () => {
  const view = await loadStoryAgentIntelligence(emptyStoryId);
  assert.equal(view.present, false);
  assert.equal(view.dataUpdatedAt, null);
  assert.equal(view.research, null);
  assert.equal(view.tracking, null);
  assert.deepEqual(view.timelineChanges, []);
  assert.deepEqual(view.productImpact, { rows: [], reviewRequiredCount: 0 });
  assert.deepEqual(view.evidence, []);
  assert.deepEqual(view.unknowns, []);
  assert.equal(view.reviewRequiredCount, 0);
});

test("partial story degrades only the sections that have data", async () => {
  const view = await loadStoryAgentIntelligence(partialStoryId);
  assert.equal(view.present, true);
  // The story has only Phase 6 impact runs, so there is no Phase 4 research section at all — a
  // tracking or impact run must never be presented as the research result.
  assert.equal(view.research, null);
  assert.equal(view.tracking, null);
  assert.deepEqual(view.timelineChanges, []);
  assert.equal(view.evidence.length, 1);
  assert.equal(view.productImpact.rows.length, 1);
  assert.equal(view.productImpact.rows[0]!.persistedKind, "claims");
  assert.deepEqual(view.productImpact.rows[0]!.affectedRange, { raw: "unresolvable version range", supported: false });
  assert.deepEqual(view.productImpact.rows[0]!.unknowns, ["The advisory states no version bounds."]);
  const serialized = JSON.stringify(view);
  for (const fragment of FORBIDDEN_FRAGMENTS) assert.ok(!serialized.includes(fragment), `leaked ${fragment}`);
});

test("a failed research run surfaces status only, never the internal error", async () => {
  const view = await loadStoryAgentIntelligence(failedStoryId);
  assert.equal(view.research?.status, "failed");
  assert.equal(view.present, true);
  const serialized = JSON.stringify(view);
  assert.ok(!serialized.includes("provider_error"));
  assert.ok(!serialized.includes("the provider returned an unusable payload"));
});

test("a later Phase 6 run never replaces the Phase 4 research view", async () => {
  const view = await loadStoryAgentIntelligence(lateAgentStoryId);
  // The impact run is the newest agent_research_runs row, but research reads Phase 4 only: the
  // Phase 4 claim and summary survive, and the impact decision reason never surfaces as research.
  assert.equal(view.research?.status, "completed");
  assert.equal(view.research?.summary, "Phase 4 summary that must survive the later impact run.");
  assert.equal(view.research?.claims.length, 1);
  assert.equal(view.research?.claims[0]!.text, "The Phase 4 research confirmed exploitation in the wild.");
  assert.deepEqual(view.research?.claims[0]!.evidenceIds, [evidenceLate]);
  // The impact run's unknowns are impact unknowns, not research unknowns.
  assert.ok(!view.unknowns.some((u) => u.source === "research"));
  const serialized = JSON.stringify(view);
  assert.ok(!serialized.includes("must NOT surface"), "the Phase 6 summary leaked into the public DTO");
});

test("a story whose only signal is an open human review shows the pending review", async () => {
  const view = await loadStoryAgentIntelligence(reviewOnlyStoryId);
  // The store routed the medium row to impact_human_reviews and persisted no impact row: the story
  // is present, the review count is the pending-review signal, and nothing about the payload leaks.
  assert.equal(view.present, true);
  assert.ok(view.dataUpdatedAt && !Number.isNaN(Date.parse(view.dataUpdatedAt)));
  assert.deepEqual(view.productImpact.rows, []);
  assert.equal(view.productImpact.reviewRequiredCount, 1);
  assert.equal(view.reviewRequiredCount, 1);
  assert.equal(view.research, null);
  assert.equal(view.tracking, null);
  const serialized = JSON.stringify(view);
  for (const fragment of FORBIDDEN_FRAGMENTS) assert.ok(!serialized.includes(fragment), `leaked ${fragment}`);
  assert.ok(!serialized.includes(`Review Only Widget ${T}`), "leaked human review payload");
});

test("reading agent intelligence writes nothing and receipts nothing", async () => {
  const countRows = async () => {
    const [row] = await sql<Record<string, number>[]>`
      SELECT (SELECT count(*)::int FROM receipts) AS receipts,
             (SELECT count(*)::int FROM agent_research_runs) AS runs,
             (SELECT count(*)::int FROM external_evidence) AS evidence,
             (SELECT count(*)::int FROM tracking_plans) AS plans,
             (SELECT count(*)::int FROM tracking_changes) AS changes,
             (SELECT count(*)::int FROM product_impacts) AS impacts,
             (SELECT count(*)::int FROM impact_human_reviews) AS reviews`;
    return row!;
  };
  const before = await countRows();
  for (let i = 0; i < 3; i++) {
    await loadStoryAgentIntelligence(fullStoryId);
    await loadStoryAgentIntelligence(emptyStoryId);
  }
  assert.deepEqual(await countRows(), before);
  const [story] = await sql<{ version: number; digest: string | null }[]>`SELECT version, digest FROM stories WHERE id = ${fullStoryId}`;
  assert.deepEqual(story, { version: 1, digest: null });
});
