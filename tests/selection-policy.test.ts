import assert from "node:assert/strict";
import test from "node:test";
import { normalizeAnalysis, scoresPassSelection } from "@aihot/backend/editorial/analyze";

test("selection requires both independent scores to meet the tier threshold", () => {
  assert.equal(scoresPassSelection([32, 32], 32), true, "the exact threshold passes");
  assert.equal(scoresPassSelection([78, 72], 32), true);
  assert.equal(scoresPassSelection([0, 64], 32), false, "a high score cannot compensate for a failed vote");
  assert.equal(scoresPassSelection([31, 33], 32), false, "a split vote stays ordinary");
});

test("selection fails closed without exactly two usable scores and a threshold", () => {
  assert.equal(scoresPassSelection(null, 32), false);
  assert.equal(scoresPassSelection([], 32), false);
  assert.equal(scoresPassSelection([80], 32), false);
  assert.equal(scoresPassSelection([80, 80, 80], 32), false);
  assert.equal(scoresPassSelection([80, 80], null), false);
});

test("the committed analysis keeps the mean score but does not select a split vote", () => {
  const run = (values: number[]) => normalizeAnalysis({
    prefilter: { label: "PASS", reason: "test" },
    scores: { model: "test", threshold: 32, values, receiptIds: [], reused: false },
    writing: { titleZh: "测试标题", summaryZh: "测试摘要", reasonZh: "test", tags: [] },
    structure: null,
  } as never);

  assert.deepEqual([run([0, 64]).score, run([0, 64]).selected], [32, false]);
  assert.deepEqual([run([32, 32]).score, run([32, 32]).selected], [32, true]);
});
