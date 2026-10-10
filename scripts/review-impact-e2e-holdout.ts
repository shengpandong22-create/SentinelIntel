import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { parseArgs } from "node:util";
import { z } from "zod";
import { REPO_ROOT } from "@aihot/backend/config";
import { closeDb } from "@aihot/backend/db";
import { codeBuddyStructured } from "@aihot/backend/providers/codebuddy";
import { markReceiptsCompleted } from "@aihot/backend/providers/llm";

// Independent review of the Phase 6 end-to-end holdout candidate: real CVEs with expected labels
// anchored on real public evidence. Reviewers judge whether the expected decision, affected products,
// confidence class, and KEV status are supported by the cited public sources and by the reviewer's own
// knowledge of the named CVE. Accept high only when every label is unambiguous.

const { values } = parseArgs({ options: {
  cases: { type: "string", default: "datasets/impact/e2e-holdout-candidate.jsonl" },
  reviewer: { type: "string" }, skip: { type: "string", default: "0" }, n: { type: "string", default: "3" },
  "allow-paid": { type: "boolean", default: false },
  out: { type: "string" },
} });
if (!values["allow-paid"]) throw new Error("e2e holdout review requires explicit --allow-paid");
if (!values.reviewer) throw new Error("--reviewer is required and must identify the actual model");
process.env.LLM_MODEL = values.reviewer;

const allCases = z.array(z.object({
  case_id: z.string(), split: z.string(), stratum: z.string(), cve: z.string(), vendor: z.string(),
  story_title: z.string(),
  expected: z.object({
    decision: z.string(), row_contains: z.array(z.string()), min_rows: z.number(),
    known_exploited: z.string(), confidence: z.string(), unknowns_min: z.number(),
  }).strict(),
  provenance: z.object({
    source_urls: z.array(z.string()), label_method: z.string(), reviewers: z.array(z.string()), note: z.string(),
  }).strict(),
}).strict()).parse(
  readFileSync(path.resolve(REPO_ROOT, values.cases!), "utf8").split(/\r?\n/).filter(Boolean).map((line) => JSON.parse(line)),
);
const skip = Number.parseInt(values.skip!, 10), count = Number.parseInt(values.n!, 10);
const cases = allCases.slice(skip, skip + count);
const ReviewSchema = z.object({ case_id: z.string(), accept: z.boolean(), confidence: z.enum(["high", "medium", "low"]), reason: z.string().min(1).max(2_000) }).strict();
const BatchSchema = z.object({ reviews: z.array(ReviewSchema).length(cases.length) }).strict();
const system = `You independently review expected labels for an end-to-end Product Impact Agent holdout on real CVEs.
Judge whether each expected label is supported by real public evidence for that exact CVE: the vendor advisory, the NVD record, and the CISA KEV catalog.
known_exploited = yes requires the CVE to genuinely be in the KEV catalog. row_contains keywords must match the products the official evidence names.
Absence of public impact detail must stay insufficient_evidence with unknowns. PoC is never claimed. Return strict JSON only.`;
const user = JSON.stringify({
  task: "Review every case independently against real public sources. Do not rewrite labels.",
  output: { reviews: [{ case_id: "exact id", accept: true, confidence: "high|medium|low", reason: "brief source-grounded reason" }] },
  cases: cases.map((row) => ({
    case_id: row.case_id, cve: row.cve, vendor: row.vendor, story_title: row.story_title,
    source_urls: row.provenance.source_urls, expected: row.expected,
  })),
});
try {
  const result = await codeBuddyStructured({
    model: values.reviewer, purpose: "impact-e2e-holdout-review", subject: `phase6:e2e-holdout-review:${values.reviewer}`,
    promptVersion: "impact-e2e-holdout-review-v1",
    system,
    schema: BatchSchema,
    prompt: user, promptInArgument: true, useJsonSchema: true, jsonSchema: z.toJSONSchema(BatchSchema) as Record<string, unknown>,
    timeoutMs: 180_000, attemptTag: "phase6-e2e-holdout-review-v1",
  });
  const ids = new Set(result.data.reviews.map((review) => review.case_id));
  if (ids.size !== cases.length || cases.some((row) => !ids.has(row.case_id))) throw new Error("review returned duplicate or missing case ids");
  const output = { schema_version: 1, reviewer: values.reviewer, provider: "codebuddy", model: result.model, receipt_id: result.receiptId, reviewed_at: new Date().toISOString(), reviews: result.data.reviews };
  const out = path.resolve(REPO_ROOT, values.out ?? `.data/impact/e2e-review-${values.reviewer}-${skip}-${count}.json`);
  mkdirSync(path.dirname(out), { recursive: true });
  writeFileSync(out, `${JSON.stringify(output, null, 2)}\n`);
  await markReceiptsCompleted([result.receiptId]);
  process.stdout.write(`${JSON.stringify({ ok: true, reviewer: values.reviewer, receipt: result.receiptId, accepted_high: result.data.reviews.filter((review) => review.accept && review.confidence === "high").length, out })}\n`);
} finally {
  await closeDb();
}
