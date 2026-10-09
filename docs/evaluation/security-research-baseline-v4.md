# Phase 4 Security Research Agent final baseline

Status: **PASSED — frozen `MODEL_REVIEWED` holdout, not human gold**

Date: 2026-10-10

## Frozen inputs

- Holdout: `datasets/security-research/holdout-v4.jsonl`, 20 cases across all six strata.
- Holdout SHA-256: `ffb0ebafbb3185ec88c661c53c2275c4889476d6ee56a1f4fa3ebbe9d66a8df2`.
- Threshold SHA-256: `875a943dbe53bcc42a96259f92fb8dc26425ad066cceae619174960864e6642c`.
- Reviewers: `deepseek-flash`, `deepseek-v4-pro`, and `glm-5.3-flash`.
- All reviewers accepted 20/20. Three GLM decisions were medium confidence; all others were high.

The dataset is model-reviewed, not human gold. It excludes 84 source rows and 92 CVEs previously used
by development or the first three consumed holdouts. Three new KEV cases were collected from official
CISA KEV and NVD records because the earlier frozen corpora contained no unused KEV cases.

## Final execution

A fresh scratch database applied migrations through `0041`. Before model execution, all 18 unique CVEs
were fetched under the public NVD rate limit and persisted in the authoritative source cache. All four
five-case final shards then completed once. Receipts `1`–`4` cover 58,790 model tokens. The provider
returned no monetary cost field, so dollar cost is unknown rather than proven zero.

| metric | threshold | B0 | B1 | result |
|---|---:|---:|---:|---|
| unsupported critical claims | 0 | 0 | 0 | pass |
| claims without Evidence | 0 | 0 | 0 | pass |
| search snippets as Evidence | 0 | 0 | 0 | pass |
| policy violations | 0 | 0 | 0 | pass |
| core mutations | 0 | 0 | 0 | pass |
| forbidden conclusions | 0 | 0 | 0 | pass |
| incomplete traces | 0 | 0 | 0 | pass |
| expected-claim recall | >= 0.80 | 0.0000 | 1.0000 | pass |
| authoritative-evidence recall | >= 0.75 | 0.0000 | 1.0000 | pass |
| supported-claim precision | >= 0.90 | 1.0000 | 1.0000 | pass |
| expected-unknown preservation | 1.00 | 1.0000 | 1.0000 | pass |
| conflict preservation | 1.00 | 1.0000 | 1.0000 | pass |
| tool error rate | <= 0.20 | n/a | 0.0000 | pass |

B1 made 36 tool calls, completed eight cases, and returned `insufficient_evidence` for 12 cases.

## Error classification

- False support / unsupported critical claims: none.
- False unknown removal: none.
- Missing expected claim or authoritative Evidence: none.
- Tool failures: none.
- Search material promoted to Evidence: none.
- Budget, allowlist, trace, or core-mutation violations: none.

## Limitations

- Labels are three-model-reviewed rather than human gold.
- The final run validates a bounded 20-case benchmark, not every vendor or vulnerability ecosystem.
- NVD reliability depends on a deliberately warmed durable cache; cache provenance remains explicit.
- Provider monetary cost was unavailable even though token usage and receipts were recorded.

## Conclusion

The bounded Security Research Agent meets every pre-registered Phase 4 safety and quality gate. External
research adds complete expected authoritative Evidence coverage over the snapshot-only B0 baseline
without unsupported claims, loss of unknowns, tool errors, or core Story/Fact mutations.
