# Evidence-driven hardening plan

Status: `DEVELOPMENT_GATE_PASSED`
Branch: `codex/evidence-driven-hardening`  
Scope: strengthen existing behavior only; no new product capability and no frozen-holdout tuning.

## 1. Why this pass exists

Phase 1–8 and the post-soak fixes established the product surface, safety boundaries and operational
recovery path. This pass does not add another Phase. It uses the committed evidence registry, failure
cases and soak report to find the smallest changes that improve an already implemented capability.

## 2. Triage

| Candidate | Evidence | Current classification | Action |
|---|---|---|---|
| Event grouping conservatively splits related reports | Stage C precision `1.000`, recall `0.095`, 38 attributable false splits; all 9 roundup cases missed | Verified quality weakness; safety-sensitive | Select as the first optimization target. Work only on development data; preserve the consumed holdout. |
| Dual-score disagreement | Seven-day operational diagnostic: 37 pairs, mean absolute gap `11.54`, 5 threshold crossings | Operational observation, not yet a proven decision defect | Do not change prompt or threshold yet. Build a labelled development replay before proposing policy changes. |
| MSRC body extraction | Soak observed 0/77 confirmed bodies; the merged adapter now uses the official API and has a focused regression | Verified historical defect, already fixed | Re-verify in the next bounded no-model source check; no redesign. |
| Receipt congestion and stale analysis jobs | Soak/backlog closeout plus focused regressions | Verified historical defects, already fixed | Keep as regression coverage; no further implementation without a new reproduction. |
| Missing human gold | Evidence registry labels are `MODEL_REVIEWED` | Evaluation limitation, not a code defect | Deferred owner/human-labelling task. Never disguise it as an implementation fix. |

## 3. Selected target: event grouping recall

The target is the existing relation/grouping capability, not a new Agent. The hard safety invariant is
zero false merges on the consumed holdout. Any recall-oriented change must therefore fail closed and
must not be promoted from development evidence alone.

### Development-only experiment contract

1. Use only `datasets/event-relations/dev.jsonl`; never read final holdout outcomes while tuning.
2. Record the current production prompt, model route, code commit, dataset hash, provider receipts,
   token usage and latency before testing a candidate.
3. Report Stage B per-class precision/recall/F1 and Stage C false merges/false splits. Do not report an
   aggregate accuracy alone.
4. First candidate is limited to explicit `ROUNDUP` recognition because the committed failure table
   shows 0/9 holdout recall and the design already defines this relation. Do not change Story identity,
   URL folding, candidate recall or database schema in the same experiment.
5. Promotion gate on development: `ROUNDUP` recall improves, `SAME_OCCURRENCE` and `SAME_STORY`
   precision do not regress by more than 0.02, and Stage C introduces zero new false merges.
6. A development pass authorizes a separately pre-registered, disjoint future validation set; it does
   not authorize rerunning or relabelling the consumed holdout and does not change canonical metrics.

### Provider safety

- The owner authorized real model calls for this hardening pass.
- Calls must use the existing receipt and database-budget path; collection and all Agent gates remain
  disabled.
- Start with the smallest stratified development slice that contains positive `ROUNDUP` cases and
  confusable non-roundup controls. Stop on an unknown receipt, repeated malformed output, budget
  exhaustion without forward progress, or a serious provider failure.
- One diagnosis and one safe alternative are the retry limit. Raw keys and `.data/` results are never
  committed.

### Development attempt log

`roundup-precedence-candidate` was preregistered above and run on the same seeded 40-case development
slice as the baseline (`seed=8`: 9 ROUNDUP positives and 31 confusable controls). The prompt-only
precedence wording did **not** improve ROUNDUP recall: baseline and candidate were both `0/9`. It also
reduced SAME_STORY F1 from `0.435` to `0.364`; therefore this candidate is rejected and will not be
promoted. Both runs completed 39 receipts with zero provider failures. Raw reports stay in ignored
`.data/hardening/` and their receipt/token/latency summaries will be copied into the final audit.

One final development alternative is allowed before closing this target: make the already-required
multi-topic check explicit in the structured decision schema (`multi_topic_side` plus
`contained_item`) so the model must classify each side before choosing the relation. This does not add
a new relation or deterministic override; the relation remains the model's output. It uses the same
seeded slice and the same promotion gates. If ROUNDUP recall remains zero or another class breaches the
gate, stop tuning and retain the production baseline.

The structured alternative passed the preregistered 40-case gate. ROUNDUP moved from precision /
recall / F1 `0 / 0 / 0` to `0.667 / 0.444 / 0.533` (4/9 recalled). SAME_OCCURRENCE precision moved
from `0.571` to `0.667`, and SAME_STORY precision from `0.313` to `0.417`; neither precision gate
regressed. Overall accuracy moved from `0.650` to `0.725`, while macro-F1 moved from `0.502` to
`0.661`. The baseline used 39 receipts / 64,263 total tokens / 233,948 ms provider latency; the
structured candidate used 39 receipts / 75,890 total tokens / 271,220 ms. These are development
observations, not replacements for the canonical holdout metrics.

The two new decision fields retain `NONE` / `false` parser defaults for older cached responses and the
existing deterministic test fixtures. New prompts require the fields explicitly, and a response that
does provide a positive containment check with a non-ROUNDUP relation is rejected fail-closed. This
keeps the public behavior compatible without silently accepting a contradictory new-format decision.

The first Stage C replay stopped after one provider `no_json` failure. The single permitted safe retry
completed and produced zero false merges, but also `0/16` true attachments on this slice. This satisfies
the safety gate but demonstrates that the structured relation improvement does **not** solve the wider
recall-to-attachment weakness. The candidate is therefore limited to ROUNDUP relation classification;
Stage C conservative splitting remains an accepted, explicitly reported limitation for a later disjoint
development experiment. No consumed holdout was rerun.

## 4. Acceptance and reporting

For every attempted fix, preserve a before/after table, exact command, code/dataset hash, receipts and
failure cases. A failed candidate remains documented. Production prompts, thresholds and routing stay
unchanged until the development gate passes and a new validation contract exists.

