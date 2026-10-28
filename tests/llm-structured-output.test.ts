import assert from "node:assert/strict";
import test from "node:test";
import { z } from "zod";
import { ModelOutputError, parseStructuredOutput } from "@aihot/backend/providers/llm";
import { config } from "@aihot/backend/config";
import { sweepUnprocessed } from "@aihot/backend/jobs/content";

const Score = z.object({ attentionScore: z.coerce.number().int().min(0).max(100) });

test("parses a fenced structured answer", () => {
  assert.deepEqual(parseStructuredOutput(Score, "```json\n{\"attentionScore\":42}\n```"), { attentionScore: 42 });
});

test("uses the first candidate that matches the requested schema", () => {
  const output = [
    '{"toolName":"mcp__example","mcpParameters":{"path":"x"}}',
    "The actual answer follows:",
    '{"attentionScore":73}',
  ].join("\n");
  assert.deepEqual(parseStructuredOutput(Score, output), { attentionScore: 73 });
});

test("the safety sweep stays idle while model calls are disabled", async () => {
  const before = config.modelCallsEnabled;
  config.modelCallsEnabled = false;
  try {
    assert.deepEqual(await sweepUnprocessed(), { enqueued: 0 });
  } finally {
    config.modelCallsEnabled = before;
  }
});

for (const [name, output, kind] of [
  ["empty output", "  ", "empty"],
  ["plain prose", "sorry, not json", "no_json"],
  ["truncated JSON", '{"attentionScore":', "no_json"],
  ["a tool call without an answer", '{"toolName":"mcp__example","mcpParameters":{}}', "schema"],
  ["a non-finite score", '{"attentionScore":"NaN"}', "schema"],
] as const) {
  test(`rejects ${name} fail-closed`, () => {
    assert.throws(
      () => parseStructuredOutput(Score, output),
      (error: unknown) => error instanceof ModelOutputError && error.kind === kind,
    );
  });
}
