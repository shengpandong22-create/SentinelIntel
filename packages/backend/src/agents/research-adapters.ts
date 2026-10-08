import { randomUUID } from "node:crypto";
import { z } from "zod";
import { guardedFetch } from "../lib/http-fetch.ts";
import { sha256, stableJson } from "../lib/ids.ts";
import { ResearchEvidenceSchema, type ResearchEvidence } from "./research-contract.ts";

const CveIdSchema = z.string().trim().toUpperCase().regex(/^CVE-\d{4}-\d{4,}$/);

const NvdResponseSchema = z.object({
  vulnerabilities: z.array(z.object({
    cve: z.object({
      id: z.string(),
      sourceIdentifier: z.string().optional(),
      published: z.string().optional(),
      lastModified: z.string().optional(),
      vulnStatus: z.string().optional(),
      descriptions: z.array(z.object({ lang: z.string(), value: z.string() })).default([]),
      metrics: z.record(z.string(), z.unknown()).default({}),
      weaknesses: z.array(z.object({
        descriptions: z.array(z.object({ lang: z.string(), value: z.string() })).default([]),
      })).default([]),
      references: z.array(z.object({ url: z.string(), source: z.string().optional(), tags: z.array(z.string()).optional() })).default([]),
    }).passthrough(),
  })).default([]),
}).passthrough();

const KevResponseSchema = z.object({
  catalogVersion: z.string(),
  dateReleased: z.string(),
  vulnerabilities: z.array(z.object({
    cveID: z.string(),
    vendorProject: z.string(),
    product: z.string(),
    vulnerabilityName: z.string(),
    dateAdded: z.string(),
    shortDescription: z.string(),
    requiredAction: z.string(),
    dueDate: z.string(),
    knownRansomwareCampaignUse: z.string().optional(),
    notes: z.string().optional(),
    cwes: z.array(z.string()).optional(),
  }).passthrough()),
}).passthrough();

export type ResearchFetchJson = (url: string, maxBytes: number) => Promise<unknown>;

async function defaultFetchJson(url: string, maxBytes: number): Promise<unknown> {
  const response = await guardedFetch(url, {
    timeoutMs: 20_000,
    maxBytes,
    headers: { accept: "application/json" },
  });
  if (response.status !== 200) throw new Error(`research source returned HTTP ${response.status}`);
  return JSON.parse(response.text()) as unknown;
}

export interface AdapterResult {
  output: Record<string, unknown>;
  evidence: ResearchEvidence[];
  receiptIds: number[];
}

function nvdTimestamp(value: string | undefined): string | null {
  if (!value) return null;
  return /(?:Z|[+-]\d\d:\d\d)$/.test(value) ? value : `${value}Z`;
}

export async function lookupNvd(cveInput: string, fetchJson: ResearchFetchJson = defaultFetchJson): Promise<AdapterResult> {
  const cveId = CveIdSchema.parse(cveInput);
  const apiUrl = `https://services.nvd.nist.gov/rest/json/cves/2.0?cveId=${encodeURIComponent(cveId)}`;
  const parsed = NvdResponseSchema.parse(await fetchJson(apiUrl, 2 * 1024 * 1024));
  const record = parsed.vulnerabilities.find((item) => item.cve.id.toUpperCase() === cveId)?.cve;
  if (!record) return { output: { found: false, cve_id: cveId }, evidence: [], receiptIds: [] };
  const description = record.descriptions.find((item) => item.lang === "en")?.value
    ?? record.descriptions[0]?.value
    ?? "NVD vulnerability record";
  const cwes = [...new Set(record.weaknesses.flatMap((item) => item.descriptions.map((entry) => entry.value)))];
  const normalized = {
    cve_id: cveId,
    status: record.vulnStatus ?? null,
    description,
    published: nvdTimestamp(record.published),
    last_modified: nvdTimestamp(record.lastModified),
    metrics: record.metrics,
    cwes,
    references: record.references.slice(0, 50),
  };
  const evidence = ResearchEvidenceSchema.parse({
    evidence_id: randomUUID(),
    source_type: "nvd",
    source_name: "NIST National Vulnerability Database",
    canonical_url: `https://nvd.nist.gov/vuln/detail/${cveId}`,
    title: `${cveId}: ${description}`.slice(0, 1_000),
    excerpt: description.slice(0, 20_000),
    normalized,
    content_hash: sha256(stableJson(record)),
    authority_level: "authoritative",
    published_at: nvdTimestamp(record.published),
    source_updated_at: nvdTimestamp(record.lastModified),
    retrieved_at: new Date().toISOString(),
    provenance: { adapter: "nvd-v2", retrieved_from: apiUrl, external_network: true },
  });
  return { output: { found: true, cve_id: cveId }, evidence: [evidence], receiptIds: [] };
}

export async function lookupKev(cveInput: string, fetchJson: ResearchFetchJson = defaultFetchJson): Promise<AdapterResult> {
  const cveId = CveIdSchema.parse(cveInput);
  const feedUrl = "https://www.cisa.gov/sites/default/files/feeds/known_exploited_vulnerabilities.json";
  const parsed = KevResponseSchema.parse(await fetchJson(feedUrl, 8 * 1024 * 1024));
  const record = parsed.vulnerabilities.find((item) => item.cveID.toUpperCase() === cveId);
  if (!record) {
    return {
      output: { found: false, cve_id: cveId, catalog_version: parsed.catalogVersion, date_released: parsed.dateReleased },
      evidence: [],
      receiptIds: [],
    };
  }
  const normalized = {
    cve_id: cveId,
    vendor_project: record.vendorProject,
    product: record.product,
    vulnerability_name: record.vulnerabilityName,
    date_added: record.dateAdded,
    short_description: record.shortDescription,
    required_action: record.requiredAction,
    due_date: record.dueDate,
    known_ransomware_campaign_use: record.knownRansomwareCampaignUse ?? null,
    notes: record.notes ?? null,
    cwes: record.cwes ?? [],
    catalog_version: parsed.catalogVersion,
    catalog_date_released: parsed.dateReleased,
  };
  const evidence = ResearchEvidenceSchema.parse({
    evidence_id: randomUUID(),
    source_type: "cisa_kev",
    source_name: "CISA Known Exploited Vulnerabilities Catalog",
    canonical_url: "https://www.cisa.gov/known-exploited-vulnerabilities-catalog",
    title: `${cveId}: ${record.vulnerabilityName}`.slice(0, 1_000),
    excerpt: record.shortDescription.slice(0, 20_000),
    normalized,
    content_hash: sha256(stableJson(record)),
    authority_level: "authoritative",
    published_at: `${record.dateAdded}T00:00:00.000Z`,
    source_updated_at: null,
    retrieved_at: new Date().toISOString(),
    provenance: { adapter: "cisa-kev-json", retrieved_from: feedUrl, external_network: true },
  });
  return { output: { found: true, cve_id: cveId, catalog_version: parsed.catalogVersion }, evidence: [evidence], receiptIds: [] };
}

export function parseCveId(value: unknown): string {
  return CveIdSchema.parse(value);
}
