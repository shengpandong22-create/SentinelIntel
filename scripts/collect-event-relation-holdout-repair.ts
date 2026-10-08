// Builds evidence-backed replacements for the four holdout strata that failed the final
// relation/chronology audit. This script only constructs disputed cases; paid review remains a
// separate explicit step.
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { REPO_ROOT } from "@aihot/backend/config";
import { parseEventRelationJsonl, type BenchmarkCandidate, type BenchmarkReport, type EventRelationCase } from "./event-grouping-eval-core.ts";

interface Evidence { evidenceId: string; source: string; sourceName: string; url: string; title: string; summary: string;
  publishedAt: string | null; cves: string[]; raw?: { category?: string; parentEvidenceIds?: string[] } }
interface FederalDocument { document_number: string; title: string; type: string; abstract: string; publication_date: string;
  html_url: string; regulation_id_numbers?: string[] }
const readJsonl = <T>(file: string) => readFileSync(path.resolve(REPO_ROOT, file), "utf8").split(/\r?\n/).filter(Boolean).map((line) => JSON.parse(line) as T);
const base = readJsonl<Evidence>(".data/event-relations/evidence-pool.jsonl");
const refs = readJsonl<Evidence>(".data/event-relations/reference-evidence.jsonl");
const byId = new Map(base.map((row) => [row.evidenceId, row]));
const usedReports = new Set(readJsonl<EventRelationCase>("datasets/event-relations/dev.jsonl")
  .flatMap((row) => [row.query.reportId, ...row.candidates.map((candidate) => candidate.reportId)]));
for (const file of readdirSync(path.resolve(REPO_ROOT, ".data/event-relations")).filter((name) => /^annotated-holdout.*\.jsonl$/.test(name))) {
  for (const row of readJsonl<EventRelationCase>(`.data/event-relations/${file}`)) {
    for (const report of [row.query, ...row.candidates]) usedReports.add(report.reportId);
  }
}
const hash = (value: string) => createHash("sha256").update(value).digest("hex").slice(0, 12);
const report = (row: Evidence, group: string, identity: { eventKey: string; storyKey: string }): BenchmarkReport => ({
  reportId: row.evidenceId, title: row.title, summary: row.summary || null, sourceName: row.sourceName,
  firstParty: row.source === "reference-page" || row.source === "cve-program", publishedAt: row.publishedAt,
  ingestedAt: row.publishedAt!, frame: null, splitGroupId: group, identity,
});
const annotation = (sourceUrls: string[], note: string) => ({ status: "disputed" as const, labelSource: "model-proposed" as const,
  humanAdjudicated: false, labeller: "pending-three-model-review", confidence: "low" as const, adjudicator: null,
  reviewers: [] as string[], sourceUrls, note });
const candidate = (baseReport: BenchmarkReport, relation: "SAME_STORY" | "UNRELATED" | "ROUNDUP", sourceUrls: string[], note: string): BenchmarkCandidate => ({
  ...baseReport, factTitle: baseReport.title.slice(0, 200), members: 1, isDistractor: false, expectedInRecall: true,
  gold: { relation }, annotation: annotation(sourceUrls, note),
});
const output: EventRelationCase[] = [];
const selectedReports = new Set<string>();
const add = (stratum: string, query: BenchmarkReport, prior: BenchmarkCandidate, note: string) => output.push({
  caseId: `EVREL-HOLD-${stratum}-FIX${String(output.filter((row) => row.samplingStratum === stratum).length + 1).padStart(3, "0")}`,
  split: "holdout", samplingStratum: stratum, query, candidates: [prior],
  construction: { assembledAt: new Date().toISOString(), assembledBy: "scripts/collect-event-relation-holdout-repair.ts", note },
}), remember = (query: BenchmarkReport, prior: BenchmarkCandidate) => { selectedReports.add(query.reportId); selectedReports.add(prior.reportId); };

// A release is a later story development only when it postdates the disclosure. Two releases
// provide three independent report pairs by using NVD and CVE Program disclosure records.
const patchRefs = refs.filter((row) => row.raw?.category === "patch-or-release" && row.publishedAt && row.cves.length === 1 && !usedReports.has(row.evidenceId))
  .flatMap((patch) => (patch.raw?.parentEvidenceIds ?? []).map((id) => ({ patch, disclosure: byId.get(id) })))
  .filter((pair): pair is { patch: Evidence; disclosure: Evidence } => Boolean(pair.disclosure?.publishedAt
    && !usedReports.has(pair.disclosure.evidenceId)
    && Date.parse(pair.patch.publishedAt!) > Date.parse(pair.disclosure.publishedAt!)
    && Date.parse(pair.patch.publishedAt!) - Date.parse(pair.disclosure.publishedAt!) < 14 * 86_400_000));
