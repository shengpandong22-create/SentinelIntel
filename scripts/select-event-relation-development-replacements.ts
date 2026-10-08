// Selects evidence-backed replacement candidates for non-decisive development rows. It never changes
// a label: replacements still pass through the independent annotation command before freeze.
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { parseArgs } from "node:util";
import { REPO_ROOT } from "@aihot/backend/config";
import { FROZEN_ALLOCATION, parseEventRelationJsonl, type EventRelationCase } from "./event-grouping-eval-core.ts";

const { values } = parseArgs({ options: {
  annotated: { type: "string" }, input: { type: "string", multiple: true },
  exclude: { type: "string", multiple: true }, satisfied: { type: "string", multiple: true },
  out: { type: "string", default: ".data/event-relations/development-replacements.jsonl" },
} });
if (!values.annotated || !values.input?.length) throw new Error("pass --annotated and one or more --input construction files");
const read = (file: string) => parseEventRelationJsonl(readFileSync(path.resolve(REPO_ROOT, file), "utf8"));
const annotated = read(values.annotated);
const usedCaseIds = new Set(annotated.map((row) => row.caseId));
for (const row of (values.exclude ?? []).flatMap(read)) usedCaseIds.add(row.caseId);
const needs = new Map<string, number>();
for (const row of annotated) if (row.candidates.some((candidate) => candidate.annotation.status !== "decisive"
  || candidate.gold.relation !== FROZEN_ALLOCATION[row.samplingStratum as keyof typeof FROZEN_ALLOCATION]?.relation))
  needs.set(row.samplingStratum, (needs.get(row.samplingStratum) ?? 0) + 1);
for (const row of (values.satisfied ?? []).flatMap(read)) {
  usedCaseIds.add(row.caseId);
  const intended = FROZEN_ALLOCATION[row.samplingStratum as keyof typeof FROZEN_ALLOCATION]?.relation;
  if (row.candidates.every((candidate) => candidate.annotation.status === "decisive" && candidate.gold.relation === intended))
    needs.set(row.samplingStratum, Math.max(0, (needs.get(row.samplingStratum) ?? 0) - 1));
}

const selected: EventRelationCase[] = [];
for (const row of values.input.flatMap(read)) {
  const remaining = needs.get(row.samplingStratum) ?? 0;
  if (!remaining || usedCaseIds.has(row.caseId)) continue;
  selected.push(row);
  needs.set(row.samplingStratum, remaining - 1);
}
const missing = [...needs].filter(([, count]) => count > 0);
if (missing.length) throw new Error(`insufficient replacements: ${missing.map(([stratum, count]) => `${stratum}=${count}`).join(", ")}`);
const outPath = path.resolve(REPO_ROOT, values.out!);
mkdirSync(path.dirname(outPath), { recursive: true });
writeFileSync(outPath, selected.map((row) => JSON.stringify(row)).join("\n") + (selected.length ? "\n" : ""));
console.log(JSON.stringify({ replacements: selected.length,
  counts: Object.fromEntries([...new Set(selected.map((row) => row.samplingStratum))].map((stratum) => [stratum, selected.filter((row) => row.samplingStratum === stratum).length])), out: outPath }));
