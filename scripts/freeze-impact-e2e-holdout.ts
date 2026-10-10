import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { parseArgs } from "node:util";
import { z } from "zod";

const { values } = parseArgs({ options: {
  candidate: { type: "string", default: "datasets/impact/e2e-holdout-candidate.jsonl" },
  reviews: { type: "string" }, out: { type: "string", default: "datasets/impact/e2e-holdout.jsonl" },
  manifest: { type: "string", default: "datasets/impact/e2e-holdout-manifest.json" },
  thresholds: { type: "string", default: "datasets/impact/thresholds-v2.json" },
} });
if (!values.reviews) throw new Error("--reviews is required");
const cases = readFileSync(values.candidate!, "utf8").split(/\r?\n/).filter(Boolean).map((line) => JSON.parse(line));
const ReviewFileSchema = z.object({
  schema_version: z.literal(1), reviewer: z.string().min(1), receipt_id: z.number().int().positive(),
  reviews: z.array(z.object({ case_id: z.string(), accept: z.boolean(), confidence: z.enum(["high", "medium", "low"]), reason: z.string().min(1) }).strict()),
}).passthrough();
const reviewFiles = values.reviews.split(",").map((file) => file.trim()).filter(Boolean)
  .map((file) => ({ file, data: ReviewFileSchema.parse(JSON.parse(readFileSync(path.resolve(file), "utf8"))) }));
const reviewers = [...new Set(reviewFiles.map((item) => item.data.reviewer))];
if (reviewers.length < 3) throw new Error(`e2e holdout freeze requires three distinct reviewers, got ${reviewers.length}`);
const verdicts = new Map<string, Array<{ accept: boolean; confidence: string; reviewer: string; reason: string }>>();
for (const { data } of reviewFiles) {
  for (const review of data.reviews) {
    (verdicts.get(review.case_id) ?? verdicts.set(review.case_id, []).get(case_id_key(review.case_id))!).push(
      { accept: review.accept, confidence: review.confidence, reviewer: data.reviewer, reason: review.reason });
  }
}
function case_id_key(id: string) { return id; }
const frozen = cases
  .filter((row) => {
    const verdict = verdicts.get(row.case_id);
    if (!verdict || verdict.length < 3) throw new Error(`${row.case_id}: incomplete e2e holdout review`);
    return verdict.every((v) => v.accept && v.confidence === "high");
  })
  .map((row) => {
    const verdict = verdicts.get(row.case_id)!;
    return {
      ...row,
      provenance: {
        ...row.provenance, label_method: "MODEL_REVIEWED", reviewers,
        note: `${row.provenance.note} Independent review: ${verdict.map((v) => `${v.reviewer}=high:${v.reason}`).join("; ")}`.slice(0, 4_000),
      },
    };
  });
if (frozen.length < cases.length) {
  process.stdout.write(`${JSON.stringify({ excluded: cases.filter((row) => !frozen.some((item) => item.case_id === row.case_id)).map((row) => row.case_id) })}\n`);
}
const body = `${frozen.map((row) => JSON.stringify(row)).join("\n")}\n`;
mkdirSync(path.dirname(path.resolve(values.out!)), { recursive: true });
writeFileSync(values.out!, body);
const thresholds = readFileSync(values.thresholds!);
const manifest = {
  schema_version: 1, frozen_at: new Date().toISOString(), cases: frozen.length,
  candidate_cases: cases.length, excluded_cases: cases.filter((row) => !frozen.some((item) => item.case_id === row.case_id)).map((row) => row.case_id),
  label_method: "MODEL_REVIEWED", reviewers,
  review_receipts: Object.fromEntries(reviewers.map((reviewer) => [reviewer, reviewFiles.filter((item) => item.data.reviewer === reviewer).map((item) => item.data.receipt_id)])),
  holdout_sha256: createHash("sha256").update(body).digest("hex"),
  thresholds_sha256: createHash("sha256").update(thresholds).digest("hex"),
  limitation: "Model-reviewed benchmark on real public evidence; not human gold. Every frozen case was unanimously accepted at high confidence by three independently identified reviewers. The single authorized run is the complete TypeScript -> Python -> TypeScript -> scratch-database pipeline.",
};
mkdirSync(path.dirname(path.resolve(values.manifest!)), { recursive: true });
writeFileSync(values.manifest!, `${JSON.stringify(manifest, null, 2)}\n`);
process.stdout.write(`${JSON.stringify({ ok: true, cases: frozen.length, reviewers, holdout_sha256: manifest.holdout_sha256, out: values.out })}\n`);
