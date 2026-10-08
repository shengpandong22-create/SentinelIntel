# SentinelIntel V2 — Project Handoff

> Purpose: this file is the durable restart point for SentinelIntel.  
> When resuming after switching projects, a new long-running session, or a different coding agent, read this file first instead of reconstructing state from chat history.

> **Current-state override (2026-10-08):** Phase 3 was merged to `main` at `7282efd`; canonical Linux
> run `37755597908` passed both jobs. Phase 4 implementation is active on
> `phase/4-security-research-agent`; deterministic callback checkpoint 2 is complete, but no live research
> adapter, model call, paid call, or benchmark case has started. Sections
> 4–14 below preserve the earlier Phase 2 design snapshot and are historical where they conflict with
> this override. The active Phase 4 contract is
> `docs/00-sentinelintel/05-Phase4-Security-Research-Plan.md`.

## 0. How to use this handoff

Before changing code:

1. Verify the repository and branch:
   - repository: `shengpandong22-create/SentinelIntel`
   - current implementation branch: `phase/4-security-research-agent`
   - Phase 4 planning base: `main` at or after `7282efd`
2. Read, in order:
   - `SENTINELINTEL_HANDOFF.md`
   - `docs/IMPLEMENTATION_STATUS.md`
   - `docs/00-sentinelintel/05-Phase4-Security-Research-Plan.md`
3. Verify the current branch head instead of assuming the SHA in an old conversation is still current.
4. Classify evidence explicitly:
   - `REPO_VERIFIED`: directly supported by repository code/history/tests.
   - `LOCAL_OBSERVED`: observed in one local environment and not asserted as universal production truth.
   - `INFERENCE`: reasoned conclusion from verified facts.
   - `PROPOSED`: approved or candidate design that is not yet implemented.
5. Do not silently advance phases. A phase transition is an owner decision.

This handoff is intentionally conservative. If this file conflicts with newer committed evidence, the newer repository state wins and this handoff must be updated.

---

## 1. Project identity and goal

SentinelIntel is the security-focused evolution of the upstream AIHOT codebase.

Upstream:

`KKKKhazix/AIHOT`

SentinelIntel repository:

`shengpandong22-create/SentinelIntel`

Audited upstream baseline:

`f6c2952a9984d4840442558be114ac959b512b0c`

Baseline tag:

`aihot-baseline-f6c2952`

Core product direction:

- retain the mature AIHOT collection / selection / grouping / publishing platform;
- verticalize the system for security intelligence;
- measure the inherited grouping system before changing it;
- then add structured Agent capabilities only after benchmark evidence establishes the need.

The intended Agent architecture is:

1. Security Research Agent
2. Event Tracking Agent
3. Product Impact Agent

The architectural control rule is:

> **Agent proposes; deterministic backend commits.**

Agents must not receive arbitrary SQL, shell, or unrestricted HTTP execution authority.

---

## 2. Phase map

The planned project phases are:

| Phase | Name | Status |
|---|---|---|
| 0 | Baseline Audit & Freeze | ACCEPTED |
| 1 | Security Verticalization | ACCEPTED_WITH_LIMITATIONS |
| 2 | Security Event Grouping Benchmark | COMPLETE_WITH_MODEL_REVIEWED_HOLDOUT_AND_BASELINE_LIMITATIONS |
| 3 | Python Agent Foundation | COMPLETE |
| 4 | Security Research Agent | IMPLEMENTATION_IN_PROGRESS — STUB_CALLBACK_LOOP_COMPLETE |
| 5 | Event Tracking Agent | NOT STARTED |
| 6 | Product Impact Agent | NOT STARTED |
| 7 | UI / Admin / MCP | NOT STARTED |
| 8 | Final Eval & Resume Package | NOT STARTED |

**Hard gates satisfied:** Phase 2 was accepted before Phase 3 began, and Phase 3 was accepted and merged
before Phase 4 planning began.

---

## 3. Frozen accepted history

### 3.1 Phase 0 — Baseline Audit & Freeze

Accepted tag:

`sentinelintel-phase0` → `1deb09084487d781482e9ec6c2c232e7dab0c9b9`

Phase 0 established and froze the AIHOT baseline. It was accepted with documented environment limitations rather than pretending the original audit environment was fully green.

Canonical record:

`docs/00-sentinelintel/03-Phase0-Baseline-Audit.md`

Do not rewrite Phase 0 history.

### 3.2 Post-Phase-0 portability fix

Merged to `main` at:

`2938249b57e821b73424b0ad26981b52459bde25`

The fix was deliberately narrow:

- Windows SSR dynamic import portability;
- MCP tool-name prefix portability.

Canonical Linux CI passed after this fix.

### 3.3 Phase 1 — Security Verticalization

Accepted `main` / tag state:

