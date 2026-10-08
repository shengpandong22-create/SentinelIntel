// Replaces ambiguous same-day PoC pairs with later CISA KEV status changes for the same CVE.
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
  const kev = evidence.find((row) => row.source === "cisa-kev"), disclosure = evidence.find((row) => row.source === "nvd");
  if (!kev || !disclosure || excluded.has(kev.evidenceId) || excluded.has(disclosure.evidenceId)) continue;
  const gap = Date.parse(kev.publishedAt) - Date.parse(disclosure.publishedAt);
  if (gap <= 86_400_000 || gap >= 14 * 86_400_000) continue;
  const view = (row: Evidence, eventKey: string): BenchmarkReport => ({ reportId: row.evidenceId, title: row.title,
    summary: row.summary, sourceName: row.sourceName, firstParty: row.source === "cisa-kev", publishedAt: row.publishedAt,
    ingestedAt: row.publishedAt, frame: null, splitGroupId: `holdout:kev:${cve}`, identity: { eventKey, storyKey: cve } });
  const query = view(kev, `kev:${cve}`), prior = view(disclosure, cve);
  const candidate: BenchmarkCandidate = { ...prior, factTitle: prior.title.slice(0, 200), members: 1, isDistractor: false,
    expectedInRecall: true, gold: { relation: "SAME_STORY" }, annotation: { status: "disputed", labelSource: "model-proposed",
      humanAdjudicated: false, labeller: "pending-three-model-review", confidence: "low", adjudicator: null, reviewers: [],
      sourceUrls: [kev.url, disclosure.url], note: "later CISA KEV exploitation/status addition after the disclosure; pending independent review" } };
  output.push({ caseId: `EVREL-HOLD-poc-vs-disclosure-K${String(output.length + 1).padStart(3, "0")}`, split: "holdout",
    samplingStratum: "poc-vs-disclosure", query, candidates: [candidate],
    construction: { assembledAt: new Date().toISOString(), assembledBy: "scripts/collect-kev-holdout-replacements.ts",
      note: `${cve}: disclosure -> CISA KEV after ${(gap / 86_400_000).toFixed(2)} days` } });
  if (output.length === 3) break;
}
if (output.length !== 3) throw new Error(`expected 3 KEV replacements, got ${output.length}`);
const out = path.resolve(REPO_ROOT, ".data/event-relations/holdout-kev-replacements.jsonl"); mkdirSync(path.dirname(out), { recursive: true });
writeFileSync(out, output.map((row) => JSON.stringify(row)).join("\n") + "\n"); console.log(JSON.stringify({ cases: output.length, out }));
