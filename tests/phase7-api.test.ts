// Phase 7 API contracts: the story detail surfaces (site API for the web page, public v1 API for
// clients and MCP) expose the unified agent-intelligence read model additively; old fields, empty
// states, 308/404 semantics and ETag behaviour stay unchanged; no internal or admin-only state leaks.
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, before, test } from "node:test";
import { closeDb, sql } from "@aihot/backend/db";
import { upsertMaterial } from "@aihot/backend/content/materials";
import { publishArticle } from "@aihot/backend/publication/publish";
import { completeResearchRun, startResearchRun } from "@aihot/backend/agents/research-store";
import { DEFAULT_RESEARCH_LIMITS, ResearchProposalSchema } from "@aihot/backend/agents/research-contract";
import { createTrackingPlan } from "@aihot/backend/agents/tracking-store";
import { buildApp } from "../apps/api/src/app.ts";
import { tag } from "./setup.ts";

const T = tag();
const SOURCE = `test-phase7-${T}`;
const app = await buildApp();

let storyId: number;
let storyPublicId: string;
let bareStoryId: number;
let bareStoryPublicId: string;
const evidenceId = randomUUID();

function snapshot(id: number) {
  return {
    schema_version: 1 as const, story_id: id, story_version: 1, title: `Phase 7 story ${T}`,
    digest: null, status: "active" as const, facts: [], missing_questions: [], captured_at: new Date().toISOString(),
  };
}

