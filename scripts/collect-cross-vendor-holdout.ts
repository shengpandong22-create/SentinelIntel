// Constructs three holdout-only cross-vendor cases from the official Ubuntu Security and
// Red Hat Product Security APIs. Labels remain pending until three-model review.
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { parseArgs } from "node:util";
import { REPO_ROOT } from "@aihot/backend/config";
import type { BenchmarkCandidate, BenchmarkReport, EventRelationCase } from "./event-grouping-eval-core.ts";

interface UbuntuCve { id: string; description: string; published: string; notices: Array<{
  id: string; title: string; summary: string; description: string; published: string; cves_ids: string[];
}> }
interface RedHatCve { public_date: string; details: string[]; bugzilla?: { description?: string; url?: string } }
const { values } = parseArgs({ options: { out: { type: "string", default: ".data/event-relations/holdout-cross-vendor-construction.jsonl" } } });
const cves = ["CVE-2021-44228", "CVE-2021-45046", "CVE-2021-45105"];
async function json<T>(url: string): Promise<T> {
  const response = await fetch(url, { headers: { accept: "application/json", "user-agent": "SentinelIntel-Phase2-evaluation" }, signal: AbortSignal.timeout(30_000) });
  if (!response.ok) throw new Error(`${url}: HTTP ${response.status}`);
  return response.json() as Promise<T>;
}
const rows: EventRelationCase[] = [];
for (const cve of cves) {
  const [ubuntu, redHat] = await Promise.all([
    json<UbuntuCve>(`https://ubuntu.com/security/cves/${cve}.json`),
    json<RedHatCve>(`https://access.redhat.com/hydra/rest/securitydata/cve/${cve}.json`),
  ]);
  const notice = ubuntu.notices.find((item) => item.cves_ids.includes(cve));
  if (!notice || !redHat.public_date || Math.abs(Date.parse(notice.published) - Date.parse(redHat.public_date)) >= 14 * 86_400_000) {
    throw new Error(`${cve}: official vendor reports are missing or outside the recall window`);
  }
  const identity = { eventKey: cve, storyKey: cve };
  const ubuntuReport: BenchmarkReport = { reportId: `UBUNTU:${notice.id}:${cve}`, title: notice.title,
    summary: `${notice.summary}\n${notice.description}`.slice(0, 4000), sourceName: "Ubuntu Security",
    firstParty: true, publishedAt: notice.published, ingestedAt: notice.published, frame: null,
    splitGroupId: `holdout:${cve}`, identity };
  const redHatReport: BenchmarkReport = { reportId: `REDHAT:${cve}`, title: redHat.bugzilla?.description ?? cve,
    summary: redHat.details[0] ?? cve, sourceName: "Red Hat Product Security", firstParty: true,
    publishedAt: redHat.public_date, ingestedAt: redHat.public_date, frame: null,
    splitGroupId: `holdout:${cve}`, identity };
  const [query, prior] = Date.parse(ubuntuReport.ingestedAt) >= Date.parse(redHatReport.ingestedAt)
    ? [ubuntuReport, redHatReport] : [redHatReport, ubuntuReport];
  const candidate: BenchmarkCandidate = { ...prior, factTitle: prior.title.slice(0, 200), members: 1,
    isDistractor: false, expectedInRecall: true, gold: { relation: "SAME_OCCURRENCE" }, annotation: {
      status: "disputed", labelSource: "model-proposed", humanAdjudicated: false,
      labeller: "pending-three-model-review", confidence: "low", adjudicator: null, reviewers: [],
      sourceUrls: [`https://ubuntu.com/security/notices/${notice.id}`, redHat.bugzilla?.url ?? `https://access.redhat.com/security/cve/${cve}`],
      note: "official Ubuntu and Red Hat reports for the same CVE; pending independent review",
    } };
  rows.push({ caseId: `EVREL-HOLD-same-cve-multi-vendor-product-${String(rows.length + 1).padStart(3, "0")}`,
    split: "holdout", samplingStratum: "same-cve-multi-vendor-product", query, candidates: [candidate],
    construction: { assembledAt: new Date().toISOString(), assembledBy: "scripts/collect-cross-vendor-holdout.ts",
      note: `${cve}: Ubuntu Security and Red Hat Product Security official APIs` } });
}
const out = path.resolve(REPO_ROOT, values.out!); mkdirSync(path.dirname(out), { recursive: true });
writeFileSync(out, rows.map((row) => JSON.stringify(row)).join("\n") + "\n");
console.log(JSON.stringify({ cases: rows.length, out }));
