# SentinelIntel Phase 1 — Security Selection Evaluation Record

Status: **COMPLETED_WITH_LIMITATIONS — EVAL COMPLETE**
Frozen thresholds: `T1 = 32 / T1_5 = 55 / T2 = 60` (`industry/selection.ts`)
Owner: not yet accepted. Final acceptance and merge decision are made by the project owner.

This document is the durable record of the Phase 1 selection evaluation. The runtime reports it
summarises stay local (`.data/` is git-ignored, see §M).

---

## A. Scope

- **Phase 1 security selection evaluation only.** It measures the selection pipeline — prefilter →
  two independent scores → the source-tier threshold — against a labelled benchmark.
- It does **not** evaluate event grouping (Phase 2), retrieval, agents, or the writing quality of the
  published copy.
- The evaluation harness is the pre-existing `scripts/eval-selection.ts` (SelectBench). No evaluation
  framework was re-implemented for Phase 1.

## B. Dataset provenance

Primary benchmark: `datasets/selection/candidates.jsonl`.

| Property | Value |
|---|---|
| rows | 200 |
| `development` | 155 |
| `holdout` | 45 |
| `select` | 110 |
| `reject` | 80 |
| `either` | 10 (`either` is excluded from every decisive metric) |
| label marker | `"$label": "MODEL_REVIEWED"` on all 200 rows |
| labeller | `"$labeller": "GPT-5.6 Sol"` |
| unique `caseId` | 200 |

Strata × split (all seven Migration Spec strata are present):

| stratum | development | holdout | total |
|---|---|---|---|
| `vulnerability` | 42 | 13 | 55 |
| `vendor-advisory` | 42 | 13 | 55 |
| `policy` | 23 | 7 | 30 |
| `procurement` | 16 | 4 | 20 |
| `marketing-noise` | 12 | 3 | 15 |
| `irrelevant-IT` | 12 | 3 | 15 |
| `generic-cybersecurity` | 8 | 2 | 10 |
| **total** | **155** | **45** | **200** |

**Annotation provenance — this is not human gold.**

- First pass: **model-proposed** labels.
- Second pass: **model-reviewed** labels.
- Both passes were performed by the **same model family**, so this is **not independent human
  adjudication**. It is a project-internal, reproducible, model-reviewed benchmark.
- Every metric in this document is a **model-reviewed benchmark metric**. It must never be presented
  as human-labelled accuracy or as production accuracy.

An earlier checkpoint of this repository shipped 150 unlabelled candidates
(`"$label": "TODO"`, every `gold.decision = "either"`) covering only four strata. The file was later
extended to the 200-case, seven-stratum, model-reviewed benchmark described above and in
`datasets/selection/README.md`.

## C. Calibration supplement

Separate file: `datasets/selection/tier-calibration.jsonl`. Provenance:
`datasets/selection/tier-calibration-provenance.md`.

| Property | Value |
|---|---|
| rows | 24 |
| `benchmarkSplit` | `calibration` on all 24 rows |
| `12 × T1_5` | all `gold.decision = reject` (`tier-gap-t1_5-negative`) |
| `12 × T2` | all `gold.decision = select` (`tier-gap-t2-positive`) |
| label marker | `"$label": "MODEL_REVIEWED"` on all 24 rows |
| `caseId` overlap with the main benchmark | 0 |

This set is **deliberately constructed and balanced**, not sampled from the natural source
distribution. It exists to obtain evidence about tier-specific false-positive and false-negative
behaviour that the natural distribution did not contain in sufficient quantity. Consequences:

- It was **never** part of the 45-case holdout, and it must not be merged into the holdout.
- Its aggregate accuracy/F1 is **not** a natural-distribution performance estimate and must not be
  presented as one.
- Its only purpose was tier threshold calibration.

## D. Original configuration

Before any calibration, the frozen baseline thresholds were:

```ts
thresholds: { T1: 60, T1_5: 65, T2: 76 },  // understandFloor: 50
```

## E. Development baseline results

Thresholds `60 / 65 / 76`, on the 155-case development split.