before(async () => {
  await sql`INSERT INTO sources (id, name, kind, tier, participation_mode, site_fulltext, syndicate_fulltext, next_fetch_at)
            VALUES (${SOURCE}, 'Phase 7 test', 'rss', 'T1', 'editorial', true, true, '2100-01-01')`;
  const { articleId } = await upsertMaterial({
    sourceId: SOURCE, url: `https://example.com/${T}`, title: `Phase 7 article ${T}`, bodyText: `body ${T}`, bodyHtml: `<p>body ${T}</p>`,
    bodyStatus: "ok", via: "fetch", publishedAt: new Date(),
  });
  await sql`INSERT INTO analyses (article_id, input_revision, origin, relevance, category, title_zh, summary_zh, reason_zh, score, selected)
            VALUES (${articleId}, 1, 'rule', 'pass', 'vulnerability', ${`标题-${T}`}, ${`摘要-${T}`}, '理由', 90, true)`;
  await publishArticle(articleId, { releasedAt: new Date(Date.now() - 60_000) });

  const rows = await sql<{ id: number }[]>`
    INSERT INTO stories (public_id, title, first_report_at, latest_at)
    VALUES (${randomUUID()}, ${`STORY-${T}`}, now(), now()) RETURNING id`;
  storyId = rows[0]!.id;
  const [fact] = await sql<{ id: number }[]>`INSERT INTO facts (public_id, story_id, title) VALUES (${`fact-${T}`}, ${storyId}, ${`FACT-${T}`}) RETURNING id`;
  await sql`INSERT INTO fact_articles (fact_id, article_id, role) VALUES (${fact!.id}, ${articleId}, 'report')`;
  const [publicRow] = await sql<{ public_id: string }[]>`SELECT public_id::text AS public_id FROM stories WHERE id = ${storyId}`;
  storyPublicId = publicRow!.public_id;

  const bare = await sql<{ id: number }[]>`
    INSERT INTO stories (public_id, title, first_report_at, latest_at) VALUES (${randomUUID()}, ${`BARE-${T}`}, now(), now()) RETURNING id`;
  bareStoryId = bare[0]!.id;
  const [barePublic] = await sql<{ public_id: string }[]>`SELECT public_id::text AS public_id FROM stories WHERE id = ${bareStoryId}`;
  bareStoryPublicId = barePublic!.public_id;
  // Give the bare story a public report so it renders: it then answers 200 with an empty agent state.
  const bareArticle = await upsertMaterial({
    sourceId: SOURCE, url: `https://example.com/${T}-bare`, title: `Phase 7 bare article ${T}`, bodyText: `bare body ${T}`, bodyHtml: `<p>bare body ${T}</p>`,
    bodyStatus: "ok", via: "fetch", publishedAt: new Date(),
  });
  await sql`INSERT INTO analyses (article_id, input_revision, origin, relevance, category, title_zh, summary_zh, reason_zh, score, selected)
            VALUES (${bareArticle.articleId}, 1, 'rule', 'pass', 'vulnerability', ${`标题-bare-${T}`}, ${`摘要-bare-${T}`}, '理由', 90, true)`;
  await publishArticle(bareArticle.articleId, { releasedAt: new Date(Date.now() - 60_000) });
  const [bareFact] = await sql<{ id: number }[]>`INSERT INTO facts (public_id, story_id, title) VALUES (${`fact-bare-${T}`}, ${bareStoryId}, ${`FACT-BARE-${T}`}) RETURNING id`;
  await sql`INSERT INTO fact_articles (fact_id, article_id, role) VALUES (${bareFact!.id}, ${bareArticle.articleId}, 'report')`;

  // Agent data on the populated story: one research run with evidence and a claim, one tracking plan.
  const run = await startResearchRun({
    storyId, traceId: randomUUID(), objective: "Phase 7 fixture", graphVersion: "phase4-stub-v1",
    snapshot: snapshot(storyId), limits: DEFAULT_RESEARCH_LIMITS,
  });
  await completeResearchRun({
    runId: run.id, storyId, provider: "fixture",
    proposal: ResearchProposalSchema.parse({
      claims: [{ claim_id: "p7", text: "Vendor advisory names affected versions.", criticality: "noncritical", status: "confirmed", confidence: 0.8, evidence_ids: [evidenceId] }],
      unknowns: [{ question: "Is a backport planned?", attempted_sources: ["vendor advisory"], reason: "Not stated." }],
      conflicts: [], tool_trace: [], summary: "One confirmed claim from the advisory.", terminal_status: "completed",
      evidence: [{
        evidence_id: evidenceId, source_type: "vendor_advisory", source_name: "Vendor", canonical_url: "https://vendor.example/phase7",
        title: "Advisory", excerpt: "Versions listed.", normalized: { secret_internals: true },
        content_hash: "1".repeat(64), authority_level: "authoritative", published_at: null,
        source_updated_at: null, retrieved_at: new Date().toISOString(), provenance: { fetcher: "internal" },
      }],
    }),
  });
  await createTrackingPlan({
    storyId,
    whyTrack: "Still unfolding.",
    questions: [{ question_id: "q1", question: "Will all branches get the fix?", resolve_on: ["patch"], status: "open", resolved_evidence_ids: [] }],
    sourceTargets: ["vendor_advisory"],
    intervalPolicy: { min_hours: 6, max_hours: 72, no_change_multiplier: 2, max_no_change_checks: 5 },
    stopCondition: { all_questions_resolved: false, stop_after_no_change_checks: 5, deadline_at: null },
    initialIntervalHours: 12,
    nextCheckAt: new Date(Date.now() + 12 * 3600_000),
  });
});

after(async () => {
  await sql`DELETE FROM tracking_plans WHERE story_id IN (${storyId}, ${bareStoryId})`;
  await sql`DELETE FROM external_evidence WHERE story_id IN (${storyId}, ${bareStoryId})`;
  await sql`DELETE FROM agent_research_runs WHERE story_id IN (${storyId}, ${bareStoryId})`;
  await sql`DELETE FROM fact_articles WHERE fact_id IN (SELECT id FROM facts WHERE story_id IN (${storyId}, ${bareStoryId}))`;
  await sql`DELETE FROM facts WHERE story_id IN (${storyId}, ${bareStoryId})`;
  await sql`DELETE FROM stories WHERE id IN (${storyId}, ${bareStoryId})`;
  await sql`DELETE FROM analyses WHERE article_id IN (SELECT id FROM articles WHERE source_id = ${SOURCE})`;
  await sql`DELETE FROM articles WHERE source_id = ${SOURCE}`;
  await sql`DELETE FROM sources WHERE id = ${SOURCE}`;
  await app.close();
  await closeDb();
});

