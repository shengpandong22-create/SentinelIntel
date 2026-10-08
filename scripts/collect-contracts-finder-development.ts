// Collects additional notice-to-award lifecycles from the official UK Contracts Finder OCDS API.
// The shared OCID is the lifecycle key; all labels remain disputed pending independent review.
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { parseArgs } from "node:util";
import { REPO_ROOT } from "@aihot/backend/config";
import type { BenchmarkCandidate, BenchmarkReport, EventRelationCase } from "./event-grouping-eval-core.ts";

interface Release { ocid: string; id: string; date: string; tag: string[]; tender?: { title?: string; description?: string };
  awards?: Array<{ documents?: Array<{ url?: string }> }>; documents?: Array<{ url?: string }> }
interface Package { releases: Release[]; links?: { next?: string } }
const { values } = parseArgs({ options: {
  out: { type: "string", default: ".data/event-relations/contracts-finder-development-construction.jsonl" },
  "max-pages": { type: "string", default: "20" },
} });
const maxPages = Number.parseInt(values["max-pages"]!, 10);
if (!Number.isInteger(maxPages) || maxPages < 1 || maxPages > 40) throw new Error("--max-pages must be 1..40");
const endpoint = (stage: string) => `https://www.contractsfinder.service.gov.uk/Published/Notices/OCDS/Search?publishedFrom=2020-01-01T00:00:00&publishedTo=${encodeURIComponent(new Date().toISOString())}&stages=${stage}&limit=100`;
async function collect(stage: "tender" | "award"): Promise<Release[]> {
  const output: Release[] = []; let next: string | undefined = endpoint(stage);
  for (let page = 0; next && page < maxPages; page++) {
    const response = await fetch(next, { headers: { accept: "application/json", "user-agent": "SentinelIntel-Phase2-evaluation" }, signal: AbortSignal.timeout(45_000) });
    if (!response.ok) throw new Error(`Contracts Finder ${stage}: HTTP ${response.status}`);
    const body = await response.json() as Package; output.push(...(body.releases ?? [])); next = body.links?.next;
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  return output;
}
const [tenders, awards] = await Promise.all([collect("tender"), collect("award")]);
const security = (row: Release) => /cyber|penetration test|firewall|siem|network security|antivirus|intrusion|threat intelligence|security operations/i
  .test(`${row.tender?.title ?? ""} ${row.tender?.description ?? ""}`);
const byOcid = new Map<string, Release[]>();
for (const row of [...tenders, ...awards].filter(security)) (byOcid.get(row.ocid) ?? byOcid.set(row.ocid, []).get(row.ocid)!).push(row);
const instant = (row: Release) => Date.parse(row.date);
const url = (row: Release) => row.awards?.flatMap((award) => award.documents ?? []).find((document) => document.url)?.url
  ?? row.documents?.find((document) => document.url)?.url
  ?? `https://www.contractsfinder.service.gov.uk/Published/Notice/releases/${encodeURIComponent(row.id)}.json`;
function report(row: Release): BenchmarkReport {
  return { reportId: `CFS:${row.id}`, title: row.tender?.title ?? row.ocid, summary: row.tender?.description ?? `Contracts Finder ${row.tag.join(", ")} notice`,
    sourceName: "UK Contracts Finder", firstParty: true, publishedAt: new Date(instant(row)).toISOString(), ingestedAt: new Date(instant(row)).toISOString(),
    frame: null, splitGroupId: `development:procurement:${row.ocid}`, identity: { eventKey: `contracts-finder:${row.id}`, storyKey: `procurement:${row.ocid}` } };
}
function candidate(query: Release, row: Release): BenchmarkCandidate {
  return { ...report(row), factTitle: report(row).title.slice(0, 200), members: 1, isDistractor: false, expectedInRecall: true,
    gold: { relation: "SAME_STORY" }, annotation: { status: "disputed", labelSource: "model-proposed", humanAdjudicated: false,
      labeller: "pending-dual-review", confidence: "low", adjudicator: null, sourceUrls: [url(query), url(row)],
      note: "same Contracts Finder OCID and sub-14-day tender-to-award hypothesis; pending independent review" } };
}
const cases: EventRelationCase[] = [];
for (const [ocid, rows] of [...byOcid].sort(([a], [b]) => a.localeCompare(b))) {
  const tender = rows.find((row) => row.tag.includes("tender")), award = rows.find((row) => row.tag.includes("award"));
  if (!tender || !award || Math.abs(instant(tender) - instant(award)) >= 14 * 86_400_000) continue;
  const [query, prior] = instant(award) >= instant(tender) ? [award, tender] : [tender, award];
  const serial = cases.length + 1;
  cases.push({ caseId: `EVREL-DEV-procurement-notice-vs-award-cfs-${String(serial).padStart(3, "0")}`, split: "development",
    samplingStratum: "procurement-notice-vs-award", query: report(query), candidates: [candidate(query, prior)],
    construction: { assembledAt: new Date().toISOString(), assembledBy: "scripts/collect-contracts-finder-development.ts",
      note: `official OCDS lifecycle ${ocid}; ${prior.tag.join("+")} -> ${query.tag.join("+")}` } });
  if (cases.length === 3) break;
}
const outPath = path.resolve(REPO_ROOT, values.out!); mkdirSync(path.dirname(outPath), { recursive: true });
writeFileSync(outPath, cases.map((row) => JSON.stringify(row)).join("\n") + (cases.length ? "\n" : ""));
console.log(JSON.stringify({ tenders: tenders.length, awards: awards.length, securityOcids: byOcid.size, cases: cases.length, out: outPath }));
