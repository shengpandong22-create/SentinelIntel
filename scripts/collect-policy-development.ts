// Collects same-day proposed/direct-final rule pairs from the official Federal Register API. These are
// pending Phase 2 development cases, not frozen labels.
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { parseArgs } from "node:util";
import { REPO_ROOT } from "@aihot/backend/config";
import { FROZEN_ALLOCATION, parseEventRelationJsonl, type BenchmarkCandidate, type BenchmarkReport, type EventRelationCase } from "./event-grouping-eval-core.ts";

interface Document { document_number: string; title: string; type: string; abstract: string; publication_date: string;
  html_url: string; regulation_id_numbers?: string[] }
const { values } = parseArgs({ options: { out: { type: "string", default: ".data/event-relations/policy-development-construction.jsonl" },
  split: { type: "string", default: "development" }, exclude: { type: "string", multiple: true } } });
if (values.split !== "development" && values.split !== "holdout") throw new Error("--split must be development or holdout");
const split = values.split;
const excludedReports = new Set((values.exclude ?? []).flatMap((file) => parseEventRelationJsonl(readFileSync(path.resolve(REPO_ROOT, file), "utf8")))
  .flatMap((row) => [row.query.reportId, ...row.candidates.map((candidate) => candidate.reportId)]));
async function documents(type: "PRORULE" | "RULE", page: number): Promise<Document[]> {
  const url = new URL("https://www.federalregister.gov/api/v1/documents.json");
  for (const [key, value] of [["per_page", "1000"], ["page", String(page)], ["conditions[type][]", type], ["order", "newest"]]) url.searchParams.append(key, value);
  for (const field of ["document_number", "title", "type", "abstract", "publication_date", "html_url", "regulation_id_numbers"]) url.searchParams.append("fields[]", field);
  const response = await fetch(url, { headers: { accept: "application/json", "user-agent": "SentinelIntel-Phase2-evaluation" }, signal: AbortSignal.timeout(30_000) });
  if (!response.ok) throw new Error(`Federal Register API: HTTP ${response.status}`);
  return ((await response.json()) as { results: Document[] }).results;
}
const normalize = (value: string) => value.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
const [proposedPages, rulePages] = await Promise.all([
  Promise.all(Array.from({ length: 10 }, (_, index) => documents("PRORULE", index + 1))),
  Promise.all(Array.from({ length: 10 }, (_, index) => documents("RULE", index + 1))),
]);
const proposed = proposedPages.flat(), rules = rulePages.flat();
const rulesByTitle = new Map<string, Document[]>();
for (const row of rules) (rulesByTitle.get(normalize(row.title)) ?? rulesByTitle.set(normalize(row.title), []).get(normalize(row.title))!).push(row);

