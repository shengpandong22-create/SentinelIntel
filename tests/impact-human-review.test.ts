import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, before, test } from "node:test";
import { closeDb, sql } from "@aihot/backend/db";
import { resolveImpactReview } from "@aihot/backend/admin/impact-reviews";
import { tag } from "./setup.ts";

const T = tag();
let storyId: number;
let otherStoryId: number;
let runId: string;
let evidenceId: string;
let factId: number;

const mediumRow = (evidence: string) => ({
  vendor: "Acme",
  product: `Review Platform ${T}`,
  models: ["RP-100"],
  cve_id: "CVE-2026-12345",
  affected_range: { raw: ">=1.0,<2.0", supported: true },
  fixed_range: { raw: "2.0", supported: true },
  mitigations: ["Upgrade to 2.0."],
  confidence: "medium",
  evidence_ids: [evidence],
});

before(async () => {
  const stories = await sql<{ id: number }[]>`
    INSERT INTO stories (public_id, title, first_report_at, latest_at)
    VALUES (${randomUUID()}, ${`Review story ${T}`}, now(), now()),
           (${randomUUID()}, ${`Other story ${T}`}, now(), now())
    RETURNING id`;
  storyId = stories[0]!.id;
  otherStoryId = stories[1]!.id;
  const [fact] = await sql<{ id: number }[]>`
    INSERT INTO facts (public_id, story_id, title) VALUES (${randomUUID()}, ${storyId}, 'Stable fact') RETURNING id`;
  factId = fact!.id;
  runId = randomUUID();
  const [run] = await sql<{ id: number }[]>`
    INSERT INTO agent_research_runs
      (public_id, story_id, trace_id, capability_hash, capability_expires_at, deadline_at,
       objective, status, graph_version, input_snapshot, output_proposal, limits, completed_at)
    VALUES
      (${runId}, ${storyId}, ${randomUUID()}, ${"a".repeat(64)}, now() + interval '1 hour',
       now() + interval '1 hour', 'fixture', 'completed', 'phase6-impact-test', '{}', '{}', '{}', now())
    RETURNING id`;
  evidenceId = randomUUID();
  await sql`
    INSERT INTO external_evidence
      (public_id, story_id, research_run_id, source_type, source_name, canonical_url, title,
       content_hash, authority_level, retrieved_at)
    VALUES (${evidenceId}, ${storyId}, ${run!.id}, 'vendor_advisory', 'Acme',
            'https://vendor.example/review', 'Acme advisory', ${"b".repeat(64)}, 'authoritative', now())`;
});

after(async () => {
  await sql`DELETE FROM impact_human_review_actions WHERE review_id IN (SELECT id FROM impact_human_reviews WHERE story_id IN (${storyId}, ${otherStoryId}))`;
  await sql`DELETE FROM product_impacts WHERE story_id IN (${storyId}, ${otherStoryId})`;
  await sql`DELETE FROM impact_human_reviews WHERE story_id IN (${storyId}, ${otherStoryId})`;
  await sql`DELETE FROM story_entities WHERE story_id IN (${storyId}, ${otherStoryId})`;
  await sql`DELETE FROM external_evidence WHERE story_id IN (${storyId}, ${otherStoryId})`;
  await sql`DELETE FROM agent_research_runs WHERE story_id IN (${storyId}, ${otherStoryId})`;
  await sql`DELETE FROM facts WHERE id = ${factId}`;
  await sql`DELETE FROM stories WHERE id IN (${storyId}, ${otherStoryId})`;
  await sql`DELETE FROM audit_log WHERE subject LIKE 'impact-review:%' AND actor = 'admin:test'`;
  await closeDb();
});

async function queue(payload: unknown, story = storyId, sourceRun = runId) {
  const [row] = await sql<{ id: number }[]>`
    INSERT INTO impact_human_reviews (public_id, story_id, run_id, reason, payload)
    VALUES (${randomUUID()}, ${story}, ${sourceRun}, 'fixture review', ${sql.json(payload as never)}) RETURNING id`;
  return row!.id;
}

test("accept revalidates immutable medium payload and appends an audited current impact", async () => {
  const reviewId = await queue(mediumRow(evidenceId));
  const [storyBefore] = await sql`SELECT version, title, digest FROM stories WHERE id = ${storyId}`;
  const [factBefore] = await sql`SELECT version, title, updated_at FROM facts WHERE id = ${factId}`;

  const result = await resolveImpactReview(reviewId, { action: "accept", reason: "Checked official advisory.", version: 1 }, "admin:test");
  assert.equal(result?.status, "resolved");
  assert.ok(result?.impactPublicId);

  const [impact] = await sql<{ confidence: string; routing: string; exploit_status: Record<string, string>; evidence_ids: string[] }[]>`
    SELECT confidence, routing, exploit_status, evidence_ids FROM product_impacts
    WHERE public_id = ${result!.impactPublicId}`;
  assert.equal(impact!.confidence, "high");
  assert.equal(impact!.routing, "human_review");
  assert.deepEqual(impact!.exploit_status, { poc: "unknown", known_exploited: "unknown" });
  assert.deepEqual(impact!.evidence_ids, [evidenceId]);

  const [action] = await sql<{ action: string; actor: string; reason: string }[]>`
    SELECT action, actor, reason FROM impact_human_review_actions WHERE review_id = ${reviewId}`;
  assert.deepEqual(action, { action: "accept", actor: "admin:test", reason: "Checked official advisory." });
  assert.deepEqual((await sql`SELECT version, title, digest FROM stories WHERE id = ${storyId}`)[0], storyBefore);
  assert.deepEqual((await sql`SELECT version, title, updated_at FROM facts WHERE id = ${factId}`)[0], factBefore);

  await assert.rejects(
    resolveImpactReview(reviewId, { action: "dismiss", reason: "stale", version: 1 }, "admin:test"),
    /已被其他管理员处理/,
  );
  assert.equal((await sql`SELECT count(*)::int AS n FROM impact_human_review_actions WHERE review_id = ${reviewId}`)[0]!.n, 1);
});

test("cross-story Evidence and unknown-only acceptance fail closed without resolving", async () => {
  const otherRun = randomUUID();
  await sql`
    INSERT INTO agent_research_runs
      (public_id, story_id, trace_id, capability_hash, capability_expires_at, deadline_at,
       objective, status, graph_version, input_snapshot, output_proposal, limits, completed_at)
    VALUES (${otherRun}, ${otherStoryId}, ${randomUUID()}, ${"c".repeat(64)}, now() + interval '1 hour',
      now() + interval '1 hour', 'fixture', 'completed', 'phase6-impact-test', '{}', '{}', '{}', now())`;
  const cross = await queue(mediumRow(evidenceId), otherStoryId, otherRun);
  await assert.rejects(
    resolveImpactReview(cross, { action: "accept", reason: "invalid", version: 1 }, "admin:test"),
    /cross-story evidence/,
  );
  assert.equal((await sql`SELECT status FROM impact_human_reviews WHERE id = ${cross}`)[0]!.status, "open");

  const unknown = await queue({ unknowns: ["No supported version expression."] });
  await assert.rejects(
    resolveImpactReview(unknown, { action: "accept", reason: "cannot accept", version: 1 }, "admin:test"),
  );
  const dismissed = await resolveImpactReview(unknown, { action: "dismiss", reason: "No actionable claim.", version: 1 }, "admin:test");
  assert.equal(dismissed?.status, "dismissed");
});
