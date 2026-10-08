// Builds pending cases from directly fetched reference pages. Semantic boundary cases stay disputed
// for dual-model review; this script does not freeze a dataset.
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { parseArgs } from "node:util";
import { REPO_ROOT } from "@aihot/backend/config";
import { FROZEN_ALLOCATION, parseEventRelationJsonl, type BenchmarkCandidate, type BenchmarkReport, type EventRelationCase } from "./event-grouping-eval-core.ts";

interface Evidence { evidenceId: string; source: string; sourceName: string; url: string; title: string; summary: string;
  publishedAt: string | null; cves: string[]; products: string[]; referenceUrls: string[]; raw?: { category?: string; parentEvidenceIds?: string[] } }
const { values } = parseArgs({ options: {
  evidence: { type: "string", default: ".data/event-relations/evidence-pool.jsonl" },
  references: { type: "string", default: ".data/event-relations/reference-evidence.jsonl" },
  out: { type: "string", default: ".data/event-relations/reference-development-construction.jsonl" },
  split: { type: "string", default: "development" }, exclude: { type: "string" },
} });
if (values.split !== "development" && values.split !== "holdout") throw new Error("--split must be development or holdout");
const split = values.split;
const excludedReports = new Set(values.exclude ? parseEventRelationJsonl(readFileSync(path.resolve(REPO_ROOT, values.exclude), "utf8"))
  .flatMap((row) => [row.query.reportId, ...row.candidates.map((candidate) => candidate.reportId)]) : []);
const quota = (stratum: keyof typeof FROZEN_ALLOCATION) => FROZEN_ALLOCATION[stratum][split];
const read = (file: string) => readFileSync(path.resolve(REPO_ROOT, file), "utf8").split(/\r?\n/).filter(Boolean).map((line) => JSON.parse(line) as Evidence);
const base = [...new Map(read(values.evidence!).map((row) => [row.evidenceId, row])).values()];
const refs = read(values.references!).filter((row) => row.publishedAt && row.title && row.summary && row.raw?.category);
const byId = new Map(base.map((row) => [row.evidenceId, row]));
const hash = (value: string) => createHash("sha256").update(value).digest("hex").slice(0, 16);
const time = (row: Evidence) => Date.parse(row.publishedAt!);
const withinRecall = (a: Evidence, b: Evidence) => Math.abs(time(a) - time(b)) < 14 * 86_400_000;

function view(row: Evidence, identity: { eventKey: string; storyKey: string }): BenchmarkReport {
  return { reportId: row.evidenceId, title: row.title, summary: row.summary, sourceName: row.sourceName, firstParty: row.source === "reference-page",
    publishedAt: row.publishedAt, ingestedAt: row.publishedAt!, frame: null, splitGroupId: `${split}:${identity.storyKey}`, identity };
}
function makeCandidate(query: Evidence, row: Evidence, relation: "SAME_STORY" | "SAME_OCCURRENCE" | "UNRELATED" | "ROUNDUP",
  identity: { eventKey: string; storyKey: string }): BenchmarkCandidate {
  return { ...view(row, identity), factTitle: row.title.slice(0, 200), members: 1, isDistractor: false, expectedInRecall: true,
    gold: { relation }, annotation: { status: "disputed", labelSource: "model-proposed", humanAdjudicated: false,
      labeller: "pending-dual-review", confidence: "low", adjudicator: null, sourceUrls: [query.url, row.url],
      note: "reference-page construction hypothesis; requires independent proposal and review" } };
}
const output: EventRelationCase[] = [], usedRefs = new Set<string>();
function add(stratum: string, queryRow: Evidence, candidateRow: Evidence, relation: "SAME_STORY" | "SAME_OCCURRENCE" | "UNRELATED" | "ROUNDUP",
  queryIdentity: { eventKey: string; storyKey: string }, candidateIdentity: { eventKey: string; storyKey: string }) {
  if (!withinRecall(queryRow, candidateRow)) return false;
  if (excludedReports.has(queryRow.evidenceId) || excludedReports.has(candidateRow.evidenceId)) return false;
  const [query, prior, qIdentity, cIdentity] = time(queryRow) >= time(candidateRow)
    ? [queryRow, candidateRow, queryIdentity, candidateIdentity] as const
    : [candidateRow, queryRow, candidateIdentity, queryIdentity] as const;
  const serial = output.filter((row) => row.samplingStratum === stratum).length + 1;
  output.push({ caseId: `EVREL-${split === "development" ? "DEV" : "HOLD"}-${stratum.replace(/[^a-z0-9]+/gi, "-")}-${String(serial).padStart(3, "0")}`,
    split, samplingStratum: stratum, query: view(query, qIdentity), candidates: [makeCandidate(query, prior, relation, cIdentity)],
    construction: { assembledAt: new Date().toISOString(), assembledBy: "scripts/assemble-event-relation-reference-development.ts",
      note: `direct reference page category ${queryRow.raw?.category}` } });
  usedRefs.add(queryRow.evidenceId);
  return true;
}
const parent = (row: Evidence, cve?: string) => (row.raw?.parentEvidenceIds ?? []).map((id) => byId.get(id)).find((item) => item && (!cve || item.cves.includes(cve)));

