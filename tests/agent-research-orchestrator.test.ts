import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, before, test } from "node:test";
import { closeDb, sql } from "@aihot/backend/db";
import { listResearchCandidates, loadResearchSnapshot, runResearchForStory } from "@aihot/backend/agents/research";
import { tag } from "./setup.ts";

const T = tag();
let cveStoryId: number;
let plainStoryId: number;

before(async () => {
  const rows = await sql<{ id: number }[]>`
    INSERT INTO stories (public_id, title, first_report_at, latest_at) VALUES
      (${randomUUID()}, ${`Cisco CVE-2026-10003 research candidate ${T}`}, now(), now()),
      (${randomUUID()}, ${`Ordinary security market update ${T}`}, now(), now())
    RETURNING id`;
  cveStoryId = rows[0]!.id;
  plainStoryId = rows[1]!.id;
  await sql`INSERT INTO facts (public_id, story_id, title) VALUES (${randomUUID()}, ${cveStoryId}, ${`Vendor disclosure ${T}`})`;
});

after(async () => {
  await sql`DELETE FROM external_evidence WHERE story_id = ANY(${[cveStoryId, plainStoryId]})`;
  await sql`DELETE FROM agent_research_runs WHERE story_id = ANY(${[cveStoryId, plainStoryId]})`;
  await sql`DELETE FROM facts WHERE story_id = ANY(${[cveStoryId, plainStoryId]})`;
  await sql`DELETE FROM stories WHERE id = ANY(${[cveStoryId, plainStoryId]})`;
  await closeDb();
});

test("research candidate and snapshot loaders preserve Story identity", async () => {
  const candidates = await listResearchCandidates(50);
  assert.equal(candidates.some((item) => item.id === cveStoryId), true);
  assert.equal(candidates.some((item) => item.id === plainStoryId), false);
  const snapshot = await loadResearchSnapshot(cveStoryId);
  assert.equal(snapshot?.story_id, cveStoryId);
  assert.equal(snapshot?.facts.length, 1);
  assert.equal(snapshot?.missing_questions.length, 3);
});

test("research orchestrator commits one bounded run and skips the same Story version", async () => {
  const result = await runResearchForStory(cveStoryId, {
    researchEnabled: true,
    internalToken: "test-token",
    retries: 0,
    fetch: async (url, init) => {
      assert.equal(String(url).endsWith(`/v1/research/story/${cveStoryId}`), true);
      const body = JSON.parse(String(init?.body)) as { run_id: string; trace_id: string; snapshot: { facts: unknown[] } };
      assert.equal(body.snapshot.facts.length, 1);
      return new Response(JSON.stringify({
        trace_id: body.trace_id,
        run_id: body.run_id,
        status: "ok",
        proposal: {
          claims: [],
          unknowns: [{ question: "Vendor remediation remains unknown.", attempted_sources: ["nvd_lookup"], reason: "No official evidence was returned." }],
          evidence: [],
          conflicts: [],
          tool_trace: [],
          summary: "No supported claim was produced.",
          terminal_status: "insufficient_evidence",
        },
      }), { status: 200, headers: { "content-type": "application/json" } });
    },
  });
  assert.equal("proposal" in result, true);
  const [stored] = await sql<{ status: string; graph_version: string }[]>`
    SELECT status, graph_version FROM agent_research_runs WHERE public_id = ${result.runId}`;
  assert.deepEqual(stored, { status: "completed", graph_version: "phase4-research-v1" });

  const repeat = await runResearchForStory(cveStoryId, {
    researchEnabled: true,
    internalToken: "test-token",
    fetch: async () => { throw new Error("completed Story version must not call runtime again"); },
  });
  assert.deepEqual(repeat, { storyId: cveStoryId, skipped: "already_researched", runId: result.runId });
});
