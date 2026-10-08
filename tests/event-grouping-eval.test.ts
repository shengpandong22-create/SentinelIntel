import assert from "node:assert/strict";
import test from "node:test";
import {
  FROZEN_ALLOCATION, parseEventRelationJsonl, partitionDevelopmentCases, rebaseFixtureTimes, recallMetrics, relationMetricViews, storyPairKey, storyPairMetrics,
  validateEventRelationDataset,
  type EventRelationCase,
} from "../scripts/event-grouping-eval-core.ts";

function report(id: string, eventKey: string, storyKey: string, ingestedAt: string) {
  return {
    reportId: id, title: `title ${id}`, summary: `summary ${id}`, sourceName: "source", firstParty: false,
    publishedAt: new Date(Date.parse(ingestedAt) - 3_600_000).toISOString(), ingestedAt, frame: null,
    splitGroupId: `sg-${storyKey}`, identity: { eventKey, storyKey },
  };
}
function fixture(overrides: Partial<EventRelationCase> = {}): EventRelationCase {
  const query = report("query", "event-2", "story-1", "2026-10-02T00:00:00Z");
  const candidate = {
    ...report("candidate", "event-1", "story-1", "2026-10-01T00:00:00Z"), factTitle: "fact", members: 1,
    isDistractor: false, expectedInRecall: true, gold: { relation: "SAME_STORY" as const },
    annotation: { status: "decisive" as const, labelSource: "model-reviewed" as const, humanAdjudicated: false,
      labeller: "reviewer", confidence: "high" as const, adjudicator: null,
      reviewers: [],
      sourceUrls: ["https://example.test/query", "https://example.test/candidate"], note: "direct development" },
  };
  return { caseId: "case-1", split: "development", samplingStratum: "disclosure-vs-patch", query, candidates: [candidate], ...overrides };
}

test("parses the candidate-level Phase 2 schema and validates relation identity", () => {
  const row = fixture();
  const parsed = parseEventRelationJsonl(JSON.stringify(row));
  assert.equal(parsed[0]?.candidates[0]?.annotation.labelSource, "model-reviewed");
  assert.doesNotThrow(() => validateEventRelationDataset(parsed));
});

test("the frozen allocation remains 240 cases split 180 and 60", () => {
  const allocation = Object.values(FROZEN_ALLOCATION);
  assert.equal(allocation.length, 16);
  assert.equal(allocation.reduce((sum, row) => sum + row.development, 0), 180);
  assert.equal(allocation.reduce((sum, row) => sum + row.holdout, 0), 60);
});

test("rejects non-decisive labels and inconsistent SAME_STORY identity", () => {
  const row = fixture();
  row.candidates[0]!.annotation.status = "disputed";
  row.candidates[0]!.identity.eventKey = row.query.identity.eventKey;
  assert.throws(() => validateEventRelationDataset([row]), /decisive-only[\s\S]*SAME_STORY identity mismatch/);
});

test("accepts either human adjudication or three-model high-confidence review for holdout", () => {
  const row = fixture({ split: "holdout" });
  assert.throws(() => validateEventRelationDataset([row]), /three independent high-confidence model reviewers/);
  row.candidates[0]!.annotation.reviewers = ["deepseek-v4.1-flash", "glm-5.3-flash", "kimi-k3-2"];
  assert.doesNotThrow(() => validateEventRelationDataset([row]));
  row.candidates[0]!.annotation.confidence = "medium";
  assert.throws(() => validateEventRelationDataset([row]), /three independent high-confidence model reviewers/);
  row.candidates[0]!.annotation.reviewers = [];
  row.candidates[0]!.annotation.confidence = "high";
  row.candidates[0]!.annotation.labelSource = "human";
  row.candidates[0]!.annotation.humanAdjudicated = true;
  row.candidates[0]!.annotation.adjudicator = "human-1";
  assert.doesNotThrow(() => validateEventRelationDataset([row]));
});

test("detects report and split-group leakage across splits", () => {
  const development = fixture();
  const holdout = structuredClone(development);
  holdout.caseId = "case-2";
  holdout.split = "holdout";
  holdout.candidates[0]!.annotation.humanAdjudicated = true;
  holdout.candidates[0]!.annotation.adjudicator = "human-1";
  holdout.candidates[0]!.annotation.labelSource = "human";
  assert.throws(() => validateEventRelationDataset([development, holdout]), /crosses splits/);
});

