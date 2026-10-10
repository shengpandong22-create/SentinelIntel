import type { PgBoss } from "pg-boss";
import { config } from "../config.ts";
import { runTrackingPlan } from "../agents/tracking.ts";
import { listDueTrackingPlans } from "../agents/tracking-store.ts";
import { ensureQueue, enqueue, QUEUES } from "./queue.ts";

export async function scheduleDueTrackingPlans(
  now = new Date(),
  limit = 50,
  deps: {
    enabled?: boolean;
    listDue?: typeof listDueTrackingPlans;
    send?: typeof enqueue;
  } = {},
) {
  if (!(deps.enabled ?? config.agentTrackingEnabled)) return { due: 0, enqueued: 0 };
  const due = await (deps.listDue ?? listDueTrackingPlans)(now, limit);
  let enqueued = 0;
  for (const plan of due) {
    const id = await (deps.send ?? enqueue)(
      QUEUES.agentTracking,
      { planPublicId: plan.plan_id, expectedVersion: plan.version },
      { singletonKey: `${plan.plan_id}:${plan.version}` },
    );
    if (id) enqueued += 1;
  }
  return { due: due.length, enqueued };
}

export async function registerTrackingJobs(boss: PgBoss) {
  await ensureQueue(QUEUES.agentTracking);
  await boss.work<{ planPublicId: string; expectedVersion: number }>(
    QUEUES.agentTracking,
    { localConcurrency: 2, pollingIntervalSeconds: 5 },
    async ([job]) => {
      if (!job) return;
      return runTrackingPlan(job.data.planPublicId, job.data.expectedVersion);
    },
  );
}