function identity(row: Document, storyKey: string) { return { eventKey: `federal-register:${row.document_number}`, storyKey }; }
function report(row: Document, storyKey: string): BenchmarkReport {
  return { reportId: `FR:${row.document_number}`, title: row.title, summary: row.abstract, sourceName: "Federal Register",
    firstParty: true, publishedAt: `${row.publication_date}T00:00:00Z`, ingestedAt: `${row.publication_date}T00:00:00Z`, frame: null,
    splitGroupId: `${split}:${storyKey}`, identity: identity(row, storyKey) };
}
function candidate(query: Document, row: Document, storyKey: string): BenchmarkCandidate {
  return { ...report(row, storyKey), factTitle: row.title.slice(0, 200), members: 1, isDistractor: false, expectedInRecall: true,
    gold: { relation: "SAME_STORY" }, annotation: { status: "disputed", labelSource: "model-proposed", humanAdjudicated: false,
      labeller: "pending-dual-review", confidence: "low", adjudicator: null, sourceUrls: [query.html_url, row.html_url],
      note: "same-day proposed/direct-final rule hypothesis from official Federal Register metadata" } };
}
const cases: EventRelationCase[] = [];
for (const draft of proposed) {
  const finals = rulesByTitle.get(normalize(draft.title)) ?? [];
  const final = finals.find((row) => Math.abs(Date.parse(row.publication_date) - Date.parse(draft.publication_date)) < 14 * 86_400_000);
  if (!final) continue;
  if (excludedReports.has(`FR:${draft.document_number}`) || excludedReports.has(`FR:${final.document_number}`)) continue;
  const storyKey = `policy:${draft.regulation_id_numbers?.[0] ?? normalize(draft.title)}`;
  const [query, prior] = final.document_number > draft.document_number ? [final, draft] : [draft, final];
  const serial = cases.length + 1;
  cases.push({ caseId: `EVREL-${split === "development" ? "DEV" : "HOLD"}-policy-draft-vs-final-${String(serial).padStart(3, "0")}`, split,
    samplingStratum: "policy-draft-vs-final", query: report(query, storyKey), candidates: [candidate(query, prior, storyKey)],
    construction: { assembledAt: new Date().toISOString(), assembledBy: "scripts/collect-policy-development.ts",
      note: "exact normalized title and publication gap below 14 days" } });
  if (cases.length === FROZEN_ALLOCATION["policy-draft-vs-final"][split]) break;
}
const tokens = (value: string) => new Set(normalize(value).split(" ").filter((token) => token.length > 2));
const similarity = (a: string, b: string) => {
  const left = tokens(a), right = tokens(b), intersection = [...left].filter((token) => right.has(token)).length;
  return intersection / Math.max(1, new Set([...left, ...right]).size);
};
const followups: Array<[Document, Document]> = [];
const lifecycleCue = (row: Document) => /\b(correction|correcting|stay of effective date|delay(?:ing|ed)? (?:the )?effective date|implementation date)\b/i.test(row.title);
for (let i = 0; i < rules.length; i++) for (let j = i + 1; j < rules.length; j++) {
  const a = rules[i]!, b = rules[j]!;
  const sharedRin = (a.regulation_id_numbers ?? []).some((rin) => b.regulation_id_numbers?.includes(rin));
  const gap = Math.abs(Date.parse(a.publication_date) - Date.parse(b.publication_date));
  if (!sharedRin || gap === 0 || gap >= 14 * 86_400_000 || similarity(a.title, b.title) < 0.7 || (!lifecycleCue(a) && !lifecycleCue(b))) continue;
  followups.push([a, b]);
}
const usedFollowupDocuments = new Set<string>();
for (const [a, b] of followups.sort(([a1], [b1]) => a1.document_number.localeCompare(b1.document_number))) {
  if (cases.filter((row) => row.samplingStratum === "policy-amendment-or-implementation-date").length === FROZEN_ALLOCATION["policy-amendment-or-implementation-date"][split]) break;
  if (usedFollowupDocuments.has(a.document_number) || usedFollowupDocuments.has(b.document_number)) continue;
  if (excludedReports.has(`FR:${a.document_number}`) || excludedReports.has(`FR:${b.document_number}`)) continue;
  const storyKey = `policy-followup:${[a.document_number, b.document_number].sort().join(":")}`;
  const [query, prior] = Date.parse(a.publication_date) >= Date.parse(b.publication_date) ? [a, b] : [b, a];
  const serial = cases.filter((row) => row.samplingStratum === "policy-amendment-or-implementation-date").length + 1;
  cases.push({ caseId: `EVREL-${split === "development" ? "DEV" : "HOLD"}-policy-amendment-or-implementation-date-${String(serial).padStart(3, "0")}`, split,
    samplingStratum: "policy-amendment-or-implementation-date", query: report(query, storyKey), candidates: [candidate(query, prior, storyKey)],
    construction: { assembledAt: new Date().toISOString(), assembledBy: "scripts/collect-policy-development.ts",
      note: `shared RIN, title token similarity ${similarity(a.title, b.title).toFixed(3)}, publication gap below 14 days` } });
  usedFollowupDocuments.add(a.document_number); usedFollowupDocuments.add(b.document_number);
}
const outPath = path.resolve(REPO_ROOT, values.out!);
mkdirSync(path.dirname(outPath), { recursive: true });
writeFileSync(outPath, cases.map((row) => JSON.stringify(row)).join("\n") + (cases.length ? "\n" : ""));
console.log(JSON.stringify({ proposed: proposed.length, rules: rules.length, cases: cases.length,
  counts: Object.fromEntries([...new Set(cases.map((row) => row.samplingStratum))].map((key) => [key, cases.filter((row) => row.samplingStratum === key).length])), out: outPath }));
