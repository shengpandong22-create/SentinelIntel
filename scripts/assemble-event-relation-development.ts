// Deterministically assembles only evidence-supported development candidates. Labels remain disputed
// until the two-model annotation command reviews them; this command never writes the frozen dataset.
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { parseArgs } from "node:util";
import { REPO_ROOT } from "@aihot/backend/config";
import { FROZEN_ALLOCATION, parseEventRelationJsonl, type EventRelationCase, type BenchmarkReport, type BenchmarkCandidate } from "./event-grouping-eval-core.ts";

interface EvidenceRecord {
  evidenceId: string; source: string; sourceName: string; url: string; title: string; summary: string;
  publishedAt: string; updatedAt: string | null; cves: string[]; products: string[]; referenceUrls: string[];
  raw?: { hardwareProducts?: string[] };
}
const { values } = parseArgs({ options: {
  input: { type: "string", default: ".data/event-relations/evidence-pool.jsonl" },
  out: { type: "string", default: ".data/event-relations/development-construction.jsonl" },
  split: { type: "string", default: "development" }, exclude: { type: "string" },
} });
if (values.split !== "development" && values.split !== "holdout") throw new Error("--split must be development or holdout");
const split = values.split;
const excludedReports = new Set(values.exclude ? parseEventRelationJsonl(readFileSync(path.resolve(REPO_ROOT, values.exclude), "utf8"))
  .flatMap((row) => [row.query.reportId, ...row.candidates.map((candidate) => candidate.reportId)]) : []);
