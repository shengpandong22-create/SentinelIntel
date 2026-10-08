// Builds explicit-text holdout replacements: roundups must name multiple CVEs in their body, and
// multi-CVE pairs compare two distinct CVE reports linked from one real advisory.
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { parseArgs } from "node:util";
import { REPO_ROOT } from "@aihot/backend/config";
import { parseEventRelationJsonl, type BenchmarkCandidate, type BenchmarkReport, type EventRelationCase } from "./event-grouping-eval-core.ts";

interface Evidence { evidenceId: string; source: string; sourceName: string; url: string; title: string; summary: string;
  publishedAt: string | null; cves: string[]; raw?: { category?: string; parentEvidenceIds?: string[] } }
const { values } = parseArgs({ options: {
  evidence: { type: "string", default: ".data/event-relations/evidence-pool.jsonl" },
  references: { type: "string", default: ".data/event-relations/reference-evidence.jsonl" },
  exclude: { type: "string", multiple: true }, roundup: { type: "string", default: "7" }, multi: { type: "string", default: "1" },
  out: { type: "string", default: ".data/event-relations/holdout-strong-replacements.jsonl" },
} });
const evidence = readFileSync(path.resolve(REPO_ROOT, values.evidence!), "utf8").split(/\r?\n/).filter(Boolean).map((line) => JSON.parse(line) as Evidence);
const refs = readFileSync(path.resolve(REPO_ROOT, values.references!), "utf8").split(/\r?\n/).filter(Boolean).map((line) => JSON.parse(line) as Evidence);
const byId = new Map(evidence.map((row) => [row.evidenceId, row]));
const baseByCve = new Map<string, Evidence[]>();
for (const row of evidence) for (const cve of row.cves) (baseByCve.get(cve) ?? baseByCve.set(cve, []).get(cve)!).push(row);
const excluded = new Set((values.exclude ?? []).flatMap((file) => parseEventRelationJsonl(readFileSync(path.resolve(REPO_ROOT, file), "utf8")))
  .flatMap((row) => [row.query.reportId, ...row.candidates.map((candidate) => candidate.reportId)]));
const used = new Set(excluded), output: EventRelationCase[] = [];
const roundupQuota = Number(values.roundup), multiQuota = Number(values.multi);
const hash = (value: string) => createHash("sha256").update(value).digest("hex").slice(0, 16);
const explicit = refs.filter((row) => row.publishedAt && row.raw?.category === "multi-cve-advisory" && row.cves.length >= 2
  && row.cves.filter((cve) => row.summary.includes(cve)).length >= 2 && !used.has(row.evidenceId));
async function nvd(cve: string): Promise<Evidence | undefined> {
  const reportId = `NVD:${cve}`;
  if (used.has(reportId)) return undefined;
  const response = await fetch(`https://services.nvd.nist.gov/rest/json/cves/2.0?cveId=${cve}`,
    { headers: { accept: "application/json", "user-agent": "SentinelIntel-Phase2-evaluation" }, signal: AbortSignal.timeout(30_000) });
  if (!response.ok) return undefined;
  const item = ((await response.json()) as { vulnerabilities?: Array<{ cve: { id: string; published: string; descriptions?: Array<{ lang: string; value: string }> } }> }).vulnerabilities?.[0]?.cve;
  if (!item) return undefined;
  return { evidenceId: reportId, source: "nvd", sourceName: "NIST National Vulnerability Database",
    url: `https://nvd.nist.gov/vuln/detail/${cve}`, title: `${cve}: ${item.descriptions?.find((row) => row.lang === "en")?.value ?? cve}`.slice(0, 240),
    summary: item.descriptions?.find((row) => row.lang === "en")?.value ?? cve, publishedAt: item.published, cves: [cve] };
}
async function cveOrg(cve: string): Promise<Evidence | undefined> {
  const reportId = `CVEORG:${cve}`;
  if (used.has(reportId)) return undefined;
  const response = await fetch(`https://cveawg.mitre.org/api/cve/${cve}`,
    { headers: { accept: "application/json", "user-agent": "SentinelIntel-Phase2-evaluation" }, signal: AbortSignal.timeout(30_000) });
  if (!response.ok) return undefined;
  const item = (await response.json()) as { cveMetadata?: { datePublished?: string }; containers?: { cna?: { descriptions?: Array<{ lang: string; value: string }> } } };
  const summary = item.containers?.cna?.descriptions?.find((row) => row.lang.startsWith("en"))?.value;
  if (!summary || !item.cveMetadata?.datePublished) return undefined;
  return { evidenceId: reportId, source: "cve-org", sourceName: "CVE Program",
    url: `https://www.cve.org/CVERecord?id=${cve}`, title: `${cve}: ${summary}`.slice(0, 240), summary,
    publishedAt: item.cveMetadata.datePublished, cves: [cve] };
}
const baseReport = (row: Evidence, identity: { eventKey: string; storyKey: string }, group: string): BenchmarkReport => ({
  reportId: row.evidenceId, title: row.title, summary: row.summary, sourceName: row.sourceName, firstParty: row.source === "reference-page",
  publishedAt: row.publishedAt, ingestedAt: row.publishedAt!, frame: null, splitGroupId: `holdout:${group}`, identity,
});
const annotation = (left: Evidence, right: Evidence, note: string) => ({ status: "disputed" as const,
  labelSource: "model-proposed" as const, humanAdjudicated: false, labeller: "pending-three-model-review",
  confidence: "low" as const, adjudicator: null, reviewers: [], sourceUrls: [left.url, right.url], note });
