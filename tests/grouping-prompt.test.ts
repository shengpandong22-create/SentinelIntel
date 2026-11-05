import assert from "node:assert/strict";
import test from "node:test";
import { BATCH_SYSTEM, BatchSchema } from "@aihot/backend/events/relate";

test("grouping prompt gives multi-topic containment precedence over shared-CVE relations", () => {
  assert.match(BATCH_SYSTEM, /第一步先检查 ROUNDUP/);
  assert.match(BATCH_SYSTEM, /优先于 SAME_OCCURRENCE 和 SAME_STORY/);
  assert.match(BATCH_SYSTEM, /即使两侧共享同一个 CVE/);
  assert.match(BATCH_SYSTEM, /另一侧只报道其中一个条目/);
});

test("grouping decisions require the explicit multi-topic containment check", () => {
  assert.match(BATCH_SYSTEM, /先填写 multi_topic_side 和 contained_item/);
  const parsed = BatchSchema.parse({ query: "q", decisions: [{
    id: "C1", multi_topic_side: "CANDIDATE", contained_item: true,
    relation: "ROUNDUP", confidence: 0.9, note: "candidate contains query",
  }] });
  assert.equal(parsed.decisions[0]!.multi_topic_side, "CANDIDATE");
  assert.equal(parsed.decisions[0]!.contained_item, true);

  const missingCheck = BatchSchema.parse({ query: "q", decisions: [{
    id: "C1", relation: "ROUNDUP", confidence: 0.9, note: "missing explicit check",
  }] });
  const inconsistent = BatchSchema.parse({ query: "q", decisions: [{
    id: "C1", multi_topic_side: "QUERY", contained_item: true,
    relation: "SAME_STORY", confidence: 0.9, note: "inconsistent",
  }] });
  assert.deepEqual(missingCheck.decisions, []);
  assert.deepEqual(inconsistent.decisions, []);
});
