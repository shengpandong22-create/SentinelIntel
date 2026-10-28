import { randomUUID } from "node:crypto";
import { sql } from "../db.ts";
import { runAgentResearchTask, type AgentClientOptions } from "./client.ts";
import { DEFAULT_RESEARCH_LIMITS, type StoryResearchSnapshot } from "./research-contract.ts";
import { completeResearchRun, failResearchRun, startResearchRun } from "./research-store.ts";

const RESEARCH_QUESTIONS = [
  "What does the authoritative vulnerability record confirm?",
  "Is this vulnerability listed as known exploited?",
  "Has the vendor published remediation guidance?",
] as const;

export async function listResearchCandidates(limit = 50): Promise<Array<{ id: number; version: number }>> {
  if (!Number.isInteger(limit) || limit < 1 || limit > 200) throw new Error("invalid research candidate limit");
  return sql<{ id: number; version: number }[]>`
    SELECT s.id, s.version
    FROM stories s
    WHERE s.merged_into IS NULL
      AND (s.title ~* 'CVE-[0-9]{4}-[0-9]{4,}' OR coalesce(s.digest, '') ~* 'CVE-[0-9]{4}-[0-9]{4,}')
      AND NOT EXISTS (
        SELECT 1 FROM agent_research_runs r
        WHERE r.story_id = s.id AND r.graph_version LIKE 'phase4-%'
          AND r.status IN ('running', 'completed')
          AND (r.input_snapshot->>'story_version')::int = s.version
      )
    ORDER BY s.id
    LIMIT ${limit}`;
}

export async function loadResearchSnapshot(storyId: number): Promise<StoryResearchSnapshot | null> {
  const [story] = await sql<{
    id: number; title: string; digest: string | null; status: "active" | "watching" | "settled"; version: number;
  }[]>`SELECT id, title, digest, status, version FROM stories WHERE id = ${storyId} AND merged_into IS NULL`;
  if (!story) return null;
  const facts = await sql<{ fact_id: number; public_id: string; title: string }[]>`
    SELECT id AS fact_id, public_id::text, title FROM facts WHERE story_id = ${storyId} ORDER BY id LIMIT 500`;
  return {
    schema_version: 1,
    story_id: story.id,
    story_version: story.version,
    title: story.title,
    digest: story.digest,
    status: story.status,
    facts,
    missing_questions: [...RESEARCH_QUESTIONS],
    captured_at: new Date().toISOString(),
  };
}

export async function runResearchForStory(storyId: number, opts: AgentClientOptions = {}) {
  const snapshot = await loadResearchSnapshot(storyId);
  if (!snapshot) throw new Error("research Story is missing or merged");
  const [existing] = await sql<{ public_id: string }[]>`
    SELECT public_id::text FROM agent_research_runs
    WHERE story_id = ${storyId} AND graph_version LIKE 'phase4-%' AND status = 'completed'
      AND (input_snapshot->>'story_version')::int = ${snapshot.story_version}
    ORDER BY id DESC LIMIT 1`;
  if (existing) return { storyId, skipped: "already_researched" as const, runId: existing.public_id };

  const traceId = randomUUID();
  const objective = "Research authoritative public evidence for this security Story.";
  const run = await startResearchRun({
    storyId,
    traceId,
    objective,
    graphVersion: "phase4-research-v1",
    snapshot,
    limits: DEFAULT_RESEARCH_LIMITS,
  });
  try {
    const response = await runAgentResearchTask({
      traceId,
      runId: run.publicId,
      toolCapability: run.capability,
      objective,
      snapshot,
      limits: DEFAULT_RESEARCH_LIMITS,
    }, opts);
    await completeResearchRun({
      runId: run.id,
      storyId,
      proposal: response.proposal,
      provider: "research-agent",
      promptVersion: "phase4-research-v1",
    });
    return { storyId, traceId, runId: run.publicId, proposal: response.proposal };
  } catch (error) {
    await failResearchRun(run.id, "research_failed", error instanceof Error ? error.message : String(error)).catch(() => undefined);
    throw error;
  }
}
