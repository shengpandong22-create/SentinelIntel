import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, before, test } from "node:test";

const database = new URL(process.env.DATABASE_URL ?? "postgres://unset/unset").pathname.slice(1);
if (!/_(test|ci)$/.test(database)) throw new Error(`tool gateway tests require *_test or *_ci (got ${database})`);
process.env.AGENT_RESEARCH_ENABLED = "true";
process.env.AGENT_RESEARCH_NETWORK_ENABLED = "false";
process.env.AGENT_INTERNAL_TOKEN = "gateway-test-token-0123456789abcdef";
process.env.MODEL_CALLS_ENABLED = "false";
process.env.AIHOT_CREDENTIALS_DIR = "/nonexistent-test-credentials";
process.env.LOG_LEVEL = "error";

const [{ buildApp }, { closeDb, sql }, { DEFAULT_RESEARCH_LIMITS }, { startResearchRun }] = await Promise.all([
  import("../apps/api/src/app.ts"),
  import("@aihot/backend/db"),
  import("@aihot/backend/agents/research-contract"),
  import("@aihot/backend/agents/research-store"),
]);

const app = await buildApp();
let storyId: number;
let run: Awaited<ReturnType<typeof startResearchRun>>;
const traceId = randomUUID();

before(async () => {
  const [story] = await sql<{ id: number }[]>`
    INSERT INTO stories (public_id, title) VALUES (${randomUUID()}, 'Gateway fixture') RETURNING id`;
  storyId = story!.id;
  run = await startResearchRun({
    storyId,
    traceId,
    objective: "Test gateway",
    graphVersion: "phase4-stub-v1",
    snapshot: {
      schema_version: 1,
      story_id: storyId,
      story_version: 1,
      title: "Gateway fixture",
      digest: null,
      status: "active",
      facts: [],
      missing_questions: ["What is known?"],
      captured_at: new Date().toISOString(),
    },
    limits: { ...DEFAULT_RESEARCH_LIMITS, max_tool_calls: 1 },
  });
});

after(async () => {
  await sql`DELETE FROM external_evidence WHERE story_id = ${storyId}`;
  await sql`DELETE FROM agent_research_runs WHERE story_id = ${storyId}`;
  await sql`DELETE FROM stories WHERE id = ${storyId}`;
  await app.close();
  await closeDb();
});

const payload = () => ({ trace_id: traceId, run_id: run.publicId, input: { question: "What is known?" } });

test("internal tool route rejects missing authentication without consuming a tool call", async () => {
  const response = await app.inject({ method: "POST", url: "/api/internal/agent/tools/stub", payload: payload() });
  assert.equal(response.statusCode, 401);
  const [stored] = await sql<{ calls: number }[]>`SELECT tool_calls_used AS calls FROM agent_research_runs WHERE id = ${run.id}`;
  assert.equal(stored!.calls, 0);
});

test("internal tool route rejects a trace mismatch without consuming a tool call", async () => {
  const response = await app.inject({
    method: "POST",
    url: "/api/internal/agent/tools/stub",
    headers: {
      authorization: `Bearer ${process.env.AGENT_INTERNAL_TOKEN}`,
      "x-run-capability": run.capability,
      "x-trace-id": randomUUID(),
    },
    payload: payload(),
  });
  assert.equal(response.statusCode, 400);
  assert.equal(response.json().error.code, "trace_mismatch");
});

test("live NVD adapter is blocked while the independent network switch is off", async () => {
  const response = await app.inject({
    method: "POST",
    url: "/api/internal/agent/tools/nvd_lookup",
    headers: {
      authorization: `Bearer ${process.env.AGENT_INTERNAL_TOKEN}`,
      "x-run-capability": run.capability,
      "x-trace-id": traceId,
    },
    payload: { trace_id: traceId, run_id: run.publicId, input: { cve_id: "CVE-2021-44228" } },
  });
  assert.equal(response.statusCode, 409);
  assert.equal(response.json().error.code, "tool_rejected");
  const [stored] = await sql<{ calls: number }[]>`SELECT tool_calls_used AS calls FROM agent_research_runs WHERE id = ${run.id}`;
  assert.equal(stored!.calls, 0);
});

test("authenticated stub callback is bounded, receipt-free, and deterministic", async () => {
  const request = {
    method: "POST" as const,
    url: "/api/internal/agent/tools/stub",
    headers: {
      authorization: `Bearer ${process.env.AGENT_INTERNAL_TOKEN}`,
      "x-run-capability": run.capability,
      "x-trace-id": traceId,
    },
    payload: payload(),
  };
  const response = await app.inject(request);
  assert.equal(response.statusCode, 200);
  const body = response.json();
  assert.equal(body.evidence.length, 1);
  assert.equal(body.evidence[0].provenance.external_network, false);
  assert.deepEqual(body.receipt_ids, []);

  const replay = await app.inject(request);
  assert.equal(replay.statusCode, 409);
  assert.equal(replay.json().error.code, "tool_rejected");
});