for (const { patch, disclosure } of patchRefs.slice(0, 2)) {
  const cve = patch.cves[0]!, group = `holdout:patch:${cve}`;
  const query = report(patch, group, { eventKey: `patch:${hash(patch.url)}`, storyKey: cve });
  const prior = candidate(report(disclosure, group, { eventKey: cve, storyKey: cve }), "SAME_STORY", [patch.url, disclosure.url],
    `${patch.title} postdates the ${cve} disclosure and is independently reviewed as a later patch/release`);
  add("disclosure-vs-patch", query, prior, "later release after disclosure"); remember(query, prior);
}
if (patchRefs.length) {
  const { patch, disclosure } = patchRefs[0]!, cve = patch.cves[0]!;
  const response = await fetch(`https://cveawg.mitre.org/api/cve/${cve}`, { signal: AbortSignal.timeout(30_000) });
  if (!response.ok) throw new Error(`${cve}: CVE API HTTP ${response.status}`);
  const record = await response.json() as { cveMetadata?: { datePublished?: string }; containers?: { cna?: { descriptions?: Array<{ lang: string; value: string }> } } };
  const publishedAt = record.cveMetadata?.datePublished;
  const summary = record.containers?.cna?.descriptions?.find((row) => row.lang.startsWith("en"))?.value;
  if (!publishedAt || !summary || Date.parse(patch.publishedAt!) <= Date.parse(publishedAt)) throw new Error(`${cve}: invalid CVE Program disclosure chronology`);
  const cveEvidence: Evidence = { evidenceId: `CVEORG:${cve}`, source: "cve-program", sourceName: "CVE Program",
    url: `https://www.cve.org/CVERecord?id=${cve}`, title: `${cve}: ${summary}`.slice(0, 240), summary, publishedAt, cves: [cve] };
  const group = `holdout:patch:${cve}`;
  const query = report(patch, group, { eventKey: `patch:${hash(patch.url)}`, storyKey: cve });
  const prior = candidate(report(cveEvidence, group, { eventKey: cve, storyKey: cve }), "SAME_STORY", [patch.url, cveEvidence.url],
    `${patch.title} postdates the CVE Program disclosure and is independently reviewed as a later patch/release`);
  add("disclosure-vs-patch", query, prior, "later release after independent CVE Program disclosure"); remember(query, prior);
}

// Two distinct CVE reports co-listed by one advisory remain unrelated.
for (const advisory of refs.filter((row) => row.raw?.category === "multi-cve-advisory" && row.publishedAt && !usedReports.has(row.evidenceId))) {
  if (output.filter((row) => row.samplingStratum === "multiple-cves-in-one-advisory").length === 2) break;
  const parents = [...new Map((advisory.raw?.parentEvidenceIds ?? []).map((id) => byId.get(id)).filter((row): row is Evidence => Boolean(row?.publishedAt
    && row.cves.length === 1 && !usedReports.has(row.evidenceId))).map((row) => [row.cves[0], row])).values()];
  if (parents.length < 2 || Math.abs(Date.parse(parents[0]!.publishedAt!) - Date.parse(parents[1]!.publishedAt!)) >= 14 * 86_400_000) continue;
  const [later, earlier] = Date.parse(parents[0]!.publishedAt!) >= Date.parse(parents[1]!.publishedAt!) ? [parents[0]!, parents[1]!] : [parents[1]!, parents[0]!];
  const group = `holdout:multi:${hash(advisory.url)}`, q = report(later, group, { eventKey: later.cves[0]!, storyKey: later.cves[0]! });
  const prior = report(earlier, group, { eventKey: earlier.cves[0]!, storyKey: earlier.cves[0]! });
  const c = candidate(prior, "UNRELATED", [later.url, earlier.url],
    `distinct CVEs ${later.cves[0]} and ${earlier.cves[0]} are both explicitly co-listed by ${advisory.url}`);
  add("multiple-cves-in-one-advisory", q, c, "distinct CVEs in one evidence-backed advisory"); remember(q, c);
}

// Use different roundup documents to avoid reusing a report with unstable case-local metadata.
for (const roundup of refs.filter((row) => row.raw?.category === "multi-cve-advisory" && row.publishedAt && !usedReports.has(row.evidenceId))) {
  if (output.filter((row) => row.samplingStratum === "roundup-containing-one-event").length === 6) break;
  const focused = (roundup.raw?.parentEvidenceIds ?? []).map((id) => byId.get(id)).find((row): row is Evidence => Boolean(row?.publishedAt
    && row.cves.length === 1 && !usedReports.has(row.evidenceId)
    && Math.abs(Date.parse(roundup.publishedAt!) - Date.parse(row.publishedAt!)) < 14 * 86_400_000));
  if (!focused || !roundup.cves.includes(focused.cves[0]!) || selectedReports.has(roundup.evidenceId) || selectedReports.has(focused.evidenceId)) continue;
  const group = `holdout:roundup:${hash(roundup.url)}`;
  const roundupReport = report(roundup, group, { eventKey: `roundup:${hash(roundup.url)}`, storyKey: `roundup:${hash(roundup.url)}` });
  const focusedReport = report(focused, group, { eventKey: focused.cves[0]!, storyKey: focused.cves[0]! });
  const [query, prior] = Date.parse(roundup.publishedAt) >= Date.parse(focused.publishedAt!)
    ? [roundupReport, candidate(focusedReport, "ROUNDUP", [roundup.url, focused.url], `${roundup.title} explicitly contains ${focused.cves[0]}`)]
    : [focusedReport, candidate(roundupReport, "ROUNDUP", [focused.url, roundup.url], `${roundup.title} explicitly contains ${focused.cves[0]}`)];
  add("roundup-containing-one-event", query, prior, "chronologically ordered multi-topic report and contained CVE"); remember(query, prior);
}

