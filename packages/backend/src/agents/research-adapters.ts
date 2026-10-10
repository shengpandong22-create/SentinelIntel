import { randomUUID } from "node:crypto";
import { load } from "cheerio";
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
export interface ResearchFetchedDocument {
  url: string;
  status: number;
  contentType: string;
  text: string;
}
export type ResearchFetchDocument = (url: string, maxBytes: number) => Promise<ResearchFetchedDocument>;
export type ResearchPostJson = (url: string, body: Record<string, unknown>, maxBytes: number) => Promise<unknown>;

const TedSearchResponseSchema = z.object({
  notices: z.array(z.record(z.string(), z.unknown())).default([]),
  totalNoticeCount: z.number().int().nonnegative().optional(),
  timedOut: z.boolean().optional(),
}).passthrough();

const TED_RESULT_TYPES = new Set(["can-standard", "can-social", "can-tran", "can-desg"]);

async function defaultPostJson(url: string, body: Record<string, unknown>, maxBytes: number): Promise<unknown> {
  const response = await guardedFetch(url, {
    method: "POST",
    timeoutMs: 20_000,
    maxBytes,
    headers: { accept: "application/json", "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  if (response.status !== 200) throw new Error(`research source returned HTTP ${response.status}`);
  return JSON.parse(response.text()) as unknown;
}

function firstText(value: unknown): string | null {
  if (typeof value === "string" && value.trim()) return value.trim();
  if (Array.isArray(value)) return value.find((item): item is string => typeof item === "string" && item.trim() !== "")?.trim() ?? null;
  if (value && typeof value === "object") return Object.values(value).find((item): item is string => typeof item === "string" && item.trim() !== "")?.trim() ?? null;
  return null;
}

function textList(value: unknown): string[] {
  if (typeof value === "string") return value.trim() ? [value.trim()] : [];
  if (Array.isArray(value)) return value.flatMap(textList);
  if (value && typeof value === "object") return Object.values(value).flatMap(textList);
  return [];
}

export async function lookupTedProcurementAward(
  procedureInput: unknown,
  postJson: ResearchPostJson = defaultPostJson,
): Promise<AdapterResult> {
  const procedureId = z.string().trim().min(1).max(200).regex(/^[A-Za-z0-9][A-Za-z0-9._:/-]*$/).parse(procedureInput);
  const endpoint = "https://api.ted.europa.eu/v3/notices/search";
  const fields = ["publication-number", "notice-type", "procedure-identifier", "title-proc", "tendering-party-name", "links"];
  const request = {
    query: `procedure-identifier = \"${procedureId}\"`,
    fields,
    page: 1,
    limit: 20,
    scope: "ALL",
    checkQuerySyntax: false,
    paginationMode: "PAGE_NUMBER",
    onlyLatestVersions: true,
  };
  const parsed = TedSearchResponseSchema.parse(await postJson(endpoint, request, 4 * 1024 * 1024));
  if (parsed.timedOut) throw new Error("TED procurement search timed out");
  const award = parsed.notices.find((notice) => {
    const types = Array.isArray(notice["notice-type"]) ? notice["notice-type"] : [notice["notice-type"]];
    return types.some((value) => typeof value === "string" && TED_RESULT_TYPES.has(value));
  });
  if (!award) return { output: { found: false, procedure_id: procedureId, total: parsed.totalNoticeCount ?? parsed.notices.length }, evidence: [], receiptIds: [] };
  const publicationNumber = firstText(award["publication-number"]);
  const noticeType = firstText(award["notice-type"]);
  if (!publicationNumber || !noticeType) throw new Error("TED award result lacks a stable publication identity");
  const title = firstText(award["title-proc"]) ?? `TED procurement award ${publicationNumber}`;
  const winners = [...new Set(textList(award["tendering-party-name"]))].slice(0, 50);
  const links = award.links && typeof award.links === "object" ? award.links as Record<string, unknown> : {};
  const htmlLinks = links.html && typeof links.html === "object" ? links.html as Record<string, unknown> : {};
  const canonicalUrl = firstText(htmlLinks.ENG)
    ?? `https://ted.europa.eu/en/notice/-/detail/${encodeURIComponent(publicationNumber)}`;
  const normalized = {
    procedure_id: procedureId,
    publication_number: publicationNumber,
    notice_type: noticeType,
    winners,
    links: award.links ?? [],
    tracking_observations: ["procurement_award"],
  };
  const evidence = ResearchEvidenceSchema.parse({
    evidence_id: randomUUID(),
    source_type: "official_procurement",
    source_name: "Tenders Electronic Daily (TED)",
    canonical_url: canonicalUrl,
    title: title.slice(0, 1_000),
    excerpt: winners.length ? `Awarded tendering parties: ${winners.join(", ")}`.slice(0, 20_000) : `Official TED award notice ${publicationNumber}`,
    normalized,
    content_hash: sha256(stableJson(award)),
    authority_level: "authoritative",
    published_at: null,
    source_updated_at: null,
    retrieved_at: new Date().toISOString(),
    provenance: { adapter: "ted-search-api-v3", retrieved_from: endpoint, external_network: true },
  });
  return { output: { found: true, procedure_id: procedureId, publication_number: publicationNumber }, evidence: [evidence], receiptIds: [] };
}

const VendorKeySchema = z.enum(["cisco", "fortinet", "hikvision", "microsoft"]);
export type VendorKey = z.infer<typeof VendorKeySchema>;

interface VendorAdvisorySource {
  name: string;
  aliases: string[];
  hosts: string[];
  allowedPaths: RegExp[];
  searchUrl(query: string): string;
  directCveUrl?(cveId: string): string;
}

export const VENDOR_ADVISORY_SOURCES: Record<VendorKey, VendorAdvisorySource> = {
  cisco: {
    name: "Cisco",
    aliases: ["cisco"],
    hosts: ["sec.cloudapps.cisco.com"],
    allowedPaths: [/^\/security\/center\/content\/CiscoSecurityAdvisory\//],
    searchUrl: (query) => `https://sec.cloudapps.cisco.com/security/center/publicationListing.x?search=${encodeURIComponent(query)}`,
  },
  fortinet: {
    name: "Fortinet",
    aliases: ["fortinet", "fortigate", "fortios"],
    hosts: ["www.fortiguard.com"],
    allowedPaths: [/^\/psirt\/FG-IR-/],
    searchUrl: (query) => `https://www.fortiguard.com/psirt?filter=1&search=${encodeURIComponent(query)}`,
  },
  hikvision: {
    name: "Hikvision",
    aliases: ["hikvision", "海康威视"],
    hosts: ["www.hikvision.com"],
    allowedPaths: [/^\/en\/support\/cybersecurity\/security-advisory\//],
    searchUrl: (query) => `https://www.hikvision.com/en/support/cybersecurity/security-advisory/?q=${encodeURIComponent(query)}`,
  },
  microsoft: {
    name: "Microsoft",
    aliases: ["microsoft", "windows"],
    hosts: ["msrc.microsoft.com"],
    allowedPaths: [/^\/update-guide\/vulnerability\//],
    searchUrl: (query) => `https://msrc.microsoft.com/update-guide/vulnerability/${encodeURIComponent(query)}`,
    directCveUrl: (cveId) => `https://msrc.microsoft.com/update-guide/vulnerability/${encodeURIComponent(cveId)}`,
  },
};

async function defaultFetchJson(url: string, maxBytes: number): Promise<unknown> {
  const response = await guardedFetch(url, {
    timeoutMs: 20_000,
    maxBytes,
    headers: { accept: "application/json" },
  });
  if (response.status !== 200) throw new Error(`research source returned HTTP ${response.status}`);
  return JSON.parse(response.text()) as unknown;
}

async function defaultFetchDocument(url: string, maxBytes: number): Promise<ResearchFetchedDocument> {
  const response = await guardedFetch(url, {
    timeoutMs: 20_000,
    maxBytes,
    maxRedirects: 3,
    headers: { accept: "text/html,application/xhtml+xml;q=0.9" },
  });
  return {
    url: response.url,
    status: response.status,
    contentType: response.headers.get("content-type") ?? "",
    text: response.text(),
  };
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
  let raw: unknown;
  for (let attempt = 1; ; attempt++) {
    try {
      raw = await fetchJson(apiUrl, 2 * 1024 * 1024);
      break;
    } catch (error) {
      const retryable = error instanceof Error && ["TimeoutError", "TypeError"].includes(error.name);
      if (fetchJson !== defaultFetchJson || !retryable || attempt >= 3) throw error;
      // NVD's no-key public limit is five requests per 30 seconds. A retry is a real request too.
      await new Promise((resolve) => setTimeout(resolve, 6_100));
    }
  }
  const parsed = NvdResponseSchema.parse(raw);
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
    tracking_observations: ["material_update"],
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
    tracking_observations: ["material_update"],
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

export function parseVendorKey(value: unknown): VendorKey {
  return VendorKeySchema.parse(typeof value === "string" ? value.trim().toLowerCase() : value);
}

function sourceFor(vendorInput: unknown): [VendorKey, VendorAdvisorySource] {
  const key = parseVendorKey(vendorInput);
  return [key, VENDOR_ADVISORY_SOURCES[key]];
}

function assertVendorHost(source: VendorAdvisorySource, urlInput: string): URL {
  const url = new URL(urlInput);
  if (url.protocol !== "https:" || url.username || url.password || url.port || !source.hosts.includes(url.hostname.toLowerCase())) {
    throw new Error("vendor source redirected outside the configured registry");
  }
  return url;
}

export function assertVendorAdvisoryUrl(vendorInput: unknown, urlInput: unknown): URL {
  const [, source] = sourceFor(vendorInput);
  const url = new URL(z.string().url().parse(urlInput));
  const host = url.hostname.toLowerCase();
  if (url.protocol !== "https:" || url.username || url.password || url.port) throw new Error("vendor advisory URL must be credential-free HTTPS");
  if (!source.hosts.includes(host) || !source.allowedPaths.some((pattern) => pattern.test(url.pathname))) {
    throw new Error("vendor advisory URL is outside the configured registry");
  }
  url.hash = "";
  return url;
}

function cleanText(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

export async function searchVendorAdvisories(
  vendorInput: unknown,
  queryInput: unknown,
  fetchDocument: ResearchFetchDocument = defaultFetchDocument,
  candidateUrlsInput: unknown = [],
): Promise<AdapterResult> {
  const [vendor, source] = sourceFor(vendorInput);
  const query = z.string().trim().min(3).max(200).parse(queryInput);
  const candidateUrls = z.array(z.string().url()).max(20).parse(candidateUrlsInput);
  const hintedCandidates = candidateUrls.flatMap((candidate) => {
    try {
      return [{ title: `${source.name} advisory candidate for ${query}`, url: assertVendorAdvisoryUrl(vendor, candidate).toString() }];
    } catch {
      return [];
    }
  }).filter((candidate, index, all) => all.findIndex((item) => item.url === candidate.url) === index).slice(0, 10);
  if (hintedCandidates.length) {
    return {
      output: { vendor, source_name: source.name, query, candidates: hintedCandidates, found: true, discovery: "validated_candidate_url" },
      evidence: [],
      receiptIds: [],
    };
  }
  const cve = /^CVE-\d{4}-\d{4,}$/i.test(query) ? query.toUpperCase() : null;
  if (cve && source.directCveUrl) {
    const url = assertVendorAdvisoryUrl(vendor, source.directCveUrl(cve)).toString();
    return {
      output: { vendor, source_name: source.name, query, candidates: [{ title: `${source.name} advisory for ${cve}`, url }], found: true },
      evidence: [],
      receiptIds: [],
    };
  }
  const searchUrl = source.searchUrl(query);
  const response = await fetchDocument(searchUrl, 2 * 1024 * 1024);
  assertVendorHost(source, response.url);
  if (response.status !== 200) throw new Error(`vendor advisory search returned HTTP ${response.status}`);
  if (!/text\/html|application\/xhtml\+xml/i.test(response.contentType)) throw new Error("vendor advisory search returned unsupported content type");
  const $ = load(response.text);
  const candidates: Array<{ title: string; url: string }> = [];
  $("a[href]").each((_index, element) => {
    if (candidates.length >= 10) return;
    const href = $(element).attr("href");
    const title = cleanText($(element).text());
    if (!href || !title) return;
    try {
      const url = assertVendorAdvisoryUrl(vendor, new URL(href, response.url).toString());
      const needle = query.toLowerCase();
      const container = $(element).closest("article,tr,li,.row,.card,[class*='item']");
      const containerNode = container.get(0);
      const containerTag = containerNode && "tagName" in containerNode ? containerNode.tagName.toLowerCase() : undefined;
      const context = container.length && containerTag !== "body" && containerTag !== "html" ? cleanText(container.text()) : "";
      if (!`${title} ${url.pathname} ${context}`.toLowerCase().includes(needle)) return;
      if (!candidates.some((item) => item.url === url.toString())) candidates.push({ title: title.slice(0, 1_000), url: url.toString() });
    } catch {
      // Search pages commonly contain unrelated navigation links; only registered advisory URLs survive.
    }
  });
  return {
    output: { vendor, source_name: source.name, query, candidates, found: candidates.length > 0 },
    evidence: [],
    receiptIds: [],
  };
}

export async function fetchVendorAdvisory(
  vendorInput: unknown,
  urlInput: unknown,
  fetchDocument: ResearchFetchDocument = defaultFetchDocument,
): Promise<AdapterResult> {
  const [vendor, source] = sourceFor(vendorInput);
  const requested = assertVendorAdvisoryUrl(vendor, urlInput);
  const response = await fetchDocument(requested.toString(), 4 * 1024 * 1024);
  if (response.status !== 200) throw new Error(`vendor advisory returned HTTP ${response.status}`);
  if (!/text\/html|application\/xhtml\+xml/i.test(response.contentType)) throw new Error("vendor advisory returned unsupported content type");
  const canonical = assertVendorAdvisoryUrl(vendor, response.url);
  const $ = load(response.text);
  $("script,style,noscript,svg,nav,footer,header").remove();
  const title = cleanText($("h1").first().text() || $("meta[property='og:title']").attr("content") || $("title").first().text());
  const body = cleanText($("main,article,[role='main']").first().text() || $("body").text());
  if (!title || body.length < 20) throw new Error("vendor advisory did not contain usable document text");
  const cves = [...new Set((`${title} ${body}`.match(/\bCVE-\d{4}-\d{4,}\b/gi) ?? []).map((item) => item.toUpperCase()))].slice(0, 50);
  const trackingObservations = ["vendor_confirmation"];
  if (/\b(?:patch|patched|fixed|fixes|software updates?|upgrade|upgraded|remediat(?:e|ed|ion))\b|修复|补丁|升级/i.test(body)) {
    trackingObservations.push("patch");
  }
  const evidence = ResearchEvidenceSchema.parse({
    evidence_id: randomUUID(),
    source_type: "vendor_advisory",
    source_name: `${source.name} Security Advisory`,
    canonical_url: canonical.toString(),
    title: title.slice(0, 1_000),
    excerpt: body.slice(0, 20_000),
    normalized: { vendor, cves, tracking_observations: trackingObservations },
    content_hash: sha256(response.text),
    authority_level: "authoritative",
    published_at: null,
    source_updated_at: null,
    retrieved_at: new Date().toISOString(),
    provenance: { adapter: "vendor-advisory-html-v1", retrieved_from: requested.toString(), external_network: true, untrusted_content: true },
  });
  return { output: { found: true, vendor, cves }, evidence: [evidence], receiptIds: [] };
}
