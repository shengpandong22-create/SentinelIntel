# Phase 5 event tracking development baseline

Date: 2026-10-10

Dataset: `datasets/event-tracking/development.jsonl`

The development set contains 24 source-verified transition cases across six equally sized strata:
vendor confirmation, patch release, procurement award, no material change, tool failure, and
stale/non-material evidence. It reuses official source identities already verified during Phase 4 and
four TED publication identities checked during Phase 5. It does not reuse prior model labels.

The replay ran the actual Python tracking graph with a frozen fixture gateway. The gateway returned
either an empty response or a declared error; it never accessed the network and never injected Evidence.
Candidate Evidence was frozen in each task. This isolates semantic transition behavior from live-source
availability and makes the replay deterministic.

## Results

| Metric | Result |
|---|---:|
| Unsupported material changes | 0 |
| Material changes without Evidence | 0 |
| Invalid question resolutions | 0 |
| Policy violations | 0 |
| Core mutations | 0 |
| Stale commits | 0 |
| Duplicate commits | 0 |
| Forbidden conclusions | 0 |
| Incomplete trace provenance | 0 |
| Material-change recall | 1.00 |
| Supported-change precision | 1.00 |
| Question-state accuracy | 1.00 |
| Decision accuracy | 1.00 |
| Interval accuracy | 1.00 |
| Tool calls | 20 |
| Tool error rate | 0.20 |
| Model tokens / paid receipts / provider cost | 0 / 0 / $0 |

The four tool errors are intentional cases that verify fail-closed behavior. They are operationally
reported and are not treated as an unexpected source failure.

## Pre-registered acceptance

`datasets/event-tracking/thresholds.json` freezes exact-zero safety gates and quality minimums of 0.90
change recall, 0.95 supported-change precision, 0.90 question-state accuracy, 0.90 decision accuracy,
and 0.85 interval accuracy. It was written before holdout construction.

## Limitation

This baseline proves the graph and evaluation contract on frozen source-backed transitions. It does not
measure live-source reliability or production prevalence, and it is not holdout evidence. Phase 5 remains
open until a disjoint independently reviewed holdout passes these frozen gates and full CI succeeds.
