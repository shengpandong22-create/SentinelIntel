// MCP compatibility for the Phase 7 get_story extension: the tool list and the old story fields
// stay exactly as before, agent intelligence is purely additive, and no internal state (traces,
// receipts, prompts, evidence internals, review payloads) crosses the public MCP boundary.
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, before, test } from "node:test";
import Fastify from "fastify";
import { closeDb, sql } from "@aihot/backend/db";
import { MCP_TOOL_NAMES } from "@aihot/contracts/mcp";
import { upsertMaterial } from "@aihot/backend/content/materials";
import { publishArticle } from "@aihot/backend/publication/publish";
import { completeResearchRun, startResearchRun } from "@aihot/backend/agents/research-store";
import { DEFAULT_RESEARCH_LIMITS, ResearchProposalSchema } from "@aihot/backend/agents/research-contract";
import { registerMcp } from "../apps/api/src/routes/mcp.ts";
import { tag } from "./setup.ts";

const T = tag();
const SOURCE = `test-mcp-story-${T}`;
const app = Fastify();
registerMcp(app);
const address = await app.listen({ host: "127.0.0.1", port: 0 });

let storyPublicId: string;
const evidenceId = randomUUID();

before(async () => {
  await sql`INSERT INTO sources (id, name, kind, tier, participation_mode, site_fulltext, syndicate_fulltext, next_fetch_at)
            VALUES (${SOURCE}, 'MCP story test', 'rss', 'T1', 'editorial', true, true, '2100-01-01')`;
  const { articleId } = await upsertMaterial({
    sourceId: SOURCE, url: `https://example.com/${T}`, title: `MCP article ${T}`, bodyText: `body ${T}`, bodyHtml: `<p>body ${T}</p>`,
    bodyStatus: "ok", via: "fetch", publishedAt: new Date(),
  });
  await sql`INSERT INTO analyses (article_id, input_revision, origin, relevance, category, title_zh, summary_zh, reason_zh, score, selected)
            VALUES (${articleId}, 1, 'rule', 'pass', 'vulnerability', ${`标题-${T}`}, ${`摘要-${T}`}, '理由', 90, true)`;
  await publishArticle(articleId, { releasedAt: new Date(Date.now() - 60_000) });
  const [story] = await sql<{ id: number }[]>`
    INSERT INTO stories (public_id, title, first_report_at, latest_at) VALUES (${randomUUID()}, ${`MCP-STORY-${T}`}, now(), now()) RETURNING id`;
  const [fact] = await sql<{ id: number }[]>`INSERT INTO facts (public_id, story_id, title) VALUES (${`fact-${T}`}, ${story!.id}, ${`FACT-${T}`}) RETURNING id`;
  await sql`INSERT INTO fact_articles (fact_id, article_id, role) VALUES (${fact!.id}, ${articleId}, 'report')`;
  const [publicRow] = await sql<{ public_id: string }[]>`SELECT public_id::text AS public_id FROM stories WHERE id = ${story!.id}`;
  storyPublicId = publicRow!.public_id;

  const run = await startResearchRun({
    storyId: story!.id, traceId: randomUUID(), objective: "MCP fixture", graphVersion: "phase4-stub-v1",
    snapshot: {
      schema_version: 1, story_id: story!.id, story_version: 1, title: `MCP-STORY-${T}`, digest: null,
      status: "active", facts: [], missing_questions: [], captured_at: new Date().toISOString(),
    },
    limits: DEFAULT_RESEARCH_LIMITS,
  });
  await completeResearchRun({
    runId: run.id, storyId: story!.id, provider: "fixture",
    proposal: ResearchProposalSchema.parse({
      claims: [{ claim_id: "m1", text: "Vendor advisory names affected versions.", criticality: "noncritical", status: "confirmed", confidence: 0.8, evidence_ids: [evidenceId] }],
      unknowns: [{ question: "Is a backport planned?", attempted_sources: ["vendor advisory"], reason: "Not stated." }],
      conflicts: [], tool_trace: [], summary: "One confirmed claim.", terminal_status: "completed",
      evidence: [{
        evidence_id: evidenceId, source_type: "vendor_advisory", source_name: "Vendor", canonical_url: "https://vendor.example/mcp-story",
        title: "Advisory", excerpt: "Versions listed.", normalized: { internals: true },
        content_hash: "9".repeat(64), authority_level: "authoritative", published_at: null,
        source_updated_at: null, retrieved_at: new Date().toISOString(), provenance: { fetcher: "internal" },
      }],
    }),
  });
});

