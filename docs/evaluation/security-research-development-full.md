# Phase 4 full development replay after durable-source remediation

Status: **PASSED — development evidence only**

Date: 2026-10-10

## Execution contract

- Dataset: `datasets/security-research/development.jsonl`, all 24 cases and all six strata.
- Runtime: fresh scratch database with migration `0041_research_source_cache.sql`.
- Model execution: four six-case shards with a hard four-call budget.
- Receipts: four completed receipts, 74,368 total model tokens.
- Monetary cost: provider returned no cost field, so cost is unknown rather than proven zero.
- No holdout was constructed, read, or executed as part of this replay.

## Overall results

| metric | v3 threshold | B1 | result |
|---|---:|---:|---|
| unsupported critical claims | 0 | 0 | pass |
| claims without Evidence | 0 | 0 | pass |
| search snippets as Evidence | 0 | 0 | pass |
| policy violations | 0 | 0 | pass |
| core mutations | 0 | 0 | pass |
| forbidden conclusions | 0 | 0 | pass |
| incomplete traces | 0 | 0 | pass |
| expected-claim recall | >= 0.80 | 0.9444 | pass |
| authoritative-evidence recall | >= 0.75 | 0.9444 | pass |
| supported-claim precision | >= 0.90 | 1.0000 | pass |
| expected-unknown preservation | 1.00 | 1.0000 | pass |
| conflict preservation | 1.00 | 1.0000 | pass |
| tool error rate | <= 0.20 | 0.0385 | pass |

B1 made 52 tool calls, completed ten cases, returned `insufficient_evidence` for 14, and persisted 23
successful NVD records in the new source cache.

## Stratum results

| stratum | cases | claim recall | evidence recall | precision | unknowns | conflicts | tool error |
|---|---:|---:|---:|---:|---:|---:|---:|
| CVE details | 4 | 1.0000 | 1.0000 | 1.0000 | 1.0000 | 1.0000 | 0.0000 |
| KEV/exploitation | 4 | 1.0000 | 1.0000 | 1.0000 | 1.0000 | 1.0000 | 0.0000 |
| vendor remediation | 4 | 0.8333 | 0.8333 | 1.0000 | 1.0000 | 1.0000 | 0.1667 |
| official revision/conflict | 4 | 1.0000 | 1.0000 | 1.0000 | 1.0000 | 1.0000 | 0.0000 |
| PoC source quality | 4 | 1.0000 | 1.0000 | 1.0000 | 1.0000 | 1.0000 | 0.0000 |
| insufficient evidence | 4 | 1.0000 | 1.0000 | 1.0000 | 1.0000 | 1.0000 | 0.0000 |

The only remaining development errors were two vendor-advisory fetches. They did not become unsupported
claims, and the corresponding questions remained unknown. NVD retrieval produced no tool errors in the
five non-vendor strata.

## Conclusion

The durable NVD cache and source-appropriate unknown preservation generalize across the complete
development set, not only the six representative cases. This satisfies the prerequisite for considering
a new independent holdout, but it is not itself final Phase 4 acceptance and does not unconsume any prior
holdout.
