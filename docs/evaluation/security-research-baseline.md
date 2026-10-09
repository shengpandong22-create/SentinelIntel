# Phase 4 Security Research Agent baseline

Status: **FINAL_GATE_FAILED — frozen `MODEL_REVIEWED` holdout, no human gold**

Date: 2026-10-09

## Frozen inputs

- Holdout: `datasets/security-research/holdout.jsonl`, 20 cases across all six strata.
- Holdout SHA-256: `12785d3307e25f48f254ae768cdbcd65901df76ef06b74a8b9b3a7087e1de52f`.
- Reviewers: `deepseek-flash`, `deepseek-v4-pro`, and `glm-5.3-flash`.
- All 20 cases were accepted by all three reviewers. The first and third reviewers returned 20 high
  confidence decisions. The second returned 17 high and three medium decisions for conservative
  revision/unknown labels.
- Thresholds were frozen before holdout construction; their hash and the review receipt ids are recorded
  in `datasets/security-research/holdout-manifest.json`.

This is model-reviewed evaluation data, not human gold.

## Final execution outcome

The authorized final B0/B1 evaluation used a new scratch database and a four-request hard budget, with
five frozen cases per request. The first two requests completed. The third response was persisted in
receipt `3` and rejected by the strict proposal schema. Per the pre-registered protocol, execution
stopped; the response was not silently repaired, discarded in favor of a retry, or used to tune the
prompt. The fourth request was not sent.

Coverage was therefore 10/20 valid B0/B1 results, five schema-rejected cases, and five unexecuted cases.
This is not a complete quality estimate. Phase 4 does not pass its final acceptance gate.

### Valid 10-case prefix

| metric | B0 | B1 |
|---|---:|---:|
| unsupported critical claims | 0 | **3** |
| claims without Evidence | 0 | 0 |
| search snippets used as Evidence | 0 | 0 |
| policy violations | 0 | 0 |
| core mutations | 0 | 0 |
| forbidden conclusions | 0 | 0 |
| incomplete traces | 0 | 0 |
| expected-claim recall | 0.0000 | 0.4444 |
| authoritative-evidence recall | 0.0000 | 0.4444 |
| supported-claim precision | 1.0000 | 0.7273 |
| expected-unknown preservation | 1.0000 | 1.0000 |
| conflict preservation | 1.0000 | 1.0000 |
| tool error rate | 1.0000 (no calls) | 0.4545 |
| tool calls | 0 | 22 |
| model tokens | 0 | 23,690 |
| distinct receipts | 0 | 2 |

The B1 prefix already fails the exact-zero unsupported-critical-claim gate. Three CVE-detail cases emitted
critical KEV claims that were evidenced but were outside those cases' frozen expected claim sets.

### Rejected third response

The rejected five-case response used 14,788 tokens. Four cases emitted a noncritical claim saying that a
KEV lookup returned no evidence, with an empty `evidence_ids` array. That is precisely the prohibited
conversion of absence into a factual claim. The schema rejected the response before a proposal could be
accepted or persisted.

## Error classification

- **False support / scope expansion:** three critical KEV claims outside the frozen expected set in the
  valid prefix.
- **Evidence-boundary violation:** four negative KEV-absence claims with no Evidence in the rejected
  response.
- **Missed evidence:** expected-claim and authoritative-evidence recall were both 0.4444 in the valid
  prefix, driven primarily by NVD adapter failures.
- **Tool reliability:** 10 of 22 tool calls in the valid prefix failed; failures were NVD timeouts or
  `TypeError` outcomes. KEV and the two Cisco advisory paths still returned authoritative Evidence.
- **Unknown handling:** every expected unknown in the valid prefix was preserved.
- **Conflict handling:** no required conflict was lost in the valid prefix, but the incomplete run does
  not support a holdout-wide conflict conclusion.
- **Cost:** the provider returned token usage but no monetary cost field, so dollar cost is unknown rather
  than proven zero.

## Conclusion

The deterministic safety boundary worked: invalid claims were rejected and no core Story/Fact state was
mutated. The research Agent itself did not meet the pre-registered safety or quality contract. Phase 4
must remain incomplete. Any remediation must be developed on development data and evaluated on a new,
independently frozen holdout; this consumed holdout must not be used for prompt or threshold tuning.
