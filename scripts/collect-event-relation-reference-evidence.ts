// Fetches a bounded, deterministic subset of advisory references for Phase 2 construction. Direct
// pages only: no Jina fallback and no model calls. Pages without an attributable date are retained in
// the raw review pool but cannot become benchmark reports until their date is verified.
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { parseArgs } from "node:util";
import * as cheerio from "cheerio";
import { REPO_ROOT } from "@aihot/backend/config";
import { guardedFetch } from "@aihot/backend/lib/http-fetch";
import { readable } from "@aihot/backend/content/extract";
import { jsonLdPublished, parseLooseDate } from "@aihot/backend/sources/web-list";

interface Parent { evidenceId: string; url: string; publishedAt: string; cves: string[]; products: string[]; referenceUrls: string[];
  raw?: { references?: Array<{ url?: string; source?: string; tags?: string[] }> } }
interface ReferenceEvidence {
  evidenceId: string; source: "reference-page"; sourceName: string; url: string; title: string; summary: string;
  publishedAt: string | null; updatedAt: string | null; cves: string[]; products: string[]; referenceUrls: string[];
  raw: { category: string; parentEvidenceIds: string[]; fetchedAt: string; status: number };
}
const { values } = parseArgs({ options: {
  input: { type: "string", default: ".data/event-relations/evidence-pool.jsonl" },
  out: { type: "string", default: ".data/event-relations/reference-evidence.jsonl" },
  limit: { type: "string", default: "160" }, concurrency: { type: "string", default: "4" },
  "refresh-undated": { type: "boolean", default: false },
} });
const limit = Number.parseInt(values.limit!, 10), concurrency = Number.parseInt(values.concurrency!, 10);
if (!Number.isInteger(limit) || limit < 1 || limit > 1500) throw new Error("--limit must be 1..1500");
if (!Number.isInteger(concurrency) || concurrency < 1 || concurrency > 8) throw new Error("--concurrency must be 1..8");
const parents = readFileSync(path.resolve(REPO_ROOT, values.input!), "utf8").split(/\r?\n/).filter(Boolean)
  .map((line) => JSON.parse(line) as Parent).filter((row) => row.evidenceId.startsWith("NVD:"));