async function federalDocuments(type: "PRORULE" | "RULE", page: number): Promise<FederalDocument[]> {
  const url = new URL("https://www.federalregister.gov/api/v1/documents.json");
  for (const [key, value] of [["per_page", "1000"], ["page", String(page)], ["conditions[type][]", type], ["order", "newest"]]) url.searchParams.append(key, value);
  for (const field of ["document_number", "title", "type", "abstract", "publication_date", "html_url", "regulation_id_numbers"]) url.searchParams.append("fields[]", field);
  const response = await fetch(url, { headers: { accept: "application/json", "user-agent": "SentinelIntel-Phase2-evaluation" }, signal: AbortSignal.timeout(30_000) });
  if (!response.ok) throw new Error(`Federal Register API: HTTP ${response.status}`);
  return ((await response.json()) as { results?: FederalDocument[] }).results ?? [];
}
const normalize = (value: string | null | undefined) => (value ?? "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
const tokens = (value: string | null | undefined) => new Set(normalize(value).split(" ").filter((token) => token.length > 3));
const similarity = (a: string | null | undefined, b: string | null | undefined) => { const left = tokens(a), right = tokens(b);
  return [...left].filter((token) => right.has(token)).length / Math.max(1, new Set([...left, ...right]).size); };
const [proposed, rules] = (await Promise.all(["PRORULE", "RULE"].map(async (type) =>
  (await Promise.all(Array.from({ length: 10 }, (_, index) => federalDocuments(type as "PRORULE" | "RULE", index + 1)))).flat()))) as [FederalDocument[], FederalDocument[]];
const rulesByTitle = new Map<string, FederalDocument[]>();
for (const row of rules) (rulesByTitle.get(normalize(row.title)) ?? rulesByTitle.set(normalize(row.title), []).get(normalize(row.title))!).push(row);
const policyPairs = proposed.flatMap((draft) => (rulesByTitle.get(normalize(draft.title)) ?? []).map((final) => ({ draft, final, score: similarity(draft.abstract, final.abstract) })))
  .filter(({ draft, final, score }) => score >= 0.6 && Date.parse(final.publication_date) >= Date.parse(draft.publication_date)
    && Date.parse(final.publication_date) - Date.parse(draft.publication_date) < 14 * 86_400_000
    && !usedReports.has(`FR:${draft.document_number}`) && !usedReports.has(`FR:${final.document_number}`))
  .sort((a, b) => b.score - a.score);
const usedPolicy = new Set<string>();
for (const { draft, final, score } of policyPairs) {
  if (output.filter((row) => row.samplingStratum === "policy-draft-vs-final").length === 3) break;
  if (usedPolicy.has(draft.document_number) || usedPolicy.has(final.document_number)) continue;
  const story = `policy:${[draft.document_number, final.document_number].sort().join(":")}`, group = `holdout:${story}`;
  const make = (row: FederalDocument, eventKey: string): BenchmarkReport => ({ reportId: `FR:${row.document_number}`, title: row.title,
    summary: row.abstract, sourceName: "Federal Register", firstParty: true, publishedAt: `${row.publication_date}T00:00:00Z`,
    ingestedAt: `${row.publication_date}T00:00:00Z`, frame: null, splitGroupId: group, identity: { eventKey, storyKey: story } });
  const query = make(final, `final:${final.document_number}`), prior = make(draft, `draft:${draft.document_number}`);
  add("policy-draft-vs-final", query, candidate(prior, "SAME_STORY", [final.html_url, draft.html_url],
    `official proposed and final rule pair with exact title and abstract similarity ${score.toFixed(3)}`), "official proposed-to-final rule lifecycle");
  usedPolicy.add(draft.document_number); usedPolicy.add(final.document_number);
}

const expected = { "disclosure-vs-patch": 3, "policy-draft-vs-final": 3, "multiple-cves-in-one-advisory": 2, "roundup-containing-one-event": 6 };
const counts = Object.fromEntries(Object.keys(expected).map((stratum) => [stratum, output.filter((row) => row.samplingStratum === stratum).length]));
for (const [stratum, count] of Object.entries(expected)) if (counts[stratum] !== count) throw new Error(`${stratum}: expected ${count}, got ${counts[stratum]}`);
const out = path.resolve(REPO_ROOT, ".data/event-relations/holdout-repair-construction.jsonl"); mkdirSync(path.dirname(out), { recursive: true });
writeFileSync(out, output.map((row) => JSON.stringify(row)).join("\n") + "\n");
console.log(JSON.stringify({ cases: output.length, counts, out }));
