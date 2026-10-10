# Phase 6 end-to-end holdout baselines — retained evidence

Date: 2026-10-10

Two end-to-end holdouts have been consumed. Both stay frozen exactly as consumed; remediation happens
on development only, followed by new disjoint holdouts.

## Baseline 1 — FAILED (evidence-limited advisory)

Dataset: `datasets/impact/e2e-holdout.jsonl` (3 cases, SHA256
`35c40f9a87d7fe38b951d5a4d31965749e14b955c339ea77deea93f0983dddab`, MODEL_REVIEWED, receipts 140-142).

Result: CVE-2018-13379 and CVE-2020-0688 passed; CVE-2022-30190 produced zero grounded rows (thin MSRC
evidence; extraction correctly refused to fabricate) and the runner's repeat-skip assertion
mishandled review-only outcomes. Root causes fixed on development: the repeat-skip assertion, and
expectation modeling for evidence-limited advisories.

## Baseline 2 — FAILED (expectation-keyword modeling defect)

Dataset: `datasets/impact/e2e-holdout-v3.jsonl` (2 cases after exclusion, SHA256
`ec5940c67569645febbd3672583362991cef928e9f20a6c18f247ddf91823cfd`, MODEL_REVIEWED unanimous
high-confidence, receipts 148-153 + admin-audited retry of 153). Excluded: IMP-E2E3-HOLD-003
(CVE-2024-20481) — Kimi withheld high confidence; the candidate's 2025/2026 CVE round was also fully
rejected by all three reviewers as outside their knowledge, so it was re-anchored on model-verifiable
KEV CVEs before this run.

Result: every safety counter is zero (Story immutability, idempotent repeat, receipts, routing
consistency, PoC unknown-only). HOLD-002 (CVE-2024-47575) passed completely: two high-confidence claim
rows (FortiManager, FortiManager Cloud), known_exploited=yes from the real KEV catalog.
HOLD-001 (CVE-2021-1675) produced a correct, well-routed row ("Windows", high, KEV yes) but
`row_recall` scored 0 because the frozen expected keywords (`["print spooler","print"]`) used AND
semantics and omitted "windows" — the exact word the NVD description leads with and the model
normalized to. The expectation-keyword modeling defect is on the benchmark side, not the pipeline.

## Remediation carried to the next round (development-only)

1. `row_contains` semantics: a case's keywords describe alternative surface forms of the same product
   (OR), anchored on words present in the official NVD description.
2. Exclusion of model-knowledge-limited CVEs from holdout candidacy (new 2025/2026 CVEs were
   correctly withheld by all three reviewers and cannot reach high confidence).
3. Then a new disjoint holdout, its single authorized run, and canonical Linux CI.

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