```text
n = 155          decisive = 147    either = 8     errors = 0
TP = 29   FP = 1   FN = 55   TN = 62
accuracy = 0.619   precision = 0.967   recall = 0.345   F1 = 0.509
selectedRate = 0.204   goldSelectRate = 0.571
```

Interpretation:

- The baseline was **strongly precision-biased**: precision 0.967 against recall 0.345.
- It **severely under-selected**: it selected 20.4% of cases where the benchmark says 57.1% should be
  selected (147 decisive cases).
- The **prefilter was not the primary bottleneck**. Most positive misses had already passed relevance
  and were lost at the scoring/threshold stage.

## F. Calibration method

1. **The holdout labels were frozen before threshold calibration, and no holdout evidence was used to
   choose the thresholds.** All threshold investigation used the development split and the calibration
   supplement only; no holdout evaluation metric and no holdout error analysis was computed or consulted
   before the thresholds were frozen.

   This is a statement about the *sequence of work*, not about blinding. It must not be read as a claim
   that the holdout was independently adjudicated or blind to the model family that produced it: the
   development and holdout splits of the 200-case benchmark were both labelled by the same model family
   (first pass model-proposed, second pass model-reviewed), so the holdout is a **split-level holdout
   only**. No independent human adjudication stands behind it. Both benchmark annotation passes were
   performed by the same model family; the retained evaluation artifacts do not establish that the
   evaluator itself was the same model family.

   What the retained artifacts support is narrower still: one final holdout report and one corresponding
   SelectBench holdout run still exist (see §M). The history of earlier runs that may have been deleted is
   not recoverable from those artifacts.
2. **Development was used for the threshold investigation.** `scripts/eval-selection.ts` reports a
   threshold sweep (40 → 90 in steps of 2), which shows what each candidate threshold would have done
   on the same fixed decisions. This is a deterministic re-scoring of already-computed scores — it
   changes no model output and no prompt.
3. **A tier-gap supplement** (`datasets/selection/tier-calibration.jsonl`) was added to obtain evidence
   for the tier-specific behaviour the natural distribution did not cover: 12 hard `T1_5` negatives
   (does lowering the T1_5 threshold create false positives?) and 12 hard `T2` positives (does the T2
   threshold suppress genuinely important media reporting?).
4. **The selection prompt was not changed** (`industry/prompts/selection-score.md` is unchanged from
   the Phase 1 security verticalization).
5. **The prefilter prompt was not changed** (`industry/prompts/prefilter.md` unchanged).
6. **Only the source-tier thresholds changed**, from `60/65/76` to `32/55/60`. `understandFloor`
   remains `50`. `industry/selection.ts` was the only code file touched by the calibration commit.
7. **Final frozen thresholds: `T1 = 32`, `T1_5 = 55`, `T2 = 60`.**

## G. Calibrated development results

Frozen thresholds `32 / 55 / 60`, on the same 155-case development split.

```text
n = 155          decisive = 147    either = 8     errors = 0
TP = 67   FP = 1   FN = 17   TN = 62
accuracy = 0.878   precision = 0.985   recall = 0.798   F1 = 0.882
selectedRate = 0.463   goldSelectRate = 0.571
```

Caution on reading this comparison: the change is a **threshold-only** change on a **fixed** set of
model decisions, so it is a re-scoring of the same predictions, not a new model run. It is also
measured on the same development split that was used to choose the thresholds, so it is by
construction an optimistic estimate. The honest independent check is the holdout (§I, §J).

## H. Tier calibration results

Frozen thresholds `32 / 55 / 60`, on the 24-case calibration supplement.

```text
n = 24           decisive = 24     either = 0     errors = 0
TP = 11   FP = 1   FN = 1   TN = 11
accuracy = 0.917   precision = 0.917   recall = 0.917   F1 = 0.917
selectedRate = 0.500   goldSelectRate = 0.500
```

Known calibration errors, both of which are the reason this supplement exists:

- **1 × `T1_5` false positive** — a hard ZDI advisory selected at the lowered `T1_5 = 55` threshold.
- **1 × `T2` false negative** — a hard media report still suppressed at `T2 = 60`.

