// Strong same-disclosure replacements using GitHub Security Advisory plus NVD records.
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { REPO_ROOT } from "@aihot/backend/config";
import { parseEventRelationJsonl, type BenchmarkCandidate, type BenchmarkReport, type EventRelationCase } from "./event-grouping-eval-core.ts";
interface Evidence { evidenceId: string; source: string; sourceName: string; url: string; title: string; summary: string; publishedAt: string; cves: string[] }
const rows = readFileSync(path.resolve(REPO_ROOT, ".data/event-relations/evidence-pool.jsonl"), "utf8").split(/\r?\n/).filter(Boolean).map((line) => JSON.parse(line) as Evidence);
const excluded = new Set(["datasets/event-relations/dev.jsonl", ".data/event-relations/holdout-construction.jsonl"]
  .flatMap((file) => parseEventRelationJsonl(readFileSync(path.resolve(REPO_ROOT, file), "utf8")))
  .flatMap((row) => [row.query.reportId, ...row.candidates.map((candidate) => candidate.reportId)]));
const byCve = new Map<string, Evidence[]>(); for (const row of rows) for (const cve of row.cves) (byCve.get(cve) ?? byCve.set(cve, []).get(cve)!).push(row);
const output: EventRelationCase[] = [];
for (const [cve, evidence] of byCve) {
  const advisory = evidence.find((row) => row.source === "github-advisory"), nvd = evidence.find((row) => row.source === "nvd");
  if (!advisory || !nvd || excluded.has(advisory.evidenceId) || excluded.has(nvd.evidenceId)
    || Math.abs(Date.parse(advisory.publishedAt) - Date.parse(nvd.publishedAt)) >= 14 * 86_400_000) continue;
  const identity = { eventKey: cve, storyKey: cve };
  const view = (row: Evidence): BenchmarkReport => ({ reportId: row.evidenceId, title: row.title, summary: row.summary,
    sourceName: row.sourceName, firstParty: row.source === "github-advisory", publishedAt: row.publishedAt,
    ingestedAt: row.publishedAt, frame: null, splitGroupId: `holdout:vendor-confirmation:${cve}`, identity });
  const [queryRow, priorRow] = Date.parse(advisory.publishedAt) >= Date.parse(nvd.publishedAt) ? [advisory, nvd] : [nvd, advisory];
  const query = view(queryRow), prior = view(priorRow);
  const candidate: BenchmarkCandidate = { ...prior, factTitle: prior.title.slice(0, 200), members: 1, isDistractor: false,
    expectedInRecall: true, gold: { relation: "SAME_OCCURRENCE" }, annotation: { status: "disputed", labelSource: "model-proposed",
      humanAdjudicated: false, labeller: "pending-three-model-review", confidence: "low", adjudicator: null, reviewers: [],
      sourceUrls: [queryRow.url, priorRow.url], note: "GitHub Security Advisory and NVD report the same CVE disclosure; pending independent review" } };
  output.push({ caseId: `EVREL-HOLD-disclosure-vs-vendor-confirmation-G${String(output.length + 1).padStart(3, "0")}`,
    split: "holdout", samplingStratum: "disclosure-vs-vendor-confirmation", query, candidates: [candidate],
    construction: { assembledAt: new Date().toISOString(), assembledBy: "scripts/collect-vendor-confirmation-holdout-replacements.ts" } });
  if (output.length === 3) break;
}
if (output.length !== 3) throw new Error(`expected 3 replacements, got ${output.length}`);
const out = path.resolve(REPO_ROOT, ".data/event-relations/holdout-vendor-confirmation-replacements.jsonl"); mkdirSync(path.dirname(out), { recursive: true });
writeFileSync(out, output.map((row) => JSON.stringify(row)).join("\n") + "\n"); console.log(JSON.stringify({ cases: output.length, out }));
