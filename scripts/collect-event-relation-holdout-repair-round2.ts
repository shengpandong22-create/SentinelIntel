// Second repair pass: stronger explicit roundups, two unused tagged patch releases, and one
// additional exact-title proposed/final policy pair. Construction only; labels remain disputed.
import { createHash } from "node:crypto";
import { readFileSync, readdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { REPO_ROOT } from "@aihot/backend/config";
import { parseEventRelationJsonl, type BenchmarkCandidate, type BenchmarkReport, type EventRelationCase } from "./event-grouping-eval-core.ts";

interface Evidence { evidenceId: string; source: string; sourceName: string; url: string; title: string; summary: string; publishedAt: string | null;
  cves: string[]; referenceUrls: string[]; raw?: { category?: string; parentEvidenceIds?: string[]; references?: Array<{ url?: string; tags?: string[] }> } }
interface FederalDocument { document_number: string; title: string; abstract: string; publication_date: string; html_url: string }
const read = <T>(file: string) => readFileSync(path.resolve(REPO_ROOT, file), "utf8").split(/\r?\n/).filter(Boolean).map((line) => JSON.parse(line) as T);
const base = read<Evidence>(".data/event-relations/evidence-pool.jsonl"), refs = read<Evidence>(".data/event-relations/reference-evidence.jsonl");
const byId = new Map(base.map((row) => [row.evidenceId, row]));
const used = new Set(read<EventRelationCase>("datasets/event-relations/dev.jsonl").flatMap((row) => [row.query.reportId, ...row.candidates.map((candidate) => candidate.reportId)]));
for (const file of readdirSync(path.resolve(REPO_ROOT, ".data/event-relations")).filter((name) => /^(?:annotated-holdout|holdout-repair-construction).*\.jsonl$/.test(name)))
  for (const row of parseEventRelationJsonl(readFileSync(path.resolve(REPO_ROOT, `.data/event-relations/${file}`), "utf8")))
    for (const report of [row.query, ...row.candidates]) used.add(report.reportId);
const hash = (value: string) => createHash("sha256").update(value).digest("hex").slice(0, 12);
const view = (row: Evidence, group: string, identity: { eventKey: string; storyKey: string }): BenchmarkReport => ({ reportId: row.evidenceId,
  title: row.title, summary: row.summary || null, sourceName: row.sourceName, firstParty: row.source === "reference-page",
  publishedAt: row.publishedAt, ingestedAt: row.publishedAt!, frame: null, splitGroupId: group, identity });
const candidate = (row: BenchmarkReport, relation: "SAME_STORY" | "ROUNDUP", urls: string[], note: string): BenchmarkCandidate => ({ ...row,
  factTitle: row.title.slice(0, 200), members: 1, isDistractor: false, expectedInRecall: true, gold: { relation }, annotation: {
    status: "disputed", labelSource: "model-proposed", humanAdjudicated: false, labeller: "pending-three-model-review", confidence: "low",
    adjudicator: null, reviewers: [], sourceUrls: urls, note } });
const output: EventRelationCase[] = [];
const add = (stratum: string, query: BenchmarkReport, prior: BenchmarkCandidate, note: string) => output.push({ caseId: `EVREL-HOLD-${stratum}-FIX2-${String(output.length + 1).padStart(3, "0")}`,
  split: "holdout", samplingStratum: stratum, query, candidates: [prior], construction: { assembledAt: new Date().toISOString(),
    assembledBy: "scripts/collect-event-relation-holdout-repair-round2.ts", note } });

// Each page explicitly names multiple CVEs in its title/body, making the containment evidence
// visible rather than inferred from a generic product page.
const roundupUrls = [
  "https://github.com/eclipse-ankaios/ankaios/releases/tag/v1.0.2",
  "https://www.tp-link.com/us/support/faq/5248/",
  "https://www.tp-link.com/us/support/faq/5251/",
  "https://www.vulncheck.com/blog/filerun-thumbnail-command-injection-rce",
  "https://github.com/Chainlit/chainlit/releases/tag/2.12.0",
  "https://github.com/matrix-org/matrix-rust-sdk/releases/tag/matrix-sdk-0.16.1",
  "https://github.com/FluidSynth/fluidsynth/releases/tag/v2.5.6",
  "https://github.com/glpi-project/glpi/releases/tag/10.0.26",
  "https://github.com/Icinga/icinga2/releases/tag/v2.16.2",
];
for (const url of roundupUrls) {
  if (output.filter((row) => row.samplingStratum === "roundup-containing-one-event").length === 6) break;
  const roundup = refs.find((row) => row.url === url); if (!roundup?.publishedAt || used.has(roundup.evidenceId)) continue;
  const focusedRows = (roundup.raw?.parentEvidenceIds ?? []).map((id) => byId.get(id)).filter((row): row is Evidence => Boolean(row?.publishedAt
    && !used.has(row.evidenceId) && row.cves.length === 1 && roundup.cves.includes(row.cves[0]!)
    && roundup.summary.includes(row.cves[0]!) && Math.abs(Date.parse(roundup.publishedAt!) - Date.parse(row.publishedAt!)) < 14 * 86_400_000));
  for (const focused of focusedRows) {
    if (output.filter((row) => row.samplingStratum === "roundup-containing-one-event").length === 6) break;
    const group = `holdout:roundup:${hash(roundup.url)}`, roundupReport = view(roundup, group, { eventKey: `roundup:${hash(roundup.url)}`, storyKey: `roundup:${hash(roundup.url)}` });
    const focusedReport = view(focused, group, { eventKey: focused.cves[0]!, storyKey: focused.cves[0]! });
    const [query, prior] = Date.parse(roundup.publishedAt) >= Date.parse(focused.publishedAt!)
      ? [roundupReport, candidate(focusedReport, "ROUNDUP", [roundup.url, focused.url], `${roundup.title} explicitly lists ${focused.cves[0]} among multiple CVEs`)]
      : [focusedReport, candidate(roundupReport, "ROUNDUP", [focused.url, roundup.url], `${roundup.title} explicitly lists ${focused.cves[0]} among multiple CVEs`)];
    add("roundup-containing-one-event", query, prior, "explicit multi-CVE body and chronologically ordered contained item");
    used.add(focused.evidenceId);
  }
}
if (output.filter((row) => row.samplingStratum === "roundup-containing-one-event").length === 5) {
  const roundup = refs.find((row) => row.url === "https://www.tp-link.com/us/support/faq/5248/")!;
  const cve = roundup.cves[0]!, response = await fetch(`https://cveawg.mitre.org/api/cve/${cve}`, { signal: AbortSignal.timeout(30_000) });
  if (!response.ok) throw new Error(`${cve}: CVE API HTTP ${response.status}`);
  const record = await response.json() as { cveMetadata?: { datePublished?: string }; containers?: { cna?: { descriptions?: Array<{ lang: string; value: string }> } } };
  const publishedAt = record.cveMetadata?.datePublished, summary = record.containers?.cna?.descriptions?.find((row) => row.lang.startsWith("en"))?.value;
  if (!publishedAt || !summary || Math.abs(Date.parse(roundup.publishedAt!) - Date.parse(publishedAt)) >= 14 * 86_400_000) throw new Error(`${cve}: unusable CVE Program evidence`);
  const focused: Evidence = { evidenceId: `CVEORG:${cve}`, source: "cve-program", sourceName: "CVE Program", url: `https://www.cve.org/CVERecord?id=${cve}`,
    title: `${cve}: ${summary}`.slice(0, 240), summary, publishedAt, cves: [cve], referenceUrls: [roundup.url] };
  const group = `holdout:roundup:${hash(roundup.url)}`, roundupReport = view(roundup, group, { eventKey: `roundup:${hash(roundup.url)}`, storyKey: `roundup:${hash(roundup.url)}` });
  const focusedReport = view(focused, group, { eventKey: cve, storyKey: cve });
  const [query, prior] = Date.parse(roundup.publishedAt!) >= Date.parse(publishedAt)
    ? [roundupReport, candidate(focusedReport, "ROUNDUP", [roundup.url, focused.url], `${roundup.title} explicitly lists ${cve} among multiple CVEs`)]
    : [focusedReport, candidate(roundupReport, "ROUNDUP", [focused.url, roundup.url], `${roundup.title} explicitly lists ${cve} among multiple CVEs`)];
  add("roundup-containing-one-event", query, prior, "independent CVE Program view of an explicitly contained item");
}

// Two unused commits that NVD explicitly tags as patches. Their immutable commit timestamps were
// resolved through the GitHub commits API during construction; the models still decide the relation.
const patchSpecs = [
  { cve: "CVE-2026-69659", url: "https://github.com/ash-project/ash/commit/1816b103af975221210478d61db20adcea700319",
    publishedAt: "2026-08-09T17:21:21.000Z", title: "ash: limit keyset binary size", summary: "Patch commit: fix: limit keyset binary size" },
  { cve: "CVE-2026-77923", url: "https://github.com/Dolibarr/dolibarr/commit/1730aa56675b31cfede895fdae55b673d887fb8f",
    publishedAt: "2026-08-14T14:25:46.000Z", title: "Dolibarr: fix authorization bypass in clonetasks",
    summary: "Patch commit: Fix AISLE-2026-0340-0086 Authorization bypass in clonetasks: private destination project check is inverted" },
];
for (const spec of patchSpecs) {
  const disclosure = byId.get(`NVD:${spec.cve}`); if (!disclosure?.publishedAt || used.has(disclosure.evidenceId)) continue;
  const publishedAt = spec.publishedAt;
  if (Math.abs(Date.parse(disclosure.publishedAt) - Date.parse(publishedAt)) >= 14 * 86_400_000) continue;
  const release: Evidence = { evidenceId: `REF:${spec.url}`, source: "reference-page", sourceName: "github.com", url: spec.url,
    title: spec.title, summary: spec.summary, publishedAt, cves: [spec.cve], referenceUrls: [disclosure.url] };
  const group = `holdout:patch:${spec.cve}`, releaseReport = view(release, group, { eventKey: `patch:${hash(release.url)}`, storyKey: spec.cve });
  const disclosureReport = view(disclosure, group, { eventKey: spec.cve, storyKey: spec.cve });
  const [query, prior] = Date.parse(publishedAt) >= Date.parse(disclosure.publishedAt)
    ? [releaseReport, candidate(disclosureReport, "SAME_STORY", [release.url, disclosure.url], `NVD tags ${release.url} as the patch/release for ${spec.cve}`)]
    : [disclosureReport, candidate(releaseReport, "SAME_STORY", [disclosure.url, release.url], `NVD tags ${release.url} as the patch/release for ${spec.cve}`)];
  add("disclosure-vs-patch", query, prior, "unused NVD Patch-tagged release page");
}

async function documents(type: "PRORULE" | "RULE", page: number): Promise<FederalDocument[]> { const url = new URL("https://www.federalregister.gov/api/v1/documents.json");
  for (const [key, value] of [["per_page", "1000"], ["page", String(page)], ["conditions[type][]", type], ["order", "newest"]]) url.searchParams.append(key, value);
  for (const field of ["document_number", "title", "abstract", "publication_date", "html_url"]) url.searchParams.append("fields[]", field);
  const response = await fetch(url, { headers: { "user-agent": "SentinelIntel-Phase2-evaluation" }, signal: AbortSignal.timeout(30_000) });
  return ((await response.json()) as { results?: FederalDocument[] }).results ?? []; }
const normalize = (value: string | null | undefined) => (value ?? "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
const tokens = (value: string | null | undefined) => new Set(normalize(value).split(" ").filter((token) => token.length > 3));
const similarity = (a: string | null | undefined, b: string | null | undefined) => { const left = tokens(a), right = tokens(b);
  return [...left].filter((token) => right.has(token)).length / Math.max(1, new Set([...left, ...right]).size); };
const [proposed, rules] = await Promise.all(["PRORULE", "RULE"].map(async (type) => (await Promise.all(Array.from({ length: 10 }, (_, index) => documents(type as "PRORULE" | "RULE", index + 1)))).flat()));
const rulesByTitle = new Map<string, FederalDocument[]>(); for (const row of rules) (rulesByTitle.get(normalize(row.title)) ?? rulesByTitle.set(normalize(row.title), []).get(normalize(row.title))!).push(row);
const pair = proposed.flatMap((draft) => (rulesByTitle.get(normalize(draft.title)) ?? []).map((final) => ({ draft, final, score: similarity(draft.abstract, final.abstract) })))
  .filter(({ draft, final, score }) => score >= 0.6 && Date.parse(final.publication_date) >= Date.parse(draft.publication_date)
    && Date.parse(final.publication_date) - Date.parse(draft.publication_date) < 14 * 86_400_000 && !used.has(`FR:${draft.document_number}`) && !used.has(`FR:${final.document_number}`))
  .sort((a, b) => b.score - a.score)[0];
if (pair) { const story = `policy:${pair.draft.document_number}:${pair.final.document_number}`, group = `holdout:${story}`;
  const make = (row: FederalDocument, phase: string): BenchmarkReport => ({ reportId: `FR:${row.document_number}`, title: row.title, summary: row.abstract,
    sourceName: "Federal Register", firstParty: true, publishedAt: `${row.publication_date}T00:00:00Z`, ingestedAt: `${row.publication_date}T00:00:00Z`, frame: null,
    splitGroupId: group, identity: { eventKey: `${phase}:${row.document_number}`, storyKey: story } });
  const query = make(pair.final, "final"), prior = make(pair.draft, "draft"); add("policy-draft-vs-final", query,
    candidate(prior, "SAME_STORY", [pair.final.html_url, pair.draft.html_url], `exact-title official draft/final pair; abstract similarity ${pair.score.toFixed(3)}`), "additional official policy lifecycle pair"); }

const expected = { "roundup-containing-one-event": 6, "disclosure-vs-patch": 2, "policy-draft-vs-final": 1 };
const counts = Object.fromEntries(Object.keys(expected).map((stratum) => [stratum, output.filter((row) => row.samplingStratum === stratum).length]));
for (const [stratum, count] of Object.entries(expected)) if (counts[stratum] !== count) throw new Error(`${stratum}: expected ${count}, got ${counts[stratum]}`);
const out = path.resolve(REPO_ROOT, ".data/event-relations/holdout-repair-round2-construction.jsonl"); writeFileSync(out, output.map((row) => JSON.stringify(row)).join("\n") + "\n");
console.log(JSON.stringify({ cases: output.length, counts, out }));
