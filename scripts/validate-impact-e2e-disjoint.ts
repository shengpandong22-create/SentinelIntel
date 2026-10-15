import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { parseArgs } from "node:util";
import { pathToFileURL } from "node:url";
import { z } from "zod";
import { REPO_ROOT } from "@aihot/backend/config";
import { ImpactE2ECaseSchema } from "./run-impact-e2e.ts";

const CVE = /CVE-\d{4}-\d{4,}/gi;

export function disjointnessErrors(candidate: z.infer<typeof ImpactE2ECaseSchema>[], prior: Array<{ file: string; text: string }>): string[] {
  const errors: string[] = [];
  const seen = new Set<string>();
  for (const row of candidate) {
    if (row.cve === null) continue;
    if (seen.has(row.cve)) errors.push(`${row.case_id}: duplicate candidate CVE ${row.cve}`);
    seen.add(row.cve);
    for (const item of prior) {
      const priorCves = new Set(item.text.match(CVE)?.map((value) => value.toUpperCase()) ?? []);
      if (priorCves.has(row.cve)) errors.push(`${row.case_id}: ${row.cve} already appears in ${item.file}`);
    }
  }
  return errors;
}

export function main(argv: string[] = process.argv.slice(2)): void {
  const { values } = parseArgs({ argv, options: { candidate: { type: "string" } } });
  if (!values.candidate) throw new Error("--candidate is required");
  const candidatePath = path.resolve(REPO_ROOT, values.candidate);
  const candidate = z.array(ImpactE2ECaseSchema).parse(
    readFileSync(candidatePath, "utf8").split(/\r?\n/).filter(Boolean).map((line) => JSON.parse(line)),
  );
  const datasetDir = path.resolve(REPO_ROOT, "datasets/impact");
  const prior = readdirSync(datasetDir)
    .filter((name) => name.endsWith(".jsonl"))
    .map((name) => path.join(datasetDir, name))
    .filter((file) => file !== candidatePath && !file.includes("-evidence"))
    .map((file) => ({ file: path.relative(REPO_ROOT, file), text: readFileSync(file, "utf8") }));
  const errors = disjointnessErrors(candidate, prior);
  if (errors.length > 0) throw new Error(`holdout disjointness failed:\n${errors.join("\n")}`);
  process.stdout.write(`${JSON.stringify({ ok: true, cases: candidate.length, prior_files: prior.length })}\n`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main();
