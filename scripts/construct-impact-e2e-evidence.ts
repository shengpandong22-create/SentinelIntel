// Constructs the frozen official evidence pack for an e2e holdout candidate (revision 7b).
//
// For every case the pack carries, per official source: source_type, URL, title, a label-relevant
// body excerpt, retrieved_at, and the SHA256 of the excerpt. The CISA KEV entry is included as the
// actual catalog record — never a constructor's note. The manifest records the pack hash and every
// item hash so the review script can fail closed on any drift.

import { createHash } from "node:crypto";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import path from "node:path";
import { parseArgs } from "node:util";
import { z } from "zod";
import { REPO_ROOT } from "@aihot/backend/config";
import { EvidenceItemSchema, EvidenceManifestSchema } from "./review-impact-e2e-holdout.ts";

const { values } = parseArgs({ options: {
  cases: { type: "string", default: "datasets/impact/e2e-holdout-v11-candidate.jsonl" },
  out: { type: "string", default: "datasets/impact/e2e-holdout-v11-evidence.jsonl" },
  manifest: { type: "string", default: "datasets/impact/e2e-holdout-v11-evidence-manifest.json" },
} });

interface CaseRow { case_id: string; cve: string | null; provenance: { source_urls: string[] } }
const cases = z.array(z.object({
  case_id: z.string(), cve: z.string().nullable(),
  provenance: z.object({ source_urls: z.array(z.string()) }).passthrough(),
}).passthrough()).parse(
  readFileSync(path.resolve(REPO_ROOT, values.cases!), "utf8").split(/\r?\n/).filter(Boolean).map((line) => JSON.parse(line)),
) as CaseRow[];

async function fetchText(url: string): Promise<string> {
  const response = await fetch(url, { headers: { "user-agent": "sentinelintel-evidence-pack/1.0", accept: "application/json,text/html" } });
  return response.text();
}

function sha256(text: string): string {
  return createHash("sha256").update(text).digest("hex");
}

function item(caseId: string, sourceType: string, url: string, title: string, excerpt: string, status: "ok" | "unfetchable", reason?: string) {
  return EvidenceItemSchema.parse({
    case_id: caseId, source_type: sourceType, url, title, excerpt,
    retrieved_at: new Date().toISOString(), content_sha256: sha256(excerpt), content_status: status,
    ...(status === "unfetchable" ? { unfetchable_reason: reason } : {}),
  });
}

// Deterministic NVD flattening, mirroring the adapter's evidence shape.
async function nvdItem(caseId: string, cve: string): Promise<ReturnType<typeof item>> {
  const raw = await fetchText(`https://services.nvd.nist.gov/rest/json/cves/2.0?cveId=${cve}`);
  const body = JSON.parse(raw) as { vulnerabilities?: Array<{ cve: { descriptions?: Array<{ lang: string; value: string }>; configurations?: Array<{ nodes: Array<{ cpeMatch: Array<{ criteria: string; versionStartIncluding?: string; versionStartExcluding?: string; versionEndExcluding?: string; versionEndIncluding?: string }> }> }> } }> };
  const cveRecord = body.vulnerabilities?.[0]?.cve;
  if (!cveRecord) throw new Error(`NVD record not found for ${cve}`);
  const description = cveRecord.descriptions?.find((entry) => entry.lang === "en")?.value ?? "";
  const bounds = (cveRecord.configurations ?? []).flatMap((config) =>
    config.nodes.flatMap((node) => node.cpeMatch.map((match) => {
      const parts = [
        match.versionStartIncluding ? `versionStartIncluding: ${match.versionStartIncluding}` : null,
        match.versionStartExcluding ? `versionStartExcluding: ${match.versionStartExcluding}` : null,
        match.versionEndExcluding ? `versionEndExcluding: ${match.versionEndExcluding}` : null,
        match.versionEndIncluding ? `versionEndIncluding: ${match.versionEndIncluding}` : null,
      ].filter(Boolean).join("; ");
      return `- ${match.criteria}${parts ? ` (${parts})` : ""}`;
    })));
  const excerpt = `${description}\n\nCPE configuration version bounds:\n${bounds.slice(0, 40).join("\n")}`;
  return item(caseId, "nvd", `https://nvd.nist.gov/vuln/detail/${cve}`, `${cve}: ${description}`.slice(0, 1_000), excerpt, "ok");
}

// The actual CISA KEV catalog entry for the CVE — the evidence of record for known_exploited.
let kevFeed: { catalogVersion: string; vulnerabilities: Array<Record<string, unknown>> } | null = null;
async function kevItem(caseId: string, cve: string): Promise<ReturnType<typeof item>> {
  kevFeed ??= JSON.parse(await fetchText("https://www.cisa.gov/sites/default/files/feeds/known_exploited_vulnerabilities.json")) as typeof kevFeed;
  const entry = kevFeed.vulnerabilities.find((row) => row.cveID === cve);
  if (!entry) throw new Error(`CISA KEV catalog entry not found for ${cve}`);
  const excerpt = JSON.stringify(entry, null, 2);
  return item(caseId, "cisa_kev", "https://www.cisa.gov/known-exploited-vulnerabilities-catalog",
    `CISA KEV entry: ${entry.vendorProject} ${entry.product} (${entry.cveID})`, excerpt, "ok");
}

