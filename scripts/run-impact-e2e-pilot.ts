import { randomUUID } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { parseArgs } from "node:util";
import { closeDb, sql } from "@aihot/backend/db";
import { runImpactForStory } from "@aihot/backend/agents/impact";

// One end-to-end pilot case for the Phase 6 evaluation correction: a real CVE Story flows through
// eligibility, the research-run boundary, the live tool gateway, the TypeScript model gateway, the
// Python normalization graph, and durable impact persistence in a scratch database. Safety
// observations (Story immutability, receipts, idempotent repeats) are collected alongside the result.

const { values } = parseArgs({ options: {
  cve: { type: "string" }, vendor: { type: "string" }, title: { type: "string" },
  token: { type: "string", default: ".data/impact/e2e-token.txt" },
  out: { type: "string", default: ".data/impact/e2e-pilot.json" },
} });
if (!values.cve || !values.vendor || !values.title) throw new Error("--cve --vendor --title are required");
const internalToken = readFileSync(values.token!, "utf8").trim();

const title = values.title!;
const [story] = await sql<{ id: number }[]>`
  INSERT INTO stories (public_id, title, first_report_at, latest_at)
  VALUES (${randomUUID()}, ${title}, now(), now()) RETURNING id`;
const storyId = story!.id;
const before = await sql<{ version: number; digest: string | null; status: string }[]>`
  SELECT version, digest, status FROM stories WHERE id = ${storyId}`;
const beforeRows = await sql<{ n: number }[]>`SELECT count(*)::int AS n FROM product_impacts WHERE story_id = ${storyId}`;

let run: Awaited<ReturnType<typeof runImpactForStory>> | { error: string };
try {
  run = await runImpactForStory(storyId, {
    productImpactEnabled: true,
    modelCallsEnabled: true,
    internalToken,
    baseUrl: "http://127.0.0.1:8000",
  });
} catch (error) {
  run = { error: error instanceof Error ? error.message : String(error) };
}

const repeat = await runImpactForStory(storyId, {
  productImpactEnabled: true,
  modelCallsEnabled: true,
  internalToken: "e2e-not-used-by-orchestrator",
  baseUrl: "http://127.0.0.1:8000",
}).catch((error: unknown) => ({ error: error instanceof Error ? error.message : String(error) }));

const after = await sql<{ version: number; digest: string | null; status: string }[]>`
  SELECT version, digest, status FROM stories WHERE id = ${storyId}`;
const impacts = await sql`
  SELECT sv.canonical_name AS vendor, sp.canonical_name AS product, i.models, i.affected_range,
         i.fixed_range, i.confidence, i.routing, i.persisted_kind, i.exploit_status, i.unknowns,
         i.evidence_ids, i.impact_version, i.run_id
  FROM product_impacts i
  JOIN security_entities sv ON sv.id = i.vendor_entity_id
  JOIN security_entities sp ON sp.id = i.product_entity_id
  WHERE i.story_id = ${storyId} ORDER BY i.id`;
const evidence = await sql<{ source_type: string; canonical_url: string }[]>`
  SELECT source_type, canonical_url FROM external_evidence WHERE story_id = ${storyId} ORDER BY id`;
const runs = await sql<{ public_id: string; status: string }[]>`
  SELECT public_id, status FROM agent_research_runs WHERE story_id = ${storyId} ORDER BY id`;
const reviews = await sql<{ reason: string }[]>`
  SELECT reason FROM impact_human_reviews WHERE story_id = ${storyId} ORDER BY id`;

// Receipts created during this run (model gateway + any paid tool calls) via the research-run linkage.
const receipts = await sql<{ id: number; service: string; model: string | null; status: string }[]>`
  SELECT DISTINCT r.id, r.service, r.model, r.status
  FROM receipts r
  WHERE r.created_at > now() - interval '15 minutes' AND r.service IN ('llm', 'codebuddy')
  ORDER BY r.id`;

const report = {
  case_id: values.cve,
  story_id: storyId,
  cve: values.cve,
  vendor: values.vendor,
  run,
  repeat,
  story_unchanged: JSON.stringify(before[0]) === JSON.stringify(after[0]),
  stories_before: before[0], stories_after: after[0],
  impact_rows_before: beforeRows[0]!.n,
  impacts,
  evidence,
  research_runs: runs,
  human_reviews: reviews,
  receipts,
};
writeFileSync(values.out!, `${JSON.stringify(report, null, 2)}\n`);
process.stdout.write(`${JSON.stringify({
  ok: !("error" in run),
  story_unchanged: report.story_unchanged,
  impacts: impacts.length,
  receipts: receipts.length,
  out: values.out,
})}\n`);
await closeDb();
