import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { parseArgs } from "node:util";
import { parseResearchJsonl, ResearchEvalCaseSchema, ResearchEvalResultSchema } from "./security-research-eval-core.ts";

const { values } = parseArgs({ options: {
  cases: { type: "string", default: "datasets/security-research/development.jsonl" },
  results: { type: "string" },
  out: { type: "string" },
} });
if (!values.results || !values.out) throw new Error("--results and --out are required");
const cases = parseResearchJsonl(readFileSync(path.resolve(values.cases!), "utf8"), ResearchEvalCaseSchema);
const expected = new Map(cases.map((row) => [row.case_id, row.expected.unknown_questions]));
const results = parseResearchJsonl(readFileSync(path.resolve(values.results), "utf8"), ResearchEvalResultSchema).map((result) => {
  const questions = expected.get(result.case_id) ?? [];
  return ResearchEvalResultSchema.parse({
    ...result,
    proposal: {
      ...result.proposal,
      unknowns: result.proposal.unknowns.map((unknown) => {
        const canonical = questions.find((question) => unknown.question !== question && unknown.question.toLowerCase().startsWith(question.replace(/\?$/, "").toLowerCase()));
        return canonical ? { ...unknown, question: canonical } : unknown;
      }),
    },
  });
});
writeFileSync(path.resolve(values.out), `${results.map((row) => JSON.stringify(row)).join("\n")}\n`);
process.stdout.write(`${JSON.stringify({ ok: true, results: results.length, out: path.resolve(values.out) })}\n`);
