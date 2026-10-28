import type { PgBoss } from "pg-boss";
import { config } from "../config.ts";
import { listResearchCandidates, runResearchForStory } from "../agents/research.ts";
import { ensureQueue, enqueue, QUEUES } from "./queue.ts";

export async function scheduleResearchCandidates(
  limit = 50,
  deps: {
    enabled?: boolean;
    networkEnabled?: boolean;
    list?: typeof listResearchCandidates;
    send?: typeof enqueue;
  } = {},
) {
  if (!(deps.enabled ?? config.agentResearchEnabled)
    || !(deps.networkEnabled ?? config.agentResearchNetworkEnabled)) return { candidates: 0, enqueued: 0 };
  const candidates = await (deps.list ?? listResearchCandidates)(limit);
  let enqueued = 0;
  for (const candidate of candidates) {
    const id = await (deps.send ?? enqueue)(
      QUEUES.agentResearch,
      { storyId: candidate.id },
      { singletonKey: `research:${candidate.id}:${candidate.version}` },
    );
    if (id) enqueued += 1;
  }
  return { candidates: candidates.length, enqueued };
}

export async function registerResearchJobs(boss: PgBoss) {
  await ensureQueue(QUEUES.agentResearch);
  await boss.work<{ storyId: number }>(
    QUEUES.agentResearch,
    { localConcurrency: 2, pollingIntervalSeconds: 5 },
    async ([job]) => {
      if (!job) return;
      return runResearchForStory(job.data.storyId);
    },
  );
}