Reminder: this set is targeted and balanced. 0.917 here is **not** natural-distribution performance.

## I. Final holdout protocol

- The final thresholds `32 / 55 / 60` were **frozen before the holdout was executed**.
- The holdout was **not used for threshold or prompt tuning** at any point before the final run. It
  contributed no label, metric or error case to the calibration in §F.
- One final holdout evaluation was executed after that freeze. The retained artifacts show **one** holdout
  report and **one** corresponding SelectBench holdout run (§M). They cannot show whether some earlier
  holdout run happened and was deleted, so "executed exactly once" is not a claim this repository can
  support; what is supported is that only one holdout result is retained.
- **After the final holdout, no further threshold or prompt tuning was performed.** No calibration
  data was added afterwards and no new benchmark split was created.
- The five holdout false negatives (§K) are **frozen evidence**. They are explicitly **not** a
  permission or an input to tune the threshold further. Re-tuning against them would consume the one split
  that was held back from the calibration; it would not be an independent estimate in the human-adjudicated
  sense, because no such adjudication exists here (§L item 1).

## J. Final holdout results

Frozen thresholds `32 / 55 / 60`, on the 45-case holdout split.

```text
n = 45           decisive = 43     either = 2     errors = 0
TP = 21   FP = 0   FN = 5   TN = 17
accuracy = 0.884   precision = 1.000   recall = 0.808   F1 = 0.894
selectedRate = 0.488   goldSelectRate = 0.605
```

`precision = 1.000` is an **observed point estimate on 21 true positives in a 45-case, model-reviewed
holdout**. It is not a guarantee, an upper bound, or a claim of 100% production precision. With `n = 45`
and 43 decisive cases, the confidence interval around any of these figures is wide.

## K. Failure analysis

### The five holdout false negatives

All five were labelled `select`, were decided `reject`, and **all five had `relevance = pass`** — the
prefilter did not block any of them:

| caseId | stratum | score | relevance | item |
|---|---|---|---|---|
| `SEC-VULN-020` | `vulnerability` | 0 | pass | Adobe Acrobat / Reader advisory (APSB26-141) |
| `SEC-VEND-012` | `vendor-advisory` | 26 | pass | Cisco IOS XR Software Security Hardening Release: September 2026 |
| `SEC-VEND-048` | `vendor-advisory` | 28 | pass | Fortinet server-side request forgery |
| `SEC-VEND-036` | `vendor-advisory` | 27 | pass | Fortinet null pointer dereference in Log Report |
| `SEC-VULN-008` | `vulnerability` | 31 | pass | Botslab G980H Dashcams |

Conclusion supported by this evidence: **the residual holdout errors are downstream
scoring/material-value errors, not prefilter blocking.** The prefilter let every one of them through;
they were lost at scoring or at the tier threshold.

### The prefilter's blocks in the holdout were all correct

Seven holdout cases were `relevance = block`. **Every one of them was `gold.decision = reject`**, and
all seven sit in the noise strata:

| caseId | stratum | gold |
|---|---|---|
| `SEC-MKTG-004`, `SEC-MKTG-008`, `SEC-MKTG-012` | `marketing-noise` | reject |
| `SEC-IRRL-004`, `SEC-IRRL-008`, `SEC-IRRL-012` | `irrelevant-IT` | reject |
| `SEC-GENE-008` | `generic-cybersecurity` | reject |

**Zero `gold = select` cases were blocked.** On this holdout the prefilter produced no false blocks,
which is the direct complement of the statement above.

### What this analysis must not be read as

- It does **not** show that these five cases are mislabelled. Even if some are debatable, the labels
  are frozen and the holdout was not re-read.
- It is **not** a justification for further tuning. A five-case residual on a 45-case holdout is
  inside the sampling noise this benchmark can resolve.
- `SEC-VULN-020` scoring `0` while passing relevance is worth a *separate, future* look at how an
  advisory that the prefilter accepts can score zero — but that is a Phase 2 question, not a licence to
  adjust the frozen thresholds now.

## L. Limitations

