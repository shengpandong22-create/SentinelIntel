import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { parseArgs } from "node:util";
import { z } from "zod";
import { REPO_ROOT } from "@aihot/backend/config";
import { closeDb } from "@aihot/backend/db";
import { codeBuddyStructured } from "@aihot/backend/providers/codebuddy";
import { chatJson, markReceiptsCompleted } from "@aihot/backend/providers/llm";

// Independent review of the Phase 6 end-to-end holdout candidate: real CVEs with expected labels
// anchored on real public evidence. Reviewers judge whether the expected decision, affected products,
// confidence class, and KEV status are supported by the cited public sources and by the reviewer's own
// knowledge of the named CVE. Accept high only when every label is unambiguous.

const { values } = parseArgs({ options: {
  cases: { type: "string", default: "datasets/impact/e2e-holdout-candidate.jsonl" },
  reviewer: { type: "string" }, provider: { type: "string", default: "codebuddy" },
  skip: { type: "string", default: "0" }, n: { type: "string", default: "3" },
  "allow-paid": { type: "boolean", default: false },
  out: { type: "string" },
} });
if (!values["allow-paid"]) throw new Error("e2e holdout review requires explicit --allow-paid");
if (!values.reviewer) throw new Error("--reviewer is required and must identify the actual model");
if (values.provider === "direct") process.env.LLM_MODEL = values.reviewer;
else process.env.LLM_MODEL = values.reviewer;

const allCases = z.array(z.object({
  case_id: z.string(), split: z.string(), stratum: z.string(), cve: z.string().nullable(), vendor: z.string(),
  story_title: z.string(),
  expected: z.object({
    decisions: z.array(z.string()), row_contains: z.array(z.string()), min_rows: z.number(),
    known_exploited: z.string(), unknowns_min: z.number(), human_reviews_min: z.number().optional(),
    claims_rows_max: z.number().optional(), models_min: z.number().optional(),
    claims_require_versions: z.boolean().optional(), forbidden_strings: z.array(z.string()).optional(),
    rows_or_reviews_min: z.number().optional(),
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
known_exploited = yes requires the CVE to genuinely be in the KEV catalog; a CVE absent from the catalog must expect unknown, never no.
row_contains keywords must match the products the official evidence names. An expected outcome set may legally include both
"propose" (when official evidence names affected products) and "insufficient_evidence with preserved unknowns" (when the
advisory states no product/version detail the pipeline can ground on); reject a label set only if neither allowed outcome
could ever be conservative for that CVE. The decision "skipped_no_cve" is legal only for a Story whose title carries no CVE
identifier; such a case must deterministically skip before any research run. Version semantics (revision 4): a version
expression the deterministic closed-grammar matcher cannot parse (prose ranges, vendor firmware naming, date builds) routes
the draft to human review with an explicit unknown and never persists as an auto claim, so a case whose official evidence
states versions only in such prose must not require current claims rows; matcher-parseable expressions may persist and are
grounding-checked verbatim against the cited evidence. Confidence numbers are deliberately not asserted: routing consistency
(high persists claims, medium routes to human review, low stays unknown) is enforced deterministically elsewhere. PoC is never claimed.
Return strict JSON only.`;
const user = JSON.stringify({
  task: "Review every case independently against real public sources. Do not rewrite labels.",
  output: { reviews: [{ case_id: "exact id", accept: true, confidence: "high|medium|low", reason: "brief source-grounded reason" }] },
  cases: cases.map((row) => ({
    case_id: row.case_id, cve: row.cve, vendor: row.vendor, story_title: row.story_title,
    source_urls: row.provenance.source_urls, expected: row.expected,
  })),
});
// Kimi-family models on the codebuddy channel have repeatedly exceeded 180 s on 3-case batches;
// give them (and any slow reviewer) a wider window.
const timeoutMs = /kimi/i.test(values.reviewer!) ? 600_000 : 180_000;
try {
  const result = values.provider === "direct"
    ? await chatJson({
        model: "default", purpose: "impact-e2e-holdout-review", subject: `phase6:e2e-holdout-review:${values.reviewer}`,
        promptVersion: "impact-e2e-holdout-review-v1", system, schema: BatchSchema,
        user, parse: (content: string) => {
          const start = content.indexOf("{"), end = content.lastIndexOf("}");
          if (start < 0 || end < start) throw new Error("review output contains no JSON object");
          return JSON.parse(content.slice(start, end + 1)) as unknown;
        },
        maxTokens: 4_000, timeoutMs, attemptTag: "phase6-e2e-holdout-review-v1",
      })
    : await codeBuddyStructured({
        model: values.reviewer, purpose: "impact-e2e-holdout-review", subject: `phase6:e2e-holdout-review:${values.reviewer}`,
        promptVersion: "impact-e2e-holdout-review-v1",
        system,
        schema: BatchSchema,
        prompt: user, promptInArgument: true, useJsonSchema: true, jsonSchema: z.toJSONSchema(BatchSchema) as Record<string, unknown>,
        timeoutMs, attemptTag: "phase6-e2e-holdout-review-v1",
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
