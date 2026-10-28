import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import { scheduleResearchCandidates } from "@aihot/backend/jobs/research";

test("research schedule is inert unless both execution and network gates are on", async () => {
  for (const gates of [[false, false], [true, false], [false, true]] as const) {
    let listed = false;
    const result = await scheduleResearchCandidates(50, {
      enabled: gates[0], networkEnabled: gates[1],
      list: async () => { listed = true; return []; },
    });
    assert.deepEqual(result, { candidates: 0, enqueued: 0 });
    assert.equal(listed, false);
  }
});

test("research schedule uses story id plus version as the singleton identity", async () => {
  const sent: Array<{ name: string; data: object; key: string | undefined }> = [];
  const result = await scheduleResearchCandidates(50, {
    enabled: true,
    networkEnabled: true,
    list: async () => [{ id: 21, version: 4 }, { id: 22, version: 2 }],
    send: async (name, data, options) => {
      sent.push({ name, data, key: options?.singletonKey });
      return sent.length === 1 ? randomUUID() : null;
    },
  });
  assert.deepEqual(result, { candidates: 2, enqueued: 1 });
  assert.deepEqual(sent.map((item) => item.name), ["agent.security-research", "agent.security-research"]);
  assert.deepEqual(sent.map((item) => item.key), ["research:21:4", "research:22:2"]);
  assert.deepEqual(sent.map((item) => item.data), [{ storyId: 21 }, { storyId: 22 }]);
});