`225e0f6473de8ac2b827c1ce34d4888a2111ac54`

Tag:

`sentinelintel-phase1`

Status:

`ACCEPTED_WITH_LIMITATIONS`

Phase 1 verticalized the industry configuration to security and produced the security selection benchmark and evaluation. It did **not** implement Agents, retrieval changes, or event-grouping changes.

Frozen production selection thresholds:

- `T1 = 32`
- `T1_5 = 55`
- `T2 = 60`
- `understandFloor = 50`

Final Phase 1 holdout:

- n = 45
- decisive = 43
- accuracy = 0.884
- precision = 1.000
- recall = 0.808
- F1 = 0.894

Important limitation:

The delivered Phase 1 benchmark is `MODEL_REVIEWED`, not independent human gold. The original 150–250 human-labelled-gold requirement was not satisfied; the owner explicitly accepted this as a documented deviation. Do not relabel it as human gold later.

No further Phase 1 selection tuning is authorized. The accepted thresholds and the Phase 1 selection prompts remain frozen.

---

## 4. Current branch and current Phase 2 state

Current phase:

**Phase 2 — Security Event Grouping Benchmark**

Branch:

`phase/2-security-event-grouping`

Base:

`main = 225e0f6473de8ac2b827c1ce34d4888a2111ac54`

Repository state audited immediately before this handoff file was created:

`41656ae5aa1bd9a89410a90f7be41e26a33f224b`

At that snapshot, the branch was 3 commits ahead of Phase 1 `main`, and the only Phase 2 changes were documentation:

- modified: `docs/IMPLEMENTATION_STATUS.md`
- added: `docs/evaluation/event-grouping-plan.md`

No Phase 2 benchmark data, harness, evaluation seam, grouping prompt change, threshold change, or production grouping behavior change had been implemented yet.

The committed Phase 2 design concludes:

`READY_FOR_PHASE2_BENCHMARK_IMPLEMENTATION_REVIEW`

That means **implementation may start**, subject to the constraints below. It does **not** mean Phase 2 is accepted or that the benchmark has been scored.

---

## 5. What Phase 2 is trying to answer

The Phase 2 question is not “how can grouping be made smarter?”

The question is:

> **Where does the current security grouping pipeline fail: candidate recall, relation classification, deterministic policy, or data coverage?**

The Migration Spec gate is explicit:

> **Measure first. Only if the report demonstrates a problem may grouping prompt / recall behavior be changed.**

Therefore Phase 2 must first produce a reproducible benchmark and baseline report.

Do not pre-commit to CrossEncoder, RRF, query routing, GraphRAG, parent-child chunking, or any other retrieval architecture.

---

## 6. Phase 2 baseline audit — facts that must not be lost

### 6.1 The historical “370 labelled pairs” numbers are not reproducible

The repository contains comments referring to 370 labelled pairs and 170 real root pairs, but the actual dataset, schema, provenance, and labels are absent from the repository and git history.

Verdict:

`NOT_REPRODUCIBLE`

These historical numbers may be cited only as evidence that the upstream authors had measured a grouping problem. They may **not** be used as the SentinelIntel Phase 2 baseline and must not be reconstructed by guesswork.

### 6.2 There is no existing event-grouping evaluation harness

Existing selection tooling is unrelated to the event benchmark.

In particular:

- `scripts/eval-selection.ts` is a binary selection evaluator;
- `scripts/regroup-events.ts` is an operational grouping tool, not an evaluation harness;
- `tests/events.test.ts` proves grouping invariants using hardcoded model answers, not relation accuracy.

Therefore Phase 2 needs a new event-grouping evaluation harness.

### 6.3 Recall path observations must be labeled correctly

The grouping implementation has separate embedding and lexical recall behavior.

The repository does **not** prove which branch a deployment runs.

The audited local environment lacked the embedding credentials needed for the embedding path, so its observed grouping recall path was lexical fallback.

This is `LOCAL_OBSERVED`, not a universal production fact.

Every benchmark report must state which recall branch actually ran.

---

## 7. Frozen Phase 2 benchmark contract

Primary benchmark size:

- total: **240**
- development: **180**
- holdout: **60**

The primary allocation contains 16 strata.

Per-class totals:

| Relation | Total | Dev | Holdout |
|---|---:|---:|---:|
| SAME_STORY | 96 | 69 | 27 |
| SAME_OCCURRENCE | 46 | 34 | 12 |
| UNRELATED | 64 | 52 | 12 |
| ROUNDUP | 34 | 25 | 9 |
| **Total** | **240** | **180** | **60** |

The authoritative per-stratum allocation is in:

`docs/evaluation/event-grouping-plan.md` §7.5

### 7.1 Relation vocabulary

The benchmark uses exactly the four production relations:

