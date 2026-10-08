// Collects a reproducible raw evidence pool from public first-party/security-database APIs.
// This does not assign benchmark labels or write either frozen split.
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { parseArgs } from "node:util";
import { REPO_ROOT } from "@aihot/backend/config";

interface EvidenceRecord {
  evidenceId: string;
  source: "github-advisory" | "nvd" | "cisa-kev";
  sourceName: string;
  url: string;
  title: string;
  summary: string;
  publishedAt: string;
  updatedAt: string | null;
  cves: string[];
  products: string[];
  referenceUrls: string[];
  raw: Record<string, unknown>;
}

const { values } = parseArgs({ options: {
  "github-pages": { type: "string", default: "5" },
  "nvd-days": { type: "string", default: "30" },
  "nvd-offset-days": { type: "string", default: "0" },
  out: { type: "string", default: ".data/event-relations/evidence-pool.jsonl" },
} });
const githubPages = Number.parseInt(values["github-pages"]!, 10);
const nvdDays = Number.parseInt(values["nvd-days"]!, 10);
const nvdOffsetDays = Number.parseInt(values["nvd-offset-days"]!, 10);
if (!Number.isInteger(githubPages) || githubPages < 1 || githubPages > 10) throw new Error("--github-pages must be between 1 and 10");
if (!Number.isInteger(nvdDays) || nvdDays < 2 || nvdDays > 120) throw new Error("--nvd-days must be between 2 and 120");
if (!Number.isInteger(nvdOffsetDays) || nvdOffsetDays < 0 || nvdOffsetDays > 3650) throw new Error("--nvd-offset-days must be between 0 and 3650");

async function json(url: string): Promise<unknown> {
  let lastError: unknown;
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const response = await fetch(url, { headers: { accept: "application/json", "user-agent": "SentinelIntel-Phase2-evaluation" }, signal: AbortSignal.timeout(60_000) });
      if (!response.ok) throw new Error(`${url}: HTTP ${response.status} ${await response.text().then((value) => value.slice(0, 300))}`);
      return response.json();
    } catch (error) {
      lastError = error;
      if (attempt < 3) await new Promise((resolve) => setTimeout(resolve, attempt * 5_000));
    }
  }
  throw lastError;
}
const strings = (value: unknown): string[] => Array.isArray(value) ? value.filter((item): item is string => typeof item === "string" && item.length > 0) : [];
const text = (value: unknown): string => typeof value === "string" ? value : "";