after(async () => {
  await sql`DELETE FROM external_evidence WHERE story_id = (SELECT id FROM stories WHERE public_id = ${storyPublicId})`;
  await sql`DELETE FROM agent_research_runs WHERE story_id = (SELECT id FROM stories WHERE public_id = ${storyPublicId})`;
  await sql`DELETE FROM fact_articles WHERE fact_id IN (SELECT id FROM facts WHERE story_id = (SELECT id FROM stories WHERE public_id = ${storyPublicId}))`;
  await sql`DELETE FROM facts WHERE story_id = (SELECT id FROM stories WHERE public_id = ${storyPublicId})`;
  await sql`DELETE FROM stories WHERE public_id = ${storyPublicId}`;
  await sql`DELETE FROM analyses WHERE article_id IN (SELECT id FROM articles WHERE source_id = ${SOURCE})`;
  await sql`DELETE FROM articles WHERE source_id = ${SOURCE}`;
  await sql`DELETE FROM sources WHERE id = ${SOURCE}`;
  await app.close();
  await closeDb();
});

async function rpc(method: string, params: unknown) {
  const name = (params as { name?: string }).name;
  const res = await fetch(`${address}/api/mcp`, {
    method: "POST",
    headers: {
      "content-type": "application/json", accept: "application/json, text/event-stream", "mcp-protocol-version": "2026-07-28",
      "mcp-method": method, ...(name ? { "mcp-name": name } : {}),
    },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params: { _meta: { "io.modelcontextprotocol/protocolVersion": "2026-07-28", "io.modelcontextprotocol/clientCapabilities": {} }, ...(params as object) } }),
  });
  const text = await res.text();
  assert.equal(res.status, 200, text.slice(0, 300));
  const payload = text.startsWith("{") ? JSON.parse(text) : JSON.parse(text.split("\n").find((line) => line.startsWith("data: "))!.slice(6));
  return payload.result;
}

test("the MCP tool list is unchanged: five tools, same names", async () => {
  const result = await rpc("tools/list", {});
  const names = result.tools.map((t: { name: string }) => t.name).sort();
  assert.deepEqual(names, Object.values(MCP_TOOL_NAMES).sort());
  const story = result.tools.find((t: { name: string }) => t.name === MCP_TOOL_NAMES.story);
  assert.deepEqual(Object.keys(story.inputSchema.properties).sort(), ["public_id", "report_limit"]);
  assert.equal(story.inputSchema.required[0], "public_id");
});

test("get_story keeps every old field and adds agent intelligence additively", async () => {
  const result = await rpc("tools/call", { name: MCP_TOOL_NAMES.story, arguments: { public_id: storyPublicId } });
  assert.ok(!result.isError, JSON.stringify(result).slice(0, 300));
  const story = result.structuredContent.story;
  for (const key of ["publicId", "title", "status", "sourceCount", "reportCount", "firstReportAt", "latestAt", "latest", "digest", "digestUpdatedAt", "links", "reports", "storyline", "related"]) {
    assert.ok(key in story, `get_story lost ${key}`);
  }
  assert.equal(result.structuredContent.schemaVersion, 1);
  // The additive field comes from the same publication read model as the API and the web page.
  assert.equal(story.agentIntelligence.present, true);
  assert.equal(story.agentIntelligence.research.summary, "One confirmed claim.");
  assert.equal(story.agentIntelligence.research.claims[0].text, "Vendor advisory names affected versions.");
  assert.equal(story.agentIntelligence.unknowns[0].text, "Is a backport planned?");
  assert.equal(story.agentIntelligence.evidence[0].url, "https://vendor.example/mcp-story");
  // The text answer carries a compact, honest summary.
  const text = result.content[0].text as string;
  assert.ok(text.includes("安全研判"));
  assert.ok(text.includes("研究完成"));
  assert.ok(text.includes("未知不代表安全，也不代表不受影响"));
  // No internals cross the boundary.
  for (const fragment of ["content_hash", "normalized", "provenance", "tool_trace", "trace_id", "receipt", "prompt_version", "payload", "fetcher"]) {
    assert.ok(!JSON.stringify(result).includes(fragment), `MCP leaked ${fragment}`);
  }
});

test("get_story still answers not_found for unknown ids and keeps working without agent data", async () => {
  const missing = await rpc("tools/call", { name: MCP_TOOL_NAMES.story, arguments: { public_id: randomUUID() } });
  assert.equal(missing.isError, true);
  assert.equal(missing.structuredContent.error.code, "not_found");
});