test("computes primary relation metrics with distractors separated", () => {
  const metrics = relationMetricViews([
    { gold: "SAME_STORY", predicted: "SAME_STORY", isDistractor: false },
    { gold: "UNRELATED", predicted: "SAME_STORY", isDistractor: true },
  ]);
  assert.equal(metrics.relatedOnly.accuracy, 1);
  assert.equal(metrics.withDistractors.accuracy, 0.5);
  assert.equal(metrics.withDistractors.confusionMatrix.UNRELATED.SAME_STORY, 1);
});

test("computes recall@K and missed candidates by stratum and branch", () => {
  const metrics = recallMetrics([
    { caseId: "a", stratum: "patch", branch: "lexical", expected: ["r1", "r2"], recalled: ["r1"] },
    { caseId: "b", stratum: "patch", branch: "lexical", expected: ["r3"], recalled: ["r3"] },
  ]);
  assert.equal(metrics.recallAtK, 0.667);
  assert.equal(metrics.missedCandidateRate, 0.333);
  assert.deepEqual(metrics.missed, ["a:r2"]);
  assert.equal(metrics.branches.lexical, 2);
});

test("rebases published and discovered timestamps by one delta and disables backfill", () => {
  const row = fixture();
  const before = Date.parse(row.query.ingestedAt) - Date.parse(row.query.publishedAt!);
  const result = rebaseFixtureTimes([row], new Date("2030-01-01T00:00:00Z"));
  const rebased = result.reports.get(row.query.reportId)!;
  assert.equal(rebased.discoveredAt.getTime() - rebased.publishedAt!.getTime(), before);
  assert.equal(rebased.backfill, false);
  assert.equal(rebased.discoveredAt.toISOString(), "2029-12-31T23:59:59.000Z");
});

test("computes Stage C pairwise merge metrics and excludes unconstrained roundup reports", () => {
  const metrics = storyPairMetrics([
    { reportId: "a", goldStoryKey: "s1", predictedStoryId: "p1", constrained: true },
    { reportId: "b", goldStoryKey: "s1", predictedStoryId: "p2", constrained: true },
    { reportId: "c", goldStoryKey: "s2", predictedStoryId: "p1", constrained: true },
    { reportId: "roundup", goldStoryKey: "s1", predictedStoryId: "p1", constrained: false },
  ]);
  assert.deepEqual({ tp: metrics.tp, fp: metrics.fp, fn: metrics.fn }, { tp: 0, fp: 1, fn: 1 });
  assert.deepEqual(metrics.falseMerges, [{ left: "a", right: "c" }]);
  assert.deepEqual(metrics.falseSplits, [{ left: "a", right: "b" }]);
});

test("routes a whole mixed-status construction case to review instead of freezing part of its batch", () => {
  const decisive = fixture();
  const disputed = structuredClone(decisive);
  disputed.caseId = "case-disputed";
  disputed.candidates[0]!.annotation.status = "disputed";
  const partition = partitionDevelopmentCases([decisive, disputed]);
  assert.deepEqual(partition.decisive.map((row) => row.caseId), ["case-1"]);
  assert.deepEqual(partition.review.map((row) => row.caseId), ["case-disputed"]);
});

test("Stage C excludes only the annotated ROUNDUP pair, not every pair involving that report", () => {
  const assignments = [
    { reportId: "roundup", goldStoryKey: "s0", predictedStoryId: "p0", constrained: true },
    { reportId: "mentioned", goldStoryKey: "s1", predictedStoryId: "p0", constrained: true },
    { reportId: "other", goldStoryKey: "s2", predictedStoryId: "p0", constrained: true },
  ];
  const metrics = storyPairMetrics(assignments, new Set([storyPairKey("roundup", "mentioned")]));
  assert.equal(metrics.fp, 2);
  assert.ok(!metrics.falseMerges.some((pair) => new Set([pair.left, pair.right]).size === 2 && pair.left === "roundup" && pair.right === "mentioned"));
});
