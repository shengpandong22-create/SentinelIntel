import { randomBytes, randomUUID } from "node:crypto";
import { runAgentTrackingTask, type AgentClientOptions } from "./client.ts";
import { applyTrackingProposal, loadTrackingTask } from "./tracking-store.ts";
import { completeResearchRun, failResearchRun, startResearchRun } from "./research-store.ts";
import { DEFAULT_RESEARCH_LIMITS, ResearchProposalSchema } from "./research-contract.ts";
import { TrackingTaskSchema } from "./tracking-contract.ts";

export async function runTrackingPlan(
  planPublicId: string,
  expectedVersion: number,
  opts: AgentClientOptions & { trackingEnabled?: boolean } = {},
) {
  const traceId = randomUUID();
  const bootstrap = await loadTrackingTask({
    planPublicId,
    traceId,
    runId: randomUUID(),
    toolCapability: randomBytes(32).toString("base64url"),
    limits: DEFAULT_RESEARCH_LIMITS,
  });
  if (bootstrap.plan.version !== expectedVersion) throw new Error("stale tracking job version");
  const run = await startResearchRun({
    storyId: bootstrap.story.story_id,
    traceId,
    objective: bootstrap.plan.why_track,
    graphVersion: "phase5-tracking-v1",
    snapshot: bootstrap.story,
    limits: DEFAULT_RESEARCH_LIMITS,
  });
  const task = TrackingTaskSchema.parse({
    ...bootstrap,
    run_id: run.publicId,
    tool_capability: run.capability,
  });
  try {
    const response = await runAgentTrackingTask(task, opts);
    await completeResearchRun({
      runId: run.id,
      storyId: task.story.story_id,
      provider: "tracking-agent",
      promptVersion: "phase5-tracking-v1",
      proposal: ResearchProposalSchema.parse({
        claims: [],
        unknowns: response.proposal.question_updates
          .filter((update) => update.status === "open")
          .map((update) => ({ question: update.question_id, attempted_sources: response.proposal.tool_trace.map((trace) => trace.tool), reason: update.reason })),
        evidence: response.proposal.new_evidence,
        conflicts: [],
        tool_trace: response.proposal.tool_trace,
        summary: response.proposal.decision_reason,
        terminal_status: response.proposal.decision === "insufficient_evidence" ? "insufficient_evidence" : "completed",
      }),
    });
    const committed = await applyTrackingProposal({ task, proposal: response.proposal });
    return { traceId, runId: run.publicId, planPublicId, ...committed, proposal: response.proposal };
  } catch (error) {
    await failResearchRun(run.id, "tracking_failed", error instanceof Error ? error.message : String(error)).catch(() => undefined);
    throw error;
  }
}
