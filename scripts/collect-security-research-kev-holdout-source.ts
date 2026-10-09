import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { parseArgs } from "node:util";
import { closeDb } from "@aihot/backend/db";
import { guardedFetch } from "@aihot/backend/lib/http-fetch";
import { lookupNvdPersistent } from "@aihot/backend/agents/research-source-cache";

const { values } = parseArgs({ options: {
  consumed: { type: "string" }, out: { type: "string", default: ".data/security-research/holdout-v4-kev-source.jsonl" }, n: { type: "string", default: "3" },
} });
if (!values.consumed) throw new Error("--consumed is required");
const usedCves = new Set(values.consumed.split(",").flatMap((file) =>
  readFileSync(path.resolve(file.trim()), "utf8").match(/CVE-\d{4}-\d{4,}/g) ?? []));
const count = Number.parseInt(values.n!, 10);
const feedUrl = "https://www.cisa.gov/sites/default/files/feeds/known_exploited_vulnerabilities.json";

try {
  const response = await guardedFetch(feedUrl, { timeoutMs: 30_000, maxBytes: 8 * 1024 * 1024, headers: { accept: "application/json" } });
  if (response.status !== 200) throw new Error(`CISA KEV returned HTTP ${response.status}`);
  const feed = JSON.parse(response.text()) as { dateReleased: string; vulnerabilities: Array<{ cveID: string; vulnerabilityName: string; shortDescription: string; dateAdded: string }> };
  const rows: unknown[] = [];
  for (const item of [...feed.vulnerabilities].reverse()) {
    const cve = item.cveID.toUpperCase();
    if (usedCves.has(cve)) continue;
    try {
      const nvd = await lookupNvdPersistent(cve);
      const evidence = nvd.evidence[0];
      if (!evidence) continue;
      const at = `${item.dateAdded}T00:00:00.000Z`;
      rows.push({
        caseId: `EVREL-FRESH-KEV-${cve}`,
        samplingStratum: "same-cve-cross-source-different-url",
        query: { reportId: `KEV:${cve}`, title: `${cve}: ${item.vulnerabilityName}`, summary: item.shortDescription, sourceName: "CISA Known Exploited Vulnerabilities Catalog", ingestedAt: at },
        candidates: [{ reportId: `NVD:${cve}`, title: evidence.title, summary: evidence.excerpt ?? evidence.title, sourceName: "NIST National Vulnerability Database", ingestedAt: evidence.retrieved_at, annotation: { sourceUrls: [feedUrl, evidence.canonical_url] } }],
      });
      if (rows.length === count) break;
    } catch { /* skip a transiently unavailable NVD record; never fabricate the pair */ }
  }
  if (rows.length !== count) throw new Error(`needed ${count} fresh KEV/NVD pairs, collected ${rows.length}`);
  const out = path.resolve(values.out!); mkdirSync(path.dirname(out), { recursive: true });
  writeFileSync(out, `${rows.map((row) => JSON.stringify(row)).join("\n")}\n`);
  process.stdout.write(`${JSON.stringify({ ok: true, cases: rows.length, out })}\n`);
} finally {
  await closeDb();
}