const multi = refs.filter((row) => row.raw?.category === "multi-cve-advisory" && row.cves.length > 1).sort((a, b) => a.url.localeCompare(b.url));
const roundupLike = (row: Evidence) => /bulletin|release|updates?|monthly|weekly|patch|security fixes|chrome|android/i.test(`${row.title} ${row.url}`);
for (const row of multi.filter(roundupLike)) {
  if (output.filter((item) => item.samplingStratum === "roundup-containing-one-event").length === quota("roundup-containing-one-event")) break;
  const cve = row.cves[0]!, prior = parent(row, cve); if (!prior) continue;
  add("roundup-containing-one-event", row, prior, "ROUNDUP",
    { eventKey: `roundup:${hash(row.url)}`, storyKey: `roundup:${hash(row.url)}` }, { eventKey: cve, storyKey: cve });
}
for (const row of multi.filter((row) => !usedRefs.has(row.evidenceId))) {
  if (output.filter((item) => item.samplingStratum === "multiple-cves-in-one-advisory").length === quota("multiple-cves-in-one-advisory")) break;
  const cve = row.cves[0]!, prior = parent(row, cve); if (!prior) continue;
  add("multiple-cves-in-one-advisory", row, prior, "UNRELATED",
    { eventKey: `document:${hash(row.url)}`, storyKey: `document:${hash(row.url)}` }, { eventKey: cve, storyKey: cve });
}
for (const row of refs.filter((item) => item.raw?.category === "patch-or-release")) {
  if (output.filter((item) => item.samplingStratum === "disclosure-vs-patch").length === quota("disclosure-vs-patch")) break;
  if (row.cves.length !== 1) continue;
  const cve = row.cves[0]!, prior = parent(row, cve); if (!prior) continue;
  add("disclosure-vs-patch", row, prior, "SAME_STORY", { eventKey: `patch:${hash(row.url)}`, storyKey: cve }, { eventKey: cve, storyKey: cve });
}
for (const row of refs.filter((item) => item.raw?.category === "vendor-advisory")) {
  if (output.filter((item) => item.samplingStratum === "disclosure-vs-vendor-confirmation").length === quota("disclosure-vs-vendor-confirmation")) break;
  if (row.cves.length !== 1) continue;
  const cve = row.cves[0]!, prior = parent(row, cve); if (!prior) continue;
  add("disclosure-vs-vendor-confirmation", row, prior, "SAME_OCCURRENCE",
    { eventKey: cve, storyKey: cve }, { eventKey: cve, storyKey: cve });
}
for (const row of refs.filter((item) => item.raw?.category === "cert")) {
  if (output.filter((item) => item.samplingStratum === "advisory-republished-by-cert").length === quota("advisory-republished-by-cert")) break;
  if (row.cves.length !== 1) continue;
  const cve = row.cves[0]!, prior = parent(row, cve); if (!prior) continue;
  add("advisory-republished-by-cert", row, prior, "SAME_OCCURRENCE", { eventKey: cve, storyKey: cve }, { eventKey: cve, storyKey: cve });
}
for (const row of refs.filter((item) => item.raw?.category === "poc")) {
  if (output.filter((item) => item.samplingStratum === "poc-vs-disclosure").length === quota("poc-vs-disclosure")) break;
  if (row.cves.length !== 1) continue;
  const cve = row.cves[0]!, prior = parent(row, cve); if (!prior) continue;
  add("poc-vs-disclosure", row, prior, "SAME_STORY", { eventKey: `poc:${hash(row.url)}`, storyKey: cve }, { eventKey: cve, storyKey: cve });
}
const normalizedVendor = (value: string) => value.toLowerCase().replace(/[^a-z0-9]+/g, "");
const representedVendor = (row: Evidence): string | null => {
  const location = normalizedVendor(`${new URL(row.url).hostname} ${new URL(row.url).pathname}`);
  const vendors = [...new Set(row.products.map((product) => normalizedVendor(product.split(":", 1)[0]!)).filter(Boolean))];
  return vendors.find((vendor) => vendor.length >= 3 && location.includes(vendor)) ?? null;
};
const referencesByCve = new Map<string, Evidence[]>();
for (const row of refs) if (row.cves.length === 1 && representedVendor(row))
  (referencesByCve.get(row.cves[0]!) ?? referencesByCve.set(row.cves[0]!, []).get(row.cves[0]!)!).push(row);
for (const [cve, rows] of [...referencesByCve].sort(([a], [b]) => a.localeCompare(b))) {
  if (output.filter((row) => row.samplingStratum === "same-cve-multi-vendor-product").length === quota("same-cve-multi-vendor-product")) break;
  outer: for (let i = 0; i < rows.length; i++) for (let j = i + 1; j < rows.length; j++) {
    const a = rows[i]!, b = rows[j]!, aVendor = representedVendor(a), bVendor = representedVendor(b);
    if (!aVendor || !bVendor || aVendor === bVendor) continue;
    if (add("same-cve-multi-vendor-product", a, b, "SAME_OCCURRENCE",
      { eventKey: cve, storyKey: cve }, { eventKey: cve, storyKey: cve })) break outer;
  }
}
const outPath = path.resolve(REPO_ROOT, values.out!);
mkdirSync(path.dirname(outPath), { recursive: true });
writeFileSync(outPath, output.map((row) => JSON.stringify(row)).join("\n") + (output.length ? "\n" : ""));
const counts = Object.fromEntries([...new Set(output.map((row) => row.samplingStratum))].map((stratum) => [stratum, output.filter((row) => row.samplingStratum === stratum).length]));
console.log(JSON.stringify({ references: refs.length, output: output.length, counts, out: outPath }));
