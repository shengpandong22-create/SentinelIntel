import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  assertVendorAdvisoryUrl,
  fetchVendorAdvisory,
  lookupKev,
  lookupNvd,
  lookupTedProcurementAward,
  parseCveId,
  searchVendorAdvisories,
} from "@aihot/backend/agents/research-adapters";

test("TED lookup turns only an official result notice into procurement-award Evidence", async () => {
  let request: { url: string; body: Record<string, unknown> } | null = null;
  const result = await lookupTedProcurementAward("PROC-SECURITY-CAMERA-2026", async (url, body) => {
    request = { url, body };
    return fixture("ted-award.json");
  });
  assert.equal(request!.url, "https://api.ted.europa.eu/v3/notices/search");
  assert.match(String(request!.body.query), /procedure-identifier/);
  assert.equal(result.output.found, true);
  assert.equal(result.evidence[0]!.source_type, "official_procurement");
  assert.equal(result.evidence[0]!.canonical_url, "https://ted.europa.eu/en/notice/-/detail/123456-2026");
  assert.deepEqual(result.evidence[0]!.normalized.tracking_observations, ["procurement_award"]);
  assert.deepEqual(result.evidence[0]!.normalized.winners, ["Example Security Systems GmbH"]);
  assert.deepEqual(result.receiptIds, []);
});

test("TED lookup preserves unknown when no official result notice exists and rejects query injection", async () => {
  const miss = await lookupTedProcurementAward("PROC-1", async () => ({
    notices: [{ "publication-number": ["111111-2026"], "notice-type": ["pin-only"] }], totalNoticeCount: 1, timedOut: false,
  }));
  assert.deepEqual(miss.evidence, []);
  assert.equal(miss.output.found, false);
  await assert.rejects(lookupTedProcurementAward('PROC-1" OR *', async () => ({})), /Invalid string/);
});

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
  assert.deepEqual(result.evidence[0]!.normalized.tracking_observations, ["material_update"]);
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
  assert.deepEqual(result.evidence[0]!.normalized.tracking_observations, ["material_update"]);
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

const documentFixture = async (name: string, url: string) => ({
  url,
  status: 200,
  contentType: "text/html; charset=utf-8",
  text: await readFile(new URL(`./fixtures/research/${name}`, import.meta.url), "utf8"),
});

test("vendor search returns only allowlisted official advisory candidates and no Evidence", async () => {
  const result = await searchVendorAdvisories("cisco", "CVE-2024-20399", async (url) => {
    assert.match(url, /^https:\/\/sec\.cloudapps\.cisco\.com\//);
    return documentFixture("cisco-search.html", url);
  });
  assert.equal(result.output.found, true);
  assert.deepEqual(result.output.candidates, [{
    title: "CVE-2024-20399 Cisco Security Advisory",
    url: "https://sec.cloudapps.cisco.com/security/center/content/CiscoSecurityAdvisory/cisco-sa-example-CVE-2024-20399",
  }]);
  assert.deepEqual(result.evidence, []);
  assert.deepEqual(result.receiptIds, []);
});

test("official advisory fetch creates authoritative Evidence but never executes page instructions", async () => {
  const url = "https://sec.cloudapps.cisco.com/security/center/content/CiscoSecurityAdvisory/cisco-sa-example-CVE-2024-20399";
  let calls = 0;
  const result = await fetchVendorAdvisory("cisco", url, async () => {
    calls += 1;
    return documentFixture("cisco-advisory.html", url);
  });
  assert.equal(calls, 1);
  assert.equal(result.evidence[0]!.source_type, "vendor_advisory");
  assert.equal(result.evidence[0]!.authority_level, "authoritative");
  assert.deepEqual(result.evidence[0]!.normalized.cves, ["CVE-2024-20399"]);
  assert.deepEqual(result.evidence[0]!.normalized.tracking_observations, ["vendor_confirmation", "patch"]);
  assert.equal(result.evidence[0]!.excerpt?.includes("invokeTool"), false);
  assert.equal(result.evidence[0]!.provenance.untrusted_content, true);
  assert.deepEqual(result.receiptIds, []);
});

test("vendor registry blocks arbitrary hosts, misleading subdomains, credentials, paths, and redirects", async () => {
  for (const url of [
    "https://attacker.example/security/center/content/CiscoSecurityAdvisory/x",
    "https://sec.cloudapps.cisco.com.attacker.example/security/center/content/CiscoSecurityAdvisory/x",
    "https://user:pass@sec.cloudapps.cisco.com/security/center/content/CiscoSecurityAdvisory/x",
    "https://sec.cloudapps.cisco.com/other/path",
  ]) assert.throws(() => assertVendorAdvisoryUrl("cisco", url));
  await assert.rejects(
    searchVendorAdvisories("cisco", "CVE-2024-20399", async () => documentFixture(
      "cisco-search.html",
      "https://attacker.example/search",
    )),
    /redirected outside/,
  );
});

test("vendor adapters reject unsupported vendors and content types", async () => {
  await assert.rejects(searchVendorAdvisories("unknown", "CVE-2024-20399"));
  await assert.rejects(fetchVendorAdvisory(
    "cisco",
    "https://sec.cloudapps.cisco.com/security/center/content/CiscoSecurityAdvisory/x",
    async (url) => ({ url, status: 200, contentType: "application/pdf", text: "%PDF" }),
  ), /unsupported content type/);
});

test("registry can locate an exact Microsoft CVE advisory without generic search", async () => {
  let fetched = false;
  const result = await searchVendorAdvisories("microsoft", "cve-2026-21527", async () => {
    fetched = true;
    throw new Error("must not fetch a search page");
  });
  assert.equal(fetched, false);
  assert.deepEqual(result.output.candidates, [{
    title: "Microsoft advisory for CVE-2026-21527",
    url: "https://msrc.microsoft.com/update-guide/vulnerability/CVE-2026-21527",
  }]);
  assert.deepEqual(result.evidence, []);
});

test("registry accepts only allowlisted advisory hints from structured sources", async () => {
  let fetched = false;
  const result = await searchVendorAdvisories(
    "fortinet",
    "CVE-2025-32756",
    async () => {
      fetched = true;
      throw new Error("validated hints must avoid search-page fetch");
    },
    [
      "https://attacker.example/psirt/FG-IR-25-254",
      "https://www.fortiguard.com/psirt/FG-IR-25-254",
    ],
  );
  assert.equal(fetched, false);
  assert.equal(result.output.discovery, "validated_candidate_url");
  assert.deepEqual(result.output.candidates, [{
    title: "Fortinet advisory candidate for CVE-2025-32756",
    url: "https://www.fortiguard.com/psirt/FG-IR-25-254",
  }]);
});
