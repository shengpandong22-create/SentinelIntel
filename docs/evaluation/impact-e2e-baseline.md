# Phase 6 end-to-end holdout baseline — FAILED (retained as evidence)

Date: 2026-10-10

Dataset: `datasets/impact/e2e-holdout.jsonl` (3 cases, SHA256
`35c40f9a87d7fe38b951d5a4d31965749e14b955c339ea77deea93f0983dddab`, MODEL_REVIEWED by
`glm-5.3-flash` / `deepseek-v4.1-flash` / `kimi-k3-2`, receipts 140-142, unanimous high-confidence)

This was the single authorized end-to-end run of the complete TypeScript → Python → TypeScript →
scratch-database pipeline against real public CVE evidence, scored against the pre-registered
`datasets/impact/thresholds-v2.json` (full contract safety set, development hashes recorded).
**Result: FAILED.** Per the contract, the failed holdout stays frozen exactly as consumed; remediation
happens on development only, followed by a new disjoint holdout.

## Results

| Case | Outcome | Persisted rows | known_exploited | Notes |
|---|---|---|---|---|
| IMP-E2E-HOLD-001 (FortiOS CVE-2018-13379) | PASS | 1 claim row, high | yes (real KEV) | Lived off the Fortinet advisory and KEV entry |
| IMP-E2E-HOLD-002 (MSDT CVE-2022-30190) | **FAIL** | 0 rows → unknown-only review | n/a | Model extraction produced no evidence-cited rows; the repeat did not skip because no current row existed |
| IMP-E2E-HOLD-003 (Exchange CVE-2020-0688) | PASS | 1 claim row, high | yes (real KEV) | Lived off the MSRC advisory and KEV entry |

Safety: `story_fact_mutations=0`, `cross_story_evidence=0`, `absence_unaffected=0`,
`gateway_bypass=0`, `stale_version_commits=0`, `poc_not_unknown=0`,
`receipt_or_trace_incomplete=0`; `duplicate_commits=1` is an artifact of the runner asserting a skip
on a case whose first run legitimately persisted no current row.

Quality: row_recall 0.50, decision_accuracy 1.00, exploit_accuracy 0.67, confidence_accuracy 0.67,
unknown_honesty 1.00 — below the pre-registered minimums (0.90/0.90/0.90/0.85/0.95).

## Root cause (honest reading)

For CVE-2022-30190 the acquired MSRC evidence does not contain a product/version impact statement the
model can cite (the MSRC page names no affected-version range), and the extraction correctly refused to
fabricate one. The failure is real pipeline behavior on real evidence: a Story whose official evidence
cannot support an impact row must route to human review (it did), but the pre-registered expectation
counted it as a propose case. Two contributing defects to fix on development only:

1. The runner's repeat-skip assertion is wrong for review-only outcomes.
2. Live acquisition of MSRC pages yields thin content; extraction then has nothing to ground rows on.
   The fix is better evidence acquisition/normalization for MSRC-class sources, or expected labels that
   model evidence-limited outcomes.

## What passed before this run

The three-case end-to-end development pilot (CVE-2024-20353, CVE-2020-1472, CVE-2023-20273 — all
KEV-listed, all with rich advisories) passed every safety observation and every quality metric on the
same pipeline. The holdout shows the pipeline does not yet generalize to advisories without
version-range content.

## Status

Phase 6 remains **NOT COMPLETE**. The synthetic fixture holdout (23 cases) and this failed end-to-end
holdout are both retained unmodified as evidence. Next: development-only remediation, a new disjoint
end-to-end holdout, then Linux CI.
