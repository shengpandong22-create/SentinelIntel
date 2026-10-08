import assert from "node:assert/strict";
import test from "node:test";
import { mergeDevelopmentReviews, mergeHoldoutReviews, reviewPrompt, type ReviewDecision } from "../scripts/event-grouping-development-annotation.ts";
import type { EventRelationCase } from "../scripts/event-grouping-eval-core.ts";

function fixture(): EventRelationCase {
  const base = (reportId: string, eventKey: string) => ({ reportId, title: reportId, summary: `${reportId} evidence`, sourceName: "source",
    firstParty: false, publishedAt: "2026-09-01T00:00:00Z", ingestedAt: "2026-09-02T00:00:00Z", frame: null,
    splitGroupId: "g1", identity: { eventKey, storyKey: "story-1" } });
  return { caseId: "c1", split: "development", samplingStratum: "disclosure-vs-patch", query: base("q", "event-q"), candidates: [{
    ...base("r", "event-r"), factTitle: "fact", members: 1, isDistractor: false, expectedInRecall: true,
    gold: { relation: "SAME_STORY" }, annotation: { status: "decisive", labelSource: "model-proposed", humanAdjudicated: false,
      labeller: "pending", confidence: "medium", adjudicator: null,
      reviewers: [],
      sourceUrls: ["https://example.test/q", "https://example.test/r"], note: "pending review" },
  }] };
}
const decision = (relation: ReviewDecision["relation"], confidence: ReviewDecision["confidence"] = "high"): ReviewDecision =>
  ({ caseId: "c1", reportId: "r", relation, confidence, insufficient: false, reason: "evidence" });

test("two agreeing model families produce a model-reviewed decisive label", () => {
  const [row] = mergeDevelopmentReviews([fixture()], [decision("SAME_STORY")], [decision("SAME_STORY", "medium")], { proposed: "deepseek", reviewed: "glm" });
  assert.equal(row!.candidates[0]!.annotation.status, "decisive");
  assert.equal(row!.candidates[0]!.annotation.labelSource, "model-reviewed");
  assert.equal(row!.candidates[0]!.annotation.confidence, "medium");
});

test("model disagreement and low-confidence occurrence/story boundaries require review", () => {
  const [disputed] = mergeDevelopmentReviews([fixture()], [decision("SAME_OCCURRENCE")], [decision("SAME_STORY")], { proposed: "deepseek", reviewed: "glm" });
  assert.equal(disputed!.candidates[0]!.annotation.status, "disputed");
  const [low] = mergeDevelopmentReviews([fixture()], [decision("SAME_STORY", "low")], [decision("SAME_STORY")], { proposed: "deepseek", reviewed: "glm" });
  assert.equal(low!.candidates[0]!.annotation.status, "disputed");
});

test("review input contains evidence but no identity gold hints", () => {
  const prompt = reviewPrompt([fixture()]);
  assert.match(prompt, /q evidence/);
  assert.doesNotMatch(prompt, /event-q|story-1|gold/);
});

test("rejects incomplete model batches", () => {
  assert.throws(() => mergeDevelopmentReviews([fixture()], [], [decision("SAME_STORY")], { proposed: "deepseek", reviewed: "glm" }), /coverage mismatch/);
});

test("three unanimous high-confidence model families produce MODEL_REVIEWED holdout labels", () => {
  const row = fixture();
  row.split = "holdout";
  const [reviewed] = mergeHoldoutReviews([row], [
    { model: "deepseek-v4.1-flash", decisions: [decision("SAME_STORY")] },
    { model: "glm-5.3-flash", decisions: [decision("SAME_STORY")] },
    { model: "kimi-k3-2", decisions: [decision("SAME_STORY")] },
  ]);
  assert.equal(reviewed!.candidates[0]!.annotation.status, "decisive");
  assert.deepEqual(reviewed!.candidates[0]!.annotation.reviewers, ["deepseek-v4.1-flash", "glm-5.3-flash", "kimi-k3-2"]);
  assert.equal(reviewed!.candidates[0]!.annotation.humanAdjudicated, false);
});

test("holdout disagreement or less than high confidence remains outside the frozen set", () => {
  const passes = [
    { model: "deepseek-v4.1-flash", decisions: [decision("SAME_STORY")] },
    { model: "glm-5.3-flash", decisions: [decision("SAME_OCCURRENCE")] },
    { model: "kimi-k3-2", decisions: [decision("SAME_STORY")] },
  ];
  assert.equal(mergeHoldoutReviews([fixture()], passes)[0]!.candidates[0]!.annotation.status, "disputed");
  passes[1]!.decisions = [decision("SAME_STORY", "medium")];
  assert.equal(mergeHoldoutReviews([fixture()], passes)[0]!.candidates[0]!.annotation.status, "disputed");
});
