# Phase 6 product impact holdout baseline

Date: 2026-10-10

Dataset: `datasets/impact/holdout.jsonl` (23 cases, SHA256
`3b2e242ee681b49d5ee957881cd1667039780c9adafc8c26c36558919fe253b5`)

This is the single authorized final run against the frozen holdout. The dataset is immutable from this
point on; a failed or consumed holdout would be kept as-is and remediation would require a new disjoint
holdout.

## Label provenance — MODEL_REVIEWED, not human gold

Three model families on three different stacks (`glm-5.3-flash`, `deepseek-v4.1-flash`, `kimi-k3-2`)
reviewed every candidate case through the existing receipt and budget boundary (receipts 104-139). Only
cases accepted unanimously at high confidence were frozen; `datasets/impact/holdout-manifest.json`
records reviewer identities, receipt ids, the excluded case, and both hashes, plus the explicit
not-human-gold limitation.

Review process facts (failure evidence preserved under `.data/impact/rejected-first-round/`):

- Round 1 (12 receipts, 80-91) was rejected almost wholesale by GLM because candidate evidence carried
  no content — a URL and a hash cannot support an affirmative impact claim. This was a real candidate
  defect, not reviewer strictness.
- The evidence contract gained frozen `title`/`excerpt` fields (additive, both runtimes), development
  was rebuilt with real advisory content and replayed (still all gates green), and round 2 (receipts
  92-103) surfaced a second real defect: CVE ids had been swapped in labels while evidence content
  still described the original CVEs.
- Round 3 rebuilt the candidate with synthetic but self-consistent advisory content bound to fresh CVE
  ids (receipts 104-115 GLM, 116-127 DeepSeek, 128-139 Kimi).
- The codebuddy hourly budget breaker fired mid-round-three and was respected by waiting for the
  window to slide; it was not bypassed.
- Exactly one case, `IMP-HOLD-UNRESOLV-001`, was excluded: DeepSeek correctly refused a template whose
  product attribution ("PAN-OS" under a Fortinet vendor) contradicted the frozen evidence. The reviewed
  label was not changed; the case stays out of the freeze and the remaining two unresolvable-range
  cases keep the stratum covered.

## Final replay

`python scripts/run-impact-development.py --cases datasets/impact/holdout.jsonl` ran the deterministic
normalization graph only (frozen drafts in, proposal out; no network, no model call, no receipt).
`node scripts/eval-impact.ts --holdout` then scored it against the pre-registered
`datasets/impact/thresholds.json`.

## Results

| Metric | Result | Pre-registered gate |
|---|---:|---|
| Unsupported claimed range | 0 | 0 |
| PoC status other than unknown | 0 | 0 |
| known_exploited yes without KEV evidence | 0 | 0 |
| Low-confidence row persisted as claims | 0 | 0 |
| Row on an expected-empty case | 0 | 0 |
| Vendor extraction accuracy | 1.00 | >= 0.90 |
| Product precision / recall | 1.00 / 1.00 | >= 0.90 |
| Version-range accuracy | 1.00 | >= 0.90 |
| Confidence-routing accuracy | 1.00 | >= 0.85 |
| Decision accuracy | 1.00 | >= 0.90 |
| Exploit-status accuracy | 1.00 | >= 0.90 |
| Unknown honesty | 1.00 | >= 0.95 |

Operations: 23 normalization runs, 0 tool calls, 0 model tokens, $0 provider cost.

## Acceptance

`acceptance.passed = true` with no failures.

## Limitations

- Labels are MODEL_REVIEWED, not human gold. The three review rounds show the review is not a rubber
  stamp, but three-model consensus is weaker evidence than human adjudication.
- The holdout measures the deterministic normalization half of the pipeline (drafts in, routed rows
  out) on frozen evidence. The live model-gateway half of the extraction round trip is fail-closed,
  receipt-bound, and exercised by tests and one manual replay — not by this benchmark.
- Frozen candidate, review outputs (including both rejected rounds), and receipts are the complete
  audit trail; none of them may be edited after this run.
