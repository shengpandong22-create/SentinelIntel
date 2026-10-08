import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, before, test } from "node:test";
import { closeDb, sql } from "@aihot/backend/db";
import { DEFAULT_RESEARCH_LIMITS, ResearchProposalSchema } from "@aihot/backend/agents/research-contract";
import {
  authorizeResearchToolCall,
  assertResearchPaidServiceBudget,
  completeResearchRun,
  failResearchRun,
  recordResearchToolResult,
  startResearchRun,
} from "@aihot/backend/agents/research-store";
import { tag } from "./setup.ts";

const T = tag();
let storyId: number;

const snapshot = () => ({
  schema_version: 1 as const,
  story_id: storyId,
  story_version: 1,
  title: `Research story ${T}`,
  digest: null,
  status: "active" as const,
  facts: [],
  missing_questions: ["Is exploitation confirmed?"],
  captured_at: new Date().toISOString(),
});

before(async () => {
  const [story] = await sql<{ id: number }[]>`
    INSERT INTO stories (public_id, title, first_report_at, latest_at)
    VALUES (${randomUUID()}, ${`Research story ${T}`}, now(), now()) RETURNING id`;
  storyId = story!.id;
});

after(async () => {
  await sql`DELETE FROM external_evidence WHERE story_id = ${storyId}`;
  await sql`DELETE FROM agent_research_runs WHERE story_id = ${storyId}`;
  await sql`DELETE FROM stories WHERE id = ${storyId}`;
  await closeDb();
});

test("persists an immutable snapshot and evidence proposal without modifying the Story", async () => {
  const traceId = randomUUID();
  const run = await startResearchRun({
    storyId,
    traceId,
    objective: "Confirm exploitation",
    graphVersion: "phase4-stub-v1",
    snapshot: snapshot(),
    limits: DEFAULT_RESEARCH_LIMITS,
  });
  const evidenceId = randomUUID();
  await authorizeResearchToolCall({ runId: run.id, capability: run.capability, tool: "stub" });
  await recordResearchToolResult({ runId: run.id, capability: run.capability, evidenceDocuments: 1, responseBytes: 512 });
  const proposal = ResearchProposalSchema.parse({
    claims: [{
      claim_id: "kev-status",
      text: "The vulnerability is listed by CISA KEV.",
      criticality: "critical",
      status: "confirmed",
      confidence: 1,
      evidence_ids: [evidenceId],
    }],
    unknowns: [],
    evidence: [{
      evidence_id: evidenceId,
      source_type: "cisa_kev",
      source_name: "CISA KEV",
      canonical_url: "https://www.cisa.gov/known-exploited-vulnerabilities-catalog",
      title: "Known Exploited Vulnerabilities Catalog",
      excerpt: "Fixture evidence only.",
      normalized: { cve: "CVE-2026-0001" },
      content_hash: "a".repeat(64),
      authority_level: "authoritative",
      published_at: null,
      source_updated_at: null,
      retrieved_at: new Date().toISOString(),
      provenance: { adapter: "fixture" },
    }],
    conflicts: [],
    tool_trace: [{
      sequence: 1,
      tool: "stub",
      status: "ok",
      input_summary: { cve: "CVE-2026-0001" },
      evidence_ids: [evidenceId],
      receipt_ids: [],
      latency_ms: 0,
      error_code: null,
    }],
    summary: "Fixture confirmed KEV status.",
    terminal_status: "completed",
  });

  await completeResearchRun({ runId: run.id, storyId, proposal, model: "test-stub", provider: "fixture" });

  const [stored] = await sql<{ status: string; snapshot_title: string; receipts: number; calls: number; documents: number; bytes: number }[]>`
    SELECT status, input_snapshot->>'title' AS snapshot_title, cardinality(receipt_ids) AS receipts,
           tool_calls_used AS calls, evidence_documents_used AS documents, response_bytes_used AS bytes
    FROM agent_research_runs WHERE id = ${run.id}`;
  const evidence = await sql<{ public_id: string }[]>`
    SELECT public_id FROM external_evidence WHERE research_run_id = ${run.id}`;
  const [story] = await sql<{ version: number; digest: string | null }[]>`
    SELECT version, digest FROM stories WHERE id = ${storyId}`;
  assert.deepEqual(stored, { status: "completed", snapshot_title: `Research story ${T}`, receipts: 0, calls: 1, documents: 1, bytes: 512 });
  assert.equal(evidence[0]!.public_id, evidenceId);
  assert.deepEqual(story, { version: 1, digest: null });

  await assert.rejects(
    completeResearchRun({ runId: run.id, storyId, proposal }),
    /already terminal/,
  );
});

test("rejects a proposal whose claim points to missing evidence", () => {
  assert.throws(() => ResearchProposalSchema.parse({
    claims: [{
      claim_id: "unsupported",
      text: "Unsupported critical claim",
      criticality: "critical",
      status: "confirmed",
      confidence: 1,
      evidence_ids: [randomUUID()],
    }],
    unknowns: [], evidence: [], conflicts: [], tool_trace: [], summary: "Invalid", terminal_status: "completed",
  }), /dangling evidence id/);
});

test("failed runs become terminal without an output proposal", async () => {
  const run = await startResearchRun({
    storyId,
    traceId: randomUUID(),
    objective: "Fail deterministically",
    graphVersion: "phase4-stub-v1",
    snapshot: snapshot(),
    limits: DEFAULT_RESEARCH_LIMITS,
  });
  await failResearchRun(run.id, "fixture_failure", "deterministic failure");
  const [stored] = await sql<{ status: string; error_code: string; output_proposal: unknown }[]>`
    SELECT status, error_code, output_proposal FROM agent_research_runs WHERE id = ${run.id}`;
  assert.deepEqual(stored, { status: "failed", error_code: "fixture_failure", output_proposal: null });
});

test("backend-enforced capabilities, network switch, and tool limits fail closed", async () => {
  const run = await startResearchRun({
    storyId,
    traceId: randomUUID(),
    objective: "Exercise limits",
    graphVersion: "phase4-stub-v1",
    snapshot: snapshot(),
    limits: { ...DEFAULT_RESEARCH_LIMITS, max_tool_calls: 1 },
  });
  await assert.rejects(
    authorizeResearchToolCall({ runId: run.id, capability: "wrong", tool: "stub" }),
    /invalid research run capability/,
  );
  await assert.rejects(
    authorizeResearchToolCall({ runId: run.id, capability: run.capability, tool: "nvd_lookup" }),
    /research network is disabled/,
  );
  await authorizeResearchToolCall({ runId: run.id, capability: run.capability, tool: "stub" });
  await assert.rejects(
    authorizeResearchToolCall({ runId: run.id, capability: run.capability, tool: "stub" }),
    /tool call limit exhausted/,
  );
  await assert.rejects(
    recordResearchToolResult({ runId: run.id, capability: run.capability, evidenceDocuments: 13, responseBytes: 1 }),
    /exceeds limits/,
  );
  await failResearchRun(run.id, "fixture_done", "limit test complete");
});

test("Phase 4 paid services fail closed when their budget row is absent or stopped", async () => {
  await assert.rejects(assertResearchPaidServiceBudget(`missing-${T}`), /has no budget/);
  await sql`
    INSERT INTO budgets (service, per_minute, per_hour, per_day, note)
    VALUES (${`stopped-${T}`}, 0, 0, 0, 'test')`;
  await assert.rejects(assertResearchPaidServiceBudget(`stopped-${T}`), /stopped by budget/);
  await sql`DELETE FROM budgets WHERE service = ${`stopped-${T}`}`;
});
