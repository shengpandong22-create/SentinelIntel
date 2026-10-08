// Free, deterministic development-set freeze. This command selects only independently reviewed,
// decisive rows that agree with the owner-approved stratum contract; it never rewrites a label.
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { parseArgs } from "node:util";
import { REPO_ROOT } from "@aihot/backend/config";
import {
  FROZEN_ALLOCATION,
  parseEventRelationJsonl,
  validateEventRelationDataset,
  type EventRelationCase,
} from "./event-grouping-eval-core.ts";

const { values } = parseArgs({ options: {
  input: { type: "string", multiple: true },
  out: { type: "string", default: "datasets/event-relations/dev.jsonl" },
  rejected: { type: "string", default: ".data/event-relations/rejected-development.jsonl" },
} });
if (!values.input?.length) throw new Error("pass one or more independently annotated --input JSONL files");

const rows = values.input.flatMap((file) => parseEventRelationJsonl(
  readFileSync(path.resolve(REPO_ROOT, file), "utf8"),
));
const selected: EventRelationCase[] = [];
const rejected: EventRelationCase[] = [];
const selectedCaseIds = new Set<string>();
const counts = new Map<string, number>();

for (const row of rows) {
  const allocation = FROZEN_ALLOCATION[row.samplingStratum as keyof typeof FROZEN_ALLOCATION];
  const accepted = row.split === "development"
    && Boolean(allocation)
    && row.candidates.every((candidate) => candidate.annotation.status === "decisive"
      && candidate.gold.relation === allocation.relation)
    && !selectedCaseIds.has(row.caseId)
    && (counts.get(row.samplingStratum) ?? 0) < allocation.development;
  if (!accepted) { rejected.push(row); continue; }
  // These two strata were constructed before the owner-approved pre-freeze contract correction.
  // Preserve the independently reviewed relation label and migrate only its derived identity metadata.
  let frozenRow: EventRelationCase = (row.samplingStratum === "disclosure-vs-vendor-confirmation"
      || row.samplingStratum === "same-cve-multi-vendor-product")
    ? { ...row, candidates: row.candidates.map((candidate) => ({ ...candidate,
        identity: { ...row.query.identity }, splitGroupId: row.query.splitGroupId })) }
    : row;
  // Multi-CVE replacements enrich an NVD record with the particular shared advisory used as
  // pair evidence. The same CVE can therefore occur in several distinct evidence records; give
  // those records a context-qualified ID instead of falsely claiming one stable report object.
  if (row.samplingStratum === "multiple-cves-in-one-advisory") {
    const qualify = <T extends { reportId: string; splitGroupId: string }>(report: T): T => ({
      ...report, reportId: `${report.reportId}@${report.splitGroupId}`,
    });
    frozenRow = { ...frozenRow, query: qualify(frozenRow.query),
      candidates: frozenRow.candidates.map(qualify) };
  }
  selected.push(frozenRow);
  selectedCaseIds.add(row.caseId);
  counts.set(row.samplingStratum, (counts.get(row.samplingStratum) ?? 0) + 1);
}

validateEventRelationDataset(selected, { development: true });
const outPath = path.resolve(REPO_ROOT, values.out!);
const rejectedPath = path.resolve(REPO_ROOT, values.rejected!);
mkdirSync(path.dirname(outPath), { recursive: true });
mkdirSync(path.dirname(rejectedPath), { recursive: true });
writeFileSync(outPath, selected.map((row) => JSON.stringify(row)).join("\n") + "\n");
writeFileSync(rejectedPath, rejected.map((row) => JSON.stringify(row)).join("\n") + (rejected.length ? "\n" : ""));
console.log(JSON.stringify({ cases: selected.length, rejected: rejected.length,
  counts: Object.fromEntries([...counts].sort(([a], [b]) => a.localeCompare(b))), out: outPath, rejectedOut: rejectedPath }));