const byUrl = new Map<string, Parent[]>();
for (const parent of parents) for (const url of parent.referenceUrls) {
  if (!/^https?:\/\//.test(url)) continue;
  (byUrl.get(url) ?? byUrl.set(url, []).get(url)!).push(parent);
}
function category(url: string, rows: Parent[]): string | null {
  const host = new URL(url).hostname.replace(/^www\./, "").toLowerCase();
  const cves = new Set(rows.flatMap((row) => row.cves));
  const tags = rows.flatMap((row) => row.raw?.references?.filter((reference) => reference.url === url).flatMap((reference) => reference.tags ?? []) ?? []);
  if (tags.some((tag) => /exploit/i.test(tag)) || /exploit|\bpoc\b|proof.of.concept/i.test(url) || /exploit-db\.com|packetstormsecurity\.com/.test(host)) return "poc";
  if (/cert|cisa|ncsc|jpcert|incibe|siberguvenlik|certcc\.github\.io/.test(host)) return "cert";
  if (cves.size > 1 || /chromereleases\.googleblog|source\.android\.com\/docs\/security\/bulletin/.test(url)) return "multi-cve-advisory";
  if (tags.some((tag) => /patch/i.test(tag)) || /commit|pull|patch|compare|release|changelog|version/i.test(url)) return "patch-or-release";
  if (tags.some((tag) => /vendor advisory/i.test(tag)) || /advis|security|bulletin/i.test(url) || /access\.redhat\.com|mediatek\.com|wordfence\.com|patchstack\.com|wpscan\.com/.test(host)) return "vendor-advisory";
  return null;
}
const priority = { "poc": 0, "cert": 1, "multi-cve-advisory": 2, "patch-or-release": 3, "vendor-advisory": 4 } as const;
const classified = [...byUrl].flatMap(([url, rows]) => {
  const kind = category(url, rows);
  const vendorKeys = new Set(rows.flatMap((row) => row.products.map((product) => product.split(":", 1)[0]!.toLowerCase().replace(/[^a-z0-9]+/g, ""))).filter(Boolean));
  return kind ? [{ url, rows, kind, crossVendorPotential: vendorKeys.size >= 2 }] : [];
}).sort((a, b) => priority[a.kind as keyof typeof priority] - priority[b.kind as keyof typeof priority]
  || Number(!a.crossVendorPotential) - Number(!b.crossVendorPotential)
  || Number(!/bulletin|release|updates?|monthly|weekly|patch|security fixes|chrome|android/i.test(a.url))
    - Number(!/bulletin|release|updates?|monthly|weekly|patch|security fixes|chrome|android/i.test(b.url))
  || a.url.localeCompare(b.url));
const selected = new Map<string, typeof classified[number]>(), perCategory = Math.ceil(limit / Object.keys(priority).length);
for (const kind of Object.keys(priority)) for (const item of classified.filter((row) => row.kind === kind).slice(0, perCategory)) selected.set(item.url, item);
for (const item of classified) {
  if (selected.size >= limit) break;
  selected.set(item.url, item);
}
const targets = [...selected.values()].slice(0, limit);
const outPath = path.resolve(REPO_ROOT, values.out!);
const cached = new Map<string, ReferenceEvidence>();
try {
  for (const line of readFileSync(outPath, "utf8").split(/\r?\n/).filter(Boolean)) {
    const row = JSON.parse(line) as ReferenceEvidence;
    cached.set(row.url, row);
  }
} catch (error) {
  if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
}

function pageDate($: cheerio.CheerioAPI, html: string, url: string): string | null {
  const visible = $("body").text().replace(/\s+/g, " ");
  const raw = jsonLdPublished($, html)
    ?? $('meta[property="article:published_time"],meta[name="pubdate"],meta[itemprop="datePublished"]').first().attr("content")
    ?? $('time[datetime]').first().attr("datetime")
    ?? /<relative-time[^>]+datetime=["']([^"']+)/i.exec(html)?.[1]
    ?? /\b(?:Public on|Published(?: on)?|Publication date)\s*:?[\s-]*([A-Z][a-z]+\s+\d{1,2},\s+20\d{2})/i.exec(visible)?.[1]
    ?? /\/(20\d{2})\/(0[1-9]|1[0-2])\/(0[1-9]|[12]\d|3[01])(?:\/|$)/.exec(url)?.slice(1, 4).join("-")
    ?? null;
  return parseLooseDate(raw, "+00:00")?.toISOString() ?? null;
}
async function fetchOne(target: typeof targets[number]): Promise<ReferenceEvidence> {
  try {
    const response = await guardedFetch(target.url, { timeoutMs: 15_000, maxBytes: 3 * 1024 * 1024 });
    const html = response.text(), $ = cheerio.load(html);
    const extracted = response.status === 200 && /html/i.test(response.headers.get("content-type") ?? "") ? readable(html, response.url) : null;
    const title = ($('meta[property="og:title"]').attr("content") ?? $("title").text()).replace(/\s+/g, " ").trim();
    const description = ($('meta[property="og:description"],meta[name="description"]').first().attr("content") ?? "").replace(/\s+/g, " ").trim();
    const parentsForUrl = [...new Map(target.rows.map((row) => [row.evidenceId, row])).values()];
    return { evidenceId: `REF:${response.url}`, source: "reference-page", sourceName: new URL(response.url).hostname,
      url: response.url, title, summary: (extracted?.text ?? description).slice(0, 4000), publishedAt: pageDate($, html, response.url), updatedAt: null,
      cves: [...new Set(parentsForUrl.flatMap((row) => row.cves))], products: [...new Set(parentsForUrl.flatMap((row) => row.products))],
      referenceUrls: parentsForUrl.map((row) => row.url), raw: { category: target.kind,
        parentEvidenceIds: parentsForUrl.map((row) => row.evidenceId), fetchedAt: new Date().toISOString(), status: response.status } };
  } catch (error) {
    return { evidenceId: `REF:${target.url}`, source: "reference-page", sourceName: new URL(target.url).hostname,
      url: target.url, title: "", summary: "", publishedAt: null, updatedAt: null,
      cves: [...new Set(target.rows.flatMap((row) => row.cves))], products: [...new Set(target.rows.flatMap((row) => row.products))],
      referenceUrls: target.rows.map((row) => row.url), raw: { category: target.kind,
        parentEvidenceIds: target.rows.map((row) => row.evidenceId), fetchedAt: new Date().toISOString(), status: 0 } };
  }
}
const output: ReferenceEvidence[] = [];
for (let offset = 0; offset < targets.length; offset += concurrency) output.push(...await Promise.all(targets.slice(offset, offset + concurrency).map((target) => {
  const prior = cached.get(target.url);
  if (!prior || (values["refresh-undated"] && prior.raw.status === 200 && !prior.publishedAt)) return fetchOne(target);
  const urlDate = /\/(20\d{2})\/(0[1-9]|1[0-2])\/(0[1-9]|[12]\d|3[01])(?:\/|$)/.exec(prior.url);
  return { ...prior, publishedAt: prior.publishedAt ?? (urlDate ? new Date(`${urlDate[1]}-${urlDate[2]}-${urlDate[3]}T00:00:00Z`).toISOString() : null) };
})));
mkdirSync(path.dirname(outPath), { recursive: true });
const merged = [...new Map([...cached.values(), ...output].map((row) => [row.evidenceId, row])).values()];
writeFileSync(outPath, merged.map((row) => JSON.stringify(row)).join("\n") + (merged.length ? "\n" : ""));
const usable = merged.filter((row) => row.raw.status === 200 && row.title && row.summary && row.publishedAt);
console.log(JSON.stringify({ targets: targets.length, retained: merged.length, fetched: merged.filter((row) => row.raw.status === 200).length, usable: usable.length,
  byCategory: Object.fromEntries([...new Set(output.map((row) => row.raw.category))].map((kind) => [kind, usable.filter((row) => row.raw.category === kind).length])), out: outPath }));
