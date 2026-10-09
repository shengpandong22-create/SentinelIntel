// Deterministic Phase 4 loop: TypeScript run -> Python graph -> TypeScript stub tool -> proposal -> DB.
// Requires a migrated throwaway *_test or *_ci database and explicit test-only research configuration.
import { spawn, type ChildProcess } from "node:child_process";
import net from "node:net";
import { randomUUID } from "node:crypto";
import { buildApp } from "../apps/api/src/app.ts";
import { runAgentResearchTask } from "@aihot/backend/agents/client";
import { DEFAULT_RESEARCH_LIMITS } from "@aihot/backend/agents/research-contract";
import { completeResearchRun, startResearchRun } from "@aihot/backend/agents/research-store";
import { closeDb, sql } from "@aihot/backend/db";

const database = new URL(process.env.DATABASE_URL ?? "postgres://unset/unset").pathname.slice(1);
if (!/_(test|ci)$/.test(database)) throw new Error(`research check requires a throwaway *_test or *_ci database (got ${database})`);
if (process.env.AGENT_RESEARCH_ENABLED !== "true") throw new Error("AGENT_RESEARCH_ENABLED=true is required for this deterministic check");
if (process.env.AGENT_RESEARCH_NETWORK_ENABLED !== "false") throw new Error("AGENT_RESEARCH_NETWORK_ENABLED must remain false");
const token = process.env.AGENT_INTERNAL_TOKEN ?? "";
if (token.length < 32) throw new Error("a test-only AGENT_INTERNAL_TOKEN of at least 32 characters is required");
const agentBaseArg = process.argv.indexOf("--agent-base");
const externalAgentBase = agentBaseArg >= 0 ? process.argv[agentBaseArg + 1] : undefined;
if (agentBaseArg >= 0 && !externalAgentBase) throw new Error("--agent-base requires a URL");

async function freePort(): Promise<number> {
  const server = net.createServer();
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const port = (server.address() as net.AddressInfo).port;
  await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  return port;
}

async function waitForHealth(baseUrl: string, process: ChildProcess): Promise<void> {
  for (let attempt = 0; attempt < 50; attempt += 1) {
    if (process.exitCode !== null) throw new Error(`agent runtime exited with ${process.exitCode}`);
    try {
      const response = await fetch(`${baseUrl}/health`);
      if (response.ok) return;
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error("agent runtime did not become healthy");
}

const api = externalAgentBase ? null : await buildApp();
const apiAddress = api ? await api.listen({ host: "127.0.0.1", port: 0 }) : null;
const pythonPort = externalAgentBase ? null : await freePort();
const pythonBase = externalAgentBase ?? `http://127.0.0.1:${pythonPort}`;
const child = externalAgentBase ? null : spawn(
    process.platform === "win32" ? "python.exe" : "python",
    ["-m", "uvicorn", "app.main:app", "--host", "127.0.0.1", "--port", String(pythonPort), "--log-level", "error"],
    {
      cwd: new URL("../agent-runtime", import.meta.url),
      env: {
        ...process.env,
        AGENT_RESEARCH_ENABLED: "true",
        AGENT_RESEARCH_NETWORK_ENABLED: "false",
        AGENT_INTERNAL_TOKEN: token,
        AGENT_GATEWAY_URL: apiAddress!,
      },
      stdio: ["ignore", "pipe", "pipe"],
    },
  );

let storyId: number | null = null;
try {
  if (child) await waitForHealth(pythonBase, child);
  const [story] = await sql<{ id: number }[]>`
    INSERT INTO stories (public_id, title, first_report_at, latest_at)
    VALUES (${randomUUID()}, 'Phase 4 deterministic callback check', now(), now()) RETURNING id`;
  storyId = story!.id;
  const traceId = randomUUID();
  const snapshot = {
    schema_version: 1 as const,
    story_id: storyId,
    story_version: 1,
    title: "Phase 4 deterministic callback check",
    digest: null,
    status: "active" as const,
    facts: [],
    missing_questions: ["Which versions are affected?"],
    captured_at: new Date().toISOString(),
  };
  const run = await startResearchRun({
    storyId,
    traceId,
    objective: "Prove the deterministic callback loop",
    graphVersion: "phase4-stub-v1",
    snapshot,
    limits: DEFAULT_RESEARCH_LIMITS,
  });
  const result = await runAgentResearchTask({
    traceId,
    runId: run.publicId,
    toolCapability: run.capability,
    objective: "Prove the deterministic callback loop",
    snapshot,
    limits: DEFAULT_RESEARCH_LIMITS,
  }, { baseUrl: pythonBase, researchEnabled: true, internalToken: token, retries: 0, timeoutMs: 15_000 });
  await completeResearchRun({ runId: run.id, storyId, proposal: result.proposal, model: "test-stub", provider: "fixture" });

  const [stored] = await sql<{ status: string; calls: number; documents: number; evidence: number }[]>`
    SELECT r.status, r.tool_calls_used AS calls, r.evidence_documents_used AS documents,
           count(e.id)::int AS evidence
    FROM agent_research_runs r LEFT JOIN external_evidence e ON e.research_run_id = r.id
    WHERE r.id = ${run.id} GROUP BY r.id`;
  const [unchanged] = await sql<{ version: number; digest: string | null }[]>`
    SELECT version, digest FROM stories WHERE id = ${storyId}`;
  if (!stored || stored.status !== "completed" || stored.calls !== 1 || stored.documents !== 1 || stored.evidence !== 1) {
    throw new Error(`unexpected persisted research result: ${JSON.stringify(stored)}`);
  }
  if (unchanged?.version !== 1 || unchanged.digest !== null) throw new Error("research changed core Story state");
  process.stdout.write(`${JSON.stringify({ ok: true, traceId, status: stored.status, toolCalls: stored.calls, evidence: stored.evidence, externalNetwork: false })}\n`);
} finally {
  if (storyId !== null) {
    await sql`DELETE FROM external_evidence WHERE story_id = ${storyId}`;
    await sql`DELETE FROM agent_research_runs WHERE story_id = ${storyId}`;
    await sql`DELETE FROM stories WHERE id = ${storyId}`;
  }
  child?.kill("SIGTERM");
  if (api) await api.close();
  await closeDb();
}
