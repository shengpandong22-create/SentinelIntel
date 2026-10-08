// Fresh KEV lifecycle replacements from the official CISA catalog and CVE Program records.
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { REPO_ROOT } from "@aihot/backend/config";
import { parseEventRelationJsonl, type BenchmarkCandidate, type BenchmarkReport, type EventRelationCase } from "./event-grouping-eval-core.ts";
interface Kev { cveID: string; vendorProject: string; product: string; vulnerabilityName: string; dateAdded: string; shortDescription: string; requiredAction: string; knownRansomwareCampaignUse?: string }
const excluded = new Set(["datasets/event-relations/dev.jsonl", ".data/event-relations/holdout-construction.jsonl", ".data/event-relations/holdout-replacements.jsonl"]
  .flatMap((file) => parseEventRelationJsonl(readFileSync(path.resolve(REPO_ROOT, file), "utf8")))
  .flatMap((row) => [row.query.reportId, ...row.candidates.map((candidate) => candidate.reportId)]));
const response = await fetch("https://www.cisa.gov/sites/default/files/feeds/known_exploited_vulnerabilities.json", { signal: AbortSignal.timeout(60_000) });
if (!response.ok) throw new Error(`CISA KEV: HTTP ${response.status}`);
const catalog = (await response.json()) as { dateReleased: string; vulnerabilities: Kev[] };
const output: EventRelationCase[] = [];
for (const kev of [...catalog.vulnerabilities].sort((a, b) => b.dateAdded.localeCompare(a.dateAdded))) {
  if (excluded.has(`CISA-KEV:${kev.cveID}:${kev.dateAdded}`) || excluded.has(`CVEORG:${kev.cveID}`)) continue;
  const cveResponse = await fetch(`https://cveawg.mitre.org/api/cve/${kev.cveID}`, { signal: AbortSignal.timeout(30_000) });
  if (!cveResponse.ok) continue;
  const cve = await cveResponse.json() as { cveMetadata?: { datePublished?: string }; containers?: { cna?: { descriptions?: Array<{ lang: string; value: string }> } } };
  const publishedAt = cve.cveMetadata?.datePublished, description = cve.containers?.cna?.descriptions?.find((row) => row.lang.startsWith("en"))?.value;
  if (!publishedAt || !description) continue;
  const addedAt = `${kev.dateAdded}T12:00:00Z`, gap = Date.parse(addedAt) - Date.parse(publishedAt);
  if (gap <= 86_400_000 || gap >= 14 * 86_400_000) continue;
  const storyKey = kev.cveID;
  const query: BenchmarkReport = { reportId: `CISA-KEV:${kev.cveID}:${kev.dateAdded}`, title: `${kev.cveID}: ${kev.vulnerabilityName}`,
    summary: `CISA Known Exploited Vulnerabilities Catalog status: this vulnerability is known to be exploited. ${kev.shortDescription} Required action: ${kev.requiredAction}. Known ransomware use: ${kev.knownRansomwareCampaignUse ?? "unknown"}.`,
    sourceName: "CISA Known Exploited Vulnerabilities Catalog", firstParty: true, publishedAt: addedAt, ingestedAt: addedAt,
    frame: null, splitGroupId: `holdout:kev-round2:${storyKey}`, identity: { eventKey: `kev:${storyKey}:${kev.dateAdded}`, storyKey } };
  const prior: BenchmarkReport = { reportId: `CVEORG:${kev.cveID}`, title: `${kev.cveID}: ${description}`.slice(0, 240), summary: description,
    sourceName: "CVE Program", firstParty: true, publishedAt, ingestedAt: publishedAt, frame: null,
    splitGroupId: `holdout:kev-round2:${storyKey}`, identity: { eventKey: storyKey, storyKey } };
  const candidate: BenchmarkCandidate = { ...prior, factTitle: prior.title, members: 1, isDistractor: false, expectedInRecall: true,
    gold: { relation: "SAME_STORY" }, annotation: { status: "disputed", labelSource: "model-proposed", humanAdjudicated: false,
      labeller: "pending-three-model-review", confidence: "low", adjudicator: null, reviewers: [], sourceUrls: [
        "https://www.cisa.gov/known-exploited-vulnerabilities-catalog", `https://www.cve.org/CVERecord?id=${kev.cveID}`,
      ], note: "CISA later added the disclosed CVE to the official known-exploited catalog; pending independent review" } };
  output.push({ caseId: `EVREL-HOLD-poc-vs-disclosure-K2-${String(output.length + 1).padStart(3, "0")}`, split: "holdout",
    samplingStratum: "poc-vs-disclosure", query, candidates: [candidate],
    construction: { assembledAt: new Date().toISOString(), assembledBy: "scripts/collect-kev-holdout-round2.ts",
      note: `${kev.cveID}: CVE publication -> KEV after ${(gap / 86_400_000).toFixed(2)} days` } });
  if (output.length === 3) break;
}
if (output.length !== 3) throw new Error(`expected 3 fresh KEV cases, got ${output.length}`);
const out = path.resolve(REPO_ROOT, ".data/event-relations/holdout-kev-round2.jsonl"); mkdirSync(path.dirname(out), { recursive: true });
writeFileSync(out, output.map((row) => JSON.stringify(row)).join("\n") + "\n"); console.log(JSON.stringify({ cases: output.length, out }));