- `SAME_OCCURRENCE`
- `SAME_STORY`
- `UNRELATED`
- `ROUNDUP`

There is no fifth `AMBIGUOUS` relation.

Disputed or insufficient material belongs in an annotation/review pool, not in the frozen decisive benchmark.

### 7.2 Annotation provenance is candidate-level

Each candidate owns its own:

- `gold.relation`
- annotation status
- label source
- labeller
- confidence
- human adjudication state
- adjudicator
- source URLs
- note

Do not replace this with a case-level “human adjudicated” flag.

The holdout requirement is per candidate.

### 7.3 Event/story identity is report-level

Each report carries:

- `identity.eventKey`
- `identity.storyKey`

The validator must enforce the relation ↔ identity contract:

- `SAME_OCCURRENCE` → same event, same story
- `SAME_STORY` → different event, same story
- `UNRELATED` → different story
- `ROUNDUP` → identity unconstrained

`ROUNDUP` must not be auto-treated as “same story”.

### 7.4 Anti-leakage split identity

`splitGroupId` is an anti-leakage key only. It is not event identity.

Split assignment is performed globally at `splitGroupId` level during dataset construction and then frozen.

The harness validates the split; it does not re-decide the split.

A `splitGroupId` may never be divided merely to satisfy a quota.

### 7.5 Decisive-only frozen files

`dev.jsonl` and `holdout.jsonl` must contain decisive candidate labels only.

Disputed / insufficient candidates stay outside the frozen benchmark because an unsettled candidate inside a batch prompt can change model answers for neighboring candidates.

### 7.6 Same-URL behavior is diagnostic, not a primary benchmark stratum

Literal same-URL duplicates are handled deterministically before the semantic grouping problem.

Therefore identical normalized URL handling is a deterministic diagnostic / integration test, not one of the 240 primary semantic cases.

### 7.7 Time rebasing is mandatory

A frozen benchmark must not expire as the wall clock advances.

For recall and end-to-end fixtures:

```
discoveryTimeShift    = evaluationTimeAnchor - datasetReferenceTime
fixture.discovered_at = dataset.ingestedAt  + discoveryTimeShift
fixture.published_at  = dataset.publishedAt + discoveryTimeShift
```

Both timestamps move by the same delta.

Fixtures use:

`backfill = false`

The harness must verify that the report's `discovered_at - published_at` interval is preserved.

Stage A / C must not silently depend on old calendar dates.

---

## 8. Primary classifier and evaluation seam

The Phase 2 **primary classifier** is the production batch judge:

- production path: `judgeBatch`
- prompt: `BATCH_SYSTEM` / `group-batch.md`
- model selector: `modelFor("group")`
- schema: `BatchSchema`

The pair path:

- `PAIR_SYSTEM`
- `modelFor("groupReview")`

is a **confirmation / diagnostic path only**. It must be reported separately and must never be averaged into the primary relation matrix.

The approved implementation seam is deliberately minimal and non-runtime:

Allowed:

- expose the existing private batch judge unchanged;
- add a thin wrapper that calls that exact production judge;
- optionally expose the pair judge for the diagnostic table;
- expose recall constants needed for report metadata.

Forbidden:

- prompt edits;
- model-choice edits;
- temperature or token-budget edits;
- routing edits;
- threshold edits;
- production behavior changes.

The seam exists only so the benchmark can measure the production behavior that already exists.

---

## 9. Required Phase 2 metrics

### Stage A — candidate recall

At minimum:

- recall@K, where production `RECALL_TOP_FACTS = 10`;
- missed-candidate rate;
- breakdown by stratum;
- actual recall branch used.

This stage can be implemented and exercised without paid relation-model calls.

### Stage B — relation classification

Primary output:

- 4×4 confusion matrix;
- per-class precision / recall / F1;
- macro F1;
- SAME_OCCURRENCE precision / recall;
- SAME_STORY precision / recall;
- matrix with and without distractors;
- schema fallback counters;
- model / prompt version;
- token and latency totals.

The pair judge is reported separately as a diagnostic only.

### Stage C — end-to-end story grouping

At minimum:

- pairwise story merge precision / recall;
- false-merge examples;
- false-split examples;
- grouping verdict distribution;
- deterministic gate counters;
- security failure taxonomy by stratum.

Pairwise merge P/R is the current approved primary story metric. B-cubed is deferred.

---

## 10. Baseline variants

Use evidence-preserving baselines only.

### B0 — current production grouping

Current pipeline unchanged:

recall → batch judge → confirmation → deterministic grouping rules

This is the actual baseline.

### B1 — oracle candidate set

Supply the frozen candidate set to the same production batch judge and bypass recall.

The difference between B0 and B1 isolates recall loss.

### B2 — optional recall-branch comparison

