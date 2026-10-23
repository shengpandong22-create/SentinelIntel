# Tracking Agent — canonical evaluation summary

**Final gate:** the single authorized Phase 5 replay of `datasets/event-tracking/holdout.jsonl`
(26 cases) against `datasets/event-tracking/thresholds.json` — `PASSED`, nine safety counters zero,
five quality metrics 1.00. It was re-verified offline in Phase 8 and reproduces exactly.

Full detail: [`event-tracking-baseline.md`](event-tracking-baseline.md) (final) and
[`event-tracking-development.md`](event-tracking-development.md) (development baseline).
Numbers below come from `docs/evaluation/evidence-registry.json` (`TRK-*`, `SYS-*`).

## 1. Task and user value

A tracked Story carries open questions ("has the vendor shipped the fix?", "did the award happen?").
The agent checks whether new public material changed anything, updates question state, records the
change with its Evidence, and decides when to check again. Value: readers see a Story that moves —
vendor confirmation → patch, notice → award — without a human re-reading every source each day.

## 2. Evaluated system boundary

The real Python tracking graph (LangGraph) with a **frozen fixture gateway** embedded in each
dataset row: no network, no model call, no receipt, no injected Evidence. The replay isolates
semantic transition behaviour and safety boundaries from live-source availability. It does not
measure live-source recall, production prevalence, or the editorial/grouping layers.

## 3. Dataset and split

| Item | Value |
|---|---|
| Dataset | `datasets/event-tracking/holdout.jsonl` |
| Split | `holdout` (26 cases; `development.jsonl` has 24 separate cases) |
| Strata | 4/4/4/4/4 across the original strata plus 6 `stale-or-nonmaterial` |
| Candidate / exclusions | 30 candidates reviewed; 4 excluded (see §10) |

## 4. Label provenance

`MODEL_REVIEWED` — **not human gold**. Three independent reviewers on three model families
(`glm-5.3-flash`, `deepseek-v4.1-flash`, `kimi-k3-2`) reviewed every candidate through the receipt and
budget boundary; only unanimous high-confidence acceptances were frozen. 46 completed review receipts.

## 5. Frozen hashes

| Artifact | SHA-256 |
|---|---|
| Holdout | `a5c6be8218d7af23ffe5b210fd1dddf5162cced8ad24cd4e1d20b0289a78ccea` |
| Thresholds | `b3b20e95b52d9f86eb31a8a786e1b8337275bf4ae9e270c577d7935d90e9a27a` |
| Manifest | `datasets/event-tracking/holdout-manifest.json` (reviewers, 46 receipt ids, both hashes) |

## 6. Scorer and thresholds

`scripts/eval-event-tracking.ts` against `datasets/event-tracking/thresholds.json`: nine exact-zero
safety gates and five quality minimums (change recall ≥ 0.90, supported-change precision ≥ 0.95,
question-state accuracy ≥ 0.90, decision accuracy ≥ 0.90, interval accuracy ≥ 0.85). The thresholds
were written before holdout construction.

## 7. Final metrics with denominators

| Metric | Result | Gate | Denominator |
|---|---:|---:|---|
| Unsupported material changes | 0 | 0 | 26 cases |
| Material changes without Evidence | 0 | 0 | 26 cases |
| Invalid question resolutions | 0 | 0 | 26 cases |
| Policy violations | 0 | 0 | 26 cases |
| Core (Story/Fact/grouping/digest) mutations | 0 | 0 | 26 cases |
| Stale commits | 0 | 0 | 26 cases |
| Duplicate commits | 0 | 0 | 26 cases |
| Forbidden conclusions | 0 | 0 | 26 cases |
| Incomplete trace provenance | 0 | 0 | 26 cases |
| Material-change recall | 1.00 | ≥ 0.90 | 26 cases (changes vary per case) |
| Supported-change precision | 1.00 | ≥ 0.95 | 26 cases |
| Question-state accuracy | 1.00 | ≥ 0.90 | 26 cases |
| Continue/stop decision accuracy | 1.00 | ≥ 0.90 | 26 cases |
| Interval accuracy | 1.00 | ≥ 0.85 | 26 cases |

Error classification: 0 change false negatives, 0 false positives, 0 question-state errors,
0 stop/continue errors, 0 interval errors. The three contract demonstrations (disclosure → vendor
confirmation → patch; notice → award; repeated no-progress → interval extension) all replayed with
the expected transition class.

## 8. Safety results

Every exact-zero gate held across 26 cases, including stale and duplicate commit prevention and the
absence of any Story/Fact/grouping/digest mutation.

## 9. Cost and latency evidence

Zero model tokens, zero receipts and $0 provider cost by construction. The offline replay observed
16 ms of wall clock in the original run and 32 ms when re-run in Phase 8 (`SYS-LATENCY-TRACKING`,
`NOT_COMPARABLE` to live latency). 20 tool calls, tool error rate 0.20 because four cases
intentionally inject tool failure.

## 10. Retained failures

- Two review receipts were left `unknown` (a six-case batch timed out; a two-case attempt died with a
  stale pending receipt). Both are preserved as failure evidence and neither review was used.
- Four `stale-or-nonmaterial` candidates were excluded because reviewers were not unanimous: their
  evidence carried an NVD URL while keeping the development template's `cisa_advisory` source type.
  Labels were not changed; a disjoint six-case supplement with consistent CISA identities was
  reviewed and frozen instead.
- See [`../failure-cases.md`](../failure-cases.md).

## 11. Reproduction commands

```bash
python scripts/run-event-tracking-development.py \
  --cases datasets/event-tracking/holdout.jsonl \
  --out .data/phase8/tracking-holdout-results.jsonl
node scripts/eval-event-tracking.ts \
  --cases datasets/event-tracking/holdout.jsonl \
  --results .data/phase8/tracking-holdout-results.jsonl \
  --thresholds datasets/event-tracking/thresholds.json
```

Phase 8 executed exactly this and reproduced the recorded numbers (quality 1.00, safety zero,
20 tool calls), which is why this capability is `REPRODUCIBLE_FINAL`.

## 12. Limitations and non-claims

- `MODEL_REVIEWED`, not human gold. Reviewer disagreement on source identity shows the review is not
  a rubber stamp, but three-model consensus is weaker than human adjudication.
- The fixture gateway proves transition semantics and safety, **not** live-source recall or
  production prevalence.
- Do not read the 1.00 figures as "the agent never misses an update on the open web".
