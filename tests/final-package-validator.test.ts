// Phase 8 validator tests: the repository as committed passes, each rule actually fires on a bad
// input, and the registry renders deterministically. No database, no network, no model call.
import assert from "node:assert/strict";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import {
  REQUIRED_FILES,
  checkDatasetHashes,
  checkFrozenArtifacts,
  checkMarkdownLinks,
  checkReadmeNumbers,
  frozenArtifacts,
  loadRegistry,
  renderRegistryMarkdown,
  scanProhibitedWording,
  sha256OfBaseBlob,
  validateRepository,
} from "../scripts/validate-final-package.ts";

// Derived from this file, so the same tests run on Windows and on the Linux CI runner.
const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

test("the committed repository passes the final-package validation", () => {
  const result = validateRepository();
  assert.deepEqual(result.errors, [], result.errors.join("\n"));
  assert.equal(result.summary.requiredFiles, 9);
  assert.ok(result.summary.entries >= 40, `expected a complete registry, got ${result.summary.entries} entries`);
  assert.ok(result.summary.frozenArtifacts >= 80, `the frozen set must cover the whole dataset corpus, got ${result.summary.frozenArtifacts}`);
  // Two separate facts: registry references verified, and distinct files they cover.
  assert.ok(result.summary.datasetReferencesChecked >= 40, `expected every cited dataset reference to be verified, got ${result.summary.datasetReferencesChecked}`);
  assert.equal(result.summary.uniqueDatasetsHashed, 7, "the registry cites seven distinct committed datasets");
  assert.ok(
    result.summary.datasetReferencesChecked > result.summary.uniqueDatasetsHashed,
    "references and unique files must not be conflated",
  );
});

test("every required output path exists and every entry has a report and a status", () => {
  const registry = loadRegistry();
  assert.equal(REQUIRED_FILES.length, 9);
  for (const entry of registry.entries) {
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

test("the recomputed dataset hash matches the manifest-recorded hash", () => {
  // The committed blob of the Phase 4 holdout hashes to the value its manifest and report record.
  assert.equal(
    sha256OfBaseBlob(REPO_ROOT, "datasets/security-research/holdout-v4.jsonl"),
    "ffb0ebafbb3185ec88c661c53c2275c4889476d6ee56a1f4fa3ebbe9d66a8df2",
  );
  assert.equal(
    sha256OfBaseBlob(REPO_ROOT, "datasets/impact/e2e-holdout-v16.jsonl"),
    "a679b11e04a9135a5f69b5eede5a592f96f9efe30f63fddca947db232234a4c5",
  );
});

test("a wrong dataset hash fails validation (tamper detection)", () => {
  const tampered = structuredClone(loadRegistry());
  const entry = tampered.entries.find((item) => item.id === "SEL-HOLDOUT-ACCURACY")!;
  entry.dataset_sha256 = "0".repeat(64);
  const result = checkDatasetHashes(tampered);
  assert.equal(result.errors.length, 1);
  assert.match(result.errors[0]!, /SEL-HOLDOUT-ACCURACY: dataset_sha256 mismatch/);

  // A missing hash is also an error: a cited dataset must always be pinned.
  const unpinned = structuredClone(loadRegistry());
  unpinned.entries.find((item) => item.id === "GRP-STAGE-A-RECALL")!.dataset_sha256 = null;
  assert.match(checkDatasetHashes(unpinned).errors[0]!, /without a dataset_sha256/);

  // Untouched registry: no hash errors.
  assert.deepEqual(checkDatasetHashes(loadRegistry()).errors, []);
});

test("datasets outside Git are warned about, never silently accepted as verified", () => {
  const result = checkDatasetHashes(loadRegistry());
  assert.ok(result.warnings.some((warning) => warning.includes("IMP-DEV-DEMO-1") && warning.includes("cannot be verified offline")));
});

test("any frozen dataset drift fails, and the frozen set covers every consumed holdout", () => {
  // A Phase 8 document was legitimately edited; using it as a "frozen" artifact proves the detector fires.
  const drifted = checkFrozenArtifacts(REPO_ROOT, ["docs/evaluation/selection.md"]);
  assert.equal(drifted.errors.length, 1);
  assert.match(drifted.errors[0]!, /frozen artifact changed since 6cdac54/);

  // A genuinely frozen dataset is clean.
  assert.deepEqual(checkFrozenArtifacts(REPO_ROOT, ["datasets/selection/candidates.jsonl"]).errors, []);

  // The derived set must contain every consumed corpus, not just the current gate files.
  const artifacts = new Set(frozenArtifacts());
  for (const required of [
    "datasets/security-research/holdout.jsonl",
    "datasets/security-research/holdout-v2.jsonl",
    "datasets/security-research/holdout-v3.jsonl",
    "datasets/security-research/holdout-v4.jsonl",
    "datasets/impact/e2e-holdout-v2.jsonl",
    "datasets/impact/e2e-holdout-v7.jsonl",
    "datasets/impact/e2e-holdout-v9.jsonl",
    "datasets/impact/e2e-holdout-v15.jsonl",
    "datasets/impact/e2e-holdout-v16.jsonl",
    "datasets/impact/e2e-holdout-v16-manifest.json",
    "datasets/impact/e2e-holdout-v16-evidence.jsonl",
    "datasets/impact/e2e-holdout-v13-evidence-manifest.json",
    "datasets/impact/thresholds-v2.json",
    "datasets/event-tracking/holdout-manifest.json",
    "datasets/security-research/thresholds-v2.json",
  ]) {
    assert.ok(artifacts.has(required), `${required} must be drift-checked`);
  }
  // A deleted frozen file is an error, not a silent pass.
  const deleted = checkFrozenArtifacts(REPO_ROOT, ["datasets/does-not-exist.jsonl"]);
  assert.match(deleted.errors[0]!, /frozen artifact deleted/);
});

test("prohibited wording fires on a bare claim and is allowed when negated", () => {
  assert.equal(scanProhibitedWording("x.md", "The benchmark is human-labelled gold.").length, 1);
  assert.deepEqual(scanProhibitedWording("x.md", "The benchmark is not human-labelled gold; it is MODEL_REVIEWED."), []);
  assert.deepEqual(scanProhibitedWording("x.md", "标签为 MODEL_REVIEWED，不是人工标注金标准。"), []);
  assert.equal(scanProhibitedWording("x.md", "Recall improved from 0.60 to 0.90 (50%) in one step.").length, 1);
});

test("internal links are checked and external links are left alone", () => {
  assert.deepEqual(checkMarkdownLinks(REPO_ROOT, "README.md", "[docs](docs/architecture.md) [ext](https://example.com)"), []);
  const broken = checkMarkdownLinks(REPO_ROOT, "README.md", "[gone](docs/nope.md)");
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