1. **The benchmark is MODEL_REVIEWED, not human-labelled gold.** Proposal and second-pass review were
   both done by the same model family. There is **no independent human adjudication** anywhere in this
   dataset.
2. **Same-family annotation.** A second pass by a similar model corrects some first-pass errors but
   shares the first pass's systematic biases; it does not convert model labels into human labels.
3. **The holdout is small** (45 cases, 43 decisive). Point estimates are unstable at this size, and a
   1-case change moves accuracy by roughly ±0.023 and precision by ±0.048.
4. **`precision = 1.000` is finite-sample.** 21 true positives and 0 false positives in 45 cases is not
   evidence of perfect production precision.
5. **The tier calibration supplement is targeted, not natural-distribution.** Its 0.917 accuracy/F1
   describes a deliberately balanced set of hard tier cases and must not be quoted as general
   performance.
6. **Benchmark-to-production distribution shift.** 150 of the 200 benchmark cases came from the configured
   Phase 1 RSS source pack (`industry/sources.json`); the remaining 50 were deliberately added from
   external web sources to cover the `procurement`, `marketing-noise` and `irrelevant-IT` strata the pack
   does not provide (see items 10 and 11). The production stream has a different mix, a different item
   volume, and includes items the benchmark never sampled. The prefilter on production also sees material
   the benchmark did not.
7. **Short material.** Each case carries roughly 240 characters of material
   (`material.bodyOriginal` or `material.bodyZh`), not the full article. This was a deliberate
   copyright constraint (see `datasets/selection/README.md` §3.5). Evaluation conditions are therefore
   thinner than production conditions.
8. **`either` cases are excluded** from decisive metrics (8 in development, 2 in holdout). 10 of the
   200 labels were left ambiguous rather than forced.
9. **No human re-verification pass has been done.** Until a human reviews a sample of these labels, the
   agreement rate between model labels and the owner's own judgement is unknown.
10. **Source provenance is uneven, and 50 rows are not URL-traceable.** The 150 `rss` rows come from the
   ten sources registered in `industry/sources.json` (all ten names match the pack). The 50 `web` rows —
   all 20 `procurement`, 15 `marketing-noise` and 15 `irrelevant-IT` — come from web sources that are
   **not** registered in `industry/sources.json` (EU Public Procurement Portal, SAM.gov, vendor
   newsrooms, AWS/Google/Apple blogs and others), and `industry/sources.json` still holds exactly 10
   sources. Neither benchmark file carries a `url` field, so **no row in either file can be traced to a
   URL from the repository alone**, and the local sampler that produced the 200-row file is git-ignored
   and was not preserved. Any future adjudication of these labels has to work from `sourceName` +
   `title` + material text, not from a retrievable URL.
11. **The benchmark covers strata the running site has no source for.** `procurement`,
   `marketing-noise` and `irrelevant-IT` are present in the benchmark only because the sampler used web
   sources outside the seeded pack. The production source pack still has no procurement source and no
   noise/informational source, so benchmark coverage of those strata does not imply the site will
   encounter them at the same rate — in fact, as configured, it will encounter them less.
12. **The holdout's tier cells are badly unbalanced, so the aggregate holdout mostly measures T1.** The
   45-case final holdout distributes as:

   | tier | n | `select` | `reject` | `either` |
   |---|---|---|---|---|
   | `T1` | 41 | 24 | 15 | 2 |
   | `T1_5` | 2 | 2 | 0 | 0 |
   | `T2` | 2 | 0 | 2 | 0 |

   So the aggregate holdout figures in §J are real, but they validate the frozen overall policy
   **primarily on T1 cases**. The final holdout does **not** independently cover the `T1_5`-negative side
   (no `T1_5` rejects at all) or the `T2`-positive side (no `T2` selects at all). Evidence for those two
   directions comes from the targeted calibration supplement in §H, which is a deliberately balanced set —
   not from the final holdout. A single aggregate holdout F1 must not be read as covering all three tier
   behaviours.
