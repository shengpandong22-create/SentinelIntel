# Evidence registry — every final number and its provenance

<!-- GENERATED FILE. Edit docs/evaluation/evidence-registry.json and run `node scripts/validate-final-package.ts --write`. -->

Base: `6cdac54` — feat: complete Phase 7 UI / Admin / MCP extension (#9). Audited 2026-10-23.

Phase 1-7 final evaluation evidence at main@6cdac54. This file is the single machine-readable source; docs/evaluation/evidence-registry.md is generated from it and validated for consistency.

## Status vocabulary

| Status | Meaning |
|---|---|
| `REPRODUCIBLE_FINAL` | 可离线复现（最终） — Committed dataset + committed scorer/thresholds + committed final report; regenerating the numbers needs no paid model call and no external network (deterministic replay, or offline scoring of a frozen result set). |
| `REPRODUCIBLE_PARTIAL` | 可复现（部分：需付费重跑） — Frozen inputs, scorer and recorded result exist, but regenerating the exact numbers needs new paid model calls and/or a live runtime; only the scoring half is offline-reproducible. |
| `HISTORICAL_ONLY` | 仅历史证据 — Retained consumed or superseded result; produced under a semantics/scorer that no longer reproduces it, or on a consumed holdout that must not be rerun. |
| `NOT_COMPARABLE` | 不可比较 — A value exists but was produced with a different dataset, split, label set, scorer or metric definition, so it may not be compared with another phase's number. |
| `NOT_RECORDED` | 未记录 — No trustworthy committed evidence exists for this metric. It is not estimated, inferred or filled in. |
| `REQUIRES_NEW_RUN` | 需新运行 — Obtainable only through a separately pre-registered and owner-authorized run (see the Gate 3 proposal). |

## Entries (47)

| ID | Capability | Metric | Value | n / d | Dataset (split) | Label | Status |
|---|---|---|---|---|---|---|---|
| `SEL-HOLDOUT-ACCURACY` | selection | accuracy | 0.884 | 38 / 43 | `datasets/selection/candidates.jsonl` (holdout) | MODEL_SINGLE_FAMILY | REPRODUCIBLE_PARTIAL |
| `SEL-HOLDOUT-PRECISION` | selection | precision | 1 | 21 / 21 | `datasets/selection/candidates.jsonl` (holdout) | MODEL_SINGLE_FAMILY | REPRODUCIBLE_PARTIAL |
| `SEL-HOLDOUT-RECALL` | selection | recall | 0.808 | 21 / 26 | `datasets/selection/candidates.jsonl` (holdout) | MODEL_SINGLE_FAMILY | REPRODUCIBLE_PARTIAL |
| `SEL-HOLDOUT-F1` | selection | F1 score | 0.894 | 见脚注 | `datasets/selection/candidates.jsonl` (holdout) | MODEL_SINGLE_FAMILY | REPRODUCIBLE_PARTIAL |
| `SEL-TOKENS` | selection | token usage | — | — | `datasets/selection/candidates.jsonl` (holdout) | MODEL_SINGLE_FAMILY | NOT_RECORDED |
| `SEL-LATENCY` | selection | latency | — | — | `datasets/selection/candidates.jsonl` (holdout) | MODEL_SINGLE_FAMILY | NOT_RECORDED |
| `SEL-TIER-CALIBRATION` | selection | accuracy on the targeted tier-calibration supplement | 0.917 | 22 / 24 | `datasets/selection/tier-calibration.jsonl` (calibration) | MODEL_SINGLE_FAMILY | NOT_COMPARABLE |
| `GRP-STAGE-A-RECALL` | event-grouping | candidate recall@10 (Stage A) | 1 | 60 / 60 | `datasets/event-relations/holdout.jsonl` (holdout) | MODEL_REVIEWED | REPRODUCIBLE_FINAL |
| `GRP-STAGE-B-ACCURACY` | event-grouping | relation classification accuracy (Stage B) | 0.75 | 45 / 60 | `datasets/event-relations/holdout.jsonl` (holdout) | MODEL_REVIEWED | REPRODUCIBLE_PARTIAL |
| `GRP-STAGE-B-MACRO-F1` | event-grouping | macro F1 (Stage B, 4 classes) | 0.629 | 见脚注 | `datasets/event-relations/holdout.jsonl` (holdout) | MODEL_REVIEWED | REPRODUCIBLE_PARTIAL |
| `GRP-SAME-OCCURRENCE` | event-grouping | SAME_OCCURRENCE precision / recall / F1 | 0.625 / 0.833 / 0.714 | 15 / 18 | `datasets/event-relations/holdout.jsonl` (holdout) | MODEL_REVIEWED | REPRODUCIBLE_PARTIAL |
| `GRP-SAME-STORY` | event-grouping | SAME_STORY precision / recall / F1 | 0.750 / 0.857 / 0.800 | 18 / 21 | `datasets/event-relations/holdout.jsonl` (holdout) | MODEL_REVIEWED | REPRODUCIBLE_PARTIAL |
| `GRP-STORY-PRECISION` | event-grouping | story replay precision (Stage C) | 1 | 见脚注 | `datasets/event-relations/holdout.jsonl` (holdout) | MODEL_REVIEWED | REPRODUCIBLE_PARTIAL |
| `GRP-STORY-RECALL` | event-grouping | story replay recall (Stage C) | 0.095 | 见脚注 | `datasets/event-relations/holdout.jsonl` (holdout) | MODEL_REVIEWED | REPRODUCIBLE_PARTIAL |
| `GRP-STORY-FALSE-MERGES` | event-grouping | story replay false merges | 0 | 0 / 60 | `datasets/event-relations/holdout.jsonl` (holdout) | MODEL_REVIEWED | REPRODUCIBLE_PARTIAL |
| `RSR-CLAIM-RECALL` | research-agent | expected-claim recall | 1 | 见脚注 | `datasets/security-research/holdout-v4.jsonl` (holdout) | MODEL_REVIEWED | REPRODUCIBLE_PARTIAL |
| `RSR-EVIDENCE-RECALL` | research-agent | authoritative-evidence recall | 1 | 见脚注 | `datasets/security-research/holdout-v4.jsonl` (holdout) | MODEL_REVIEWED | REPRODUCIBLE_PARTIAL |
| `RSR-CLAIM-PRECISION` | research-agent | supported-claim precision | 1 | 见脚注 | `datasets/security-research/holdout-v4.jsonl` (holdout) | MODEL_REVIEWED | REPRODUCIBLE_PARTIAL |
| `RSR-UNSUPPORTED-CLAIMS` | research-agent | unsupported critical claims | 0 | 0 / 20 | `datasets/security-research/holdout-v4.jsonl` (holdout) | MODEL_REVIEWED | REPRODUCIBLE_PARTIAL |
| `RSR-UNKNOWN-PRESERVATION` | research-agent | expected-unknown preservation | 1 | 见脚注 | `datasets/security-research/holdout-v4.jsonl` (holdout) | MODEL_REVIEWED | REPRODUCIBLE_PARTIAL |
| `TRK-CHANGE-RECALL` | tracking-agent | material-change recall | 1 | 见脚注 | `datasets/event-tracking/holdout.jsonl` (holdout) | MODEL_REVIEWED | REPRODUCIBLE_FINAL |
| `TRK-CHANGE-PRECISION` | tracking-agent | supported-change precision | 1 | 见脚注 | `datasets/event-tracking/holdout.jsonl` (holdout) | MODEL_REVIEWED | REPRODUCIBLE_FINAL |
| `TRK-QUESTION-STATE` | tracking-agent | question-state accuracy | 1 | 见脚注 | `datasets/event-tracking/holdout.jsonl` (holdout) | MODEL_REVIEWED | REPRODUCIBLE_FINAL |
| `TRK-MISSED-UPDATES` | tracking-agent | missed material updates | 0 | 0 / 26 | `datasets/event-tracking/holdout.jsonl` (holdout) | MODEL_REVIEWED | REPRODUCIBLE_FINAL |
| `TRK-UNNECESSARY-RESEARCH` | tracking-agent | unnecessary research rate | — | — | `datasets/event-tracking/holdout.jsonl` (holdout) | MODEL_REVIEWED | NOT_RECORDED |
| `IMP-V16-SAFETY` | product-impact | thirteen hard safety counters (aggregate) | 0 | 0 / 4 | `datasets/impact/e2e-holdout-v16.jsonl` (holdout) | MODEL_REVIEWED | REPRODUCIBLE_PARTIAL |
| `IMP-V16-ROW-RECALL` | product-impact | row recall | 1 | 1 / 1 | `datasets/impact/e2e-holdout-v16.jsonl` (holdout) | MODEL_REVIEWED | REPRODUCIBLE_PARTIAL |
| `IMP-V16-DECISION-ACCURACY` | product-impact | decision accuracy | 1 | 3 / 3 | `datasets/impact/e2e-holdout-v16.jsonl` (holdout) | MODEL_REVIEWED | REPRODUCIBLE_PARTIAL |
| `IMP-V16-EXPLOIT-ACCURACY` | product-impact | exploit-status accuracy | 1 | 3 / 3 | `datasets/impact/e2e-holdout-v16.jsonl` (holdout) | MODEL_REVIEWED | REPRODUCIBLE_PARTIAL |
| `IMP-V16-UNKNOWN-HONESTY` | product-impact | unknown honesty | 1 | 3 / 3 | `datasets/impact/e2e-holdout-v16.jsonl` (holdout) | MODEL_REVIEWED | REPRODUCIBLE_PARTIAL |
| `IMP-V16-VENDOR-PRODUCT-VERSION` | product-impact | vendor extraction accuracy / product F1 / version exact-semantic accuracy | — | 见脚注 | `datasets/impact/e2e-holdout-v16.jsonl` (holdout) | MODEL_REVIEWED | NOT_RECORDED |
| `IMP-V16-EVIDENCE-COVERAGE` | product-impact | evidence coverage of persisted impact rows | — | 见脚注 | `datasets/impact/e2e-holdout-v16.jsonl` (holdout) | MODEL_REVIEWED | NOT_RECORDED |
| `IMP-DEV-DEMO-1` | product-impact | contract-complete record demonstration (vendor + product + model + affected + fixed + evidence) | 7 claims rows, all confidence=high, zero safety violations | 7 / 7 | `.data/impact/cases/probe-demo1-7921.jsonl (development probe; case file not committed)` (development) | MODEL_REVIEWED | REPRODUCIBLE_PARTIAL |
| `IMP-FIXTURE-HOLDOUT` | product-impact | synthetic normalization fixture holdout (quality metrics 1.00) | 1 | — / 23 | `datasets/impact/holdout.jsonl` (holdout) | SYNTHETIC_FIXTURE | HISTORICAL_ONLY |
| `SYS-TOOL-ERROR-RATE-RESEARCH` | agent-system | tool error rate (research holdout run) | 0 | 0 / 36 | `datasets/security-research/holdout-v4.jsonl` (holdout) | MODEL_REVIEWED | REPRODUCIBLE_PARTIAL |
| `SYS-TOOL-CALLS-RESEARCH` | agent-system | tool calls (research holdout run) | 36 | — / 20 | `datasets/security-research/holdout-v4.jsonl` (holdout) | MODEL_REVIEWED | REPRODUCIBLE_PARTIAL |
| `SYS-TOKENS-RESEARCH` | agent-system | model tokens (research holdout run) | 58790 | 见脚注 | `datasets/security-research/holdout-v4.jsonl` (holdout) | MODEL_REVIEWED | REPRODUCIBLE_PARTIAL |
| `SYS-TOOL-ERROR-RATE-TRACKING` | agent-system | tool error rate (tracking holdout replay) | 0.2 | 4 / 20 | `datasets/event-tracking/holdout.jsonl` (holdout) | MODEL_REVIEWED | REPRODUCIBLE_FINAL |
| `SYS-LATENCY-TRACKING` | agent-system | replay latency (tracking holdout) | 16 | — / 26 | `datasets/event-tracking/holdout.jsonl` (holdout) | MODEL_REVIEWED | NOT_COMPARABLE |
| `SYS-TOKENS-GROUPING` | agent-system | model tokens (grouping final Stage B/C/pair diagnostic) | 163512 | 145274 / 18238 | `datasets/event-relations/holdout.jsonl` (holdout) | MODEL_REVIEWED | REPRODUCIBLE_PARTIAL |
| `SYS-LATENCY-GROUPING` | agent-system | aggregate provider latency (grouping final run) | 118286 | 118286 / 96 | `datasets/event-relations/holdout.jsonl` (holdout) | MODEL_REVIEWED | REPRODUCIBLE_PARTIAL |
| `SYS-RESEARCH-LATENCY` | agent-system | research agent latency | — | — | `datasets/security-research/holdout-v4.jsonl` (holdout) | MODEL_REVIEWED | NOT_RECORDED |
| `SYS-IMPACT-LATENCY-TOKENS` | agent-system | product impact end-to-end latency and token usage | — | — | `datasets/impact/e2e-holdout-v16.jsonl` (holdout) | MODEL_REVIEWED | REQUIRES_NEW_RUN |
| `SYS-LLM-CALLS` | agent-system | average LLM calls per task | — | — | — | NONE | NOT_RECORDED |
| `SYS-TASK-SUCCESS` | agent-system | task success rate | — | — | — | NONE | NOT_RECORDED |
| `SYS-HUMAN-REVIEW-RATE` | agent-system | human-review rate | — | — | `datasets/impact/e2e-holdout-v16.jsonl` (holdout) | MODEL_REVIEWED | NOT_RECORDED |
| `SYS-RECOVERY-RATE` | agent-system | receipt recovery rate | — | — | — | NONE | NOT_RECORDED |

## Entry detail

### `SEL-HOLDOUT-ACCURACY` — accuracy

- **Status**: `REPRODUCIBLE_PARTIAL` (可复现（部分：需付费重跑）)
- **Value**: 0.884
- **Numerator / denominator**: 38 / 43 — 43 decisive holdout cases (2 either excluded).
- **Dataset**: `datasets/selection/candidates.jsonl` (holdout), sha256 `4dd7e975bb031dfc9e22d00824b746260ff20a7b1b53d87025d7ba1cfe1fddc9`
- **Scorer**: scripts/eval-selection.ts (SelectBench)
- **Thresholds**: industry/selection.ts - T1=32 / T1_5=55 / T2=60
- **Labels**: MODEL_SINGLE_FAMILY, humanGold=false, reviewers: GPT-5.6 Sol (proposal pass + review pass, same family)
- **Source report**: `docs/evaluation/selection.md#J`
- **Reproduction**: node --env-file=.env scripts/eval-selection.ts --gold datasets/selection/candidates.jsonl --split holdout
- **System boundary**: Prefilter -> two independent scores -> source-tier threshold. Not grouping, research, tracking or impact.
- **Limitations**: Model-reviewed, not human-labelled gold; both annotation passes used one model family. 45-case holdout (43 decisive): one case moves accuracy about +/-0.023. Reproduction needs live paid model calls; per-case decisions are not committed, so the exact numbers cannot be re-derived offline.

### `SEL-HOLDOUT-PRECISION` — precision

- **Status**: `REPRODUCIBLE_PARTIAL` (可复现（部分：需付费重跑）)
- **Value**: 1
- **Numerator / denominator**: 21 / 21 — 21 true positives, 0 false positives.
- **Dataset**: `datasets/selection/candidates.jsonl` (holdout), sha256 `4dd7e975bb031dfc9e22d00824b746260ff20a7b1b53d87025d7ba1cfe1fddc9`
- **Scorer**: scripts/eval-selection.ts (SelectBench)
- **Thresholds**: industry/selection.ts - T1=32 / T1_5=55 / T2=60
- **Labels**: MODEL_SINGLE_FAMILY, humanGold=false, reviewers: GPT-5.6 Sol (proposal pass + review pass, same family)
- **Source report**: `docs/evaluation/selection.md#J`
- **Reproduction**: node --env-file=.env scripts/eval-selection.ts --gold datasets/selection/candidates.jsonl --split holdout
- **System boundary**: Same as SEL-HOLDOUT-ACCURACY.
- **Limitations**: Finite-sample point estimate: 21 true positives and 0 false positives; not a production-precision guarantee. Requires live paid model calls to regenerate.

### `SEL-HOLDOUT-RECALL` — recall

- **Status**: `REPRODUCIBLE_PARTIAL` (可复现（部分：需付费重跑）)
- **Value**: 0.808
- **Numerator / denominator**: 21 / 26 — 21 of 26 labelled-select decisive cases.
- **Dataset**: `datasets/selection/candidates.jsonl` (holdout), sha256 `4dd7e975bb031dfc9e22d00824b746260ff20a7b1b53d87025d7ba1cfe1fddc9`
- **Scorer**: scripts/eval-selection.ts (SelectBench)
- **Thresholds**: industry/selection.ts - T1=32 / T1_5=55 / T2=60
- **Labels**: MODEL_SINGLE_FAMILY, humanGold=false, reviewers: GPT-5.6 Sol (proposal pass + review pass, same family)
- **Source report**: `docs/evaluation/selection.md#J`
- **Reproduction**: node --env-file=.env scripts/eval-selection.ts --gold datasets/selection/candidates.jsonl --split holdout
- **System boundary**: Same as SEL-HOLDOUT-ACCURACY.
- **Limitations**: Five holdout false negatives are frozen evidence and must not drive further tuning. Requires live paid model calls to regenerate.

### `SEL-HOLDOUT-F1` — F1 score

- **Status**: `REPRODUCIBLE_PARTIAL` (可复现（部分：需付费重跑）)
- **Value**: 0.894
- **Numerator / denominator**: — / — — Derived from TP=21, FP=0, FN=5 on the 43 decisive holdout cases.
- **Dataset**: `datasets/selection/candidates.jsonl` (holdout), sha256 `4dd7e975bb031dfc9e22d00824b746260ff20a7b1b53d87025d7ba1cfe1fddc9`
- **Scorer**: scripts/eval-selection.ts (SelectBench)
- **Thresholds**: industry/selection.ts - T1=32 / T1_5=55 / T2=60
- **Labels**: MODEL_SINGLE_FAMILY, humanGold=false, reviewers: GPT-5.6 Sol (proposal pass + review pass, same family)
- **Source report**: `docs/evaluation/selection.md#J`
- **Reproduction**: node --env-file=.env scripts/eval-selection.ts --gold datasets/selection/candidates.jsonl --split holdout
- **System boundary**: Same as SEL-HOLDOUT-ACCURACY.
- **Limitations**: Requires live paid model calls to regenerate.

### `SEL-TOKENS` — token usage

- **Status**: `NOT_RECORDED` (未记录)
- **Value**: not recorded
- **Numerator / denominator**: — / —
- **Dataset**: `datasets/selection/candidates.jsonl` (holdout), sha256 `4dd7e975bb031dfc9e22d00824b746260ff20a7b1b53d87025d7ba1cfe1fddc9`
- **Scorer**: scripts/eval-selection.ts (SelectBench)
- **Thresholds**: industry/selection.ts - T1=32 / T1_5=55 / T2=60
- **Labels**: MODEL_SINGLE_FAMILY, humanGold=false, reviewers: GPT-5.6 Sol (proposal pass + review pass, same family)
- **Source report**: `docs/evaluation/selection.md#M`
- **Reproduction**: Not recorded: the runtime reports carrying usage stayed in .data/ and are not committed.
- **System boundary**: Selection pipeline.
- **Limitations**: No committed token or cost figure exists for the selection evaluation.

### `SEL-LATENCY` — latency

- **Status**: `NOT_RECORDED` (未记录)
- **Value**: not recorded
- **Numerator / denominator**: — / —
- **Dataset**: `datasets/selection/candidates.jsonl` (holdout), sha256 `4dd7e975bb031dfc9e22d00824b746260ff20a7b1b53d87025d7ba1cfe1fddc9`
- **Scorer**: scripts/eval-selection.ts (SelectBench)
- **Thresholds**: industry/selection.ts - T1=32 / T1_5=55 / T2=60
- **Labels**: MODEL_SINGLE_FAMILY, humanGold=false, reviewers: GPT-5.6 Sol (proposal pass + review pass, same family)
- **Source report**: `docs/evaluation/selection.md#M`
- **Reproduction**: Not recorded: no committed latency measurement.
- **System boundary**: Selection pipeline.
- **Limitations**: No committed latency figure exists for the selection evaluation.

### `SEL-TIER-CALIBRATION` — accuracy on the targeted tier-calibration supplement

- **Status**: `NOT_COMPARABLE` (不可比较)
- **Value**: 0.917
- **Numerator / denominator**: 22 / 24 — 24 deliberately balanced tier-gap cases.
- **Dataset**: `datasets/selection/tier-calibration.jsonl` (calibration), sha256 `e1f30e2dd968feddd99c9826880bfc6584e46025ad5edf43cae7d31e8e1fc7b9`
- **Scorer**: scripts/eval-selection.ts (SelectBench)
- **Thresholds**: industry/selection.ts - T1=32 / T1_5=55 / T2=60
- **Labels**: MODEL_SINGLE_FAMILY, humanGold=false, reviewers: GPT-5.6 Sol (proposal pass + review pass, same family)
- **Source report**: `docs/evaluation/selection.md#H`
- **Reproduction**: node --env-file=.env scripts/eval-selection.ts --gold datasets/selection/tier-calibration.jsonl --split calibration
- **System boundary**: Selection pipeline on a deliberately balanced tier-gap set.
- **Limitations**: Targeted, balanced set: NOT natural-distribution performance. Requires live paid model calls to regenerate.

### `GRP-STAGE-A-RECALL` — candidate recall@10 (Stage A)

- **Status**: `REPRODUCIBLE_FINAL` (可离线复现（最终）)
- **Value**: 1
- **Numerator / denominator**: 60 / 60 — 60 holdout cases.
- **Dataset**: `datasets/event-relations/holdout.jsonl` (holdout), sha256 `438afbf05d7a79f1c29401176aa454dc2bff13efba793264d923bc7e8aced53f`
- **Scorer**: scripts/eval-event-grouping.ts --stage recall
- **Thresholds**: frozen in the Phase 2 baseline (diagnostic, no numeric gate)
- **Labels**: MODEL_REVIEWED, humanGold=false, reviewers: three independent model families (unanimous high confidence)
- **Source report**: `docs/evaluation/event-grouping-baseline.md`
- **Reproduction**: node scripts/eval-event-grouping.ts --split holdout --stage recall
- **System boundary**: Deterministic lexical candidate branch of the grouping pipeline (no embedding provider).
- **Limitations**: Lexical branch only: measures candidate recall, not semantic matching. Stage A replay needs a scratch database; nothing is paid.

### `GRP-STAGE-B-ACCURACY` — relation classification accuracy (Stage B)

- **Status**: `REPRODUCIBLE_PARTIAL` (可复现（部分：需付费重跑）)
- **Value**: 0.75
- **Numerator / denominator**: 45 / 60 — 15 errors across 60 holdout pairs.
- **Dataset**: `datasets/event-relations/holdout.jsonl` (holdout), sha256 `438afbf05d7a79f1c29401176aa454dc2bff13efba793264d923bc7e8aced53f`
- **Scorer**: scripts/eval-event-grouping.ts --stage relation
- **Thresholds**: frozen in the Phase 2 baseline (diagnostic, no numeric gate)
- **Labels**: MODEL_REVIEWED, humanGold=false, reviewers: three independent model families (unanimous high confidence)
- **Source report**: `docs/evaluation/event-grouping-baseline.md`
- **Reproduction**: node scripts/eval-event-grouping.ts --split holdout --stage relation --models default
- **System boundary**: Production batch relation judge (deepseek-flash) over frozen holdout pairs.
- **Limitations**: Requires live paid model calls; the per-pair decisions are not committed. All 15 errors are roundup or occurrence/story boundary errors.

### `GRP-STAGE-B-MACRO-F1` — macro F1 (Stage B, 4 classes)

- **Status**: `REPRODUCIBLE_PARTIAL` (可复现（部分：需付费重跑）)
- **Value**: 0.629
- **Numerator / denominator**: — / — — Per-class support 18 / 21 / 12 / 9.
- **Dataset**: `datasets/event-relations/holdout.jsonl` (holdout), sha256 `438afbf05d7a79f1c29401176aa454dc2bff13efba793264d923bc7e8aced53f`
- **Scorer**: scripts/eval-event-grouping.ts --stage relation
- **Thresholds**: frozen in the Phase 2 baseline (diagnostic, no numeric gate)
- **Labels**: MODEL_REVIEWED, humanGold=false, reviewers: three independent model families (unanimous high confidence)
- **Source report**: `docs/evaluation/event-grouping-baseline.md`
- **Reproduction**: node scripts/eval-event-grouping.ts --split holdout --stage relation --models default
- **System boundary**: Same as GRP-STAGE-B-ACCURACY.
- **Limitations**: Requires live paid model calls. ROUNDUP recall 0.000 dominates the macro average.

### `GRP-SAME-OCCURRENCE` — SAME_OCCURRENCE precision / recall / F1

- **Status**: `REPRODUCIBLE_PARTIAL` (可复现（部分：需付费重跑）)
- **Value**: 0.625 / 0.833 / 0.714
- **Numerator / denominator**: 15 / 18 — recall 15/18; precision 15/24 predicted (support 18).
- **Dataset**: `datasets/event-relations/holdout.jsonl` (holdout), sha256 `438afbf05d7a79f1c29401176aa454dc2bff13efba793264d923bc7e8aced53f`
- **Scorer**: scripts/eval-event-grouping.ts --stage relation
- **Thresholds**: frozen in the Phase 2 baseline
- **Labels**: MODEL_REVIEWED, humanGold=false, reviewers: three independent model families (unanimous high confidence)
- **Source report**: `docs/evaluation/event-grouping-baseline.md`
- **Reproduction**: node scripts/eval-event-grouping.ts --split holdout --stage relation --models default
- **System boundary**: Same as GRP-STAGE-B-ACCURACY.
- **Limitations**: Requires live paid model calls.

### `GRP-SAME-STORY` — SAME_STORY precision / recall / F1

- **Status**: `REPRODUCIBLE_PARTIAL` (可复现（部分：需付费重跑）)
- **Value**: 0.750 / 0.857 / 0.800
- **Numerator / denominator**: 18 / 21 — recall 18/21; precision 18/24 predicted (support 21).
- **Dataset**: `datasets/event-relations/holdout.jsonl` (holdout), sha256 `438afbf05d7a79f1c29401176aa454dc2bff13efba793264d923bc7e8aced53f`
- **Scorer**: scripts/eval-event-grouping.ts --stage relation
- **Thresholds**: frozen in the Phase 2 baseline
- **Labels**: MODEL_REVIEWED, humanGold=false, reviewers: three independent model families (unanimous high confidence)
- **Source report**: `docs/evaluation/event-grouping-baseline.md`
- **Reproduction**: node scripts/eval-event-grouping.ts --split holdout --stage relation --models default
- **System boundary**: Same as GRP-STAGE-B-ACCURACY.
- **Limitations**: Requires live paid model calls.

### `GRP-STORY-PRECISION` — story replay precision (Stage C)

- **Status**: `REPRODUCIBLE_PARTIAL` (可复现（部分：需付费重跑）)
- **Value**: 1
- **Numerator / denominator**: — / — — Zero false merges; verdict distribution new-story 104, new-fact-in-story 2, same-fact 3.
- **Dataset**: `datasets/event-relations/holdout.jsonl` (holdout), sha256 `438afbf05d7a79f1c29401176aa454dc2bff13efba793264d923bc7e8aced53f`
- **Scorer**: scripts/eval-event-grouping.ts --stage story
- **Thresholds**: frozen in the Phase 2 baseline
- **Labels**: MODEL_REVIEWED, humanGold=false, reviewers: three independent model families (unanimous high confidence)
- **Source report**: `docs/evaluation/event-grouping-baseline.md`
- **Reproduction**: node scripts/eval-event-grouping.ts --split holdout --stage story
- **System boundary**: Stage C story replay over the deterministic grouping path with the relation judge.
- **Limitations**: Requires live paid model calls and a scratch database.

### `GRP-STORY-RECALL` — story replay recall (Stage C)

- **Status**: `REPRODUCIBLE_PARTIAL` (可复现（部分：需付费重跑）)
- **Value**: 0.095
- **Numerator / denominator**: — / — — 38 attributable false splits; the report does not restate the denominator as a count.
- **Dataset**: `datasets/event-relations/holdout.jsonl` (holdout), sha256 `438afbf05d7a79f1c29401176aa454dc2bff13efba793264d923bc7e8aced53f`
- **Scorer**: scripts/eval-event-grouping.ts --stage story
- **Thresholds**: frozen in the Phase 2 baseline
- **Labels**: MODEL_REVIEWED, humanGold=false, reviewers: three independent model families (unanimous high confidence)
- **Source report**: `docs/evaluation/event-grouping-baseline.md`
- **Reproduction**: node scripts/eval-event-grouping.ts --split holdout --stage story
- **System boundary**: Same as GRP-STORY-PRECISION.
- **Limitations**: Conservative splitting is the dominant baseline failure (38 false splits). Requires live paid model calls.

### `GRP-STORY-FALSE-MERGES` — story replay false merges

- **Status**: `REPRODUCIBLE_PARTIAL` (可复现（部分：需付费重跑）)
- **Value**: 0
- **Numerator / denominator**: 0 / 60 — 60 holdout cases.
- **Dataset**: `datasets/event-relations/holdout.jsonl` (holdout), sha256 `438afbf05d7a79f1c29401176aa454dc2bff13efba793264d923bc7e8aced53f`
- **Scorer**: scripts/eval-event-grouping.ts --stage story
- **Thresholds**: frozen in the Phase 2 baseline
- **Labels**: MODEL_REVIEWED, humanGold=false, reviewers: three independent model families (unanimous high confidence)
- **Source report**: `docs/evaluation/event-grouping-baseline.md`
- **Reproduction**: node scripts/eval-event-grouping.ts --split holdout --stage story
- **System boundary**: Same as GRP-STORY-PRECISION.
- **Limitations**: Zero observed false merges on this holdout; not a guarantee across the open web.

### `RSR-CLAIM-RECALL` — expected-claim recall

- **Status**: `REPRODUCIBLE_PARTIAL` (可复现（部分：需付费重跑）)
- **Value**: 1
- **Numerator / denominator**: — / — — Gate >= 0.80; the committed report states the ratio but not the expected-claim instance count.
- **Dataset**: `datasets/security-research/holdout-v4.jsonl` (holdout), sha256 `ffb0ebafbb3185ec88c661c53c2275c4889476d6ee56a1f4fa3ebbe9d66a8df2`
- **Scorer**: scripts/eval-security-research.ts
- **Thresholds**: datasets/security-research/thresholds-v4.json (sha256 875a943d...)
- **Labels**: MODEL_REVIEWED, humanGold=false, reviewers: deepseek-flash, deepseek-v4-pro, glm-5.3-flash
- **Source report**: `docs/evaluation/security-research-baseline-v4.md`
- **Reproduction**: No committed results file (baseline results came from a live agent run); the scorer and dataset are committed.
- **System boundary**: Bounded research agent: 20 cases, 36 tool calls, provider via the receipted gateway.
- **Limitations**: Requires a paid agent re-run to regenerate; B1 completed 8 cases and returned insufficient_evidence for 12. Labels are three-model reviewed, not human gold.

### `RSR-EVIDENCE-RECALL` — authoritative-evidence recall

- **Status**: `REPRODUCIBLE_PARTIAL` (可复现（部分：需付费重跑）)
- **Value**: 1
- **Numerator / denominator**: — / — — Gate >= 0.75; exact instance count not stated in the committed report.
- **Dataset**: `datasets/security-research/holdout-v4.jsonl` (holdout), sha256 `ffb0ebafbb3185ec88c661c53c2275c4889476d6ee56a1f4fa3ebbe9d66a8df2`
- **Scorer**: scripts/eval-security-research.ts
- **Thresholds**: datasets/security-research/thresholds-v4.json (sha256 875a943d...)
- **Labels**: MODEL_REVIEWED, humanGold=false, reviewers: deepseek-flash, deepseek-v4-pro, glm-5.3-flash
- **Source report**: `docs/evaluation/security-research-baseline-v4.md`
- **Reproduction**: No committed results file; the scorer and dataset are committed.
- **System boundary**: Same as RSR-CLAIM-RECALL.
- **Limitations**: Requires a paid agent re-run to regenerate. NVD reliability depends on a deliberately warmed durable cache.

### `RSR-CLAIM-PRECISION` — supported-claim precision

- **Status**: `REPRODUCIBLE_PARTIAL` (可复现（部分：需付费重跑）)
- **Value**: 1
- **Numerator / denominator**: — / — — Gate >= 0.90; exact instance count not stated in the committed report.
- **Dataset**: `datasets/security-research/holdout-v4.jsonl` (holdout), sha256 `ffb0ebafbb3185ec88c661c53c2275c4889476d6ee56a1f4fa3ebbe9d66a8df2`
- **Scorer**: scripts/eval-security-research.ts
- **Thresholds**: datasets/security-research/thresholds-v4.json (sha256 875a943d...)
- **Labels**: MODEL_REVIEWED, humanGold=false, reviewers: deepseek-flash, deepseek-v4-pro, glm-5.3-flash
- **Source report**: `docs/evaluation/security-research-baseline-v4.md`
- **Reproduction**: No committed results file; the scorer and dataset are committed.
- **System boundary**: Same as RSR-CLAIM-RECALL.
- **Limitations**: Requires a paid agent re-run to regenerate.

### `RSR-UNSUPPORTED-CLAIMS` — unsupported critical claims

- **Status**: `REPRODUCIBLE_PARTIAL` (可复现（部分：需付费重跑）)
- **Value**: 0
- **Numerator / denominator**: 0 / 20 — 20 holdout cases.
- **Dataset**: `datasets/security-research/holdout-v4.jsonl` (holdout), sha256 `ffb0ebafbb3185ec88c661c53c2275c4889476d6ee56a1f4fa3ebbe9d66a8df2`
- **Scorer**: scripts/eval-security-research.ts
- **Thresholds**: datasets/security-research/thresholds-v4.json (sha256 875a943d...)
- **Labels**: MODEL_REVIEWED, humanGold=false, reviewers: deepseek-flash, deepseek-v4-pro, glm-5.3-flash
- **Source report**: `docs/evaluation/security-research-baseline-v4.md`
- **Reproduction**: No committed results file; the scorer and dataset are committed.
- **System boundary**: Same as RSR-CLAIM-RECALL.
- **Limitations**: Requires a paid agent re-run to regenerate. Zero observed violations on 20 cases is not a proof for every vendor.

### `RSR-UNKNOWN-PRESERVATION` — expected-unknown preservation

- **Status**: `REPRODUCIBLE_PARTIAL` (可复现（部分：需付费重跑）)
- **Value**: 1
- **Numerator / denominator**: — / — — Gate = 1.00 across the 20 holdout cases; exact expected-unknown count not stated.
- **Dataset**: `datasets/security-research/holdout-v4.jsonl` (holdout), sha256 `ffb0ebafbb3185ec88c661c53c2275c4889476d6ee56a1f4fa3ebbe9d66a8df2`
- **Scorer**: scripts/eval-security-research.ts
- **Thresholds**: datasets/security-research/thresholds-v4.json (sha256 875a943d...)
- **Labels**: MODEL_REVIEWED, humanGold=false, reviewers: deepseek-flash, deepseek-v4-pro, glm-5.3-flash
- **Source report**: `docs/evaluation/security-research-baseline-v4.md`
- **Reproduction**: No committed results file; the scorer and dataset are committed.
- **System boundary**: Same as RSR-CLAIM-RECALL.
- **Limitations**: Requires a paid agent re-run to regenerate.

### `TRK-CHANGE-RECALL` — material-change recall

- **Status**: `REPRODUCIBLE_FINAL` (可离线复现（最终）)
- **Value**: 1
- **Numerator / denominator**: — / — — Gate >= 0.90 over 26 holdout cases; the number of material changes per case varies.
- **Dataset**: `datasets/event-tracking/holdout.jsonl` (holdout), sha256 `a5c6be8218d7af23ffe5b210fd1dddf5162cced8ad24cd4e1d20b0289a78ccea`
- **Scorer**: scripts/eval-event-tracking.ts
- **Thresholds**: datasets/event-tracking/thresholds.json (sha256 b3b20e95...)
- **Labels**: MODEL_REVIEWED, humanGold=false, reviewers: glm-5.3-flash, deepseek-v4.1-flash, kimi-k3-2
- **Source report**: `docs/evaluation/event-tracking-baseline.md`
- **Reproduction**: python scripts/run-event-tracking-development.py --cases datasets/event-tracking/holdout.jsonl --out .data/phase8/tracking-holdout-results.jsonl && node scripts/eval-event-tracking.ts --cases datasets/event-tracking/holdout.jsonl --results .data/phase8/tracking-holdout-results.jsonl --thresholds datasets/event-tracking/thresholds.json
- **System boundary**: Deterministic replay of the real Python tracking graph with the dataset's frozen fixture gateway: no network, no model call, no receipt.
- **Limitations**: Proves semantic transition behaviour and safety boundaries, not live-source recall or production prevalence. Labels are three-model reviewed, not human gold.

### `TRK-CHANGE-PRECISION` — supported-change precision

- **Status**: `REPRODUCIBLE_FINAL` (可离线复现（最终）)
- **Value**: 1
- **Numerator / denominator**: — / — — Gate >= 0.95 over 26 holdout cases.
- **Dataset**: `datasets/event-tracking/holdout.jsonl` (holdout), sha256 `a5c6be8218d7af23ffe5b210fd1dddf5162cced8ad24cd4e1d20b0289a78ccea`
- **Scorer**: scripts/eval-event-tracking.ts
- **Thresholds**: datasets/event-tracking/thresholds.json (sha256 b3b20e95...)
- **Labels**: MODEL_REVIEWED, humanGold=false, reviewers: glm-5.3-flash, deepseek-v4.1-flash, kimi-k3-2
- **Source report**: `docs/evaluation/event-tracking-baseline.md`
- **Reproduction**: Same two-step replay and scorer command as TRK-CHANGE-RECALL.
- **System boundary**: Same as TRK-CHANGE-RECALL.
- **Limitations**: Same as TRK-CHANGE-RECALL.

### `TRK-QUESTION-STATE` — question-state accuracy

- **Status**: `REPRODUCIBLE_FINAL` (可离线复现（最终）)
- **Value**: 1
- **Numerator / denominator**: — / — — Gate >= 0.90 over the 26 holdout cases.
- **Dataset**: `datasets/event-tracking/holdout.jsonl` (holdout), sha256 `a5c6be8218d7af23ffe5b210fd1dddf5162cced8ad24cd4e1d20b0289a78ccea`
- **Scorer**: scripts/eval-event-tracking.ts
- **Thresholds**: datasets/event-tracking/thresholds.json (sha256 b3b20e95...)
- **Labels**: MODEL_REVIEWED, humanGold=false, reviewers: glm-5.3-flash, deepseek-v4.1-flash, kimi-k3-2
- **Source report**: `docs/evaluation/event-tracking-baseline.md`
- **Reproduction**: Same two-step replay and scorer command as TRK-CHANGE-RECALL.
- **System boundary**: Same as TRK-CHANGE-RECALL.
- **Limitations**: Same as TRK-CHANGE-RECALL.

### `TRK-MISSED-UPDATES` — missed material updates

- **Status**: `REPRODUCIBLE_FINAL` (可离线复现（最终）)
- **Value**: 0
- **Numerator / denominator**: 0 / 26 — 26 holdout cases.
- **Dataset**: `datasets/event-tracking/holdout.jsonl` (holdout), sha256 `a5c6be8218d7af23ffe5b210fd1dddf5162cced8ad24cd4e1d20b0289a78ccea`
- **Scorer**: scripts/eval-event-tracking.ts
- **Thresholds**: datasets/event-tracking/thresholds.json (sha256 b3b20e95...)
- **Labels**: MODEL_REVIEWED, humanGold=false, reviewers: glm-5.3-flash, deepseek-v4.1-flash, kimi-k3-2
- **Source report**: `docs/evaluation/event-tracking-baseline.md`
- **Reproduction**: Same two-step replay and scorer command as TRK-CHANGE-RECALL.
- **System boundary**: Same as TRK-CHANGE-RECALL.
- **Limitations**: Zero missed updates on the frozen fixture gateway, not on live sources.

### `TRK-UNNECESSARY-RESEARCH` — unnecessary research rate

- **Status**: `NOT_RECORDED` (未记录)
- **Value**: not recorded
- **Numerator / denominator**: — / —
- **Dataset**: `datasets/event-tracking/holdout.jsonl` (holdout), sha256 `a5c6be8218d7af23ffe5b210fd1dddf5162cced8ad24cd4e1d20b0289a78ccea`
- **Scorer**: scripts/eval-event-tracking.ts
- **Thresholds**: datasets/event-tracking/thresholds.json (sha256 b3b20e95...)
- **Labels**: MODEL_REVIEWED, humanGold=false, reviewers: glm-5.3-flash, deepseek-v4.1-flash, kimi-k3-2
- **Source report**: `docs/evaluation/event-tracking-baseline.md`
- **Reproduction**: The replay aborts if observed tool calls differ from each case's expected tool list, so zero unnecessary calls is enforced rather than counted as a rate.
- **System boundary**: Same as TRK-CHANGE-RECALL.
- **Limitations**: No ratio is recorded; the invariant is exact-match enforcement, not a measured rate.

### `IMP-V16-SAFETY` — thirteen hard safety counters (aggregate)

- **Status**: `REPRODUCIBLE_PARTIAL` (可复现（部分：需付费重跑）)
- **Value**: 0
- **Numerator / denominator**: 0 / 4 — 4 cases; every counter is asserted per case by the revision-12 runner.
- **Dataset**: `datasets/impact/e2e-holdout-v16.jsonl` (holdout), sha256 `a679b11e04a9135a5f69b5eede5a592f96f9efe30f63fddca947db232234a4c5`
- **Scorer**: scripts/run-impact-e2e.ts (revision-12 runner + fail-closed scorer)
- **Thresholds**: datasets/impact/thresholds-v2.json (sha256 5073d029...)
- **Labels**: MODEL_REVIEWED, humanGold=false, reviewers: glm-5.3-flash, deepseek-v4.1-flash, kimi-k2.8-preview
- **Source report**: `docs/evaluation/impact-e2e-baseline.md`
- **Reproduction**: Live end-to-end run over a scratch database; needs the API and agent runtime plus paid extraction receipts (one per case). Not offline.
- **System boundary**: Complete TypeScript -> Python -> TypeScript -> scratch-database pipeline: 4 frozen cases, 43 migrations, frozen official evidence pack (sha256 6f4c000b...).
- **Limitations**: Regenerating needs paid extraction calls and a live runtime. Four cases: a gate, not a prevalence estimate.

### `IMP-V16-ROW-RECALL` — row recall

- **Status**: `REPRODUCIBLE_PARTIAL` (可复现（部分：需付费重跑）)
- **Value**: 1
- **Numerator / denominator**: 1 / 1 — Only runs that decided to propose AND persisted a claims row enter the denominator.
- **Dataset**: `datasets/impact/e2e-holdout-v16.jsonl` (holdout), sha256 `a679b11e04a9135a5f69b5eede5a592f96f9efe30f63fddca947db232234a4c5`
- **Scorer**: scripts/run-impact-e2e.ts (revision-12 runner + fail-closed scorer)
- **Thresholds**: datasets/impact/thresholds-v2.json (sha256 5073d029...)
- **Labels**: MODEL_REVIEWED, humanGold=false, reviewers: glm-5.3-flash, deepseek-v4.1-flash, kimi-k2.8-preview
- **Source report**: `docs/evaluation/impact-e2e-baseline.md`
- **Reproduction**: Same as IMP-V16-SAFETY.
- **System boundary**: Same as IMP-V16-SAFETY.
- **Limitations**: Denominator of one: a single scored case, not a statistical recall estimate.

### `IMP-V16-DECISION-ACCURACY` — decision accuracy

- **Status**: `REPRODUCIBLE_PARTIAL` (可复现（部分：需付费重跑）)
- **Value**: 1
- **Numerator / denominator**: 3 / 3 — The no-CVE negative is a deterministic pre-model skip and is not scored as a decision.
- **Dataset**: `datasets/impact/e2e-holdout-v16.jsonl` (holdout), sha256 `a679b11e04a9135a5f69b5eede5a592f96f9efe30f63fddca947db232234a4c5`
- **Scorer**: scripts/run-impact-e2e.ts (revision-12 runner + fail-closed scorer)
- **Thresholds**: datasets/impact/thresholds-v2.json (sha256 5073d029...)
- **Labels**: MODEL_REVIEWED, humanGold=false, reviewers: glm-5.3-flash, deepseek-v4.1-flash, kimi-k2.8-preview
- **Source report**: `docs/evaluation/impact-e2e-baseline.md`
- **Reproduction**: Same as IMP-V16-SAFETY.
- **System boundary**: Same as IMP-V16-SAFETY.
- **Limitations**: Three scored cases.

### `IMP-V16-EXPLOIT-ACCURACY` — exploit-status accuracy

- **Status**: `REPRODUCIBLE_PARTIAL` (可复现（部分：需付费重跑）)
- **Value**: 1
- **Numerator / denominator**: 3 / 3 — Three scored cases.
- **Dataset**: `datasets/impact/e2e-holdout-v16.jsonl` (holdout), sha256 `a679b11e04a9135a5f69b5eede5a592f96f9efe30f63fddca947db232234a4c5`
- **Scorer**: scripts/run-impact-e2e.ts (revision-12 runner + fail-closed scorer)
- **Thresholds**: datasets/impact/thresholds-v2.json (sha256 5073d029...)
- **Labels**: MODEL_REVIEWED, humanGold=false, reviewers: glm-5.3-flash, deepseek-v4.1-flash, kimi-k2.8-preview
- **Source report**: `docs/evaluation/impact-e2e-baseline.md`
- **Reproduction**: Same as IMP-V16-SAFETY.
- **System boundary**: Same as IMP-V16-SAFETY.
- **Limitations**: Three scored cases.

### `IMP-V16-UNKNOWN-HONESTY` — unknown honesty

- **Status**: `REPRODUCIBLE_PARTIAL` (可复现（部分：需付费重跑）)
- **Value**: 1
- **Numerator / denominator**: 3 / 3 — Three scored cases.
- **Dataset**: `datasets/impact/e2e-holdout-v16.jsonl` (holdout), sha256 `a679b11e04a9135a5f69b5eede5a592f96f9efe30f63fddca947db232234a4c5`
- **Scorer**: scripts/run-impact-e2e.ts (revision-12 runner + fail-closed scorer)
- **Thresholds**: datasets/impact/thresholds-v2.json (sha256 5073d029...)
- **Labels**: MODEL_REVIEWED, humanGold=false, reviewers: glm-5.3-flash, deepseek-v4.1-flash, kimi-k2.8-preview
- **Source report**: `docs/evaluation/impact-e2e-baseline.md`
- **Reproduction**: Same as IMP-V16-SAFETY.
- **System boundary**: Same as IMP-V16-SAFETY.
- **Limitations**: Three scored cases.

### `IMP-V16-VENDOR-PRODUCT-VERSION` — vendor extraction accuracy / product F1 / version exact-semantic accuracy

- **Status**: `NOT_RECORDED` (未记录)
- **Value**: not recorded
- **Numerator / denominator**: — / — — The E2E runner asserts per-case contract completeness but does not emit these three ratios.
- **Dataset**: `datasets/impact/e2e-holdout-v16.jsonl` (holdout), sha256 `a679b11e04a9135a5f69b5eede5a592f96f9efe30f63fddca947db232234a4c5`
- **Scorer**: scripts/run-impact-e2e.ts (revision-12 runner + fail-closed scorer)
- **Thresholds**: datasets/impact/thresholds-v2.json (sha256 5073d029...)
- **Labels**: MODEL_REVIEWED, humanGold=false, reviewers: glm-5.3-flash, deepseek-v4.1-flash, kimi-k2.8-preview
- **Source report**: `docs/evaluation/impact-e2e-baseline.md`
- **Reproduction**: No committed ratio: the runner's per-case assertions cover the same behaviour qualitatively.
- **System boundary**: Same as IMP-V16-SAFETY.
- **Limitations**: These three ratios were never produced by the E2E scorer. The fixture holdout's version-range accuracy (1.00) is HISTORICAL_ONLY and not comparable.

### `IMP-V16-EVIDENCE-COVERAGE` — evidence coverage of persisted impact rows

- **Status**: `NOT_RECORDED` (未记录)
- **Value**: not recorded
- **Numerator / denominator**: — / — — Grounding is enforced by the stale_version_commits / unsupported_claim / forbidden_row detectors, not reported as a ratio.
- **Dataset**: `datasets/impact/e2e-holdout-v16.jsonl` (holdout), sha256 `a679b11e04a9135a5f69b5eede5a592f96f9efe30f63fddca947db232234a4c5`
- **Scorer**: scripts/run-impact-e2e.ts (revision-12 runner + fail-closed scorer)
- **Thresholds**: datasets/impact/thresholds-v2.json (sha256 5073d029...)
- **Labels**: MODEL_REVIEWED, humanGold=false, reviewers: glm-5.3-flash, deepseek-v4.1-flash, kimi-k2.8-preview
- **Source report**: `docs/evaluation/impact-e2e-baseline.md`
- **Reproduction**: Same as IMP-V16-SAFETY.
- **System boundary**: Same as IMP-V16-SAFETY.
- **Limitations**: No committed percentage exists; zero stale/unsupported/forbidden detections is the recorded guarantee.

### `IMP-DEV-DEMO-1` — contract-complete record demonstration (vendor + product + model + affected + fixed + evidence)

- **Status**: `REPRODUCIBLE_PARTIAL` (可复现（部分：需付费重跑）)
- **Value**: 7 claims rows, all confidence=high, zero safety violations
- **Numerator / denominator**: 7 / 7 — CVE-2017-7921 Hikvision advisory: 7 affected camera model series, each with affected and fixed firmware.
- **Dataset**: `.data/impact/cases/probe-demo1-7921.jsonl (development probe; case file not committed)` (development), sha256 `9924054ca8876535d1a0660c0859e62fc826135788c659dd01dec98b698255cb`
- **Scorer**: scripts/verify-impact-development-evidence.ts (offline re-verification)
- **Thresholds**: datasets/impact/thresholds-v2.json revision 6 assertions
- **Labels**: MODEL_REVIEWED, humanGold=false, reviewers: glm-5.3-flash, deepseek-v4.1-flash, kimi-k2.8-preview (v10 review; the probes predate it)
- **Source report**: `docs/evaluation/impact-development-demonstrations.md`
- **Reproduction**: Offline re-verification reads the scratch database; the case files and results live under .data/ and are gitignored.
- **System boundary**: Development end-to-end demonstration on real public evidence; not a holdout metric.
- **Limitations**: Development evidence only; the case file and results are not committed. Demonstrates the capability qualitatively; it is not a rate.

### `IMP-FIXTURE-HOLDOUT` — synthetic normalization fixture holdout (quality metrics 1.00)

- **Status**: `HISTORICAL_ONLY` (仅历史证据)
- **Value**: 1
- **Numerator / denominator**: — / 23 — 23 synthetic cases; the report lists 12 metrics all at 1.00.
- **Dataset**: `datasets/impact/holdout.jsonl` (holdout), sha256 `3b2e242ee681b49d5ee957881cd1667039780c9adafc8c26c36558919fe253b5`
- **Scorer**: scripts/eval-impact.ts
- **Thresholds**: datasets/impact/thresholds.json (manifest records 0c7a0c7d...; the committed blob hashes to f78bb9ba...)
- **Labels**: SYNTHETIC_FIXTURE, humanGold=false, reviewers: glm-5.3-flash, deepseek-v4.1-flash, kimi-k3-2
- **Source report**: `docs/evaluation/impact-baseline.md`
- **Reproduction**: python scripts/run-impact-development.py --cases datasets/impact/holdout.jsonl && node scripts/eval-impact.ts --cases datasets/impact/holdout.jsonl --results <out> --thresholds datasets/impact/thresholds.json
- **System boundary**: Frozen drafts -> normalize -> route only: no model extraction, no gateway, no worker, no database.
- **Limitations**: Reclassified by the owner as a synthetic fixture holdout, not the Phase 6 closing baseline. Not reproducible today: the current scorer aborts on this frozen set (unresolvable-range requires >= 3 cases; the freeze has 2 after the documented exclusion), and normalization semantics changed in revisions 4-6. The manifest's thresholds_sha256 matches the CRLF working copy, not the committed LF blob.

### `SYS-TOOL-ERROR-RATE-RESEARCH` — tool error rate (research holdout run)

- **Status**: `REPRODUCIBLE_PARTIAL` (可复现（部分：需付费重跑）)
- **Value**: 0
- **Numerator / denominator**: 0 / 36 — 36 tool calls, 0 failures.
- **Dataset**: `datasets/security-research/holdout-v4.jsonl` (holdout), sha256 `ffb0ebafbb3185ec88c661c53c2275c4889476d6ee56a1f4fa3ebbe9d66a8df2`
- **Scorer**: scripts/eval-security-research.ts
- **Thresholds**: datasets/security-research/thresholds-v4.json (gate <= 0.20)
- **Labels**: MODEL_REVIEWED, humanGold=false, reviewers: deepseek-flash, deepseek-v4-pro, glm-5.3-flash
- **Source report**: `docs/evaluation/security-research-baseline-v4.md`
- **Reproduction**: No committed results file.
- **System boundary**: Research agent tool calls through the capability-bound tool gateway.
- **Limitations**: Requires a paid agent re-run to regenerate.

### `SYS-TOOL-CALLS-RESEARCH` — tool calls (research holdout run)

- **Status**: `REPRODUCIBLE_PARTIAL` (可复现（部分：需付费重跑）)
- **Value**: 36
- **Numerator / denominator**: — / 20 — 36 calls across 20 cases: 1.8 per case.
- **Dataset**: `datasets/security-research/holdout-v4.jsonl` (holdout), sha256 `ffb0ebafbb3185ec88c661c53c2275c4889476d6ee56a1f4fa3ebbe9d66a8df2`
- **Scorer**: scripts/eval-security-research.ts
- **Thresholds**: datasets/security-research/thresholds-v4.json
- **Labels**: MODEL_REVIEWED, humanGold=false, reviewers: deepseek-flash, deepseek-v4-pro, glm-5.3-flash
- **Source report**: `docs/evaluation/security-research-baseline-v4.md`
- **Reproduction**: No committed results file.
- **System boundary**: Same as SYS-TOOL-ERROR-RATE-RESEARCH.
- **Limitations**: Requires a paid agent re-run to regenerate.

### `SYS-TOKENS-RESEARCH` — model tokens (research holdout run)

- **Status**: `REPRODUCIBLE_PARTIAL` (可复现（部分：需付费重跑）)
- **Value**: 58790
- **Numerator / denominator**: — / — — Recorded across receipts 1-4; input/output split not stated in the report.
- **Dataset**: `datasets/security-research/holdout-v4.jsonl` (holdout), sha256 `ffb0ebafbb3185ec88c661c53c2275c4889476d6ee56a1f4fa3ebbe9d66a8df2`
- **Scorer**: receipts 1-4 (recorded in the committed report)
- **Thresholds**: datasets/security-research/thresholds-v4.json
- **Labels**: MODEL_REVIEWED, humanGold=false, reviewers: deepseek-flash, deepseek-v4-pro, glm-5.3-flash
- **Source report**: `docs/evaluation/security-research-baseline-v4.md`
- **Reproduction**: Receipt usage was read from the run database; the provider returned no monetary cost field.
- **System boundary**: Same as SYS-TOOL-ERROR-RATE-RESEARCH.
- **Limitations**: Cost is unknown, not zero: the provider returned no cost field.

### `SYS-TOOL-ERROR-RATE-TRACKING` — tool error rate (tracking holdout replay)

- **Status**: `REPRODUCIBLE_FINAL` (可离线复现（最终）)
- **Value**: 0.2
- **Numerator / denominator**: 4 / 20 — The four errors are the dataset's intentional tool-failure cases.
- **Dataset**: `datasets/event-tracking/holdout.jsonl` (holdout), sha256 `a5c6be8218d7af23ffe5b210fd1dddf5162cced8ad24cd4e1d20b0289a78ccea`
- **Scorer**: scripts/eval-event-tracking.ts
- **Thresholds**: datasets/event-tracking/thresholds.json (sha256 b3b20e95...)
- **Labels**: MODEL_REVIEWED, humanGold=false, reviewers: glm-5.3-flash, deepseek-v4.1-flash, kimi-k3-2
- **Source report**: `docs/evaluation/event-tracking-baseline.md`
- **Reproduction**: Same two-step replay and scorer command as TRK-CHANGE-RECALL.
- **System boundary**: Deterministic fixture-gateway replay.
- **Limitations**: Intentional failure injection, not an operational error rate.

### `SYS-LATENCY-TRACKING` — replay latency (tracking holdout)

- **Status**: `NOT_COMPARABLE` (不可比较)
- **Value**: 16
- **Numerator / denominator**: — / 26 — Milliseconds for the whole 26-case offline replay; the Phase 8 re-run observed 32 ms.
- **Dataset**: `datasets/event-tracking/holdout.jsonl` (holdout), sha256 `a5c6be8218d7af23ffe5b210fd1dddf5162cced8ad24cd4e1d20b0289a78ccea`
- **Scorer**: scripts/eval-event-tracking.ts
- **Thresholds**: datasets/event-tracking/thresholds.json
- **Labels**: MODEL_REVIEWED, humanGold=false, reviewers: glm-5.3-flash, deepseek-v4.1-flash, kimi-k3-2
- **Source report**: `docs/evaluation/event-tracking-baseline.md`
- **Reproduction**: Same two-step replay and scorer command as TRK-CHANGE-RECALL.
- **System boundary**: Offline replay only: excludes all network and provider latency.
- **Limitations**: Wall-clock figure with no provider work; not comparable to live latency.

### `SYS-TOKENS-GROUPING` — model tokens (grouping final Stage B/C/pair diagnostic)

- **Status**: `REPRODUCIBLE_PARTIAL` (可复现（部分：需付费重跑）)
- **Value**: 163512
- **Numerator / denominator**: 145274 / 18238 — 145,274 input + 18,238 output tokens over 96 unique paid attempts.
- **Dataset**: `datasets/event-relations/holdout.jsonl` (holdout), sha256 `438afbf05d7a79f1c29401176aa454dc2bff13efba793264d923bc7e8aced53f`
- **Scorer**: scripts/eval-event-grouping.ts + receipt usage
- **Thresholds**: frozen in the Phase 2 baseline
- **Labels**: MODEL_REVIEWED, humanGold=false, reviewers: three independent model families (unanimous high confidence)
- **Source report**: `docs/evaluation/event-grouping-baseline.md`
- **Reproduction**: Receipt usage recorded at run time (receipts 61-156); no committed usage file.
- **System boundary**: Stage B relation batch judge + Stage C replay + pair confirmation.
- **Limitations**: The gateway reported no provider cost; only token counts are recorded.

### `SYS-LATENCY-GROUPING` — aggregate provider latency (grouping final run)

- **Status**: `REPRODUCIBLE_PARTIAL` (可复现（部分：需付费重跑）)
- **Value**: 118286
- **Numerator / denominator**: 118286 / 96 — Milliseconds over 96 unique paid attempts (about 1,232 ms average).
- **Dataset**: `datasets/event-relations/holdout.jsonl` (holdout), sha256 `438afbf05d7a79f1c29401176aa454dc2bff13efba793264d923bc7e8aced53f`
- **Scorer**: scripts/eval-event-grouping.ts + receipt usage
- **Thresholds**: frozen in the Phase 2 baseline
- **Labels**: MODEL_REVIEWED, humanGold=false, reviewers: three independent model families (unanimous high confidence)
- **Source report**: `docs/evaluation/event-grouping-baseline.md`
- **Reproduction**: Receipt usage recorded at run time; no committed usage file.
- **System boundary**: Same as SYS-TOKENS-GROUPING.
- **Limitations**: Provider-side latency only; excludes queueing and application overhead.

### `SYS-RESEARCH-LATENCY` — research agent latency

- **Status**: `NOT_RECORDED` (未记录)
- **Value**: not recorded
- **Numerator / denominator**: — / —
- **Dataset**: `datasets/security-research/holdout-v4.jsonl` (holdout), sha256 `ffb0ebafbb3185ec88c661c53c2275c4889476d6ee56a1f4fa3ebbe9d66a8df2`
- **Scorer**: scripts/eval-security-research.ts
- **Thresholds**: datasets/security-research/thresholds-v4.json
- **Labels**: MODEL_REVIEWED, humanGold=false, reviewers: deepseek-flash, deepseek-v4-pro, glm-5.3-flash
- **Source report**: `docs/evaluation/security-research-baseline-v4.md`
- **Reproduction**: Not recorded: the baseline report states token usage and receipts but no latency figure.
- **System boundary**: Research agent.
- **Limitations**: No committed latency measurement.

### `SYS-IMPACT-LATENCY-TOKENS` — product impact end-to-end latency and token usage

- **Status**: `REQUIRES_NEW_RUN` (需新运行)
- **Value**: not recorded
- **Numerator / denominator**: — / —
- **Dataset**: `datasets/impact/e2e-holdout-v16.jsonl` (holdout), sha256 `a679b11e04a9135a5f69b5eede5a592f96f9efe30f63fddca947db232234a4c5`
- **Scorer**: scripts/run-impact-e2e.ts
- **Thresholds**: datasets/impact/thresholds-v2.json
- **Labels**: MODEL_REVIEWED, humanGold=false, reviewers: glm-5.3-flash, deepseek-v4.1-flash, kimi-k2.8-preview
- **Source report**: `docs/evaluation/impact-e2e-baseline.md`
- **Reproduction**: Not recorded: the v16 report records pass/fail counters, not per-case latency or tokens.
- **System boundary**: Complete impact pipeline.
- **Limitations**: No committed latency or token figure for the closing gate.

### `SYS-LLM-CALLS` — average LLM calls per task

- **Status**: `NOT_RECORDED` (未记录)
- **Value**: not recorded
- **Numerator / denominator**: — / —
- **Dataset**: —
- **Scorer**: —
- **Thresholds**: —
- **Labels**: NONE, humanGold=false
- **Source report**: `docs/IMPLEMENTATION_STATUS.md`
- **Reproduction**: Not recorded across capabilities: receipts are per-request, and no per-task LLM-call average is published.
- **System boundary**: Agent system as a whole.
- **Limitations**: Would need a new instrumented run to produce.

### `SYS-TASK-SUCCESS` — task success rate

- **Status**: `NOT_RECORDED` (未记录)
- **Value**: not recorded
- **Numerator / denominator**: — / —
- **Dataset**: —
- **Scorer**: —
- **Thresholds**: —
- **Labels**: NONE, humanGold=false
- **Source report**: `docs/IMPLEMENTATION_STATUS.md`
- **Reproduction**: Not recorded as a rate. The impact v16 run completed 4/4 cases (3 runs + 1 deterministic skip); the research run completed 8 and returned insufficient_evidence on 12 by design.
- **System boundary**: Agent system as a whole.
- **Limitations**: Per-case verdicts exist, but no cross-capability success-rate definition was ever fixed and measured.

### `SYS-HUMAN-REVIEW-RATE` — human-review rate

- **Status**: `NOT_RECORDED` (未记录)
- **Value**: not recorded
- **Numerator / denominator**: — / —
- **Dataset**: `datasets/impact/e2e-holdout-v16.jsonl` (holdout), sha256 `a679b11e04a9135a5f69b5eede5a592f96f9efe30f63fddca947db232234a4c5`
- **Scorer**: scripts/run-impact-e2e.ts
- **Thresholds**: datasets/impact/thresholds-v2.json
- **Labels**: MODEL_REVIEWED, humanGold=false, reviewers: glm-5.3-flash, deepseek-v4.1-flash, kimi-k2.8-preview
- **Source report**: `docs/evaluation/impact-e2e-baseline.md`
- **Reproduction**: Not recorded as a rate: the v16 run reports 2 review rows for the unsupported-format case but no review-rate denominator across cases.
- **System boundary**: Impact agent review routing.
- **Limitations**: Routing behaviour is asserted per case; the ratio was never defined or measured.

### `SYS-RECOVERY-RATE` — receipt recovery rate

- **Status**: `NOT_RECORDED` (未记录)
- **Value**: not recorded
- **Numerator / denominator**: — / —
- **Dataset**: —
- **Scorer**: —
- **Thresholds**: —
- **Labels**: NONE, humanGold=false
- **Source report**: `docs/IMPLEMENTATION_STATUS.md`
- **Reproduction**: Not recorded as a rate. Documented cases: grouping 96 unique paid attempts with 0 failures; tracking review 46 completed receipts plus 2 unknown receipts resolved by the documented recovery path; several holdout reviews timed out and were resolved as failed under the receipt protocol.
- **System boundary**: Receipt and budget boundary across providers.
- **Limitations**: Counts are recorded per incident; no recovery-rate denominator exists.

## Gate 3 proposals (not authorized, not results)

### `G3-IMPACT-LATENCY-TOKENS` — NOT_AUTHORIZED

- **Target entries**: `SYS-IMPACT-LATENCY-TOKENS`
- **Dataset / split**: `datasets/impact/e2e-holdout-v16.jsonl (already consumed; must NOT be rerun)` (holdout)
- **Scorer**: scripts/run-impact-e2e.ts
- **Model / provider**: existing codebuddy-routed gateway (prompt phase6-impact-extraction-v5)
- **Expected calls**: approximately 6-10 paid extraction calls
- **Budget ceiling**: to be set by the owner before authorization
- **Success criterion**: a committed JSON report with per-case latency and token usage while all thirteen safety counters stay zero
- **Stop rule**: stop after the first complete run; any safety-counter regression ends the proposal without a rerun
- **Blocking note**: The v16 holdout is consumed evidence and may not be executed again. A valid replacement requires a new disjoint holdout, which is outside Phase 8 and needs separate owner authorization.
- **Recommended now**: false