function candidate(report: BenchmarkReport, relation: "ROUNDUP" | "UNRELATED", left: Evidence, right: Evidence, note: string): BenchmarkCandidate {
  return { ...report, factTitle: report.title.slice(0, 200), members: 1, isDistractor: false, expectedInRecall: true,
    gold: { relation }, annotation: annotation(left, right, note) };
}
for (const row of explicit) {
  if (output.filter((item) => item.samplingStratum === "roundup-containing-one-event").length >= roundupQuota) break;
  let cve: string | undefined, prior: Evidence | undefined;
  for (const value of row.cves.filter((value) => row.summary.includes(value))) {
    const local = (row.raw?.parentEvidenceIds ?? []).map((id) => byId.get(id)).find((item) => item?.cves.includes(value) && !used.has(item.evidenceId))
      ?? (baseByCve.get(value) ?? []).find((item) => item.publishedAt && !used.has(item.evidenceId));
    let candidate = local?.publishedAt && Math.abs(Date.parse(row.publishedAt!) - Date.parse(local.publishedAt)) < 14 * 86_400_000
      ? local : await nvd(value);
    if (!candidate?.publishedAt || Math.abs(Date.parse(row.publishedAt!) - Date.parse(candidate.publishedAt)) >= 14 * 86_400_000) candidate = await cveOrg(value);
    if (candidate?.publishedAt && Math.abs(Date.parse(row.publishedAt!) - Date.parse(candidate.publishedAt)) < 14 * 86_400_000) { cve = value; prior = candidate; break; }
  }
  if (!cve || !prior?.publishedAt) continue;
  const roundup = baseReport(row, { eventKey: `roundup:${hash(row.url)}`, storyKey: `roundup:${hash(row.url)}` }, `roundup:${hash(row.url)}`);
  const event = baseReport(prior, { eventKey: cve, storyKey: cve }, `roundup:${hash(row.url)}`);
  const [query, priorView] = Date.parse(roundup.ingestedAt) >= Date.parse(event.ingestedAt) ? [roundup, event] : [event, roundup];
  const serial = output.filter((item) => item.samplingStratum === "roundup-containing-one-event").length + 1;
  output.push({ caseId: `EVREL-HOLD-roundup-containing-one-event-R${String(serial).padStart(3, "0")}`, split: "holdout",
    samplingStratum: "roundup-containing-one-event", query, candidates: [candidate(priorView, "ROUNDUP", row, prior,
      "advisory body explicitly names multiple CVEs including the paired event; pending independent review")],
    construction: { assembledAt: new Date().toISOString(), assembledBy: "scripts/collect-strong-roundup-holdout-replacements.ts" } });
  used.add(row.evidenceId); used.add(prior.evidenceId);
}
for (const row of explicit) {
  if (output.filter((item) => item.samplingStratum === "multiple-cves-in-one-advisory").length >= multiQuota) break;
  if (used.has(row.evidenceId)) continue;
  const parents = (row.raw?.parentEvidenceIds ?? []).map((id) => byId.get(id)).filter((item): item is Evidence => Boolean(item?.publishedAt) && !used.has(item!.evidenceId));
  const pair = parents.find((a) => parents.some((b) => b !== a && b.cves[0] !== a.cves[0]));
  const other = pair && parents.find((b) => b !== pair && b.cves[0] !== pair.cves[0]);
  if (!pair || !other || Math.abs(Date.parse(pair.publishedAt!) - Date.parse(other.publishedAt!)) >= 14 * 86_400_000) continue;
  const left = baseReport(pair, { eventKey: pair.cves[0]!, storyKey: pair.cves[0]! }, `multi:${hash(row.url)}`);
  const right = baseReport(other, { eventKey: other.cves[0]!, storyKey: other.cves[0]! }, `multi:${hash(row.url)}`);
  const [query, prior] = Date.parse(left.ingestedAt) >= Date.parse(right.ingestedAt) ? [left, right] : [right, left];
  const serial = output.filter((item) => item.samplingStratum === "multiple-cves-in-one-advisory").length + 1;
  output.push({ caseId: `EVREL-HOLD-multiple-cves-in-one-advisory-R${String(serial).padStart(3, "0")}`, split: "holdout",
    samplingStratum: "multiple-cves-in-one-advisory", query, candidates: [candidate(prior, "UNRELATED", pair, other,
      `distinct CVEs explicitly named by shared advisory ${row.url}; pending independent review`)],
    construction: { assembledAt: new Date().toISOString(), assembledBy: "scripts/collect-strong-roundup-holdout-replacements.ts" } });
  used.add(pair.evidenceId); used.add(other.evidenceId); used.add(row.evidenceId);
}
const roundupCount = output.filter((row) => row.samplingStratum === "roundup-containing-one-event").length;
const multiCount = output.filter((row) => row.samplingStratum === "multiple-cves-in-one-advisory").length;
if (roundupCount !== roundupQuota || multiCount !== multiQuota) throw new Error(`insufficient strong replacements: roundup=${roundupCount}/${roundupQuota}, multi=${multiCount}/${multiQuota}`);
const out = path.resolve(REPO_ROOT, values.out!); mkdirSync(path.dirname(out), { recursive: true });
writeFileSync(out, output.map((row) => JSON.stringify(row)).join("\n") + "\n");
console.log(JSON.stringify({ cases: output.length, out }));