function githubRecord(value: unknown): EvidenceRecord | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const row = value as Record<string, unknown>;
  const ghsa = text(row.ghsa_id), publishedAt = text(row.published_at), url = text(row.html_url);
  if (!ghsa || !publishedAt || !url) return null;
  const identifiers = Array.isArray(row.identifiers) ? row.identifiers as Array<Record<string, unknown>> : [];
  const cves = identifiers.filter((item) => item.type === "CVE").map((item) => text(item.value)).filter(Boolean);
  const vulnerabilities = Array.isArray(row.vulnerabilities) ? row.vulnerabilities as Array<Record<string, unknown>> : [];
  const products = vulnerabilities.map((item) => {
    const pkg = item.package as Record<string, unknown> | undefined;
    return pkg ? `${text(pkg.ecosystem)}:${text(pkg.name)}` : "";
  }).filter(Boolean);
  const references = Array.isArray(row.references) ? row.references : [];
  return {
    evidenceId: `GHSA:${ghsa}`, source: "github-advisory", sourceName: "GitHub Advisory Database", url,
    title: text(row.summary), summary: text(row.description).slice(0, 4000), publishedAt,
    updatedAt: text(row.updated_at) || null, cves: [...new Set(cves)], products: [...new Set(products)],
    referenceUrls: [...new Set(references.map((item) => typeof item === "string" ? item : text((item as Record<string, unknown>)?.url)).filter((item) => /^https?:\/\//.test(item)))],
    raw: { ghsaId: ghsa, severity: row.severity ?? null, withdrawnAt: row.withdrawn_at ?? null },
  };
}

function iso(value: unknown): string {
  const valueText = text(value);
  return valueText && !/[zZ]|[+-]\d\d:\d\d$/.test(valueText) ? `${valueText}Z` : valueText;
}

function nvdRecord(value: unknown): EvidenceRecord | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const cve = (value as Record<string, unknown>).cve as Record<string, unknown> | undefined;
  if (!cve) return null;
  const id = text(cve.id), publishedAt = iso(cve.published);
  if (!id || !publishedAt) return null;
  const descriptions = Array.isArray(cve.descriptions) ? cve.descriptions as Array<Record<string, unknown>> : [];
  const summary = text(descriptions.find((item) => item.lang === "en")?.value ?? descriptions[0]?.value);
  const references = Array.isArray(cve.references) ? cve.references as Array<Record<string, unknown>> : [];
  const affected = Array.isArray(cve.affected) ? cve.affected as Array<Record<string, unknown>> : [];
  const affectedProducts = affected.flatMap((source) => Array.isArray(source.affectedData) ? (source.affectedData as Array<Record<string, unknown>>)
    .map((item) => `${text(item.vendor)}:${text(item.product)}`).filter((item) => item !== ":") : []);
  const configurations = Array.isArray(cve.configurations) ? cve.configurations as Array<Record<string, unknown>> : [];
  const cpeCriteria: string[] = [];
  const visit = (value: unknown) => {
    if (!value || typeof value !== "object") return;
    if (Array.isArray(value)) { for (const item of value) visit(item); return; }
    const object = value as Record<string, unknown>;
    if (typeof object.criteria === "string") cpeCriteria.push(object.criteria);
    for (const child of Object.values(object)) visit(child);
  };
  visit(configurations);
  const parsedCpes = cpeCriteria.map((criteria) => criteria.split(":"))
    .filter((parts) => parts.length > 5 && parts[2] && parts[3] && parts[4]);
  const cpeProducts = parsedCpes.map((parts) => `${parts[3]}:${parts[4]}`);
  const hardwareProducts = parsedCpes.filter((parts) => parts[2] === "h").map((parts) => `${parts[3]}:${parts[4]}`);
  const products = [...affectedProducts, ...cpeProducts];
  return {
    evidenceId: `NVD:${id}`, source: "nvd", sourceName: "NIST National Vulnerability Database",
    url: `https://nvd.nist.gov/vuln/detail/${id}`, title: `${id}: ${summary.slice(0, 240)}`, summary,
    publishedAt, updatedAt: iso(cve.lastModified) || null, cves: [id], products: [...new Set(products)],
    referenceUrls: [...new Set(references.map((item) => text(item.url)).filter((item) => /^https?:\/\//.test(item)))],
    raw: { sourceIdentifier: cve.sourceIdentifier ?? null, vulnStatus: cve.vulnStatus ?? null,
      cveTags: cve.cveTags ?? [], weaknesses: cve.weaknesses ?? [],
      references: references.map((item) => ({ url: text(item.url), source: text(item.source), tags: strings(item.tags) })),
      hardwareProducts: [...new Set(hardwareProducts)] },
  };
}

function kevRecord(value: unknown): EvidenceRecord | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const row = value as Record<string, unknown>;
  const cve = text(row.cveID), added = text(row.dateAdded);
  if (!cve || !added) return null;
  return {
    evidenceId: `CISA-KEV:${cve}:${added}`, source: "cisa-kev", sourceName: "CISA Known Exploited Vulnerabilities Catalog",
    url: `https://www.cisa.gov/known-exploited-vulnerabilities-catalog?search_api_fulltext=${encodeURIComponent(cve)}`,
    title: `${cve}: ${text(row.vulnerabilityName)}`,
    summary: [text(row.shortDescription), text(row.requiredAction), text(row.notes)].filter(Boolean).join(" ").slice(0, 4000),
    publishedAt: `${added}T00:00:00Z`, updatedAt: null, cves: [cve],
    products: [`${text(row.vendorProject)}:${text(row.product)}`],
    referenceUrls: strings(row.knownRansomwareCampaignUse).filter((item) => /^https?:\/\//.test(item)),
    raw: { vendorProject: row.vendorProject ?? null, product: row.product ?? null, dueDate: row.dueDate ?? null,
      knownRansomwareCampaignUse: row.knownRansomwareCampaignUse ?? null },
  };
}

const pages = await Promise.all(Array.from({ length: githubPages }, (_, index) =>
  json(`https://api.github.com/advisories?type=reviewed&per_page=100&page=${index + 1}`)));
const github = pages.flatMap((page) => Array.isArray(page) ? page.map(githubRecord).filter((row): row is EvidenceRecord => !!row) : []);
const githubDates = github.map((row) => Date.parse(row.publishedAt)).filter(Number.isFinite);
const nvdEndMs = Math.max(...githubDates) - nvdOffsetDays * 24 * 60 * 60_000;
const nvdStart = new Date(nvdEndMs - nvdDays * 24 * 60 * 60_000).toISOString();
const nvdEnd = new Date(nvdEndMs).toISOString();
const nvdQuery = new URLSearchParams({ pubStartDate: nvdStart, pubEndDate: nvdEnd, resultsPerPage: "500", startIndex: "0" });
const firstNvd = await json(`https://services.nvd.nist.gov/rest/json/cves/2.0?${nvdQuery}`) as Record<string, unknown>;
const totalNvd = Number(firstNvd.totalResults ?? 0);
const nvdPages: unknown[] = [firstNvd];
for (let startIndex = 500; startIndex < totalNvd; startIndex += 500) {
  await new Promise((resolve) => setTimeout(resolve, 6_500));
  nvdQuery.set("startIndex", String(startIndex));
  nvdPages.push(await json(`https://services.nvd.nist.gov/rest/json/cves/2.0?${nvdQuery}`));
}
const nvd = nvdPages.flatMap((page) => {
  const rows = (page as Record<string, unknown>).vulnerabilities;
  return Array.isArray(rows) ? rows.map(nvdRecord).filter((row): row is EvidenceRecord => !!row) : [];
});
const kevJson = await json("https://www.cisa.gov/sites/default/files/feeds/known_exploited_vulnerabilities.json") as Record<string, unknown>;
const kev = (Array.isArray(kevJson.vulnerabilities) ? kevJson.vulnerabilities : []).map(kevRecord).filter((row): row is EvidenceRecord => !!row);
const duplicateIds = new Set<string>();
const unique = new Map<string, EvidenceRecord>();
const outPath = path.resolve(REPO_ROOT, values.out!);
let retained: EvidenceRecord[] = [];
try { retained = readFileSync(outPath, "utf8").split(/\r?\n/).filter(Boolean).map((line) => JSON.parse(line) as EvidenceRecord); }
catch (error) { if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error; }
for (const row of [...retained, ...github, ...nvd, ...kev]) {
  if (unique.has(row.evidenceId)) duplicateIds.add(row.evidenceId);
  unique.set(row.evidenceId, row);
}
const records = [...unique.values()].sort((a, b) => a.publishedAt.localeCompare(b.publishedAt) || a.evidenceId.localeCompare(b.evidenceId));
mkdirSync(path.dirname(outPath), { recursive: true });
writeFileSync(outPath, records.map((row) => JSON.stringify(row)).join("\n") + "\n");
const cveSources = new Map<string, Set<string>>();
for (const row of records) for (const cve of row.cves) (cveSources.get(cve) ?? cveSources.set(cve, new Set()).get(cve)!).add(row.source);
console.log(JSON.stringify({ out: outPath, records: records.length, github: github.length, nvd: nvd.length, kev: kev.length,
  duplicateEvidenceIds: duplicateIds.size, crossSourceCves: [...cveSources.values()].filter((sources) => sources.size > 1).length }));