13. **`T2 = 60` is calibrated against security media, but the production T2 source is a different
   publisher.** The production pack's only `T2` source is `FreeBuf 安全资讯`. The 12 `T2`-positive cases in
   the calibration supplement come from `SecurityWeek`, `The Record`, `Dark Reading` and
   `BleepingComputer` — the intersection of the two `sourceName` sets is **empty**. The supplement
   therefore shows that `T2 = 60` behaves sensibly on a set of independent security-media hard positives;
   it does **not** show that `T2 = 60` has been calibrated or validated on the `FreeBuf` positive
   distribution the running site will actually see. `FreeBuf` items appear in the benchmark only as
   `generic-cybersecurity` material.

## M. Reproducibility

Frozen inputs and harness:

| Artifact | Path / value |
|---|---|
| main benchmark | `datasets/selection/candidates.jsonl` (200 rows) |
| calibration supplement | `datasets/selection/tier-calibration.jsonl` (24 rows) |
| supplement provenance | `datasets/selection/tier-calibration-provenance.md` |
| evaluation harness | `scripts/eval-selection.ts` |
| frozen thresholds | `industry/selection.ts` → `{ T1: 32, T1_5: 55, T2: 60 }`, `understandFloor: 50` |
| scoring prompt (unchanged by calibration) | `industry/prompts/selection-score.md` |
| prefilter prompt (unchanged by calibration) | `industry/prompts/prefilter.md` |
| seed | `7` for every recorded run |
| sample size | `--n` equal to the split size (`155` / `24` / `45`) |

SelectBench run IDs. `scripts/eval-selection.ts` imports every run into SelectBench
(`importSelectBenchRun`, actor `script:eval-selection`) and prints `SelectBench run: <id>`; the id is
generated by `packages/backend/src/admin/selectbench.ts:35` as `sb-YYYYMMDD-<6 hex>`. Six runs exist in
the `selectbench_runs` table:

| run id | label | split | n | canonical role |
|---|---|---|---|---|
| `sb-20261003-b99e22` | Phase 1 security development baseline v1 | development | 155 | §E baseline development |
| `sb-20261003-44ccdd` | Phase 1 source-tier gap calibration v1 | calibration | 24 | pre-calibration supplement run (not cited as a result) |
| `sb-20261003-84b518` | Phase 1 threshold-only 32-55-60 development | development | 155 | intermediate re-run, identical metrics to §E |
| `sb-20261003-931c48` | Phase 1 threshold-only 32-55-60 development | development | 155 | **§G calibrated development** |
| `sb-20261003-a8de21` | Phase 1 threshold-only 32-55-60 calibration | calibration | 24 | **§H tier calibration** |
| `sb-20261003-44d43e` | Phase 1 final holdout 32-55-60 | holdout | 45 | **§J final holdout** |

The first two rows of that table are recorded because they were **observed in the
`selectbench_runs` table**, not because the project owner designated them. No run ID in this document
was invented.

**Important reproducibility caveat.** These run IDs live in a **local PostgreSQL container**
(`selectbench_runs`), not in the repository, and the container is disposable. Once it is removed the
IDs are no longer verifiable from the repository. The repository-side artifacts are the two dataset
files above (committed) and the frozen configuration; the per-run reports
(`.data/eval/selection-*.json`) are **not** committed, by repository policy (`.gitignore` ignores
`.data/`, see §7 of the finalization brief). The metrics in §E, §G, §H and §J were read out of those
local report files and re-verified against the `selectbench_runs` rows before being written here.

Re-running any of these runs requires real model calls and receipt-backed reuse of already-paid work;
no run was repeated for this document. Re-running the **holdout** is out of scope by decision (see §I).

### Reproduce a development run

```bash
node --env-file=.env scripts/eval-selection.ts \
  --gold datasets/selection/candidates.jsonl \
  --split development --n 155 --seed 7 --label "reproduce §G"
```

### Reproduce the tier calibration run

```bash
node --env-file=.env scripts/eval-selection.ts \
  --gold datasets/selection/tier-calibration.jsonl \
  --split calibration --n 24 --seed 7 --label "reproduce §H"
```

Do not re-run the 45-case holdout. Its result is frozen evidence (§I).
