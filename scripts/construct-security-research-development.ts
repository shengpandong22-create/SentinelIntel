import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { parseArgs } from "node:util";
import { ResearchEvalCaseSchema, validateResearchCases, type ResearchEvalCase } from "./security-research-eval-core.ts";

interface Report {
  reportId: string;
  title: string;
  summary: string;
  sourceName: string;
  ingestedAt: string;
  identity?: { eventKey?: string };
}
interface RelationRow {
  caseId: string;
  samplingStratum: string;
  query: Report;
  candidates: Array<Report & { annotation?: { sourceUrls?: string[] } }>;
}

const { values } = parseArgs({ options: {
  input: { type: "string", default: "datasets/event-relations/dev.jsonl" },
  out: { type: "string", default: "datasets/security-research/development.jsonl" },
} });
const rows = readFileSync(path.resolve(values.input!), "utf8").split(/\r?\n/).filter(Boolean).map((line) => JSON.parse(line) as RelationRow);
const built: ResearchEvalCase[] = [];
const usedSourceRows = new Set<string>();
let storyId = 41_000;

function reports(row: RelationRow): Report[] {
  return [row.query, ...row.candidates];
}

function cves(row: RelationRow): string[] {
  return [...new Set(reports(row).flatMap((report) => report.title.match(/\bCVE-\d{4}-\d{4,}\b/gi) ?? []).map((item) => item.toUpperCase()))];
}

