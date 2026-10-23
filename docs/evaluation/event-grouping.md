# Event grouping — canonical evaluation summary

**Final gate:** the Phase 2 frozen-holdout baseline (240-case dataset; 60-case holdout) scored by
`scripts/eval-event-grouping.ts` across Stages A/B/C — the recorded baseline is the last word for this
capability; no later run replaced it. It is a **diagnostic baseline**, not a tuned gate: the numbers
describe the production grouping path and were not used to change any prompt, model route, threshold
or deterministic rule.

Full detail: [`event-grouping-baseline.md`](event-grouping-baseline.md) (results) and
[`event-grouping-plan.md`](event-grouping-plan.md) (design and strata). Numbers below come from
`docs/evaluation/evidence-registry.json` (`GRP-*`, `SYS-*`).

## 1. Task and user value

Readers should see one event, not ten reports of it. The grouping pipeline clusters reports of the
same occurrence, attaches follow-ups to the right Story, and ranks events by independent-source heat.
Value: a Story page that reflects how many independent sources are actually discussing the same thing,
with follow-ups attached instead of duplicated.

## 2. Evaluated system boundary

The production grouping path: deterministic candidate recall (lexical/URL branch), the production
batch relation judge (`deepseek-flash`), the story replay with the confirmation judge, and the
deterministic identity/heat rules. Not evaluated here: the editorial writer, the research/tracking/
impact agents, and the web presentation layer.

## 3. Dataset and split

| Item | Value |
|---|---|
| Datasets | `datasets/event-relations/dev.jsonl` (180), `datasets/event-relations/holdout.jsonl` (60) |
| Split | `holdout` for all reported numbers |
| Strata | 16 strata with a frozen allocation |
| Distractors | none in the frozen holdout (the related-only and with-distractor matrices are identical) |

## 4. Label provenance

`MODEL_REVIEWED` — **not human gold**. Holdout labels are unanimous high-confidence reviews by at
least three independent models; `humanGold` is `false`. The original human-adjudication requirement
remains an explicitly accepted deviation.

## 5. Frozen hashes

| Artifact | SHA-256 |
|---|---|
| Development | `dc6e7d7fb303ef27ccd0a23a45d95f8dd321a8c333f3cb999bf7056bc94d1834` |
| Holdout | `438afbf05d7a79f1c29401176aa454dc2bff13efba793264d923bc7e8aced53f` |

No separate threshold file: the Phase 2 evaluation is diagnostic.

## 6. Scorer and thresholds

`scripts/eval-event-grouping.ts` (`--stage recall|relation|story`), with the frozen dataset,
`--split holdout` and the production model configuration. Stage A also replays deterministic code
against a scratch `*_test`/`*_ci` database.

## 7. Final metrics with denominators

| Stage | Metric | Result | Denominator |
|---|---|---:|---|
| A | candidate recall@10 | 1.000 | 60/60 cases |
| B | relation accuracy | 0.750 | 60 cases (15 errors) |
| B | macro F1 (4 classes) | 0.629 | support 18 / 21 / 12 / 9 |
| B | `SAME_OCCURRENCE` P / R / F1 | 0.625 / 0.833 / 0.714 | 18 |
| B | `SAME_STORY` P / R / F1 | 0.750 / 0.857 / 0.800 | 21 |
| B | `UNRELATED` P / R | 1.000 / 1.000 | 12 |
| B | `ROUNDUP` P / R | 0.000 / 0.000 | 9 |
| C | story precision | 1.000 | 0 false merges |
| C | story recall | 0.095 | 38 false splits |
| C | story F1 | 0.174 | — |

Verdict distribution: `new-story: 104`, `new-fact-in-story: 2`, `same-fact: 3`. The dominant failure
is conservative splitting, not over-merging.

## 8. Safety results

Stage A identity folding (`identityFold: true`, `articleFold: true`) held in the scratch fixture.
Stage C produced **zero false merges** on 60 cases, which is the safety-relevant property: an event
is not polluted by unrelated reports. No forbidden conclusion or mutation check applies at this layer.

## 9. Cost and latency evidence

96 unique paid attempts, 0 failures; 145,274 input + 18,238 output tokens; 118,286 ms aggregate
provider latency (≈1,232 ms per attempt). Receipts 61–120 (Stage B), 121–138 (Stage C) and 139–156
(pair confirmation); reused receipts are not double-counted. The gateway reported no monetary cost.

## 10. Retained failures

- All 9 roundup cases were missed (6 became `SAME_OCCURRENCE`, 3 `SAME_STORY`).
- 3 `SAME_OCCURRENCE` cases were promoted to `SAME_STORY`; 3 `SAME_STORY` cases collapsed to
  `SAME_OCCURRENCE`.
- 38 attributable false splits, concentrated in same-CVE cross-source (9), CERT republication (3),
  policy amendment (3), procurement correction (3), notice/award (3), multi-vendor same-CVE (3),
  advisory revision (3), PoC disclosure (3), policy draft/final (3) and disclosure/patch (2).
- See [`../failure-cases.md`](../failure-cases.md).

## 11. Reproduction commands

```bash
node scripts/eval-event-grouping.ts --split holdout --stage recall
node scripts/eval-event-grouping.ts --split holdout --stage relation --models default
node scripts/eval-event-grouping.ts --split holdout --stage story
```

Stages B and C need live paid model calls and the per-pair decisions are not committed, so the
capability is `REPRODUCIBLE_PARTIAL`: dataset, scorer and strata are reproducible offline; the model
verdicts are not.

## 12. Limitations and non-claims

- `MODEL_REVIEWED`, not human gold; the human-adjudicated requirement was explicitly waived by the owner.
- No distractors in the holdout, so precision is measured only against related candidates.
- Stage A measures a lexical branch only; no embedding-provider claim is made.
- The pair-confirmation judge confirmed every one of its 18 invoked merges, so it is not the current
  bottleneck; that says nothing about pairs it never saw.
- Do not read `recall 0.095` as "the product merges 9.5% of events": it is the rate at which the
  replay re-derives the frozen Story assignment, dominated by conservative splitting.
