import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { parseArgs } from "node:util";
import {
  evaluateTracking,
  parseTrackingJsonl,
  TrackingEvalCaseSchema,
  TrackingEvalResultSchema,
  validateTrackingCases,
} from "./event-tracking-eval-core.ts";

const { values } = parseArgs({ options: {
  cases: { type: "string", default: "datasets/event-tracking/development.jsonl" },
  results: { type: "string" },
  out: { type: "string" },
  pilot: { type: "boolean", default: false },
  "validate-only": { type: "boolean", default: false },
} });
const cases = parseTrackingJsonl(readFileSync(path.resolve(values.cases!), "utf8"), TrackingEvalCaseSchema);
validateTrackingCases(cases, { pilot: values.pilot, holdout: cases.every((row) => row.split === "holdout") });
if (values["validate-only"]) {
  process.stdout.write(`${JSON.stringify({ ok: true, cases: cases.length, strata: new Set(cases.map((row) => row.stratum)).size })}\n`);
  process.exit(0);
}
if (!values.results) throw new Error("--results is required; the harness never fabricates tracking output");
const resultPaths = values.results.split(",").map((item) => item.trim()).filter(Boolean);
const results = resultPaths.flatMap((file) => parseTrackingJsonl(readFileSync(path.resolve(file), "utf8"), TrackingEvalResultSchema));
const output = `${JSON.stringify({
  generated_at: new Date().toISOString(),
  dataset: values.cases,
  result_files: resultPaths,
  summary: evaluateTracking(cases, results),
}, null, 2)}\n`;
if (values.out) writeFileSync(path.resolve(values.out), output);
else process.stdout.write(output);
