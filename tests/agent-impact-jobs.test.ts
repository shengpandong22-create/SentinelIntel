import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import { scheduleImpactCandidates } from "@aihot/backend/jobs/impact";

test("impact schedule is inert while its switch is off", async () => {
  let listed = false;
  const result = await scheduleImpactCandidates(50, {
    enabled: false,
    list: async () => { listed = true; return []; },
  });
  assert.deepEqual(result, { candidates: 0, enqueued: 0 });
  assert.equal(listed, false);
});

test("impact schedule uses story id plus version as the singleton identity", async () => {
  const candidates = [{ id: 11, version: 3 }, { id: 12, version: 1 }];
  const sent: Array<{ name: string; data: object; key: string | undefined }> = [];
  const result = await scheduleImpactCandidates(50, {
    enabled: true,
    list: async () => candidates,
    send: async (name, data, options) => {
      sent.push({ name, data, key: options?.singletonKey });
      return sent.length === 1 ? randomUUID() : null;
    },
  });
  assert.deepEqual(result, { candidates: 2, enqueued: 1 });
  assert.deepEqual(sent.map((item) => item.name), ["agent.product-impact", "agent.product-impact"]);
  assert.deepEqual(sent.map((item) => item.key), ["impact:11:3", "impact:12:1"]);
  assert.deepEqual(sent.map((item) => item.data), [{ storyId: 11 }, { storyId: 12 }]);
});
