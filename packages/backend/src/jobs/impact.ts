import type { PgBoss } from "pg-boss";
import { config } from "../config.ts";
import { listImpactCandidates, runImpactForStory } from "../agents/impact.ts";
import { ensureQueue, enqueue, QUEUES } from "./queue.ts";

export async function scheduleImpactCandidates(
  limit = 50,
  deps: {
    enabled?: boolean;
    list?: typeof listImpactCandidates;
    send?: typeof enqueue;
  } = {},
) {
  if (!(deps.enabled ?? config.productImpactEnabled)) return { candidates: 0, enqueued: 0 };
  const candidates = await (deps.list ?? listImpactCandidates)(limit);
  let enqueued = 0;
  for (const candidate of candidates) {
    // Story id plus version: one attempt per Story revision, whatever triggered it.
    const id = await (deps.send ?? enqueue)(
      QUEUES.agentImpact,
      { storyId: candidate.id },
      { singletonKey: `impact:${candidate.id}:${candidate.version}` },
    );
    if (id) enqueued += 1;
  }
  return { candidates: candidates.length, enqueued };
}

export async function registerImpactJobs(boss: PgBoss) {
  await ensureQueue(QUEUES.agentImpact);
  await boss.work<{ storyId: number }>(
    QUEUES.agentImpact,
    { localConcurrency: 2, pollingIntervalSeconds: 5 },
    async ([job]) => {
      if (!job) return;
      return runImpactForStory(job.data.storyId);
    },
  );
}
