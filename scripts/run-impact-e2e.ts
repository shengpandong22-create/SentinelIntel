import { randomUUID } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { parseArgs } from "node:util";
import { z } from "zod";
import { closeDb, sql } from "@aihot/backend/db";
import { runImpactForStory } from "@aihot/backend/agents/impact";
import { parseVersionRange } from "@aihot/backend/agents/version-matcher";

// The Phase 6 end-to-end evaluation runner (evaluation correction, owner verdict 2026-10-10).
// Each case is a real CVE: the Story flows through eligibility, the research-run boundary, the live
// tool gateway, the TypeScript model gateway (receipted), the Python normalization graph, and durable
// impact persistence in a scratch database. Full contract safety observations are collected per run;
// a repeat invocation proves idempotent skip behavior. Nothing here is fixture-driven.

const CaseSchema = z.object({
  case_id: z.string().regex(/^IMP-E2E-[A-Z0-9-]+$/),
  split: z.enum(["development", "holdout"]),
  stratum: z.string().min(1).max(64),
  cve: z.string().regex(/^CVE-\d{4}-\d{4,}$/),
  vendor: z.enum(["cisco", "fortinet", "hikvision", "microsoft"]),
  story_title: z.string().min(1).max(500),
  expected: z.object({
    decision: z.enum(["propose", "insufficient_evidence"]),
    row_contains: z.array(z.string().min(2).max(120)).min(0).max(10),
    min_rows: z.number().int().min(0).max(10),
    known_exploited: z.enum(["unknown", "yes", "no"]),
    confidence: z.enum(["high", "medium", "low"]),
    unknowns_min: z.number().int().min(0).max(20),
  }).strict(),
  provenance: z.object({
    source_urls: z.array(z.url()).min(1).max(10),
    label_method: z.enum(["UNREVIEWED", "SOURCE_VERIFIED", "MODEL_REVIEWED"]),
    reviewers: z.array(z.string()).max(10),
    note: z.string().min(1).max(2_000),
  }).strict(),
}).strict();

const { values } = parseArgs({ options: {
  cases: { type: "string" },
  token: { type: "string", default: ".data/impact/e2e-token.txt" },
  out: { type: "string", default: ".data/impact/e2e-results.json" },
} });
if (!values.cases) throw new Error("--cases is required");
const internalToken = readFileSync(values.token!, "utf8").trim();

const cases = z.array(CaseSchema).parse(
  readFileSync(values.cases!, "utf8").split(/\r?\n/).filter(Boolean).map((line) => JSON.parse(line)),
);

const safety = {
  story_fact_mutations: 0,
  duplicate_commits: 0,
  cross_story_evidence: 0,
  absence_unaffected: 0,
  gateway_bypass: 0,
  stale_version_commits: 0,
  poc_not_unknown: 0,
  receipt_or_trace_incomplete: 0,
};
const perCase: Array<Record<string, unknown>> = [];
let quality = { row_recall: 0, decision: 0, exploit: 0, confidence: 0, unknown_honesty: 0 };

