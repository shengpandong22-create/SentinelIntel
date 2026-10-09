import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { parseArgs } from "node:util";
import {
  evaluateResearchVariant,
  parseResearchJsonl,
  ResearchEvalCaseSchema,
  ResearchEvalResultSchema,
  validateResearchCases,
} from "./security-research-eval-core.ts";

const { values } = parseArgs({ options: {
  cases: { type: "string", default: "datasets/security-research/development.jsonl" },
  results: { type: "string" },
  out: { type: "string" },
  pilot: { type: "boolean", default: false },
  "validate-only": { type: "boolean", default: false },
} });
const allCases = parseResearchJsonl(readFileSync(path.resolve(values.cases!), "utf8"), ResearchEvalCaseSchema);
const cases = values.pilot
  ? [...new Set(allCases.map((row) => row.stratum))].map((stratum) => allCases.find((row) => row.stratum === stratum)!)
  : allCases;
validateResearchCases(cases, { pilot: values.pilot });
if (values["validate-only"]) {
  process.stdout.write(`${JSON.stringify({ ok: true, cases: cases.length, strata: new Set(cases.map((row) => row.stratum)).size })}\n`);
  process.exit(0);
}
if (!values.results) throw new Error("--results is required; the harness never fabricates model or tool output");
const resultPaths = values.results.split(",").map((item) => item.trim()).filter(Boolean);
const results = resultPaths.flatMap((file) => parseResearchJsonl(readFileSync(path.resolve(file), "utf8"), ResearchEvalResultSchema));
const report = {
  schema_version: 1,
  generated_at: new Date().toISOString(),
  dataset: values.cases,
  result_files: resultPaths,
  variants: [evaluateResearchVariant(cases, results, "B0"), evaluateResearchVariant(cases, results, "B1")],
};
const output = `${JSON.stringify(report, null, 2)}\n`;
if (values.out) writeFileSync(path.resolve(values.out), output);
else process.stdout.write(output);
