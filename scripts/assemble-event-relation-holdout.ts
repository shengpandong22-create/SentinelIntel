// Deterministically combines holdout construction shards and rejects any development leakage before
// paid review. This command does not label or freeze cases.
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { parseArgs } from "node:util";
import { REPO_ROOT } from "@aihot/backend/config";
import { FROZEN_ALLOCATION, parseEventRelationJsonl, type EventRelationCase } from "./event-grouping-eval-core.ts";

const { values } = parseArgs({ options: {
  input: { type: "string", multiple: true }, development: { type: "string", default: "datasets/event-relations/dev.jsonl" },
  out: { type: "string", default: ".data/event-relations/holdout-construction.jsonl" },
} });
if (!values.input?.length) throw new Error("pass holdout construction shards with --input");
const read = (file: string) => parseEventRelationJsonl(readFileSync(path.resolve(REPO_ROOT, file), "utf8"));
const development = read(values.development!);
const developmentReports = new Set(development.flatMap((row) => [row.query.reportId, ...row.candidates.map((candidate) => candidate.reportId)]));
const developmentGroups = new Set(development.flatMap((row) => [row.query.splitGroupId, ...row.candidates.map((candidate) => candidate.splitGroupId)]));
const rows: EventRelationCase[] = values.input.flatMap(read);
const errors: string[] = [];
const caseIds = new Set<string>();
const counts = new Map<string, number>();
for (const row of rows) {
  if (row.split !== "holdout") errors.push(`${row.caseId}: not a holdout case`);
  if (caseIds.has(row.caseId)) errors.push(`${row.caseId}: duplicate caseId`);
  caseIds.add(row.caseId);
  counts.set(row.samplingStratum, (counts.get(row.samplingStratum) ?? 0) + 1);
  for (const report of [row.query, ...row.candidates]) {
    if (developmentReports.has(report.reportId)) errors.push(`${row.caseId}: report ${report.reportId} leaks from development`);
    if (developmentGroups.has(report.splitGroupId)) errors.push(`${row.caseId}: splitGroupId ${report.splitGroupId} leaks from development`);
  }
}
if (rows.length !== 60) errors.push(`expected 60 holdout cases, got ${rows.length}`);
for (const [stratum, allocation] of Object.entries(FROZEN_ALLOCATION)) {
  const actual = counts.get(stratum) ?? 0;
  if (actual !== allocation.holdout) errors.push(`${stratum}: expected ${allocation.holdout}, got ${actual}`);
}
if (errors.length) throw new Error(`holdout construction failed:\n- ${errors.join("\n- ")}`);
const out = path.resolve(REPO_ROOT, values.out!); mkdirSync(path.dirname(out), { recursive: true });
writeFileSync(out, rows.map((row) => JSON.stringify(row)).join("\n") + "\n");
console.log(JSON.stringify({ cases: rows.length, counts: Object.fromEntries([...counts].sort(([a], [b]) => a.localeCompare(b))), out }));
