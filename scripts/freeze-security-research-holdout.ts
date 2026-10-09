import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { parseArgs } from "node:util";
import { z } from "zod";
import { parseResearchJsonl, ResearchEvalCaseSchema, validateResearchCases } from "./security-research-eval-core.ts";

const { values } = parseArgs({ options: {
  candidate: { type: "string", default: ".data/security-research/holdout-candidate.jsonl" },
  reviews: { type: "string" },
  out: { type: "string", default: "datasets/security-research/holdout.jsonl" },
  manifest: { type: "string", default: "datasets/security-research/holdout-manifest.json" },
  thresholds: { type: "string", default: "datasets/security-research/thresholds.json" },
} });
if (!values.reviews) throw new Error("--reviews is required");
const cases = parseResearchJsonl(readFileSync(path.resolve(values.candidate!), "utf8"), ResearchEvalCaseSchema);
const ReviewFileSchema = z.object({
  schema_version: z.literal(1), reviewer: z.string().min(1), receipt_id: z.number().int().positive(),
  reviews: z.array(z.object({ case_id: z.string(), accept: z.boolean(), confidence: z.enum(["high", "medium", "low"]), reason: z.string().min(1) }).strict()),
}).passthrough();
const reviewPaths = values.reviews.split(",").map((item) => item.trim()).filter(Boolean);
const reviewFiles = reviewPaths.map((file) => ({ file, data: ReviewFileSchema.parse(JSON.parse(readFileSync(path.resolve(file), "utf8"))) }));
const reviewers = [...new Set(reviewFiles.map((item) => item.data.reviewer))];
if (reviewers.length < 3) throw new Error(`holdout freeze requires three distinct reviewers, got ${reviewers.length}`);
const byReviewer = new Map<string, Map<string, z.infer<typeof ReviewFileSchema>["reviews"][number]>>();
for (const { data } of reviewFiles) {
  const map = byReviewer.get(data.reviewer) ?? new Map();
  for (const review of data.reviews) {
    if (map.has(review.case_id)) throw new Error(`${data.reviewer}: duplicate review for ${review.case_id}`);
    map.set(review.case_id, review);
  }
  byReviewer.set(data.reviewer, map);
}
for (const [reviewer, reviews] of byReviewer) {
  if (reviews.size !== cases.length || cases.some((row) => !reviews.has(row.case_id))) throw new Error(`${reviewer}: incomplete holdout review`);
}
const frozen = cases.map((row) => {
  const decisions = reviewers.map((reviewer) => byReviewer.get(reviewer)!.get(row.case_id)!);
  if (decisions.some((review) => !review.accept)) throw new Error(`${row.case_id}: not unanimously accepted`);
  const reviewNote = decisions.map((review, index) => `${reviewers[index]}=${review.confidence}:${review.reason}`).join("; ");
  return ResearchEvalCaseSchema.parse({
    ...row,
    provenance: {
      ...row.provenance,
      label_method: "MODEL_REVIEWED",
      reviewers,
      note: `${row.provenance.note} Independent review: ${reviewNote}`.slice(0, 2_000),
    },
  });
});
validateResearchCases(frozen, { holdout: true });
const body = `${frozen.map((row) => JSON.stringify(row)).join("\n")}\n`;
const out = path.resolve(values.out!);
mkdirSync(path.dirname(out), { recursive: true });
writeFileSync(out, body);
const thresholdsPath = path.resolve(values.thresholds!);
const manifest = {
  schema_version: 1,
  frozen_at: new Date().toISOString(),
  cases: frozen.length,
  strata: Object.fromEntries([...new Set(frozen.map((row) => row.stratum))].map((stratum) => [stratum, frozen.filter((row) => row.stratum === stratum).length])),
  label_method: "MODEL_REVIEWED",
  reviewers,
  review_receipts: Object.fromEntries(reviewers.map((reviewer) => [reviewer, reviewFiles.filter((item) => item.data.reviewer === reviewer).map((item) => item.data.receipt_id)])),
  holdout_sha256: createHash("sha256").update(body).digest("hex"),
  thresholds_sha256: createHash("sha256").update(readFileSync(thresholdsPath)).digest("hex"),
  limitation: reviewFiles.every((file) => file.data.reviews.every((review) => review.confidence === "high"))
    ? "Model-reviewed benchmark; not human gold. All cases were unanimously accepted at high confidence."
    : "Model-reviewed benchmark; not human gold. All cases were unanimously accepted, but confidence was not uniformly high.",
};
writeFileSync(path.resolve(values.manifest!), `${JSON.stringify(manifest, null, 2)}\n`);
process.stdout.write(`${JSON.stringify({ ok: true, cases: frozen.length, reviewers, holdout_sha256: manifest.holdout_sha256, out })}\n`);
