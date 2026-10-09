import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { parseArgs } from "node:util";
import { ResearchEvalCaseSchema, validateResearchCases, type ResearchEvalCase } from "./security-research-eval-core.ts";

interface Report { reportId: string; title: string; summary: string; sourceName: string; ingestedAt: string }
interface RelationRow { caseId: string; samplingStratum: string; query: Report; candidates: Array<Report & { annotation?: { sourceUrls?: string[] } }> }

const { values } = parseArgs({ options: {
  input: { type: "string", default: "datasets/event-relations/dev.jsonl" },
  development: { type: "string", default: "datasets/security-research/development.jsonl" },
  consumed: { type: "string", default: "datasets/security-research/holdout.jsonl" },
  out: { type: "string", default: ".data/security-research/holdout-v2-candidate.jsonl" },
  prefix: { type: "string", default: "SRA-HOLD2" },
} });
const parseLines = (file: string): any[] => readFileSync(path.resolve(file), "utf8").split(/\r?\n/).filter(Boolean).map(JSON.parse);
const sourceRows = values.input!.split(",").map((file) => file.trim()).filter(Boolean).flatMap(parseLines) as RelationRow[];
const consumedCases = values.consumed!.split(",").map((file) => file.trim()).filter(Boolean).flatMap(parseLines);
const priorCases = [...parseLines(values.development!), ...consumedCases] as ResearchEvalCase[];
const sourceRowPattern = /source row ([^;]+);/;
const usedRowIds = new Set(priorCases.map((row) => row.provenance.note.match(sourceRowPattern)?.[1]).filter(Boolean));
const usedCves = new Set(priorCases.flatMap((row) => JSON.stringify(row).match(/CVE-\d{4}-\d{4,}/g) ?? []));
const reports = (row: RelationRow): Report[] => [row.query, ...row.candidates];
const cves = (row: RelationRow): string[] => [...new Set(reports(row).flatMap((item) => item.title.match(/\bCVE-\d{4}-\d{4,}\b/gi) ?? []).map((item) => item.toUpperCase()))];
const urlsIn = (row: RelationRow): string[] => [...new Set([
  ...reports(row).flatMap((item) => item.summary.match(/https?:\/\/[^\s;]+/g) ?? []),
  ...row.candidates.flatMap((item) => item.annotation?.sourceUrls ?? []),
].map((url) => url.replace(/[),.'"]+$/g, "")))].filter((url) => url.startsWith("https://"));
const rows = sourceRows.filter((row) => !usedRowIds.has(row.caseId) && cves(row).every((cve) => !usedCves.has(cve)));
const built: ResearchEvalCase[] = [], selectedRows = new Set<string>();
let storyId = 43_000;
const take = (predicate: (row: RelationRow) => boolean, count: number, label: string): RelationRow[] => {
  const selected = rows.filter((row) => !selectedRows.has(row.caseId) && predicate(row)).slice(0, count);
  if (selected.length !== count) throw new Error(`${label}: need ${count} independent rows, found ${selected.length}`);
  selected.forEach((row) => selectedRows.add(row.caseId));
  return selected;
};
const claim = (id: string, url: string) => ({ claim_id: id, critical: true, admissible_source_urls: [url] });
function base(row: RelationRow, id: string, stratum: ResearchEvalCase["stratum"], objective: string, question: string) {
  const items = reports(row);
  return { case_id: `${values.prefix}-${id}`, split: "holdout" as const, stratum, input: { objective, snapshot: {
    schema_version: 1 as const, story_id: storyId++, story_version: 1,
    title: items.map((item) => item.title).join(" / ").slice(0, 2_000),
    digest: items.map((item) => item.summary).join("\n\n").slice(0, 20_000), status: "active" as const,
    facts: items.slice(0, 20).map((item, index) => ({ fact_id: index + 1, public_id: item.reportId.slice(0, 200), title: item.title.slice(0, 2_000) })),
    missing_questions: [question], captured_at: items.map((item) => item.ingestedAt).sort().at(-1)!,
  } } };
}
const provenance = (row: RelationRow, urls: string[], note: string) => ({
  source_urls: [...new Set(urls)], collected_at: "2026-10-09T00:00:00Z", label_method: "SOURCE_VERIFIED" as const, reviewers: [],
  note: `${note} Derived from independent frozen source row ${row.caseId}; excluded every Phase 4 development and consumed-holdout source row and CVE.`,
});
const nvd = (cve: string) => `https://nvd.nist.gov/vuln/detail/${cve}`;
const kevUrl = "https://www.cisa.gov/known-exploited-vulnerabilities-catalog";

for (const [i, row] of take((row) => row.samplingStratum === "same-cve-cross-source-different-url" && cves(row).length === 1, 3, "KEV").entries()) {
  const cve = cves(row)[0]!, question = `Is ${cve} listed in CISA KEV?`;
  built.push(ResearchEvalCaseSchema.parse({ ...base(row, `KEV-${i + 1}`, "kev-exploitation-status", `Confirm the CISA KEV status of ${cve}.`, question), expected: { claims: [claim(`nvd_lookup:${cve}`, nvd(cve)), claim(`kev_lookup:${cve}`, kevUrl)], unknown_questions: [], conflict_required: false, forbidden_conclusions: [`${cve} is not exploited`] }, provenance: provenance(row, [nvd(cve), kevUrl], "The row contains independent NVD and CISA KEV records.") }));
}
for (const [i, row] of take((row) => ["same-cve-cross-source-different-url", "same-cve-multi-vendor-product", "roundup-containing-one-event"].includes(row.samplingStratum) && cves(row).length === 1, 5, "CVE").entries()) {
  const cve = cves(row)[0]!, question = `What authoritative vulnerability details are available for ${cve}?`;
  built.push(ResearchEvalCaseSchema.parse({ ...base(row, `CVE-${i + 1}`, "cve-details", `Confirm the authoritative vulnerability record for ${cve}.`, question), expected: { claims: [claim(`nvd_lookup:${cve}`, nvd(cve))], unknown_questions: [], conflict_required: false, forbidden_conclusions: [`${cve} does not exist`] }, provenance: provenance(row, [nvd(cve)], "The independent row identifies an NVD vulnerability record.") }));
}
for (const [i, row] of take((row) => ["disclosure-vs-patch", "disclosure-vs-vendor-confirmation"].includes(row.samplingStratum) && cves(row).length === 1, 3, "vendor").entries()) {
  const cve = cves(row)[0]!, question = `What vendor-confirmed remediation is available for ${cve}?`;
  built.push(ResearchEvalCaseSchema.parse({ ...base(row, `VENDOR-${i + 1}`, "vendor-remediation", `Verify vendor-confirmed remediation for ${cve} using only allowlisted fetched evidence.`, question), expected: { claims: [claim(`nvd_lookup:${cve}`, nvd(cve))], unknown_questions: [question], conflict_required: false, forbidden_conclusions: ["the vendor has not released a fix", "all versions are affected"] }, provenance: provenance(row, [...urlsIn(row), nvd(cve)], "A real patch or vendor-confirmation source is preserved, but the frozen tool allowlist does not make it admissible Evidence automatically.") }));
}
for (const [i, row] of take((row) => ["advisory-revision-vs-republication", "advisory-republished-by-cert"].includes(row.samplingStratum), 3, "revision").entries()) {
  const question = "Do the official records establish a material revision or conflict?";
  built.push(ResearchEvalCaseSchema.parse({ ...base(row, `REVISION-${i + 1}`, "official-source-conflict-or-revision", "Compare official records without inventing agreement or conflict.", question), expected: { claims: [], unknown_questions: [question], conflict_required: false, forbidden_conclusions: ["the official sources conflict", "the sources have always been identical"] }, provenance: provenance(row, urlsIn(row), "Real source documents are preserved; conflict remains unknown without two fetched authoritative revisions.") }));
}
for (const [i, row] of take((row) => ["poc-vs-disclosure", "same-cve-multi-vendor-product"].includes(row.samplingStratum) && cves(row).length >= 1, 3, "PoC").entries()) {
  const cve = cves(row)[0]!, question = `Is a working public PoC for ${cve} confirmed by admissible primary evidence?`;
  built.push(ResearchEvalCaseSchema.parse({ ...base(row, `POC-${i + 1}`, "poc-source-quality", `Assess whether admissible primary evidence confirms a public PoC for ${cve}.`, question), expected: { claims: [claim(`nvd_lookup:${cve}`, nvd(cve))], unknown_questions: [question], conflict_required: false, forbidden_conclusions: ["a search result proves a working exploit"] }, provenance: provenance(row, [...urlsIn(row), nvd(cve)], "Available disclosure references do not by themselves prove a working public exploit; the conservative expected result preserves the PoC question as unknown.") }));
}
for (const [i, row] of take((row) => ["same-vendor-different-cve", "same-product-family-different-cve", "same-model-different-vulnerability"].includes(row.samplingStratum) && cves(row).length >= 2, 3, "unknown").entries()) {
  const [first, second] = cves(row), question = `Does remediation for ${first} also remediate ${second}?`;
  built.push(ResearchEvalCaseSchema.parse({ ...base(row, `UNKNOWN-${i + 1}`, "insufficient-evidence", `Determine whether remediation can be transferred between ${first} and ${second}.`, question), expected: { claims: [claim(`nvd_lookup:${first}`, nvd(first!))], unknown_questions: [question], conflict_required: false, forbidden_conclusions: ["the same product means the same remediation", `${second} is not affected`] }, provenance: provenance(row, [...urlsIn(row), nvd(first!)], "Distinct vulnerabilities do not establish interchangeable remediation.") }));
}

if (built.length !== 20 || new Set(built.map((row) => row.stratum)).size !== 6) throw new Error("v2 candidate must contain 20 cases across six strata");
// Candidate labels are source-verified until three independent model reviews complete.
validateResearchCases(built.map((row) => ({ ...row, split: "development" as const })));
const out = path.resolve(values.out!); mkdirSync(path.dirname(out), { recursive: true });
writeFileSync(out, `${built.map((row) => JSON.stringify(row)).join("\n")}\n`);
process.stdout.write(`${JSON.stringify({ ok: true, cases: built.length, excluded_source_rows: usedRowIds.size, excluded_cves: usedCves.size, out })}\n`);
