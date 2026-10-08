// One explicit ROUNDUP replacement: an Ubuntu notice naming multiple CVEs paired with the focused
// CVE Program record for one contained event.
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { parseArgs } from "node:util";
import { REPO_ROOT } from "@aihot/backend/config";
import type { BenchmarkCandidate, BenchmarkReport, EventRelationCase } from "./event-grouping-eval-core.ts";
const { values } = parseArgs({ options: { out: { type: "string", default: ".data/event-relations/holdout-ubuntu-roundup-replacement.jsonl" } } });
const cve = "CVE-2021-44832", noticeId = "USN-5222-1";
const [ubuntuResponse, cveResponse] = await Promise.all([
  fetch(`https://ubuntu.com/security/notices/${noticeId}.json`, { signal: AbortSignal.timeout(30_000) }),
  fetch(`https://cveawg.mitre.org/api/cve/${cve}`, { signal: AbortSignal.timeout(30_000) }),
]);
if (!ubuntuResponse.ok || !cveResponse.ok) throw new Error(`official evidence fetch failed: Ubuntu ${ubuntuResponse.status}, CVE ${cveResponse.status}`);
const ubuntu = await ubuntuResponse.json() as { title: string; summary: string; description: string; published: string; cves_ids: string[] };
const cveRecord = await cveResponse.json() as { cveMetadata: { datePublished: string }; containers: { cna: { descriptions: Array<{ lang: string; value: string }> } } };
if (ubuntu.cves_ids.length < 2 || !ubuntu.cves_ids.includes(cve)) throw new Error("Ubuntu notice is not the expected multi-CVE roundup");
const description = cveRecord.containers.cna.descriptions.find((row) => row.lang.startsWith("en"))?.value ?? cve;
if (Math.abs(Date.parse(ubuntu.published) - Date.parse(cveRecord.cveMetadata.datePublished)) >= 14 * 86_400_000) throw new Error("evidence is outside recall window");
const roundup: BenchmarkReport = { reportId: `UBUNTU:${noticeId}`, title: ubuntu.title,
  summary: `${ubuntu.summary}\n${ubuntu.description}\nContained CVEs: ${ubuntu.cves_ids.join(", ")}`, sourceName: "Ubuntu Security",
  firstParty: true, publishedAt: ubuntu.published, ingestedAt: ubuntu.published, frame: null,
  splitGroupId: `holdout:roundup:${noticeId}`, identity: { eventKey: `roundup:${noticeId}`, storyKey: `roundup:${noticeId}` } };
const focused: BenchmarkReport = { reportId: `CVEORG:${cve}`, title: `${cve}: ${description}`.slice(0, 240), summary: description,
  sourceName: "CVE Program", firstParty: true, publishedAt: cveRecord.cveMetadata.datePublished,
  ingestedAt: cveRecord.cveMetadata.datePublished, frame: null, splitGroupId: `holdout:roundup:${noticeId}`,
  identity: { eventKey: cve, storyKey: cve } };
const candidate: BenchmarkCandidate = { ...focused, factTitle: focused.title, members: 1, isDistractor: false,
  expectedInRecall: true, gold: { relation: "ROUNDUP" }, annotation: { status: "disputed", labelSource: "model-proposed",
    humanAdjudicated: false, labeller: "pending-three-model-review", confidence: "low", adjudicator: null, reviewers: [],
    sourceUrls: [`https://ubuntu.com/security/notices/${noticeId}`, `https://www.cve.org/CVERecord?id=${cve}`],
    note: `Ubuntu notice explicitly lists ${ubuntu.cves_ids.length} CVEs including ${cve}; pending independent review` } };
const row: EventRelationCase = { caseId: "EVREL-HOLD-roundup-containing-one-event-U001", split: "holdout",
  samplingStratum: "roundup-containing-one-event", query: roundup, candidates: [candidate],
  construction: { assembledAt: new Date().toISOString(), assembledBy: "scripts/collect-ubuntu-roundup-holdout.ts" } };
const out = path.resolve(REPO_ROOT, values.out!); mkdirSync(path.dirname(out), { recursive: true }); writeFileSync(out, JSON.stringify(row) + "\n");
console.log(JSON.stringify({ cases: 1, out }));
