import assert from "node:assert/strict";
import test from "node:test";
import { codeBuddyArgs, parseCodeBuddyEnvelope, parseCodeBuddyOutput, parseCodeBuddyStream } from "@aihot/backend/providers/codebuddy";

test("parses CodeBuddy structured output and usage metadata", () => {
  const row = parseCodeBuddyEnvelope(JSON.stringify({
    subtype: "success", is_error: false, session_id: "session-1",
    structured_output: { decisions: [] }, usage: { input_tokens: 10, output_tokens: 2 }, total_cost_usd: 0,
  }));
  assert.deepEqual(row.structured_output, { decisions: [] });
  assert.equal(row.usage?.input_tokens, 10);
});

test("rejects failed or unstructured CodeBuddy results", () => {
  assert.throws(() => parseCodeBuddyEnvelope("not json"), /invalid JSON/);
  assert.throws(() => parseCodeBuddyEnvelope(JSON.stringify({ subtype: "error_during_execution", is_error: true, errors: ["quota"] })), /quota/);
  assert.throws(() => parseCodeBuddyEnvelope(JSON.stringify({ subtype: "success", result: "text only" })), /structured_output/);
});

test("builds a one-turn tool-free non-persistent CodeBuddy command", () => {
  const args = codeBuddyArgs({ model: "glm-5.3-flash", system: "judge", prompt: "pairs", jsonSchema: { type: "object" } });
  assert.deepEqual(args.slice(0, 6), ["--model", "glm-5.3-flash", "--agent", "minimal", "--tools", ""]);
  assert.ok(args.includes("--strict-mcp-config"));
  assert.ok(args.includes("--no-session-persistence"));
  assert.equal(args[args.indexOf("--max-turns") + 1], "1");
  assert.equal(args.includes("pairs"), false, "prompt is sent through stdin to avoid the Windows command-line limit");
  assert.equal(args[args.indexOf("--output-format") + 1], "stream-json");
  assert.equal(args[args.indexOf("--input-format") + 1], "text");
  assert.equal(args[args.indexOf("--json-schema") + 1], '{"type":"object"}');
});

test("can pass a bounded prompt as the final argument for CLI compatibility", () => {
  const args = codeBuddyArgs({ model: "m", system: "s", prompt: "bounded", jsonSchema: { type: "object" }, promptInArgument: true });
  assert.equal(args.at(-1), "bounded");
});

test("can use ordinary text output when the CLI native schema path is unavailable", () => {
  const args = codeBuddyArgs({ model: "m", system: "s", prompt: "bounded", jsonSchema: { type: "object" }, promptInArgument: true, useJsonSchema: false });
  assert.equal(args[args.indexOf("--output-format") + 1], "text");
  assert.equal(args.includes("--json-schema"), false);
  assert.equal(args.at(-1), "bounded");
});

test("parses the terminal result from CodeBuddy stream-json", () => {
  const envelope = parseCodeBuddyStream([
    JSON.stringify({ type: "system", subtype: "init" }),
    JSON.stringify({ type: "result", subtype: "success", is_error: false, session_id: "s1",
      result: JSON.stringify({ decisions: [] }), usage: { input_tokens: 10, output_tokens: 2 }, total_cost_usd: 0 }),
  ].join("\n"));
  assert.deepEqual(envelope.structured_output, { decisions: [] });
});

test("extracts fenced JSON from a successful CodeBuddy stream result", () => {
  const envelope = parseCodeBuddyStream(JSON.stringify({ type: "result", subtype: "success", is_error: false,
    result: "Here is the result:\n```json\n{\"decisions\":[]}\n```" }));
  assert.deepEqual(envelope.structured_output, { decisions: [] });
});

test("extracts structured data from ordinary CodeBuddy JSON output", () => {
  const envelope = parseCodeBuddyOutput(JSON.stringify({ subtype: "success", result: '```json\n{"ok":true}\n```' }));
  assert.deepEqual(envelope.structured_output, { ok: true });
});

test("extracts a JSON object from ordinary CodeBuddy text output", () => {
  const envelope = parseCodeBuddyOutput('{"ok":true}\n');
  assert.deepEqual(envelope.structured_output, { ok: true });
});
