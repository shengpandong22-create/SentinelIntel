import { randomBytes, randomUUID } from "node:crypto";
import { runAgentTrackingTask, type AgentClientOptions } from "./client.ts";
import { applyTrackingProposal, loadTrackingTask } from "./tracking-store.ts";

export async function runTrackingPlan(
  planPublicId: string,
  expectedVersion: number,
  opts: AgentClientOptions & { trackingEnabled?: boolean } = {},
) {
  const traceId = randomUUID();
  const runId = randomUUID();
  const task = await loadTrackingTask({
    planPublicId,
    traceId,
    runId,
    toolCapability: randomBytes(32).toString("base64url"),
  });
  if (task.plan.version !== expectedVersion) throw new Error("stale tracking job version");
  const response = await runAgentTrackingTask(task, opts);
  const committed = await applyTrackingProposal({ task, proposal: response.proposal });
  return { traceId, runId, planPublicId, ...committed, proposal: response.proposal };
}
