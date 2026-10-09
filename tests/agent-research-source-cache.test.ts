import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import { closeDb, sql } from "@aihot/backend/db";
import { lookupNvdPersistent } from "@aihot/backend/agents/research-source-cache";
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

test.after(async () => closeDb());
