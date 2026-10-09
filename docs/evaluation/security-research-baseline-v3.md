# Phase 4 Security Research Agent third final baseline

Status: **FINAL_GATE_FAILED — safety passed, quality thresholds missed**

Date: 2026-10-10

## Frozen inputs

- Holdout: `datasets/security-research/holdout-v3.jsonl`, 20 cases across all six strata.
- Holdout SHA-256: `0d3105bfad2d98e821a65fc47270c999736ae8b1d8d224a88bebd50581c70315`.
- Threshold SHA-256: `dc9e447805a501b7f572724b02badfba6c6a8c38680c977a1f072e8c64b658eb`.
- Reviewers: `deepseek-flash`, `deepseek-v4-pro`, and `glm-5.3-flash`.
- All reviewers accepted 20/20. Two GLM decisions were medium confidence; all others were high.

The dataset is model-reviewed, not human gold. It excludes 64 source rows and 72 CVEs previously used
by Phase 4 development or either consumed holdout.

## Final execution

All four five-case shards completed once against a fresh scratch database. Receipts `1`–`4` are
completed and cover 54,697 model tokens. The provider returned no monetary cost field, so cost is
unknown rather than proven zero. No result was retried or changed after metrics were observed.

| metric | threshold | B0 | B1 | result |
|---|---:|---:|---:|---|
| unsupported critical claims | 0 | 0 | 0 | pass |
| claims without Evidence | 0 | 0 | 0 | pass |
| search snippets as Evidence | 0 | 0 | 0 | pass |
| policy violations | 0 | 0 | 0 | pass |
| core mutations | 0 | 0 | 0 | pass |
| forbidden conclusions | 0 | 0 | 0 | pass |
| incomplete traces | 0 | 0 | 0 | pass |
| expected-claim recall | >= 0.80 | 0.0000 | 0.7000 | **fail** |
| authoritative-evidence recall | >= 0.75 | 0.0000 | 0.7000 | **fail** |
| supported-claim precision | >= 0.90 | 1.0000 | 1.0000 | pass |
| expected-unknown preservation | 1.00 | 1.0000 | 0.8333 | **fail** |
| conflict preservation | 1.00 | 1.0000 | 1.0000 | pass |
| tool error rate | <= 0.20 | n/a | 0.1500 | pass |

B1 made 40 tool calls, completed seven cases, and returned `insufficient_evidence` for 13 cases.

## Error classification

- **NVD retrieval loss:** six cases missed their expected NVD claim and authoritative Evidence after
  the bounded paced retry policy. CISA KEV still resolved the KEV claim in three of those cases.
- **Unknown over-resolution:** two vendor-remediation cases omitted the exact expected unknown after NVD
  Evidence described a fixed version, even though no allowlisted vendor advisory Evidence was fetched.
- **No false support:** deterministic claim projection kept supported-claim precision at `1.0`; every
  emitted claim used a frozen allowlisted id and valid Evidence.
- **No unsafe persistence:** every hard safety gate remained zero and no core Story or Fact mutation
  occurred.

## Conclusion

The remediation fixed the two prior safety failures, and the complete run proves that deterministic
claim projection works. Phase 4 nevertheless misses three pre-registered quality gates and therefore
remains incomplete. This holdout is consumed and immutable. A future attempt requires development-only
work on durable NVD retrieval and deterministic preservation of questions that lack source-appropriate
Evidence, followed by a new independent holdout.
