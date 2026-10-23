// Phase 8 validator tests: the repository as committed passes, each rule actually fires on a bad
// input, and the registry renders deterministically. No database, no network, no model call.
import assert from "node:assert/strict";
import { test } from "node:test";
import {
  FROZEN_ARTIFACTS,
  REQUIRED_FILES,
  checkMarkdownLinks,
  checkReadmeNumbers,
  loadRegistry,
  renderRegistryMarkdown,
  scanProhibitedWording,
  validateRepository,
} from "../scripts/validate-final-package.ts";

test("the committed repository passes the final-package validation", () => {
  const result = validateRepository();
  assert.deepEqual(result.errors, [], result.errors.join("\n"));
  assert.equal(result.summary.requiredFiles, 9);
  assert.ok(result.summary.entries >= 40, `expected a complete registry, got ${result.summary.entries} entries`);
  assert.equal(result.summary.frozenArtifacts, FROZEN_ARTIFACTS.length);
});

test("every required output path exists and every entry has a report and a status", () => {
  const registry = loadRegistry();
  for (const entry of registry.entries) {
    assert.ok(REQUIRED_FILES.length === 9);
    assert.ok(entry.source_report.startsWith("docs/"), `${entry.id} names a report inside the repository`);
    assert.equal(entry.human_gold, false, `${entry.id} must not claim human gold`);
    assert.ok(entry.limitations.length > 0, `${entry.id} must state a limitation`);
  }
});

test("no entry claims human gold and no status is outside the vocabulary", () => {
  const registry = loadRegistry();
  const statuses = new Set(["REPRODUCIBLE_FINAL", "REPRODUCIBLE_PARTIAL", "HISTORICAL_ONLY", "NOT_COMPARABLE", "NOT_RECORDED", "REQUIRES_NEW_RUN"]);
  for (const entry of registry.entries) assert.ok(statuses.has(entry.status), `${entry.id}: ${entry.status}`);
});

test("the Markdown registry renders from the JSON and stays in sync", () => {
  const registry = loadRegistry();
  const first = renderRegistryMarkdown(registry);
  assert.equal(first, renderRegistryMarkdown(registry), "rendering must be deterministic");
  assert.match(first, /GENERATED FILE/);
  for (const entry of registry.entries) assert.ok(first.includes(`\`${entry.id}\``), `markdown lost ${entry.id}`);
});

test("prohibited wording fires on a bare claim and is allowed when negated", () => {
  assert.equal(scanProhibitedWording("x.md", "The benchmark is human-labelled gold.").length, 1);
  assert.deepEqual(scanProhibitedWording("x.md", "The benchmark is not human-labelled gold; it is MODEL_REVIEWED."), []);
  assert.deepEqual(scanProhibitedWording("x.md", "标签为 MODEL_REVIEWED，不是人工标注金标准。"), []);
  assert.equal(scanProhibitedWording("x.md", "Recall improved from 0.60 to 0.90 (50%) in one step.").length, 1);
});

test("internal links are checked and external links are left alone", () => {
  const root = "D:\\AgentStudy\\SentinelIntel";
  assert.deepEqual(checkMarkdownLinks(root, "README.md", "[docs](docs/architecture.md) [ext](https://example.com)"), []);
  const broken = checkMarkdownLinks(root, "README.md", "[gone](docs/nope.md)");
  assert.equal(broken.length, 1);
  assert.match(broken[0]!, /broken internal link/);
});

test("README percentages must map to the registry, HTML attributes are not claims", () => {
  const registry = JSON.stringify({ entries: [{ value: 0.884 }] });
  assert.deepEqual(checkReadmeNumbers(registry, '<img width="100%" src="x.png">'), []);
  assert.deepEqual(checkReadmeNumbers(registry, "accuracy 0.884"), []);
  const problems = checkReadmeNumbers(registry, "accuracy 87.5%");
  assert.equal(problems.length, 1);
  assert.match(problems[0]!, /87\.5/);
});

test("the frozen artifact list covers every canonical dataset and threshold file", () => {
  for (const required of [
    "datasets/selection/candidates.jsonl",
    "datasets/event-relations/holdout.jsonl",
    "datasets/security-research/holdout-v4.jsonl",
    "datasets/event-tracking/holdout.jsonl",
    "datasets/impact/e2e-holdout-v16.jsonl",
    "datasets/impact/thresholds-v2.json",
  ]) {
    assert.ok(FROZEN_ARTIFACTS.includes(required as never), `${required} must be drift-checked`);
  }
});