function urlsIn(row: RelationRow): string[] {
  const text = reports(row).map((report) => report.summary).join(" ");
  const embedded = text.match(/https?:\/\/[^\s;]+/g) ?? [];
  const annotated = row.candidates.flatMap((candidate) => candidate.annotation?.sourceUrls ?? []);
  return [...new Set([...embedded, ...annotated].map((url) => url.replace(/[),.'"]+$/g, "")))]
    .filter((url) => !["https://www.cisa.gov/notification", "https://www.cisa.gov/privacy-policy"].includes(url));
}

function base(row: RelationRow, serial: string, stratum: ResearchEvalCase["stratum"], objective: string, question: string) {
  const items = reports(row);
  return {
    case_id: `SRA-DEV-${serial}`,
    split: "development" as const,
    stratum,
    input: {
      objective,
      snapshot: {
        schema_version: 1 as const,
        story_id: storyId++,
        story_version: 1,
        title: items.map((item) => item.title).join(" / ").slice(0, 2_000),
        digest: items.map((item) => item.summary).join("\n\n").slice(0, 20_000),
        status: "active" as const,
        facts: items.slice(0, 20).map((item, index) => ({ fact_id: index + 1, public_id: item.reportId.slice(0, 200), title: item.title.slice(0, 2_000) })),
        missing_questions: [question],
        captured_at: items.map((item) => item.ingestedAt).sort().at(-1)!,
      },
    },
  };
}

function sourceProvenance(row: RelationRow, sourceUrls: string[], note: string) {
  return {
    source_urls: [...new Set(sourceUrls)],
    collected_at: "2026-10-08T00:00:00Z",
    label_method: "SOURCE_VERIFIED" as const,
    reviewers: [],
    note: `${note} Derived from frozen source row ${row.caseId}; no Phase 2 relation label is reused.`,
  };
}

function sourceClaims(cve: string, includeKev: boolean, extra: Array<{ claim_id: string; url: string }> = []) {
  return [
    { claim_id: `nvd_lookup:${cve}`, critical: true, admissible_source_urls: [`https://nvd.nist.gov/vuln/detail/${cve}`] },
    ...(includeKev ? [{ claim_id: `kev_lookup:${cve}`, critical: true, admissible_source_urls: ["https://www.cisa.gov/known-exploited-vulnerabilities-catalog"] }] : []),
    ...extra.map((item) => ({ claim_id: item.claim_id, critical: true, admissible_source_urls: [item.url] })),
  ];
}

const crossSource = rows.filter((row) => row.samplingStratum === "same-cve-cross-source-different-url" && cves(row).length === 1);
for (const [index, row] of crossSource.slice(0, 4).entries()) {
  const cve = cves(row)[0]!;
  const question = `What authoritative vulnerability details are available for ${cve}?`;
  const item = {
    ...base(row, `CVE-${String(index + 1).padStart(3, "0")}`, "cve-details", `Confirm the authoritative vulnerability record for ${cve}.`, question),
    expected: { claims: sourceClaims(cve, true), unknown_questions: [], conflict_required: false, forbidden_conclusions: [`${cve} does not exist`] },
    provenance: sourceProvenance(row, [`https://nvd.nist.gov/vuln/detail/${cve}`, "https://www.cisa.gov/known-exploited-vulnerabilities-catalog"], "NVD and CISA KEV identities are present in the frozen source material."),
  };
  built.push(ResearchEvalCaseSchema.parse(item)); usedSourceRows.add(row.caseId);
}
for (const [index, row] of crossSource.slice(4, 8).entries()) {
  const cve = cves(row)[0]!;
  const question = `Is ${cve} listed in CISA KEV?`;
  built.push(ResearchEvalCaseSchema.parse({
    ...base(row, `KEV-${String(index + 1).padStart(3, "0")}`, "kev-exploitation-status", `Confirm the CISA KEV status of ${cve}.`, question),
    expected: { claims: sourceClaims(cve, true), unknown_questions: [], conflict_required: false, forbidden_conclusions: [`${cve} is not exploited`] },
    provenance: sourceProvenance(row, [`https://nvd.nist.gov/vuln/detail/${cve}`, "https://www.cisa.gov/known-exploited-vulnerabilities-catalog"], "The frozen source row pairs the NVD record with a CISA KEV entry."),
  })); usedSourceRows.add(row.caseId);
}

const vendorCandidates = rows.flatMap((row) => {
  const cve = cves(row)[0];
  if (!cve) return [];
  const urls = urlsIn(row);
  const cisco = urls.find((url) => /^https:\/\/sec\.cloudapps\.cisco\.com\/security\/center\/content\/CiscoSecurityAdvisory\//.test(url));
  const microsoft = urls.find((url) => /^(?:https:\/\/msrc\.microsoft\.com\/update-guide\/(?:en-US\/)?vulnerability\/|https:\/\/portal\.msrc\.microsoft\.com\/en-US\/security-guidance\/advisory\/)/.test(url));
  if (cisco) return [{ row, cve, vendor: "cisco", url: cisco }];
  if (microsoft) return [{ row, cve, vendor: "microsoft", url: `https://msrc.microsoft.com/update-guide/vulnerability/${cve}` }];
  return [];
}).filter((item) => !usedSourceRows.has(item.row.caseId)).slice(0, 4);
if (vendorCandidates.length < 4) throw new Error(`need four vendor advisory cases, found ${vendorCandidates.length}`);
for (const [index, item] of vendorCandidates.entries()) {
  const { row, cve, vendor, url } = item;
  const question = `Did ${vendor} publish an official advisory for ${cve}?`;
  built.push(ResearchEvalCaseSchema.parse({
    ...base(row, `VENDOR-${String(index + 1).padStart(3, "0")}`, "vendor-remediation", `Locate and fetch the official ${vendor} advisory for ${cve}.`, question),
    expected: {
      claims: sourceClaims(cve, true, [{ claim_id: `vendor_advisory:${vendor}:${cve}`, url }]),
      unknown_questions: [], conflict_required: false,
      forbidden_conclusions: [`all ${vendor} products are affected`],
    },
    provenance: sourceProvenance(row, [`https://nvd.nist.gov/vuln/detail/${cve}`, "https://www.cisa.gov/known-exploited-vulnerabilities-catalog", url], "The official vendor advisory URL is embedded in the frozen source evidence."),
  })); usedSourceRows.add(row.caseId);
}

const revisionRows = rows.filter((row) => ["advisory-revision-vs-republication", "advisory-republished-by-cert"].includes(row.samplingStratum)).slice(0, 4);
if (revisionRows.length < 4) throw new Error(`need four revision/source-comparison cases, found ${revisionRows.length}`);
for (const [index, row] of revisionRows.entries()) {
  const question = "Do the official records establish a material revision or conflict?";
  const sources = urlsIn(row).filter((url) => url.startsWith("https://")).slice(0, 20);
  built.push(ResearchEvalCaseSchema.parse({
    ...base(row, `REVISION-${String(index + 1).padStart(3, "0")}`, "official-source-conflict-or-revision", "Compare the official source records without inventing agreement or conflict.", question),
    expected: { claims: [], unknown_questions: [question], conflict_required: false, forbidden_conclusions: ["the official sources conflict", "the sources have always been identical"] },
    provenance: sourceProvenance(row, sources, "The source documents are real; a conflict label is withheld pending independent adjudication."),
  })); usedSourceRows.add(row.caseId);
}

const pocRows = rows.filter((row) => row.samplingStratum === "poc-vs-disclosure" && cves(row).length >= 1).slice(0, 4);
if (pocRows.length < 4) throw new Error(`need four PoC cases, found ${pocRows.length}`);
for (const [index, row] of pocRows.entries()) {
  const cve = cves(row)[0]!;
  const question = `Is a working public PoC for ${cve} confirmed by admissible primary evidence?`;
  built.push(ResearchEvalCaseSchema.parse({
    ...base(row, `POC-${String(index + 1).padStart(3, "0")}`, "poc-source-quality", `Assess the source quality of the reported PoC for ${cve}.`, question),
    expected: { claims: sourceClaims(cve, false), unknown_questions: [question], conflict_required: false, forbidden_conclusions: ["a search result proves a working exploit"] },
    provenance: sourceProvenance(row, [...urlsIn(row), `https://nvd.nist.gov/vuln/detail/${cve}`], "The disclosure and reported PoC sources are preserved; current allowlisted tools cannot elevate a search/report mention to confirmed PoC."),
  })); usedSourceRows.add(row.caseId);
}

const insufficientRows = rows.filter((row) => row.samplingStratum === "same-vendor-different-cve" && cves(row).length >= 2).slice(0, 4);
if (insufficientRows.length < 4) throw new Error(`need four insufficient-evidence cases, found ${insufficientRows.length}`);
for (const [index, row] of insufficientRows.entries()) {
  const [first, second] = cves(row);
  const question = `Does remediation for ${first} also remediate ${second}?`;
  const includeKev = reports(row).some((report) => report.sourceName.includes("Known Exploited"));
  built.push(ResearchEvalCaseSchema.parse({
    ...base(row, `UNKNOWN-${String(index + 1).padStart(3, "0")}`, "insufficient-evidence", `Determine whether remediation can be transferred between ${first} and ${second}.`, question),
    expected: { claims: sourceClaims(first!, includeKev), unknown_questions: [question], conflict_required: false, forbidden_conclusions: ["the same product means the same remediation", `${second} is not affected`] },
    provenance: sourceProvenance(row, [...urlsIn(row), `https://nvd.nist.gov/vuln/detail/${first}`, ...(includeKev ? ["https://www.cisa.gov/known-exploited-vulnerabilities-catalog"] : [])], "Distinct CVEs in the same vendor/product family do not establish interchangeable remediation."),
  })); usedSourceRows.add(row.caseId);
}

validateResearchCases(built);
const out = path.resolve(values.out!);
mkdirSync(path.dirname(out), { recursive: true });
writeFileSync(out, `${built.map((row) => JSON.stringify(row)).join("\n")}\n`);
process.stdout.write(`${JSON.stringify({ ok: true, cases: built.length, strata: Object.fromEntries([...new Set(built.map((row) => row.stratum))].map((stratum) => [stratum, built.filter((row) => row.stratum === stratum).length])), out })}\n`);
