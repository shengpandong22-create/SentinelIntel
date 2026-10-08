// Combines the exact replacement deficits after the first three-model holdout pass.
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { REPO_ROOT } from "@aihot/backend/config";
import { parseEventRelationJsonl, type EventRelationCase } from "./event-grouping-eval-core.ts";
const inputs = [
  ".data/event-relations/holdout-strong-roundup-replacements.jsonl",
  ".data/event-relations/holdout-additional-roundup-replacement.jsonl",
  ".data/event-relations/holdout-strong-multi-replacement.jsonl",
  ".data/event-relations/holdout-kev-replacements.jsonl",
  ".data/event-relations/holdout-vendor-confirmation-replacements.jsonl",
  ".data/event-relations/holdout-policy-replacements.jsonl",
  ".data/event-relations/holdout-procurement-replacements.jsonl",
];
const deficits: Record<string, number> = {
  "roundup-containing-one-event": 7, "multiple-cves-in-one-advisory": 1,
  "poc-vs-disclosure": 3, "disclosure-vs-vendor-confirmation": 3,
  "policy-amendment-or-implementation-date": 1, "procurement-correction-or-cancellation": 2,
};
const selected: EventRelationCase[] = [], counts = new Map<string, number>();
for (const row of inputs.flatMap((file) => parseEventRelationJsonl(readFileSync(path.resolve(REPO_ROOT, file), "utf8")))) {
  const quota = deficits[row.samplingStratum] ?? 0, count = counts.get(row.samplingStratum) ?? 0;
  if (count >= quota) continue;
  selected.push(row); counts.set(row.samplingStratum, count + 1);
}
const missing = Object.entries(deficits).filter(([stratum, quota]) => (counts.get(stratum) ?? 0) !== quota);
if (missing.length || selected.length !== 17) throw new Error(`replacement deficits not satisfied: ${JSON.stringify(missing)}`);
const development = parseEventRelationJsonl(readFileSync(path.resolve(REPO_ROOT, "datasets/event-relations/dev.jsonl"), "utf8"));
const devReports = new Set(development.flatMap((row) => [row.query.reportId, ...row.candidates.map((candidate) => candidate.reportId)]));
for (const row of selected) for (const report of [row.query, ...row.candidates]) if (devReports.has(report.reportId)) throw new Error(`${row.caseId}: development leakage ${report.reportId}`);
const out = path.resolve(REPO_ROOT, ".data/event-relations/holdout-replacements.jsonl"); mkdirSync(path.dirname(out), { recursive: true });
writeFileSync(out, selected.map((row) => JSON.stringify(row)).join("\n") + "\n"); console.log(JSON.stringify({ cases: selected.length, counts: Object.fromEntries(counts), out }));
