// Six ROUNDUP cases from two evidence-rich reports whose bodies explicitly enumerate every paired CVE.
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { REPO_ROOT } from "@aihot/backend/config";
import type { BenchmarkCandidate, BenchmarkReport, EventRelationCase } from "./event-grouping-eval-core.ts";
interface Evidence { evidenceId: string; sourceName: string; url: string; title: string; summary: string; publishedAt: string; cves: string[] }
const refs = readFileSync(path.resolve(REPO_ROOT, ".data/event-relations/reference-evidence.jsonl"), "utf8").split(/\r?\n/).filter(Boolean).map((line) => JSON.parse(line) as Evidence);
const specs = [
  { url: "https://www.tenable.com/security/tns-2026-22", cves: ["CVE-2026-19639", "CVE-2026-19682", "CVE-2026-19681", "CVE-2026-19680"] },
  { url: "https://blog.spiizn.xyz/articles/remote-code-execution-turning-a-ticket-into-a-new-issue/", cves: ["CVE-2026-102373", "CVE-2026-102374"] },
];
const output: EventRelationCase[] = [];
for (const spec of specs) {
  const source = refs.find((row) => row.url === spec.url); if (!source?.publishedAt) throw new Error(`missing roundup evidence ${spec.url}`);
  const group = `holdout:explicit-roundup:${source.evidenceId}`;
  const roundup: BenchmarkReport = { reportId: source.evidenceId, title: source.title, summary: source.summary,
    sourceName: source.sourceName, firstParty: true, publishedAt: source.publishedAt, ingestedAt: source.publishedAt,
    frame: null, splitGroupId: group, identity: { eventKey: `roundup:${source.evidenceId}`, storyKey: `roundup:${source.evidenceId}` } };
  for (const cve of spec.cves) {
    if (!source.summary.includes(cve)) throw new Error(`${source.url} does not explicitly name ${cve}`);
    const response = await fetch(`https://cveawg.mitre.org/api/cve/${cve}`, { signal: AbortSignal.timeout(30_000) });
    if (!response.ok) throw new Error(`${cve}: CVE API HTTP ${response.status}`);
    const record = await response.json() as { cveMetadata?: { datePublished?: string }; containers?: { cna?: { descriptions?: Array<{ lang: string; value: string }> } } };
    const publishedAt = record.cveMetadata?.datePublished, summary = record.containers?.cna?.descriptions?.find((row) => row.lang.startsWith("en"))?.value;
    if (!publishedAt || !summary || Math.abs(Date.parse(source.publishedAt) - Date.parse(publishedAt)) >= 14 * 86_400_000) throw new Error(`${cve}: invalid focused evidence`);
    const focused: BenchmarkReport = { reportId: `CVEORG:${cve}`, title: `${cve}: ${summary}`.slice(0, 240), summary,
      sourceName: "CVE Program", firstParty: true, publishedAt, ingestedAt: publishedAt, frame: null,
      splitGroupId: group, identity: { eventKey: cve, storyKey: cve } };
    const candidate: BenchmarkCandidate = { ...focused, factTitle: focused.title, members: 1, isDistractor: false,
      expectedInRecall: true, gold: { relation: "ROUNDUP" }, annotation: { status: "disputed", labelSource: "model-proposed",
        humanAdjudicated: false, labeller: "pending-three-model-review", confidence: "low", adjudicator: null, reviewers: [],
        sourceUrls: [source.url, `https://www.cve.org/CVERecord?id=${cve}`],
        note: `${source.title} explicitly enumerates ${cve} among multiple distinct CVEs; pending independent review` } };
    output.push({ caseId: `EVREL-HOLD-roundup-containing-one-event-X${String(output.length + 1).padStart(3, "0")}`,
      split: "holdout", samplingStratum: "roundup-containing-one-event", query: roundup, candidates: [candidate],
      construction: { assembledAt: new Date().toISOString(), assembledBy: "scripts/collect-explicit-roundup-holdout-round2.ts" } });
  }
}
const out = path.resolve(REPO_ROOT, ".data/event-relations/holdout-roundup-round2.jsonl"); mkdirSync(path.dirname(out), { recursive: true });
writeFileSync(out, output.map((row) => JSON.stringify(row)).join("\n") + "\n"); console.log(JSON.stringify({ cases: output.length, out }));
