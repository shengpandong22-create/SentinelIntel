import { readFileSync, writeFileSync } from "node:fs";
import { parseArgs } from "node:util";
import {
  assessImpactThresholds,
  evaluateImpactCases,
  ImpactResultSchema,
  ImpactThresholdsSchema,
  parseImpactJsonl,
  validateImpactEvalCases,
  ImpactEvalCaseSchema,
} from "./impact-eval-core.ts";

const { values } = parseArgs({ options: {
  cases: { type: "string", default: "datasets/impact/development.jsonl" },
  results: { type: "string" },
  thresholds: { type: "string" },
  out: { type: "string" },
  "validate-only": { type: "boolean", default: false },
  candidate: { type: "boolean", default: false },
  holdout: { type: "boolean", default: false },
} });

const cases = parseImpactJsonl(readFileSync(values.cases!, "utf8"), ImpactEvalCaseSchema);
validateImpactEvalCases(cases, { candidate: values.candidate, holdout: values.holdout });
if (values["validate-only"]) {
  process.stdout.write(`${JSON.stringify({ ok: true, cases: cases.length, validated_only: true })}\n`);
  process.exit(0);
}
if (!values.results) throw new Error("--results is required unless --validate-only");

const results = parseImpactJsonl(readFileSync(values.results!, "utf8"), ImpactResultSchema);
const summary = evaluateImpactCases(cases, results);
let acceptance: { passed: boolean; failures: string[] } | null = null;
if (values.thresholds) {
  const thresholds = ImpactThresholdsSchema.parse(JSON.parse(readFileSync(values.thresholds!, "utf8")));
  acceptance = assessImpactThresholds(summary, thresholds);
}
const report = {
  generated_at: new Date().toISOString(),
  dataset: values.cases,
  result_files: [values.results],
  summary,
  acceptance,
};
const out = values.out ?? ".data/impact/development-report.json";
writeFileSync(out, `${JSON.stringify(report, null, 2)}\n`);
process.stdout.write(`${JSON.stringify({ ok: true, cases: summary.cases, safety: summary.safety, quality: summary.quality, acceptance, out })}\n`);