const inputPath = path.resolve(REPO_ROOT, values.input!);
const raw = readFileSync(inputPath, "utf8").split(/\r?\n/).filter(Boolean).map((line) => JSON.parse(line) as EvidenceRecord);
const evidence = [...new Map(raw.map((row) => [row.evidenceId, row])).values()]
  .filter((row) => row.cves.length === 1 && row.title && row.summary && /^https?:\/\//.test(row.url));
const withinRecall = (a: EvidenceRecord, b: EvidenceRecord) => Math.abs(Date.parse(a.publishedAt) - Date.parse(b.publishedAt)) < 14 * 86_400_000;
const ordered = (a: EvidenceRecord, b: EvidenceRecord) => Date.parse(a.publishedAt) >= Date.parse(b.publishedAt) ? [a, b] as const : [b, a] as const;
const idPart = (value: string) => value.replace(/[^A-Za-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 70);

function report(row: EvidenceRecord): BenchmarkReport {
  const cve = row.cves[0]!;
  return { reportId: row.evidenceId, title: row.title, summary: row.summary, sourceName: row.sourceName,
    firstParty: false, publishedAt: row.publishedAt, ingestedAt: row.publishedAt, frame: null,
    splitGroupId: `${split}:${cve}`, identity: { eventKey: cve, storyKey: cve } };
}
function candidate(query: EvidenceRecord, row: EvidenceRecord, relation: "SAME_OCCURRENCE" | "UNRELATED"): BenchmarkCandidate {
  return { ...report(row), factTitle: row.title.slice(0, 200), members: 1, isDistractor: false,
    expectedInRecall: true, gold: { relation }, annotation: {
      status: "disputed", labelSource: "model-proposed", humanAdjudicated: false, labeller: "pending-dual-review",
      confidence: "low", adjudicator: null, sourceUrls: [query.url, row.url],
      note: "construction hypothesis only; requires independent proposal and review",
    } };
}
function makeCase(stratum: string, serial: number, query: EvidenceRecord, prior: EvidenceRecord, relation: "SAME_OCCURRENCE" | "UNRELATED"): EventRelationCase {
  return { caseId: `EVREL-${split === "development" ? "DEV" : "HOLD"}-${idPart(stratum)}-${String(serial).padStart(3, "0")}`, split,
    samplingStratum: stratum, query: report(query), candidates: [candidate(query, prior, relation)],
    construction: { assembledAt: new Date().toISOString(), assembledBy: "scripts/assemble-event-relation-development.ts",
      note: `deterministic evidence pairing from ${query.source} and ${prior.source}` } };
}

const byCve = new Map<string, EvidenceRecord[]>(), byProduct = new Map<string, EvidenceRecord[]>(), byVendor = new Map<string, EvidenceRecord[]>();
for (const row of evidence) {
  (byCve.get(row.cves[0]!) ?? byCve.set(row.cves[0]!, []).get(row.cves[0]!)!).push(row);
  for (const product of row.products) {
    (byProduct.get(product) ?? byProduct.set(product, []).get(product)!).push(row);
    const vendor = product.split(":", 1)[0]!.trim().toLowerCase();
    if (vendor) (byVendor.get(vendor) ?? byVendor.set(vendor, []).get(vendor)!).push(row);
  }
}

const output: EventRelationCase[] = [], usedPairs = new Set<string>();
const pairKey = (a: EvidenceRecord, b: EvidenceRecord) => [a.evidenceId, b.evidenceId].sort().join("\u0000");
function addPairs(stratum: string, quota: number, groups: Iterable<EvidenceRecord[]>, relation: "SAME_OCCURRENCE" | "UNRELATED", accept: (a: EvidenceRecord, b: EvidenceRecord) => boolean) {
  let serial = 0;
  for (const group of groups) {
    const unique = [...new Map(group.map((row) => [row.evidenceId, row])).values()].sort((a, b) => a.publishedAt.localeCompare(b.publishedAt) || a.evidenceId.localeCompare(b.evidenceId));
    for (let i = 0; i < unique.length; i++) for (let j = i + 1; j < unique.length; j++) {
      const a = unique[i]!, b = unique[j]!, key = pairKey(a, b);
      if (usedPairs.has(key) || excludedReports.has(a.evidenceId) || excludedReports.has(b.evidenceId) || !withinRecall(a, b) || !accept(a, b)) continue;
      const [query, prior] = ordered(a, b);
      usedPairs.add(key); output.push(makeCase(stratum, ++serial, query, prior, relation));
      if (serial === quota) return;
    }
  }
}

addPairs("same-cve-cross-source-different-url", FROZEN_ALLOCATION["same-cve-cross-source-different-url"][split], byCve.values(), "SAME_OCCURRENCE",
  (a, b) => a.source !== b.source && a.cves[0] === b.cves[0] && a.url !== b.url);
const byHardwareModel = new Map<string, EvidenceRecord[]>();
for (const row of evidence) for (const product of row.raw?.hardwareProducts ?? [])
  (byHardwareModel.get(product) ?? byHardwareModel.set(product, []).get(product)!).push(row);
for (const row of evidence.filter((item) => item.source === "cisa-kev")) for (const product of row.products) {
  if (!/router|camera|appliance|firepower|mobile device|chipset|gateway|vpn|switch|nas|network device/i.test(product)) continue;
  (byHardwareModel.get(product) ?? byHardwareModel.set(product, []).get(product)!).push(row);
}
addPairs("same-model-different-vulnerability", FROZEN_ALLOCATION["same-model-different-vulnerability"][split],
  [...byHardwareModel.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([, rows]) => rows), "UNRELATED",
  (a, b) => a.cves[0] !== b.cves[0]);
addPairs("same-product-family-different-cve", FROZEN_ALLOCATION["same-product-family-different-cve"][split], [...byProduct.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([, rows]) => rows), "UNRELATED",
  (a, b) => a.cves[0] !== b.cves[0] && a.products.some((product) => b.products.includes(product)));
addPairs("same-vendor-different-cve", FROZEN_ALLOCATION["same-vendor-different-cve"][split], [...byVendor.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([, rows]) => rows), "UNRELATED",
  (a, b) => a.cves[0] !== b.cves[0] && !a.products.some((product) => b.products.includes(product)));

const outPath = path.resolve(REPO_ROOT, values.out!);
mkdirSync(path.dirname(outPath), { recursive: true });
writeFileSync(outPath, output.map((row) => JSON.stringify(row)).join("\n") + (output.length ? "\n" : ""));
const counts = Object.fromEntries([...new Set(output.map((row) => row.samplingStratum))].map((stratum) => [stratum, output.filter((row) => row.samplingStratum === stratum).length]));
console.log(JSON.stringify({ input: evidence.length, output: output.length, counts, out: outPath }));
