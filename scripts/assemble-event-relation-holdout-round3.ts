import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { REPO_ROOT } from "@aihot/backend/config";
import { parseEventRelationJsonl } from "./event-grouping-eval-core.ts";
const specs = [
  [".data/event-relations/holdout-roundup-round2.jsonl", "roundup-containing-one-event", 6],
  [".data/event-relations/holdout-kev-round2.jsonl", "poc-vs-disclosure", 3],
  [".data/event-relations/holdout-procurement-strict-replacements.jsonl", "procurement-correction-or-cancellation", 2],
] as const;
const rows = specs.flatMap(([file, stratum, count]) => parseEventRelationJsonl(readFileSync(path.resolve(REPO_ROOT, file), "utf8"))
  .filter((row) => row.samplingStratum === stratum).slice(0, count));
if (rows.length !== 11) throw new Error(`expected 11 round-3 replacements, got ${rows.length}`);
const dev = parseEventRelationJsonl(readFileSync(path.resolve(REPO_ROOT, "datasets/event-relations/dev.jsonl"), "utf8"));
const used = new Set(dev.flatMap((row) => [row.query.reportId, ...row.candidates.map((candidate) => candidate.reportId)]));
for (const row of rows) for (const report of [row.query, ...row.candidates]) if (used.has(report.reportId)) throw new Error(`${row.caseId}: development leakage ${report.reportId}`);
const out = path.resolve(REPO_ROOT, ".data/event-relations/holdout-round3.jsonl"); mkdirSync(path.dirname(out), { recursive: true });
writeFileSync(out, rows.map((row) => JSON.stringify(row)).join("\n") + "\n"); console.log(JSON.stringify({ cases: rows.length, out }));
