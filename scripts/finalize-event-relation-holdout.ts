// Deterministic final holdout freeze from decisive three-model-reviewed shards. It never rewrites labels.
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { REPO_ROOT } from "@aihot/backend/config";
import { FROZEN_ALLOCATION, parseEventRelationJsonl, validateEventRelationDataset, type EventRelationCase } from "./event-grouping-eval-core.ts";
const inputs = [
  ".data/event-relations/annotated-holdout-00-29.jsonl",
  ".data/event-relations/annotated-holdout-30-59.jsonl",
  ".data/event-relations/annotated-holdout-replacements.jsonl",
  ".data/event-relations/annotated-holdout-round3.jsonl",
  ".data/event-relations/annotated-holdout-round4.jsonl",
  ".data/event-relations/annotated-holdout-round5.jsonl",
  ".data/event-relations/annotated-holdout-repair.jsonl",
  ".data/event-relations/annotated-holdout-repair-round2.jsonl",
  ".data/event-relations/annotated-holdout-repair-round3.jsonl",
  ".data/event-relations/annotated-holdout-rekeyed-collision.jsonl",
];
const selected: EventRelationCase[] = [], counts = new Map<string, number>(), ids = new Set<string>(), fingerprints = new Map<string, string>();
const reportFingerprint = (report: EventRelationCase["query"]) => JSON.stringify({ reportId: report.reportId, title: report.title,
  summary: report.summary, sourceName: report.sourceName, firstParty: report.firstParty, publishedAt: report.publishedAt,
  ingestedAt: report.ingestedAt, frame: report.frame, splitGroupId: report.splitGroupId, identity: report.identity });
for (const row of inputs.flatMap((file) => parseEventRelationJsonl(readFileSync(path.resolve(REPO_ROOT, file), "utf8")))) {
  const allocation = FROZEN_ALLOCATION[row.samplingStratum as keyof typeof FROZEN_ALLOCATION];
  const count = counts.get(row.samplingStratum) ?? 0;
  if (!allocation || count >= allocation.holdout || ids.has(row.caseId)) continue;
  if (!row.candidates.every((candidate) => candidate.annotation.status === "decisive"
    && candidate.annotation.confidence === "high" && candidate.annotation.reviewers.length >= 3
    && candidate.gold.relation === allocation.relation)) continue;
  const queryTime = Date.parse(row.query.ingestedAt);
  if (row.candidates.some((candidate) => Date.parse(candidate.ingestedAt) > queryTime
    || queryTime - Date.parse(candidate.ingestedAt) >= 14 * 86_400_000)) continue;
  const reports = [row.query, ...row.candidates];
  if (reports.some((report) => fingerprints.has(report.reportId) && fingerprints.get(report.reportId) !== reportFingerprint(report))) continue;
  selected.push(row); ids.add(row.caseId); counts.set(row.samplingStratum, count + 1);
  for (const report of reports) fingerprints.set(report.reportId, reportFingerprint(report));
}
validateEventRelationDataset(selected, { holdout: true });
const development = parseEventRelationJsonl(readFileSync(path.resolve(REPO_ROOT, "datasets/event-relations/dev.jsonl"), "utf8"));
validateEventRelationDataset([...development, ...selected], { frozen: true });
const out = path.resolve(REPO_ROOT, "datasets/event-relations/holdout.jsonl"); mkdirSync(path.dirname(out), { recursive: true });
writeFileSync(out, selected.map((row) => JSON.stringify(row)).join("\n") + "\n");
console.log(JSON.stringify({ cases: selected.length, counts: Object.fromEntries([...counts].sort(([a], [b]) => a.localeCompare(b))), out }));