async function get(url: string, headers: Record<string, string> = {}) {
  const res = await app.inject({ method: "GET", url, headers });
  return { status: res.statusCode, body: res.body, etag: res.headers.etag as string | undefined };
}

const FORBIDDEN = ["content_hash", "normalized", "provenance", "tool_trace", "trace_id", "receipt", "prompt_version", "error_detail", "payload"];

test("site story API exposes the unified read model additively", async () => {
  const res = await get(`/api/site/stories/${storyPublicId}`);
  assert.equal(res.status, 200);
  const story = JSON.parse(res.body);
  // Old fields keep their shape.
  assert.equal(story.publicId, storyPublicId);
  assert.equal(story.reportCount, 1);
  assert.ok(Array.isArray(story.timeline) && story.timeline.length === 1);
  assert.ok(story.digestUpdatedAt === null || typeof story.digestUpdatedAt === "string");
  // New field: the same read model the page renders.
  assert.equal(story.agentIntelligence.present, true);
  assert.equal(story.agentIntelligence.research.status, "completed");
  assert.equal(story.agentIntelligence.research.claims[0].claimId, "p7");
  assert.equal(story.agentIntelligence.tracking.status, "active");
  assert.equal(story.agentIntelligence.evidence[0].url, "https://vendor.example/phase7");
  assert.equal(story.agentIntelligence.unknowns[0].text, "Is a backport planned?");
  for (const fragment of FORBIDDEN) assert.ok(!res.body.includes(fragment), `leaked ${fragment}`);
});

test("public v1 story API carries the same read model, old fields untouched", async () => {
  const res = await get(`/api/v1/stories/${storyPublicId}`);
  assert.equal(res.status, 200);
  const body = JSON.parse(res.body);
  assert.equal(body.schemaVersion, 1);
  for (const key of ["publicId", "title", "status", "sourceCount", "reportCount", "firstReportAt", "latestAt", "latest", "digest", "digestUpdatedAt", "links", "reports", "storyline", "related"]) {
    assert.ok(key in body.story, `v1 story lost ${key}`);
  }
  assert.equal(body.story.agentIntelligence.present, true);
  assert.equal(body.story.agentIntelligence.research.summary, "One confirmed claim from the advisory.");
  for (const fragment of FORBIDDEN) assert.ok(!res.body.includes(fragment), `leaked ${fragment}`);
});

test("stories without agent data answer with the empty state, not an error", async () => {
  const res = await get(`/api/site/stories/${bareStoryPublicId}`);
  assert.equal(res.status, 200);
  const story = JSON.parse(res.body);
  assert.equal(story.agentIntelligence.present, false);
  assert.equal(story.agentIntelligence.research, null);
  assert.equal(story.agentIntelligence.tracking, null);
  assert.deepEqual(story.agentIntelligence.evidence, []);
  assert.deepEqual(story.agentIntelligence.productImpact.rows, []);
  assert.equal(story.agentIntelligence.dataUpdatedAt, null);
  const v1 = await get(`/api/v1/stories/${bareStoryPublicId}`);
  assert.equal(v1.status, 200);
  assert.equal(JSON.parse(v1.body).story.agentIntelligence.present, false);
});

test("missing stories keep 404 and merged stories keep 308", async () => {
  assert.equal((await get(`/api/site/stories/${randomUUID()}`)).status, 404);
  assert.equal((await get(`/api/v1/stories/${randomUUID()}`)).status, 404);
  assert.equal((await get(`/api/site/stories/not-a-uuid`)).status, 404);
});

test("story responses keep conditional-request behaviour", async () => {
  const first = await get(`/api/site/stories/${storyPublicId}`);
  assert.ok(first.etag, "story response carries an etag");
  const again = await get(`/api/site/stories/${storyPublicId}`);
  assert.equal(again.etag, first.etag);
  const cached = await get(`/api/site/stories/${storyPublicId}`, { "if-none-match": first.etag! });
  assert.equal(cached.status, 304);
});
