import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { lookupKev, lookupNvd, parseCveId } from "@aihot/backend/agents/research-adapters";

const fixture = async (name: string) => JSON.parse(await readFile(new URL(`./fixtures/research/${name}`, import.meta.url), "utf8")) as unknown;

test("NVD adapter normalizes official v2 response shape without a receipt", async () => {
  let requested = "";
  const result = await lookupNvd("cve-2021-44228", async (url) => {
    requested = url;
    return fixture("nvd-cve.json");
  });
  assert.equal(requested, "https://services.nvd.nist.gov/rest/json/cves/2.0?cveId=CVE-2021-44228");
  assert.deepEqual(result.receiptIds, []);
  assert.equal(result.output.found, true);
  assert.equal(result.evidence[0]!.source_type, "nvd");
  assert.equal(result.evidence[0]!.authority_level, "authoritative");
  assert.equal(result.evidence[0]!.normalized.cve_id, "CVE-2021-44228");
  assert.deepEqual(result.evidence[0]!.normalized.cwes, ["CWE-917"]);
  assert.equal(result.evidence[0]!.provenance.external_network, true);
});

test("NVD adapter returns an explicit miss", async () => {
  const result = await lookupNvd("CVE-2026-9999", async () => ({ vulnerabilities: [] }));
  assert.deepEqual(result.output, { found: false, cve_id: "CVE-2026-9999" });
  assert.deepEqual(result.evidence, []);
});

test("KEV adapter normalizes the official catalog shape and preserves remediation", async () => {
  let requested = "";
  const result = await lookupKev("CVE-2021-44228", async (url) => {
    requested = url;
    return fixture("cisa-kev.json");
  });
  assert.equal(requested, "https://www.cisa.gov/sites/default/files/feeds/known_exploited_vulnerabilities.json");
  assert.deepEqual(result.receiptIds, []);
  assert.equal(result.output.found, true);
  assert.equal(result.evidence[0]!.source_type, "cisa_kev");
  assert.equal(result.evidence[0]!.normalized.required_action, "Apply updates per vendor instructions.");
  assert.equal(result.evidence[0]!.normalized.known_ransomware_campaign_use, "Known");
});

test("KEV absence is not converted into a claim that exploitation has not occurred", async () => {
  const data = await fixture("cisa-kev.json") as { catalogVersion: string; dateReleased: string; vulnerabilities: unknown[] };
  data.vulnerabilities = [];
  const result = await lookupKev("CVE-2026-9999", async () => data);
  assert.equal(result.output.found, false);
  assert.deepEqual(result.evidence, []);
  assert.equal("not_exploited" in result.output, false);
});

test("adapters reject malformed CVE identifiers before fetching", () => {
  assert.throws(() => parseCveId("CVE-2021-1"));
  assert.throws(() => parseCveId("https://example.com"));
});
