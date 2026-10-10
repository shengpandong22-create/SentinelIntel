import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { after, before, test } from "node:test";
import { closeDb, sql } from "@aihot/backend/db";
import { DEFAULT_RESEARCH_LIMITS, ResearchProposalSchema } from "@aihot/backend/agents/research-contract";
import { executeResearchTool } from "@aihot/backend/agents/tool-gateway";
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
  await authorizeResearchToolCall({ runPublicId: run.publicId, traceId, capability: run.capability, tool: "stub" });
  await recordResearchToolResult({ runPublicId: run.publicId, traceId, capability: run.capability, evidenceDocuments: 1, responseBytes: 512 });
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
    authorizeResearchToolCall({ runPublicId: run.publicId, traceId: run.traceId, capability: "wrong", tool: "stub" }),
    /invalid research run capability/,
  );
  await assert.rejects(
    authorizeResearchToolCall({ runPublicId: run.publicId, traceId: run.traceId, capability: run.capability, tool: "nvd_lookup" }),
    /research network is disabled/,
  );
  await authorizeResearchToolCall({ runPublicId: run.publicId, traceId: run.traceId, capability: run.capability, tool: "stub" });
  await assert.rejects(
    authorizeResearchToolCall({ runPublicId: run.publicId, traceId: run.traceId, capability: run.capability, tool: "stub" }),
    /tool call limit exhausted/,
  );
  await assert.rejects(
    recordResearchToolResult({ runPublicId: run.publicId, traceId: run.traceId, capability: run.capability, evidenceDocuments: 13, responseBytes: 1 }),
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

test("NVD and KEV fixtures pass through the bounded gateway and consume two free tool calls", async () => {
  const traceId = randomUUID();
  const run = await startResearchRun({
    storyId,
    traceId,
    objective: "Research CVE-2021-44228",
    graphVersion: "phase4-sources-v1",
    snapshot: snapshot(),
    limits: { ...DEFAULT_RESEARCH_LIMITS, max_tool_calls: 2 },
  });
  const fetchJson = async (url: string) => JSON.parse(await readFile(
    new URL(url.includes("nvd.nist.gov") ? "./fixtures/research/nvd-cve.json" : "./fixtures/research/cisa-kev.json", import.meta.url),
    "utf8",
  )) as unknown;
  const base = { trace_id: traceId, run_id: run.publicId };
  const nvd = await executeResearchTool(
    { ...base, tool: "nvd_lookup", input: { cve_id: "CVE-2021-44228" } },
    run.capability,
    { networkEnabled: true, fetchJson },
  );
  const kev = await executeResearchTool(
    { ...base, tool: "kev_lookup", input: { cve_id: "CVE-2021-44228" } },
    run.capability,
    { networkEnabled: true, fetchJson },
  );
  assert.equal(nvd.evidence[0]!.source_type, "nvd");
  assert.equal(kev.evidence[0]!.source_type, "cisa_kev");
  assert.deepEqual(nvd.receipt_ids, []);
  assert.deepEqual(kev.receipt_ids, []);
  const [stored] = await sql<{ calls: number; documents: number }[]>`
    SELECT tool_calls_used AS calls, evidence_documents_used AS documents
    FROM agent_research_runs WHERE id = ${run.id}`;
  assert.deepEqual(stored, { calls: 2, documents: 2 });
  await failResearchRun(run.id, "fixture_done", "source adapter test complete");
});

test("vendor discovery and official fetch pass through the bounded gateway without receipts", async () => {
  const traceId = randomUUID();
  const run = await startResearchRun({
    storyId,
    traceId,
    objective: "Find the Cisco advisory for CVE-2024-20399",
    graphVersion: "phase4-vendor-sources-v1",
    snapshot: snapshot(),
    limits: { ...DEFAULT_RESEARCH_LIMITS, max_tool_calls: 2 },
  });
  const advisoryUrl = "https://sec.cloudapps.cisco.com/security/center/content/CiscoSecurityAdvisory/cisco-sa-example-CVE-2024-20399";
  const fetchDocument = async (url: string) => ({
    url,
    status: 200,
    contentType: "text/html; charset=utf-8",
    text: await readFile(new URL(
      url.includes("publicationListing") ? "./fixtures/research/cisco-search.html" : "./fixtures/research/cisco-advisory.html",
      import.meta.url,
    ), "utf8"),
  });
  const base = { trace_id: traceId, run_id: run.publicId };
  const search = await executeResearchTool(
    { ...base, tool: "vendor_advisory_search", input: { vendor: "cisco", query: "CVE-2024-20399" } },
    run.capability,
    { networkEnabled: true, fetchDocument },
  );
  assert.deepEqual(search.evidence, []);
  assert.deepEqual(search.output.candidates, [{ title: "CVE-2024-20399 Cisco Security Advisory", url: advisoryUrl }]);
  const fetched = await executeResearchTool(
    { ...base, tool: "evidence_fetch", input: { vendor: "cisco", url: advisoryUrl } },
    run.capability,
    { networkEnabled: true, fetchDocument },
  );
  assert.equal(fetched.evidence[0]!.source_type, "vendor_advisory");
  assert.deepEqual(fetched.receipt_ids, []);
  const [stored] = await sql<{ calls: number; documents: number }[]>`
    SELECT tool_calls_used AS calls, evidence_documents_used AS documents
    FROM agent_research_runs WHERE id = ${run.id}`;
  assert.deepEqual(stored, { calls: 2, documents: 1 });
  await failResearchRun(run.id, "fixture_done", "vendor adapter test complete");
});

test("TED award lookup passes through the bounded gateway and consumes one free tool call", async () => {
  const traceId = randomUUID();
  const run = await startResearchRun({
    storyId,
    traceId,
    objective: "Find the official procurement award for PROC-SECURITY-CAMERA-2026",
    graphVersion: "phase5-ted-source-v1",
    snapshot: snapshot(),
    limits: { ...DEFAULT_RESEARCH_LIMITS, max_tool_calls: 1 },
  });
  const postJson = async () => JSON.parse(await readFile(
    new URL("./fixtures/research/ted-award.json", import.meta.url),
    "utf8",
  )) as unknown;
  const result = await executeResearchTool(
    {
      trace_id: traceId,
      run_id: run.publicId,
      tool: "ted_procurement_lookup",
      input: { procedure_id: "PROC-SECURITY-CAMERA-2026" },
    },
    run.capability,
    { networkEnabled: true, postJson },
  );
  assert.equal(result.evidence[0]!.source_type, "official_procurement");
  assert.deepEqual(result.evidence[0]!.normalized.tracking_observations, ["procurement_award"]);
  assert.deepEqual(result.receipt_ids, []);
  const [stored] = await sql<{ calls: number; documents: number }[]>`
    SELECT tool_calls_used AS calls, evidence_documents_used AS documents
    FROM agent_research_runs WHERE id = ${run.id}`;
  assert.deepEqual(stored, { calls: 1, documents: 1 });
  await failResearchRun(run.id, "fixture_done", "TED adapter test complete");
});
