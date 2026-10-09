import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { parseArgs } from "node:util";
import { ResearchEvalCaseSchema, validateResearchCases, type ResearchEvalCase } from "./security-research-eval-core.ts";

interface Report { reportId: string; title: string; summary: string; sourceName: string; ingestedAt: string }
interface RelationRow { caseId: string; samplingStratum: string; query: Report; candidates: Array<Report & { annotation?: { sourceUrls?: string[] } }> }

const { values } = parseArgs({ options: {
  input: { type: "string", default: "datasets/event-relations/holdout.jsonl" },
  out: { type: "string", default: ".data/security-research/holdout-candidate.jsonl" },
  reviewers: { type: "string" },
} });
const rows = readFileSync(path.resolve(values.input!), "utf8").split(/\r?\n/).filter(Boolean).map((line) => JSON.parse(line) as RelationRow);
const reviewers = values.reviewers?.split(",").map((item) => item.trim()).filter(Boolean) ?? [];
if (reviewers.length && new Set(reviewers).size < 3) throw new Error("--reviewers requires at least three distinct model identifiers");
const built: ResearchEvalCase[] = [];
const usedRows = new Set<string>();
let storyId = 42_000;

const reports = (row: RelationRow): Report[] => [row.query, ...row.candidates];
const cves = (row: RelationRow): string[] => [...new Set(reports(row).flatMap((report) => report.title.match(/\bCVE-\d{4}-\d{4,}\b/gi) ?? []).map((item) => item.toUpperCase()))];
const urlsIn = (row: RelationRow): string[] => {
  const embedded = reports(row).flatMap((report) => report.summary.match(/https?:\/\/[^\s;]+/g) ?? []);
  const annotated = row.candidates.flatMap((candidate) => candidate.annotation?.sourceUrls ?? []);
  return [...new Set([...embedded, ...annotated].map((url) => url.replace(/[),.'"]+$/g, "")))].filter((url) => url.startsWith("https://"));
};
const vendorUrl = (row: RelationRow): { vendor: "cisco"; url: string } | null => {
  const url = urlsIn(row).find((item) => /^https:\/\/sec\.cloudapps\.cisco\.com\/security\/center\/content\/CiscoSecurityAdvisory\//.test(item));
  return url ? { vendor: "cisco", url } : null;
};
const hasKev = (row: RelationRow): boolean => reports(row).some((report) => report.sourceName.includes("Known Exploited Vulnerabilities"));
const take = (pool: RelationRow[], count: number, label: string): RelationRow[] => {
  const selected = pool.filter((row) => !usedRows.has(row.caseId)).slice(0, count);
  if (selected.length !== count) throw new Error(`${label}: need ${count} independent rows, found ${selected.length}`);
  for (const row of selected) usedRows.add(row.caseId);
  return selected;
};
const claim = (claimId: string, url: string) => ({ claim_id: claimId, critical: true, admissible_source_urls: [url] });
const provenance = (row: RelationRow, sourceUrls: string[], note: string) => ({
  source_urls: [...new Set(sourceUrls)], collected_at: "2026-10-08T00:00:00Z",
  label_method: reviewers.length ? "MODEL_REVIEWED" as const : "SOURCE_VERIFIED" as const,
  reviewers,
  note: `${note} Derived from independent frozen source row ${row.caseId}; no Phase 2 relation label is reused.`,
});
function base(row: RelationRow, serial: string, stratum: ResearchEvalCase["stratum"], objective: string, question: string) {
  const items = reports(row);
  return {
    case_id: `SRA-HOLD-${serial}`, split: "holdout" as const, stratum,
    input: { objective, snapshot: {
      schema_version: 1 as const, story_id: storyId++, story_version: 1,
      title: items.map((item) => item.title).join(" / ").slice(0, 2_000),
      digest: items.map((item) => item.summary).join("\n\n").slice(0, 20_000), status: "active" as const,
      facts: items.slice(0, 20).map((item, index) => ({ fact_id: index + 1, public_id: item.reportId.slice(0, 200), title: item.title.slice(0, 2_000) })),
      missing_questions: [question], captured_at: items.map((item) => item.ingestedAt).sort().at(-1)!,
    } },
  };
}

const vendorRows = take(rows.filter((row) => cves(row).length === 1 && vendorUrl(row)), 2, "vendor-remediation");
for (const [index, row] of vendorRows.entries()) {
  const cve = cves(row)[0]!, vendor = vendorUrl(row)!;
  const question = `Did ${vendor.vendor} publish an official advisory for ${cve}?`;
  built.push(ResearchEvalCaseSchema.parse({
    ...base(row, `VENDOR-${index + 1}`, "vendor-remediation", `Locate and fetch the official ${vendor.vendor} advisory for ${cve}.`, question),
    expected: { claims: [claim(`nvd_lookup:${cve}`, `https://nvd.nist.gov/vuln/detail/${cve}`), claim(`kev_lookup:${cve}`, "https://www.cisa.gov/known-exploited-vulnerabilities-catalog"), claim(`vendor_advisory:${vendor.vendor}:${cve}`, vendor.url)], unknown_questions: [], conflict_required: false, forbidden_conclusions: [`all ${vendor.vendor} products are affected`] },
    provenance: provenance(row, [`https://nvd.nist.gov/vuln/detail/${cve}`, "https://www.cisa.gov/known-exploited-vulnerabilities-catalog", vendor.url], "The registered official advisory URL is embedded in CISA KEV source evidence."),
  }));
}

const kevRows = take(rows.filter((row) => cves(row).length === 1 && hasKev(row)), 4, "kev-exploitation-status");
for (const [index, row] of kevRows.entries()) {
  const cve = cves(row)[0]!, question = `Is ${cve} listed in CISA KEV?`;
  built.push(ResearchEvalCaseSchema.parse({
    ...base(row, `KEV-${index + 1}`, "kev-exploitation-status", `Confirm the CISA KEV status of ${cve}.`, question),
    expected: { claims: [claim(`nvd_lookup:${cve}`, `https://nvd.nist.gov/vuln/detail/${cve}`), claim(`kev_lookup:${cve}`, "https://www.cisa.gov/known-exploited-vulnerabilities-catalog")], unknown_questions: [], conflict_required: false, forbidden_conclusions: [`${cve} is not exploited`] },
    provenance: provenance(row, [`https://nvd.nist.gov/vuln/detail/${cve}`, "https://www.cisa.gov/known-exploited-vulnerabilities-catalog"], "The source row contains independent NVD and CISA KEV records."),
  }));
}

const cveRows = take(rows.filter((row) => cves(row).length === 1), 5, "cve-details");
for (const [index, row] of cveRows.entries()) {
  const cve = cves(row)[0]!, question = `What authoritative vulnerability details are available for ${cve}?`;
  built.push(ResearchEvalCaseSchema.parse({
    ...base(row, `CVE-${index + 1}`, "cve-details", `Confirm the authoritative vulnerability record for ${cve}.`, question),
    expected: { claims: [claim(`nvd_lookup:${cve}`, `https://nvd.nist.gov/vuln/detail/${cve}`)], unknown_questions: [], conflict_required: false, forbidden_conclusions: [`${cve} does not exist`] },
    provenance: provenance(row, [`https://nvd.nist.gov/vuln/detail/${cve}`], "The NVD identity is present in independent holdout source material."),
  }));
}

const revisionRows = take(rows.filter((row) => ["advisory-revision-vs-republication", "advisory-republished-by-cert"].includes(row.samplingStratum)), 3, "official-source-conflict-or-revision");
for (const [index, row] of revisionRows.entries()) {
  const question = "Do the official records establish a material revision or conflict?";
  built.push(ResearchEvalCaseSchema.parse({
    ...base(row, `REVISION-${index + 1}`, "official-source-conflict-or-revision", "Compare the official source records without inventing agreement or conflict.", question),
    expected: { claims: [], unknown_questions: [question], conflict_required: false, forbidden_conclusions: ["the official sources conflict", "the sources have always been identical"] },
    provenance: provenance(row, urlsIn(row), "The source documents are real; conflict remains unknown without two fetched authoritative records."),
  }));
}

const pocRows = take(rows.filter((row) => row.samplingStratum === "poc-vs-disclosure" && cves(row).length), 3, "poc-source-quality");
for (const [index, row] of pocRows.entries()) {
  const cve = cves(row)[0]!, question = `Is a working public PoC for ${cve} confirmed by admissible primary evidence?`;
  built.push(ResearchEvalCaseSchema.parse({
    ...base(row, `POC-${index + 1}`, "poc-source-quality", `Assess the source quality of the reported PoC for ${cve}.`, question),
    expected: { claims: [claim(`nvd_lookup:${cve}`, `https://nvd.nist.gov/vuln/detail/${cve}`)], unknown_questions: [question], conflict_required: false, forbidden_conclusions: ["a search result proves a working exploit"] },
    provenance: provenance(row, [...urlsIn(row), `https://nvd.nist.gov/vuln/detail/${cve}`], "The disclosure and PoC references remain source material, not proof of a working exploit."),
  }));
}

const insufficientRows = take(rows.filter((row) => ["same-vendor-different-cve", "same-product-family-different-cve", "same-model-different-vulnerability"].includes(row.samplingStratum) && cves(row).length >= 2), 3, "insufficient-evidence");
for (const [index, row] of insufficientRows.entries()) {
  const [first, second] = cves(row), question = `Does remediation for ${first} also remediate ${second}?`;
  built.push(ResearchEvalCaseSchema.parse({
    ...base(row, `UNKNOWN-${index + 1}`, "insufficient-evidence", `Determine whether remediation can be transferred between ${first} and ${second}.`, question),
    expected: { claims: [claim(`nvd_lookup:${first}`, `https://nvd.nist.gov/vuln/detail/${first}`)], unknown_questions: [question], conflict_required: false, forbidden_conclusions: ["the same product means the same remediation", `${second} is not affected`] },
    provenance: provenance(row, [...urlsIn(row), `https://nvd.nist.gov/vuln/detail/${first}`], "Distinct vulnerabilities do not establish interchangeable remediation."),
  }));
}

if (reviewers.length) validateResearchCases(built, { holdout: true });
else if (built.length !== 20 || new Set(built.map((row) => row.stratum)).size !== 6) throw new Error("holdout candidate must contain 20 cases across six strata");
const out = path.resolve(values.out!);
mkdirSync(path.dirname(out), { recursive: true });
writeFileSync(out, `${built.map((row) => JSON.stringify(row)).join("\n")}\n`);
process.stdout.write(`${JSON.stringify({ ok: true, cases: built.length, reviewed: reviewers.length > 0, reviewers, out })}\n`);
