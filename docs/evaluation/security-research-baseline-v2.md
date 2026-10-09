# Phase 4 Security Research Agent remediation baseline

Status: **FINAL_GATE_FAILED — second independent frozen `MODEL_REVIEWED` holdout**

Date: 2026-10-09

## Frozen inputs

- Holdout: `datasets/security-research/holdout-v2.jsonl`, 20 cases across all six strata.
- Holdout SHA-256: `f0d373af080fcc6977402f66a41ab63135a14dc568f21e578bc73c4b1a1e5452`.
- Threshold SHA-256: `7d7f1f656f1ef0ed61e9702ad6b2f11d0dfbbd27f53a5d6316e0d519cd9b0ab4`.
- Reviewers: `deepseek-flash`, `deepseek-v4-pro`, and `glm-5.3-flash`; all accepted 20/20 at high confidence.

This benchmark is model-reviewed, not human gold. It excludes every source row and CVE used by the
Phase 4 development set or the first consumed holdout.

## Final execution outcome

The authorized final run used a fresh scratch database and a four-request LLM budget. Three shards
produced 15 valid B0/B1 results. The third shard's raw response was retained in receipt `4` but rejected
because revision cases emitted NVD claims while their frozen claim allowlists were empty. The fourth
shard had already run sequentially and completed, but the rejected shard leaves coverage at 15/20.

An earlier launcher mistake invoked CodeBuddy instead of the requested direct provider and timed out
without output. Its receipt `1` was conservatively recorded as possibly billed and failed before the
direct final run began; it supplied no label or metric.

The rejected response was not repaired, filtered, or retried. This holdout is consumed.

### Valid 15-case subset

| metric | B0 | B1 |
|---|---:|---:|
| unsupported critical claims | 0 | 0 |
| claims without Evidence | 0 | 0 |
| search snippets used as Evidence | 0 | 0 |
| policy violations | 0 | 0 |
| core mutations | 0 | 0 |
| forbidden conclusions | 0 | 0 |
| incomplete traces | 0 | 0 |
| authoritative-evidence recall | 0.0000 | 0.8947 |
| supported-claim precision | 1.0000 | 1.0000 |
| expected-unknown preservation | 1.0000 | 1.0000 |
| conflict preservation | 1.0000 | 1.0000 |
| tool error rate | 1.0000 (no calls) | 0.0667 |
| tool calls | 0 | 30 |
| model tokens | 0 | 46,064 |
| distinct receipts | 0 | 3 |

Expected-claim recall is not reported for the subset because the current scorer counted repeated
expected claim ids more than once and produced an impossible value above 1.0. This is a harness defect,
not a metric improvement, and must be fixed on development data before another evaluation.

## Error classification

- **Allowlist noncompliance:** three revision cases emitted authoritative NVD claims even though their
  frozen claim allowlists were empty. The deterministic boundary rejected the whole shard.
- **Harness defect:** repeated expected claim ids were not rejected or deduplicated during scoring,
  allowing recall above 1.0 in the valid subset.
- **Tool reliability:** two of 30 tool calls in valid shards failed; the rate was below the registered
  maximum, but incomplete coverage prevents a holdout-wide conclusion.
- **Safety boundary:** no invalid proposal was persisted and no core Story or Fact state was mutated.

## Conclusion

The deterministic validator prevented scope expansion, but the Agent did not return a complete valid
result set. Phase 4 remains incomplete. Further work must use development data to enforce claim
projection and unique claim ids, followed by a third independent holdout. This holdout and its hashes
must remain unchanged.
