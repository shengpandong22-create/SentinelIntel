import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, before, test } from "node:test";
import { closeDb, sql } from "@aihot/backend/db";
import { impactSourceParameters, listImpactCandidates, runImpactForStory } from "@aihot/backend/agents/impact";
import { tag } from "./setup.ts";

const T = tag();
let cveStoryId: number;
let plainStoryId: number;

before(async () => {
  const rows = await sql<{ id: number }[]>`
    INSERT INTO stories (public_id, title, first_report_at, latest_at) VALUES
      (${randomUUID()}, ${`Cisco CVE-2026-10002 camera flaw ${T}`}, now(), now()),
      (${randomUUID()}, ${`Unrelated industry news without identifiers ${T}`}, now(), now())
    RETURNING id`;
  cveStoryId = rows[0]!.id;
  plainStoryId = rows[1]!.id;
});

after(async () => {
  await sql`DELETE FROM product_impacts WHERE story_id = ANY(${[cveStoryId, plainStoryId]})`;
  await sql`DELETE FROM impact_human_reviews WHERE story_id = ANY(${[cveStoryId, plainStoryId]})`;
  await sql`DELETE FROM story_entities WHERE story_id = ANY(${[cveStoryId, plainStoryId]})`;
  await sql`DELETE FROM external_evidence WHERE story_id = ANY(${[cveStoryId, plainStoryId]})`;
  await sql`DELETE FROM agent_research_runs WHERE story_id = ANY(${[cveStoryId, plainStoryId]})`;
  await sql`DELETE FROM stories WHERE id = ANY(${[cveStoryId, plainStoryId]})`;
  await closeDb();
});

test("parameter extraction is deterministic and vendor-aware", () => {
  assert.deepEqual(impactSourceParameters("Cisco issues advisory\nCVE-2026-10002"), {
    cve_id: "CVE-2026-10002", vendor: "cisco",
  });
  assert.deepEqual(impactSourceParameters("nothing here"), { cve_id: null, vendor: null });
});

test("candidate selection lists only CVE-bearing unanalyzed stories", async () => {
  const candidates = await listImpactCandidates(50);
  const ids = candidates.map((item) => item.id);
  assert.equal(ids.includes(cveStoryId), true);
  assert.equal(ids.includes(plainStoryId), false);
});

test("orchestrator runs one bounded task, persists routed rows, and skips repeats", async () => {
  const evidenceId = randomUUID();
  const runtimeProposal = {
    new_evidence: [{
      evidence_id: evidenceId, source_type: "vendor_advisory", source_name: "Vendor",
      canonical_url: "https://vendor.example/advisory-orchestrator", title: "Affected versions",
      excerpt: "Versions 1.0 to 2.0 are affected.", normalized: {}, content_hash: "c".repeat(64),
      authority_level: "authoritative" as const, published_at: null, source_updated_at: null,
      retrieved_at: new Date().toISOString(), provenance: {},
    }],
    impact_rows: [{
      vendor: "Cisco", product: `Orchestrated Platform ${T}`, models: ["CAM-100"],
      cve_id: "CVE-2026-10002",
      affected_range: { raw: ">=1.0,<=2.0", supported: true },
      fixed_range: null,
      mitigations: [],
      confidence: "high" as const,
      evidence_ids: [evidenceId],
    }],
    exploit_status: { poc: "unknown" as const, known_exploited: "unknown" as const },
    known_exploited_evidence_ids: [],
    unknowns: [],
    decision: "propose" as const,
    decision_reason: "Official advisory fully supports the impact row.",
    tool_trace: [],
  };

  const orchestrated = await runImpactForStory(cveStoryId, {
    productImpactEnabled: true, internalToken: "test-token", retries: 0,
    fetch: async (url, init) => {
      assert.equal(String(url).endsWith(`/v1/impact/story/${cveStoryId}`), true);
      const body = JSON.parse(String(init?.body)) as { run_id: string; trace_id: string };
      return new Response(JSON.stringify({ trace_id: body.trace_id, run_id: body.run_id, proposal: runtimeProposal }),
        { status: 200, headers: { "content-type": "application/json" } });
    },
  });
  if (!("impactVersion" in orchestrated)) throw new Error("impact run did not commit");
  assert.deepEqual(
    { impactVersion: orchestrated.impactVersion, persistedClaimRows: orchestrated.persistedClaimRows, idempotent: orchestrated.idempotent },
    { impactVersion: 1, persistedClaimRows: 1, idempotent: false },
  );
  // The proposal's new evidence must be durably stored for the Story by the time the impact commits.
  const [storedEvidence] = await sql<{ rows: number }[]>`
    SELECT count(*) AS rows FROM external_evidence WHERE story_id = ${cveStoryId}`;
  assert.equal(storedEvidence!.rows >= 1, true);

  const repeat = await runImpactForStory(cveStoryId, {
    productImpactEnabled: true, internalToken: "test-token", retries: 0,
    fetch: async () => { throw new Error("runtime must not be called for an already-analyzed story"); },
  });
  assert.deepEqual(repeat, { storyId: cveStoryId, traceId: repeat.traceId, skipped: "already_analyzed" });

  const plain = await runImpactForStory(plainStoryId, {
    productImpactEnabled: true, internalToken: "test-token", retries: 0,
    fetch: async () => { throw new Error("runtime must not be called for a non-CVE story"); },
  });
  assert.deepEqual(plain, { storyId: plainStoryId, traceId: plain.traceId, skipped: "no_cve" });
});