Embedding branch with pre-seeded vectors vs lexical fallback.

Run this only if it helps explain a demonstrated recall bottleneck.

Do not confuse these measurement variants with the architecture-stage B0/B1/B2 labels in the broader Tech Design.

---

## 11. What is authorized now

The following Phase 2 implementation work may start without paid-model authorization:

- benchmark schema;
- dataset validator;
- minimal non-runtime evaluation seam;
- offline harness plumbing;
- fixture construction and time-rebasing tests;
- deterministic same-URL diagnostic;
- development candidate construction;
- development annotation workflow;
- free recall-stage execution.

The next implementation should be incremental and independently auditable.

A sensible sequence is:

1. schema + validator;
2. minimal evaluation seam;
3. offline harness + fixtures;
4. development candidate construction;
5. free recall-stage baseline;
6. holdout finalization after human adjudication is available;
7. paid Stage B / C baseline only after explicit authorization.

Do not combine implementation with prompt tuning or retrieval redesign.

---

## 12. Open blockers

Two owner-level blockers remain.

### 12.1 Human holdout adjudication

No human adjudicator has yet been assigned.

This blocks:

- final holdout adjudication;
- final holdout freeze.

It does **not** block schema, validator, evaluation seam, harness, fixtures, development construction, or development annotation.

All 60 holdout cases entering the decisive metrics must be human-adjudicated at candidate level.

### 12.2 Paid model authorization

No paid Phase 2 evaluation is currently authorized.

This blocks:

- paid Stage B relation scoring;
- paid Stage C end-to-end grouping runs;
- any paid embedding run performed as part of the benchmark.

It does **not** block the free recall stage or offline plumbing.

Do not spend API/model budget without explicit owner authorization.

---

## 13. Hard non-goals until the Phase 2 report exists

Do **not** implement or tune any of the following before benchmark evidence demonstrates the need:

- grouping prompt changes;
- grouping threshold changes;
- recall logic changes;
- CrossEncoder;
- RRF / hybrid retrieval;
- query router;
- GraphRAG;
- parent-child retrieval;
- a new Agent;
- Python Agent runtime;
- Phase 3 work.

Also do not tune the benchmark itself to make a proposed algorithm look better.

The benchmark is evidence, not an optimization target.

---

## 14. Test and environment facts

Primary development environment has included Windows.

Canonical acceptance evidence should continue to distinguish:

- Windows local behavior;
- canonical Linux CI behavior;
- repository facts;
- deployment assumptions.

Known Phase 2 baseline invariant tests already run successfully on a scratch database with provider stubs:

- `tests/events.test.ts`: 10 / 10 pass
- `tests/signals.test.ts`: 3 / 3 pass

These tests prove grouping invariants, not semantic relation accuracy.

Before implementing Phase 2 code, use a scratch database ending in `_test` or `_ci` for fixture/eval work and keep production membership untouched.

---

## 15. Project governance / working conventions

These are owner workflow constraints for future sessions:

- inspect current repository evidence before proposing architecture;
- distinguish completed, partially completed, evidence-supported, speculative, and rejected work;
- do not rebuild features that already exist;
- prefer experiments and holdout evidence over architectural intuition;
- coding agents execute a formal scoped task; they do not redesign the project freely;
- independent audit follows implementation;
- branch and commit evidence should be verified rather than copied from an old conversation;
- no default-branch mutation, production action, destructive operation, credential change, or paid model call without explicit authorization.

SentinelIntel should remain independent of any particular orchestration tool. External automation such as AgentRelay may be used to execute and audit tasks, but SentinelIntel's repository state and this handoff remain the durable source for project recovery.

---

## 16. Resume checklist

When returning to SentinelIntel after working on another project:

```text
1. git fetch origin
2. verify current branch and HEAD
3. compare phase/3-python-agent-foundation against main
4. read SENTINELINTEL_HANDOFF.md
5. read docs/IMPLEMENTATION_STATUS.md
6. read docs/00-sentinelintel/05-Phase4-Security-Research-Plan.md
7. confirm the latest Phase 4 planning and authorization state
8. run/inspect the relevant tests before changing code
9. preserve the deterministic/Agent boundary and no-external-network test gate
10. continue only from the smallest Phase 4 slice authorized by the approved contract
```

If the branch has advanced, update this handoff as part of the next accepted checkpoint.

---

## 17. Immediate next action at this snapshot

Current action after Phase 4 deterministic checkpoint 2:

> **Add fixture-first NVD and CISA KEV adapters through the existing TypeScript gateway. Keep live
> development requests behind `AGENT_RESEARCH_NETWORK_ENABLED`; do not begin vendor discovery, generic
> search, real models, paid calls, benchmark construction, holdout freeze, or final evaluation yet.**
