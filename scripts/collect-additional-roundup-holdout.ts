// Adds one more contained event from an already selected explicit multi-CVE roundup. Reusing the
// roundup report inside the holdout is intentional; its report projection remains byte-stable.
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { REPO_ROOT } from "@aihot/backend/config";
import { parseEventRelationJsonl, type BenchmarkCandidate, type BenchmarkReport, type EventRelationCase } from "./event-grouping-eval-core.ts";
interface Evidence { evidenceId: string; url: string; cves: string[]; summary: string }
const replacements = parseEventRelationJsonl(readFileSync(path.resolve(REPO_ROOT, ".data/event-relations/holdout-strong-roundup-replacements.jsonl"), "utf8"));
const refs = readFileSync(path.resolve(REPO_ROOT, ".data/event-relations/reference-evidence.jsonl"), "utf8").split(/\r?\n/).filter(Boolean).map((line) => JSON.parse(line) as Evidence);
const refById = new Map(refs.map((row) => [row.evidenceId, row]));
const developmentReports = new Set(parseEventRelationJsonl(readFileSync(path.resolve(REPO_ROOT, "datasets/event-relations/dev.jsonl"), "utf8"))
  .flatMap((row) => [row.query.reportId, ...row.candidates.map((candidate) => candidate.reportId)]));
let result: EventRelationCase | undefined;
for (const row of replacements) {
  const roundup = [row.query, ...row.candidates].find((report) => report.identity.eventKey.startsWith("roundup:"));
  if (!roundup) continue;
  const source = refById.get(roundup.reportId); if (!source) continue;
  const existingCve = [row.query, ...row.candidates].find((report) => !report.identity.eventKey.startsWith("roundup:"))?.identity.eventKey;
  for (const cve of source.cves.filter((value) => value !== existingCve && source.summary.includes(value))) {
    if (developmentReports.has(`NVD:${cve}`) || developmentReports.has(`CVEORG:${cve}`)) continue;
    const response = await fetch(`https://cveawg.mitre.org/api/cve/${cve}`, { signal: AbortSignal.timeout(30_000) });
    if (!response.ok) continue;
    const cveRecord = await response.json() as { cveMetadata?: { datePublished?: string }; containers?: { cna?: { descriptions?: Array<{ lang: string; value: string }> } } };
    const publishedAt = cveRecord.cveMetadata?.datePublished;
    const summary = cveRecord.containers?.cna?.descriptions?.find((item) => item.lang.startsWith("en"))?.value;
    if (!publishedAt || !summary || Math.abs(Date.parse(roundup.ingestedAt) - Date.parse(publishedAt)) >= 14 * 86_400_000) continue;
    const focused: BenchmarkReport = { reportId: `CVEORG:${cve}`, title: `${cve}: ${summary}`.slice(0, 240), summary,
      sourceName: "CVE Program", firstParty: true, publishedAt, ingestedAt: publishedAt, frame: null,
      splitGroupId: roundup.splitGroupId, identity: { eventKey: cve, storyKey: cve } };
    const candidate: BenchmarkCandidate = { ...focused, factTitle: focused.title, members: 1, isDistractor: false,
      expectedInRecall: true, gold: { relation: "ROUNDUP" }, annotation: { status: "disputed", labelSource: "model-proposed",
        humanAdjudicated: false, labeller: "pending-three-model-review", confidence: "low", adjudicator: null, reviewers: [],
        sourceUrls: [source.url, `https://www.cve.org/CVERecord?id=${cve}`],
        note: `the same explicit multi-CVE roundup names this additional contained event ${cve}; pending independent review` } };
    result = { caseId: "EVREL-HOLD-roundup-containing-one-event-R007", split: "holdout",
      samplingStratum: "roundup-containing-one-event", query: roundup, candidates: [candidate],
      construction: { assembledAt: new Date().toISOString(), assembledBy: "scripts/collect-additional-roundup-holdout.ts" } };
    break;
  }
  if (result) break;
}
if (!result) throw new Error("no additional contained event satisfied the holdout constraints");
const out = path.resolve(REPO_ROOT, ".data/event-relations/holdout-additional-roundup-replacement.jsonl"); mkdirSync(path.dirname(out), { recursive: true });
writeFileSync(out, JSON.stringify(result) + "\n"); console.log(JSON.stringify({ cases: 1, out }));
