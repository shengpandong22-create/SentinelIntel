# Ablations and comparisons — what is admissible, what is not

Phase 8 records comparisons, it does not manufacture them. A numeric comparison appears below only
when **both sides** share the frozen cases (or an explicitly paired dataset), the split, the labels,
the scorer, the metric definition and a compatible system boundary, with recorded model/provider
settings. Everything else is marked `NOT_COMPARABLE`, `NOT_RUN` or `HISTORICAL_ONLY`.

There is deliberately **no B0 → B5 curve**. The design's B0–B5 framing is a suggested experimental
sequence across different capabilities with different datasets and scorers; stringing those numbers
into one monotonic "improvement" line would be fabricated comparability.

## 1. Admissible comparisons

### A1 — Research Agent: snapshot-only (B0) vs bounded agent with external evidence (B1)

| Property | Value |
|---|---|
| Cases | the same 20 frozen holdout cases (`datasets/security-research/holdout-v4.jsonl`, sha256 `ffb0ebaf...`) |
| Split | holdout |
| Labels | identical `MODEL_REVIEWED` labels, unchanged between arms |
| Scorer | `scripts/eval-security-research.ts` with `datasets/security-research/thresholds-v4.json` |
| Difference | B0 answers from the Story snapshot only; B1 may call the allowlisted external tools |
| Model/provider | same configured model route; the report records receipts and token usage |

| Metric | B0 | B1 | Gate |
|---|---:|---:|---|
| Expected-claim recall | 0.0000 | 1.0000 | ≥ 0.80 |
| Authoritative-evidence recall | 0.0000 | 1.0000 | ≥ 0.75 |
| Supported-claim precision | 1.0000 | 1.0000 | ≥ 0.90 |
| Unsupported critical claims | 0 | 0 | 0 |
| Claims without Evidence | 0 | 0 | 0 |
| Unknown preservation / conflict preservation | 1.0000 / 1.0000 | 1.0000 / 1.0000 | 1.00 |

This is a genuine paired ablation on one frozen holdout with one scorer: adding evidence acquisition
lifts recall from zero (the snapshot carries no external citations) to full coverage **without**
losing precision, unknowns or conflicts. Caveat: B0 is a deliberately crippled boundary, not a
different model, so the delta measures the value of the tool boundary — not "a better model".

### A2 — Selection: threshold-only re-scoring on the development split

| Property | Value |
|---|---|
| Cases | the same 155 development cases, identical model decisions |
| Scorer | `scripts/eval-selection.ts` (deterministic re-scoring of already-computed scores) |
| Difference | thresholds `60 / 65 / 76` → `32 / 55 / 60` |
| Labels | identical |
| Leakage | **yes** — the development split was used to choose the thresholds |

| Metric (development, 147 decisive) | Before | After |
|---|---:|---:|
| Accuracy | 0.619 | 0.878 |
| Precision | 0.967 | 0.985 |
| Recall | 0.345 | 0.798 |
| F1 | 0.509 | 0.882 |

Admissible as a **threshold** ablation, inadmissible as an unbiased performance estimate: the same
split selected the thresholds. The independent check is the holdout (§J of `selection.md`), which has
one result and no paired "before" arm — the pre-calibration thresholds were never run on the holdout,
so no holdout delta exists and none is claimed.

## 2. Not comparable

| Comparison someone might attempt | Why it is invalid |
|---|---|
| Phase 1 accuracy / F1 vs Phase 2 macro F1 vs Phase 3 claim recall | Different tasks, datasets, label sets, class structures and scorers. |
| Phase 5 development (24 cases) vs Phase 5 holdout (26 cases) | Same scorer, different datasets and different case construction; the holdout is not an "improvement" over development. |
| Impact v5 row_recall 0.67 vs v16 row_recall 1.00 | Different datasets (v5 consumed, v16 disjoint), different scorer revisions (revision 2 vs 12) and different label constraints; the denominators are 3 vs 1. |
| Impact v8 quality 1.00 vs v16 quality 1.00 | v8 was a 2-case safety run under revision 4a; v16 is the 4-case gate under revision 12. Same-looking numbers, different questions. |
| Synthetic normalization fixture holdout (23 cases, all 1.00) vs the v16 end-to-end gate | Different system boundaries (drafts→routes vs full pipeline) and the fixture is `HISTORICAL_ONLY`. |
| Tracking replay latency 16–32 ms vs any live latency | The replay excludes all network and provider work. |
| Grouping Stage A/B/C numbers as a single "grouping F1" | Three different stages with different denominators; Stage C recall is a diagnostic replay rate, not a product recall. |
| Any token / cost figure across phases | Only per-run receipt totals exist; providers did not report monetary cost, so cross-phase cost comparison is undefined. |

## 3. Not run

| Candidate ablation | Status | Reason |
|---|---|---|
| `keyword/full-text` vs `vector-only` vs `hybrid` retrieval | `NOT_RUN` | The implemented system has one retrieval path. Building alternatives to produce an ablation is prohibited in Phase 8 and was never part of the product. |
| Reranker / CrossEncoder on the grouping or research path | `NOT_RUN` | Same reason; AGENTS.md forbids introducing such infrastructure without evidence that the design needs it. |
| Single-agent vs multi-agent decomposition | `NOT_RUN` | The system is a deterministic pipeline with three bounded agents, not a multi-agent swarm; there is no second architecture to compare. |
| Grouping: with vs without the pair-confirmation judge | `NOT_RUN` | The diagnostic (18/18 confirmations) shows the judge never disagreed, but no no-judge arm was executed and the per-pair data is not committed. |
| Impact: normalization-only vs full extraction on the same cases | `NOT_RUN` | The fixture holdout has drafts; the E2E cases have real evidence. They are different datasets, so a paired arm would require a new dataset and paid runs. |
| Retrieval/quality ablations on selection thresholds against the holdout | `NOT_RUN` | Re-tuning on the holdout would consume the only held-out split. The five holdout false negatives are frozen evidence, explicitly not a tuning input. |

## 4. What Phase 8 changed

Nothing in the measured systems. No prompt, model route, threshold, routing rule, receipt, budget,
holdout, label or frozen report was modified. This document only records what already existed.
