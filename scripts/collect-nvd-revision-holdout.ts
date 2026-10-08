// Holdout-only advisory revision evidence from NVD's official CVE Change History API.
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { parseArgs } from "node:util";
import { REPO_ROOT } from "@aihot/backend/config";
import type { BenchmarkCandidate, BenchmarkReport, EventRelationCase } from "./event-grouping-eval-core.ts";

interface Detail { action: string; type: string; oldValue?: string; newValue?: string }
interface Change { change: { cveId: string; eventName: string; cveChangeId: string; sourceIdentifier: string; created: string; details: Detail[] } }
const { values } = parseArgs({ options: { out: { type: "string", default: ".data/event-relations/holdout-revision-construction.jsonl" } } });
const cves = ["CVE-2024-3094", "CVE-2021-44228", "CVE-2023-4863"];
const rows: EventRelationCase[] = [];
for (const cve of cves) {
  const endpoint = `https://services.nvd.nist.gov/rest/json/cvehistory/2.0?cveId=${cve}`;
  const response = await fetch(endpoint, { headers: { accept: "application/json", "user-agent": "SentinelIntel-Phase2-evaluation" }, signal: AbortSignal.timeout(30_000) });
  if (!response.ok) throw new Error(`${endpoint}: HTTP ${response.status}`);
  const changes = ((await response.json()) as { cveChanges: Change[] }).cveChanges.map((row) => row.change)
    .filter((change) => change.details.length && /modified|received|analysis/i.test(change.eventName))
    .sort((a, b) => Date.parse(a.created) - Date.parse(b.created));
  let pair: [typeof changes[number], typeof changes[number]] | undefined;
  for (let i = 0; i < changes.length; i++) for (let j = i + 1; j < changes.length; j++) {
    const gap = Date.parse(changes[j]!.created) - Date.parse(changes[i]!.created);
    if (gap > 0 && gap < 14 * 86_400_000) { pair = [changes[i]!, changes[j]!]; break; }
  }
  if (!pair) throw new Error(`${cve}: no content-bearing revisions inside the recall window`);
  const view = (change: typeof changes[number]): BenchmarkReport => ({
    reportId: `NVD-REV:${cve}:${change.cveChangeId}`, title: `${cve}: ${change.eventName}`,
    summary: change.details.map((detail) => `${detail.action} ${detail.type}: ${detail.newValue ?? detail.oldValue ?? ""}`).join("\n").slice(0, 4000),
    sourceName: "NIST National Vulnerability Database", firstParty: true,
    publishedAt: `${change.created}Z`, ingestedAt: `${change.created}Z`, frame: null,
    splitGroupId: `holdout:advisory-revision:${cve}`,
    identity: { eventKey: `nvd-revision:${change.cveChangeId}`, storyKey: `nvd-advisory:${cve}` },
  });
  const prior = view(pair[0]), query = view(pair[1]);
  const candidate: BenchmarkCandidate = { ...prior, factTitle: prior.title, members: 1, isDistractor: false,
    expectedInRecall: true, gold: { relation: "SAME_STORY" }, annotation: { status: "disputed",
      labelSource: "model-proposed", humanAdjudicated: false, labeller: "pending-three-model-review",
      confidence: "low", adjudicator: null, reviewers: [], sourceUrls: [
        `${endpoint}#${pair[1].cveChangeId}`, `${endpoint}#${pair[0].cveChangeId}`,
      ], note: "two content-bearing revisions from NVD CVE Change History; pending independent review" } };
  rows.push({ caseId: `EVREL-HOLD-advisory-revision-vs-republication-${String(rows.length + 1).padStart(3, "0")}`,
    split: "holdout", samplingStratum: "advisory-revision-vs-republication", query, candidates: [candidate],
    construction: { assembledAt: new Date().toISOString(), assembledBy: "scripts/collect-nvd-revision-holdout.ts",
      note: `${cve} NVD revision ${pair[0].cveChangeId} -> ${pair[1].cveChangeId}` } });
  await new Promise((resolve) => setTimeout(resolve, 1_000));
}
const out = path.resolve(REPO_ROOT, values.out!); mkdirSync(path.dirname(out), { recursive: true });
writeFileSync(out, rows.map((row) => JSON.stringify(row)).join("\n") + "\n");
console.log(JSON.stringify({ cases: rows.length, out }));
