import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import { closeDb, sql } from "@aihot/backend/db";
import { fetchVendorAdvisoryPersistent, lookupNvdPersistent } from "@aihot/backend/agents/research-source-cache";
import type { AdapterResult } from "@aihot/backend/agents/research-adapters";

const cve = "CVE-2099-4242";
const liveResult = (): AdapterResult => ({
  output: { found: true, cve_id: cve }, receiptIds: [], evidence: [{
    evidence_id: randomUUID(), source_type: "nvd", source_name: "NIST National Vulnerability Database",
    canonical_url: `https://nvd.nist.gov/vuln/detail/${cve}`, title: `${cve}: fixture`, excerpt: "fixture",
    normalized: { cve_id: cve }, content_hash: "a".repeat(64), authority_level: "authoritative",
    published_at: null, source_updated_at: null, retrieved_at: new Date().toISOString(),
    provenance: { adapter: "nvd-v2", external_network: true },
  }],
});

test("successful NVD evidence survives a later transient live failure", async () => {
  await sql`DELETE FROM research_source_cache WHERE source_type = 'nvd' AND source_key = ${cve}`;
  const live = await lookupNvdPersistent(cve, async () => liveResult());
  const cached = await lookupNvdPersistent(cve, async () => { throw new TypeError("transient"); });
  assert.equal(live.evidence.length, 1);
  assert.equal(cached.evidence.length, 1);
  assert.notEqual(cached.evidence[0]!.evidence_id, live.evidence[0]!.evidence_id);
  assert.equal(cached.evidence[0]!.provenance.cache_hit, true);
  await sql`DELETE FROM research_source_cache WHERE source_type = 'nvd' AND source_key = ${cve}`;
});

test("verified vendor advisory survives a later transient live failure", async () => {
  const url = "https://fortiguard.fortinet.com/psirt/FG-IR-25-513";
  await sql`DELETE FROM research_source_cache WHERE source_type = 'vendor_advisory' AND source_key = ${url}`;
  const live = await fetchVendorAdvisoryPersistent("fortinet", url, async () => ({
    output: { fetched: true },
    evidence: [{
      evidence_id: randomUUID(), source_type: "vendor_advisory", source_name: "Fortinet",
      authority_level: "authoritative", canonical_url: url, title: "Official advisory",
      excerpt: "Affected FortiWeb 7.6.0 through 7.6.5. Upgrade to 7.6.6 or above.",
      retrieved_at: new Date().toISOString(), published_at: null, source_updated_at: null,
      content_hash: "a".repeat(64), normalized: {}, provenance: { adapter: "test" },
    }],
    receiptIds: [],
  }));
  assert.equal(live.evidence.length, 1);
  const cached = await fetchVendorAdvisoryPersistent("fortinet", url, async () => { throw new TypeError("transient"); });
  assert.equal(cached.evidence.length, 1);
  assert.equal(cached.evidence[0]!.provenance.cache_hit, true);
  assert.equal(cached.evidence[0]!.canonical_url, url);
  await sql`DELETE FROM research_source_cache WHERE source_type = 'vendor_advisory' AND source_key = ${url}`;
});

test.after(async () => closeDb());