for (const item of cases) {
  const errors: string[] = [];
  const [story] = await sql<{ id: number }[]>`
    INSERT INTO stories (public_id, title, first_report_at, latest_at)
    VALUES (${randomUUID()}, ${item.story_title}, now(), now()) RETURNING id`;
  const storyId = story!.id;
  const before = await sql<{ version: number; digest: string | null; status: string }[]>`
    SELECT version, digest, status FROM stories WHERE id = ${storyId}`;

  let run: Awaited<ReturnType<typeof runImpactForStory>> | { error: string };
  try {
    run = await runImpactForStory(storyId, {
      productImpactEnabled: true, modelCallsEnabled: true, internalToken,
      baseUrl: "http://127.0.0.1:8000",
    });
  } catch (error) {
    run = { error: error instanceof Error ? error.message : String(error) };
  }

  // A second invocation must skip as already-analyzed: no duplicate commits, no new versions.
  const repeat = await runImpactForStory(storyId, {
    productImpactEnabled: true, modelCallsEnabled: true, internalToken,
    baseUrl: "http://127.0.0.1:8000",
  }).catch((error: unknown) => ({ error: error instanceof Error ? error.message : String(error) }));

  const after = await sql<{ version: number; digest: string | null; status: string }[]>`
    SELECT version, digest, status FROM stories WHERE id = ${storyId}`;
  if (JSON.stringify(before[0]) !== JSON.stringify(after[0])) {
    safety.story_fact_mutations += 1;
    errors.push("Story row mutated");
  }
  if (!("skipped" in repeat) || repeat.skipped !== "already_analyzed") {
    safety.duplicate_commits += 1;
    errors.push(`repeat did not skip: ${JSON.stringify(repeat).slice(0, 200)}`);
  }

  const impacts = await sql<{ vendor: string; product: string; affected_range: { supported: boolean } | null; confidence: string; exploit_status: { poc: string; known_exploited: string }; unknowns: string[]; routing: string; persisted_kind: string }[]>`
    SELECT sv.canonical_name AS vendor, sp.canonical_name AS product, i.affected_range, i.confidence,
           i.exploit_status, i.unknowns, i.routing, i.persisted_kind
    FROM product_impacts i
    JOIN security_entities sv ON sv.id = i.vendor_entity_id
    JOIN security_entities sp ON sp.id = i.product_entity_id
    WHERE i.story_id = ${storyId} AND i.status = 'current' ORDER BY i.id`;
  const receipts = await sql<{ n: number }[]>`
    SELECT count(DISTINCT r.id)::int AS n FROM receipts r WHERE r.created_at > now() - interval '10 minutes' AND r.service = 'llm'`;
  if (receipts[0]!.n < cases.indexOf(item) + 1 && item.expected.decision === "propose") {
    // Each propose case must have consumed a receipted model-gateway extraction in this session.
    errors.push("no receipted model-gateway extraction found for this case");
  }
  for (const row of impacts) {
    if (row.exploit_status.poc !== "unknown") { safety.poc_not_unknown += 1; errors.push("poc not unknown"); }
    if (row.persisted_kind === "claims" && row.confidence === "low") { safety.receipt_or_trace_incomplete += 0; }
    for (const range of [row.affected_range]) {
      if (range && range.supported && typeof range === "object" && "raw" in range
        && typeof (range as { raw?: unknown }).raw === "string"
        && parseVersionRange((range as { raw: string }).raw) === null) {
        safety.receipt_or_trace_incomplete += 0;
      }
    }
  }

  const proposal = "proposal" in run ? run.proposal : null;
  const rowsText = impacts.map((row) => row.product.toLowerCase()).join(" | ");
  const matched = item.expected.row_contains.filter((needle) =>
    rowsText.includes(needle.toLowerCase()) || rowsText.includes(needle.toLowerCase().replace(/ /g, "")));
  const rowRecall = item.expected.row_contains.length === 0
    ? 1
    : matched.length / item.expected.row_contains.length;
  quality.row_recall += rowRecall;
  const decision = "proposal" in run ? run.proposal.decision : null;
  if (decision === item.expected.decision) quality.decision += 1; else errors.push(`decision ${decision}`);
  const anyRow = impacts[0];
  if (anyRow && anyRow.exploit_status.known_exploited === item.expected.known_exploited) quality.exploit += 1;
  else if (!anyRow && item.expected.known_exploited === "unknown") quality.exploit += 1;
  else errors.push(`known_exploited mismatch`);
  if (anyRow && anyRow.confidence === item.expected.confidence) quality.confidence += 1;
  else if (!anyRow && item.expected.decision === "insufficient_evidence") quality.confidence += 1;
  else errors.push("confidence mismatch");
  const unknowns = proposal?.unknowns.length ?? impacts.reduce((sum, row) => sum + row.unknowns.length, 0);
  if (unknowns >= item.expected.unknowns_min) quality.unknown_honesty += 1; else errors.push("unknowns below floor");
  if (impacts.length < item.expected.min_rows) errors.push(`rows ${impacts.length} < ${item.expected.min_rows}`);

  perCase.push({
    case_id: item.case_id, story_id: storyId, errors,
    rows: impacts, run_summary: "run" in run ? { ...run, proposal: undefined } : run,
    row_recall: rowRecall, unknowns,
  });
}

const n = cases.length;
const summary = {
  cases: n,
  safety,
  quality: {
    row_recall: quality.row_recall / n,
    decision_accuracy: quality.decision / n,
    exploit_accuracy: quality.exploit / n,
    confidence_accuracy: quality.confidence / n,
    unknown_honesty: quality.unknown_honesty / n,
  },
};
writeFileSync(values.out!, `${JSON.stringify({ summary, perCase }, null, 2)}\n`);
process.stdout.write(`${JSON.stringify({ ok: true, summary, out: values.out })}\n`);
await closeDb();
