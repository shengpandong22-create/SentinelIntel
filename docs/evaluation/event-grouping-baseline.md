# Phase 2 event-grouping baseline

Date: 2026-10-08
Status: `MODEL_REVIEWED` holdout baseline; not human gold

## Dataset and provenance

- Frozen dataset: 240 cases (`development` 180, `holdout` 60), with the exact 16-stratum allocation.
- Holdout labels: unanimous, high-confidence review by at least three independent models. They are recorded as `model-reviewed`; `humanGold` is `false`.
- The holdout was frozen before the final Stage B/C baseline was observed. The final validator checks split/report-group isolation, stable report fingerprints, chronology, the 14-day recall window, relation-to-identity consistency, decisive-only labels and per-stratum quotas.
- The original human-adjudicated requirement remains an explicitly accepted deviation. These numbers must not be represented as human-gold performance.

## Baseline results

| stage | holdout result | interpretation |
|---|---:|---|
| A — candidate recall | 60/60, recall@10 `1.000` | deterministic lexical branch; no embedding-provider claim |
| same-URL diagnostic | identity fold `true`; article fold `true` | normalized-URL shortcut works in the scratch fixture |
| B — relation classification | accuracy `0.750`; macro-F1 `0.629` | unchanged production batch judge |
| C — story replay | precision `1.000`; recall `0.095`; F1 `0.174` | zero false merges, but 38 false splits |
| pair confirmation diagnostic | 18/18 remained `SAME_OCCURRENCE` | every low-similarity batch merge was admitted by confirmation |

Stage B per-class results:

| relation | precision | recall | F1 | support |
|---|---:|---:|---:|---:|
| `SAME_OCCURRENCE` | 0.625 | 0.833 | 0.714 | 18 |
| `SAME_STORY` | 0.750 | 0.857 | 0.800 | 21 |
| `UNRELATED` | 1.000 | 1.000 | 1.000 | 12 |
| `ROUNDUP` | 0.000 | 0.000 | 0.000 | 9 |

There were no distractors in the frozen holdout, so the related-only and with-distractors matrices are identical.

## Error taxonomy

Stage B made 15 errors:

- Roundup collapse: all 9 roundup cases were missed; 6 became `SAME_OCCURRENCE`, 3 became `SAME_STORY`.
- Occurrence/story boundary: 3 `SAME_OCCURRENCE` cases became `SAME_STORY` (one same-CVE cross-source, one CERT republication, one multi-vendor same-CVE case).
- Lifecycle collapsed to occurrence: 3 `SAME_STORY` cases became `SAME_OCCURRENCE` (two procurement corrections, one policy draft/final pair).
- `UNRELATED` was perfect at 12/12.

Stage C produced no false merges and 38 false splits. The attributable within-case false splits were:

| stratum | false splits |
|---|---:|
| same CVE, cross-source/different URL | 9 |
| CERT republication | 3 |
| policy amendment/implementation date | 3 |
| procurement correction/cancellation | 3 |
| procurement notice/award | 3 |
| same CVE, multi-vendor product | 3 |
| advisory revision/republication | 3 |
| PoC/disclosure | 3 |
| policy draft/final | 3 |
| disclosure/patch | 2 |
| cross-case same-story pairs | 3 |

The end-to-end verdict distribution was `new-story: 104`, `new-fact-in-story: 2`, `same-fact: 3`. The dominant baseline failure is therefore conservative splitting, not over-merging. The confirmation model is not the immediate bottleneck: every one of its 18 invoked pairs confirmed the batch decision.

## Paid-run receipts

The final Stage B, Stage C and pair diagnostic used the configured production model `deepseek-flash` through the normal `llm` receipt and budget path:

- 96 unique paid attempts, 0 failures;
- 145,274 input tokens and 18,238 output tokens;
- 118,286 ms aggregate provider latency.

Stage B used receipts 61–120. Stage C used 121–138. The pair diagnostic reused the 60 Stage B receipts and added confirmation receipts 139–156; reused receipts are not double-counted in the totals above.

## Reproduction artifacts

The detailed machine-readable reports are intentionally gitignored under `.data/eval/`:

- `event-grouping-holdout-stage-a.json`
- `event-grouping-holdout-stage-b.json`
- `event-grouping-holdout-stage-c.json`
- `event-grouping-holdout-pair-diagnostic.json`

The canonical frozen inputs are `datasets/event-relations/dev.jsonl` and `datasets/event-relations/holdout.jsonl`.

## Conclusion

Phase 2 establishes the reproducible baseline; it does not tune production behavior. The evidence supports a later, separately authorized improvement phase focused first on explicit roundup recognition and then on recall-to-attachment behavior that currently causes false splits. No Phase 2 prompt, model route, threshold or deterministic grouping rule was changed in response to these results.