const ADVISORY_FOCUS_PATTERNS: RegExp[] = [
  /Version\s+Affected\s+Solution/i,
  /Affected\s+Versions?/i,
  /First Fixed Release/i,
  /through \d+\.\d+/,
  /affected|solution|version/i,
];

async function advisoryItem(caseId: string, url: string, sourceType: string): Promise<ReturnType<typeof item>> {
  try {
    const response = await fetch(url, { headers: { "user-agent": "sentinelintel-evidence-pack/1.0", accept: "application/json,text/html" } });
    const html = await response.text();
    if (response.status >= 400) {
      return item(caseId, sourceType, url, url, `the URL returned HTTP ${response.status} at construction time`, "unfetchable", `HTTP ${response.status}`);
    }
    const text = html.replace(/<script[\s\S]*?<\/script>/g, " ").replace(/<style[\s\S]*?<\/style>/g, " ")
      .replace(/<[^>]+>/g, " ").replace(/&nbsp;/g, " ").replace(/\s+/g, " ").trim();
    if (text.length < 200) return item(caseId, sourceType, url, url, `fetched page carried no usable document text (length ${text.length})`, "unfetchable", "page is a client-side shell with no server-rendered advisory text");
    let start = 0;
    for (const pattern of ADVISORY_FOCUS_PATTERNS) {
      const match = pattern.exec(text);
      if (match) { start = Math.max(0, match.index - 100); break; }
    }
    return item(caseId, sourceType, url, text.slice(0, 160), text.slice(start, start + 2_600), "ok");
  } catch (error) {
    return item(caseId, sourceType, url, url, `fetch failed: ${error instanceof Error ? error.message : String(error)}`, "unfetchable", "network or HTTP failure at construction time");
  }
}

const items: Array<ReturnType<typeof item>> = [];
for (const row of cases) {
  if (row.cve === null) {
    // The negative case's label rests on the Story title carrying no CVE; record the announcement URL.
    const url = row.provenance.source_urls[0]!;
    items.push(await advisoryItem(row.case_id, url, "vendor_announcement", /CVE-\d{4}-\d{4,}/));
    continue;
  }
  items.push(await nvdItem(row.case_id, row.cve));
  items.push(await kevItem(row.case_id, row.cve));
  for (const url of row.provenance.source_urls) {
    if (url.includes("nvd.nist.gov") || url.includes("cisa.gov")) continue;
    if (url.includes("msrc.microsoft.com")) {
      // The update-guide page is a client-side shell; the official MSRC data service that backs it
      // carries the advisory record. The item URL stays the case's source URL (what the reviewer
      // was given), and the excerpt states its data-service origin.
      try {
        const raw = await fetchText(`https://api.msrc.microsoft.com/sug/v2.0/en-US/vulnerability/${row.cve}`);
        const record = JSON.parse(raw) as Record<string, unknown>;
        const excerpt = `Content retrieved from the official MSRC data service (api.msrc.microsoft.com/sug/v2.0) that backs this update-guide page:\n${JSON.stringify({
          cveNumber: record.cveNumber, cveTitle: record.cveTitle, releaseDate: record.releaseDate,
          vulnType: record.vulnType, releaseNumber: record.releaseNumber, latestRevisionDate: record.latestRevisionDate,
        }, null, 2)}`;
        items.push(item(row.case_id, "msrc_api", url, `MSRC record: ${String(record.cveTitle ?? row.cve)}`, excerpt, "ok"));
      } catch (error) {
        items.push(item(row.case_id, "msrc_api", url, row.cve, `MSRC data service fetch failed: ${error instanceof Error ? error.message : String(error)}`, "unfetchable", "MSRC data service unreachable at construction time"));
      }
      continue;
    }
    items.push(await advisoryItem(row.case_id, url, "vendor_advisory"));
  }
}

const packBody = `${items.map((entry) => JSON.stringify(entry)).join("\n")}\n`;
mkdirSync(path.dirname(path.resolve(REPO_ROOT, values.out!)), { recursive: true });
writeFileSync(path.resolve(REPO_ROOT, values.out!), packBody);
const packSha256 = createHash("sha256").update(Buffer.from(packBody, "utf8")).digest("hex");
const manifest = EvidenceManifestSchema.parse({
  schema_version: 1,
  pack: path.relative(REPO_ROOT, path.resolve(REPO_ROOT, values.out!)),
  pack_sha256: packSha256,
  constructed_at: new Date().toISOString(),
  kev_catalog_version: kevFeed?.catalogVersion ?? "unknown",
  items: items.map((entry) => ({
    case_id: entry.case_id, source_type: entry.source_type, url: entry.url,
    content_sha256: entry.content_sha256, content_status: entry.content_status,
  })),
  note: `Frozen official evidence for ${path.basename(values.cases!)}. The CISA KEV entry is the actual catalog record. Reviewers judge only semantic labels against these excerpts; the pack hash and every item hash are validated before any paid request.`,
});
writeFileSync(path.resolve(REPO_ROOT, values.manifest!), `${JSON.stringify(manifest, null, 2)}\n`);
process.stdout.write(`${JSON.stringify({ ok: true, items: items.length, pack_sha256: packSha256, kev_catalog_version: manifest.kev_catalog_version, unfetchable: items.filter((entry) => entry.content_status === "unfetchable").length })}\n`);
