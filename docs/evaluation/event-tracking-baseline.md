# Phase 5 event tracking holdout baseline

Date: 2026-10-10

Dataset: `datasets/event-tracking/holdout.jsonl` (26 cases, SHA256
`a5c6be8218d7af23ffe5b210fd1dddf5162cced8ad24cd4e1d20b0289a78ccea`)

This is the single authorized final run against the frozen holdout. The dataset is immutable from this
point on; a failed or consumed holdout would be kept as-is and any remediation would require a new
disjoint holdout.

## Label provenance — MODEL_REVIEWED, not human gold

The holdout was labelled by three independent model reviewers on three different model families
(`glm-5.3-flash`, `deepseek-v4.1-flash`, `kimi-k3-2`), each covering every candidate case through the
existing receipt and budget boundary. Only cases accepted unanimously at high confidence by all three
reviewers were frozen. `datasets/event-tracking/holdout-manifest.json` records the reviewer identities,
the 46 review receipt ids, the holdout and threshold hashes, and the explicit limitation. These labels
are model review, not human gold.

Review process facts:

- The original 24-case candidate was reviewed in batches of one or two cases; the first six-case batch
  attempt timed out and was not reused (receipt 1, `unknown`). A later two-case attempt died with its
  receipt left stale-pending and was marked `unknown` by the standard recovery path (receipt 2). Both
  receipts are preserved as failure evidence; neither review was used.
- Four original `stale-or-nonmaterial` cases (001–004) were excluded from the freeze because the
  reviewers were not unanimous at high confidence: their evidence carried an NVD URL while keeping the
  development template's `cisa_advisory` source type. The reviewed labels were not changed.
- A disjoint six-case `stale-or-nonmaterial` supplement was constructed from the development template
  with consistent CISA advisory identities, reviewed by the same three models, and unanimously accepted
  at high confidence. Frozen strata: 4/4/4/4/4 and 6 (stale-or-nonmaterial).
- Review usage (46 completed receipts): 1,487,746 input tokens, 85,082 output tokens; the CodeBuddy CLI
  reported no provider cost, so recorded cost is $0.

## Final replay

`python scripts/run-event-tracking-development.py --cases datasets/event-tracking/holdout.jsonl` ran the
actual Python tracking graph against the fixture gateway (empty or declared-error responses; no network,
no injected Evidence, no model calls, no paid receipts).

## Results

| Metric | Result | Pre-registered gate |
|---|---:|---|
| Unsupported material changes | 0 | 0 |
| Material changes without Evidence | 0 | 0 |
| Invalid question resolutions | 0 | 0 |
| Policy violations | 0 | 0 |
| Core (Story/Fact/grouping/digest) mutations | 0 | 0 |
| Stale commits | 0 | 0 |
| Duplicate commits | 0 | 0 |
| Forbidden conclusions | 0 | 0 |
| Incomplete trace provenance | 0 | 0 |
| Material-change recall | 1.00 | >= 0.90 |
| Supported-change precision | 1.00 | >= 0.95 |
| Question-state accuracy | 1.00 | >= 0.90 |
| Continue/stop decision accuracy | 1.00 | >= 0.90 |
| Interval accuracy | 1.00 | >= 0.85 |

Error classification across all 26 cases:

- Material-change false negatives: 0; false positives: 0.
- Open-question errors (wrongly resolved or wrongly kept open): 0.
- Stop/continue decision errors: 0 (three required demonstrations — vulnerability disclosure ->
  vendor confirmation -> patch, procurement notice -> award, repeated no-progress -> interval
  extension/stop — all replayed with the expected transition class).
- Interval errors: 0.

Operations: total replay latency 16 ms, 20 tool calls, tool error rate 0.20 (the four intentional
tool-failure cases), 0 model tokens, 0 receipts, $0 provider cost.

## Acceptance

`node scripts/eval-event-tracking.ts` against the pre-registered `datasets/event-tracking/thresholds.json`
reports `passed: true` with no failures.

## Limitations

- The labels are MODEL_REVIEWED, not human gold; reviewer disagreement on the source-identity mismatch
  shows the review is not a rubber stamp, but consensus among three models is weaker evidence than human
  adjudication.
- The replay uses the frozen fixture gateway. It proves semantic transition behavior and safety
  boundaries, not live-source recall or production prevalence.
- The frozen dataset, candidate, supplement, review outputs, and the two unknown receipts are the complete
  audit trail; none of them may be edited after this run.
