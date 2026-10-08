import { stub } from "./setup.ts";
import assert from "node:assert/strict";
import { after, test } from "node:test";
import { closeDb } from "@aihot/backend/db";
import { endToEndDatasetFixture, endToEndFixture, recallFixture, sameUrlDiagnostic } from "../scripts/event-grouping-eval-fixture.ts";
import type { EventRelationCase } from "../scripts/event-grouping-eval-core.ts";
import { receiptUsage } from "../scripts/event-grouping-eval-receipts.ts";

const provider = await stub((_hit, req) => {
  const body = JSON.parse(req.body) as { messages: Array<{ content: string }> };
  const user = body.messages[1]!.content;
  const ids = [...user.matchAll(/【候选 (C\d+)】/g)].map((match) => match[1]!);
  return { id: "stub", choices: [{ message: { content: JSON.stringify({ query: "patch",
    decisions: ids.map((id) => ({ id, relation: "SAME_STORY", confidence: 0.95, note: "development" })) }) } }],
    usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 } };
});
process.env.DEEPSEEK_BASE_URL = `${provider.url}/v1`;
process.env.DEEPSEEK_API_KEY = "test-key";

after(async () => { await provider.close(); await closeDb(); });

const row: EventRelationCase = {
  caseId: "fixture-recall", split: "development", samplingStratum: "disclosure-vs-patch",
  query: { reportId: "query", title: "CVE-2026-1000 vendor patch released", summary: "Vendor fixed CVE-2026-1000",
    sourceName: "Vendor", firstParty: true, publishedAt: "2026-10-02T00:00:00Z", ingestedAt: "2026-10-02T01:00:00Z",
    frame: null, splitGroupId: "sg-1", identity: { eventKey: "patch", storyKey: "cve-1000" } },
  candidates: [{ reportId: "candidate", title: "CVE-2026-1000 vendor patch released", summary: "Vendor fixed CVE-2026-1000",
    sourceName: "News", firstParty: false, publishedAt: "2026-10-01T00:00:00Z", ingestedAt: "2026-10-01T01:00:00Z",
    frame: null, splitGroupId: "sg-1", identity: { eventKey: "disclosure", storyKey: "cve-1000" },
    factTitle: "CVE-2026-1000", members: 1, isDistractor: false, expectedInRecall: true,
    gold: { relation: "SAME_STORY" }, annotation: { status: "decisive", labelSource: "model-reviewed",
      humanAdjudicated: false, labeller: "test", confidence: "high", adjudicator: null, reviewers: [],
      sourceUrls: ["https://example.test/q", "https://example.test/c"], note: "test" } }],
};

test("Stage A fixture drives production lexical recall without a model call", async () => {
  const result = await recallFixture(row, new Date("2030-01-01T00:00:00Z"));
  assert.equal(result.branch, "lexical");
  assert.deepEqual(result.expected, ["candidate"]);
  assert.deepEqual(result.recalled, ["candidate"]);
});

test("same-URL diagnostic proves normal ingestion folds normalized URLs", async () => {
  assert.deepEqual(await sameUrlDiagnostic(), { identityFolded: true, articleFolded: true });
});

test("Stage C replays the production grouping path in a scratch fixture", async () => {
  const result = await endToEndFixture(row, new Date("2030-01-01T00:00:00Z"));
  assert.equal(result.result.verdict, "new-fact-in-story");
  assert.equal(result.assignments[0]!.predictedStoryId, result.assignments[1]!.predictedStoryId);
  assert.equal(result.receiptIds.length, 1);
  const usage = await receiptUsage(result.receiptIds);
  assert.equal(usage.receipts, 1);
  assert.equal(usage.attempts, 1);
  assert.equal(usage.tokensIn, 10);
  assert.equal(usage.tokensOut, 5);
});

test("Stage C globally ingests each unique report in discovery order", async () => {
  const result = await endToEndDatasetFixture([row], new Date("2030-01-01T00:00:00Z"));
  assert.deepEqual(result.verdicts.map((item) => item.verdict), ["new-story", "new-fact-in-story"]);
  assert.equal(result.assignments[0]!.predictedStoryId, result.assignments[1]!.predictedStoryId);
  assert.equal(result.receiptIds.length, 1, "the first report has no candidates and makes no model call");
});
