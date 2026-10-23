# Phase 8 — Final Evaluation & Resume Package

Status: **PLANNING — scope and acceptance contract only**

Base: `main@6cdac54` (Phase 7 squash merge, pull request #9)

This document is the Phase 8 contract. Creating it does **not** authorize a fresh holdout run, paid
model call, external collection, relabelling, threshold change, product-code change, or resume metric.
Those actions require the evidence audit and the gates in §8.

## 1. Objective

Turn the already completed Phase 1–7 work into one reproducible final evidence package:

- canonical evaluation summaries for selection, event grouping, research, tracking, and product impact;
- an honest ablation/comparison record;
- a failure-case catalogue that preserves unsuccessful and consumed runs;
- architecture documentation matching the implemented system;
- README/project claims whose numbers point to reproducible repository evidence.

Phase 8 is primarily **evaluation consolidation and documentation**, not another feature phase.

## 2. Required outputs

The migration specification requires these final paths:

```text
docs/evaluation/selection.md
docs/evaluation/event-grouping.md
docs/evaluation/research-agent.md
docs/evaluation/tracking-agent.md
docs/evaluation/product-impact.md
docs/evaluation/ablations.md
docs/failure-cases.md
docs/architecture.md
README.md
```

Existing detailed reports remain immutable historical evidence. Canonical summaries link to them and
do not silently replace, rename, or rewrite frozen results.

## 3. Evidence sources already available

| Capability | Canonical evidence to audit | Label limitation |
|---|---|---|
| Selection | `docs/evaluation/selection.md`, `datasets/selection/` | model-reviewed/owner-adjudicated; not human gold |
| Event grouping | `event-grouping-baseline.md`, `event-grouping-plan.md`, `datasets/event-relations/` | `MODEL_REVIEWED`; lexical recall limitation |
| Research Agent | `security-research-baseline-v4.md` plus retained v1–v3 reports, `datasets/security-research/` | `MODEL_REVIEWED`; not human gold |
| Tracking Agent | `event-tracking-baseline.md`, `event-tracking-development.md`, `datasets/event-tracking/` | `MODEL_REVIEWED`; not human gold |
| Product Impact Agent | `impact-e2e-baseline.md`, `impact-development-demonstrations.md`, retained impact reports and `datasets/impact/` | v16 is closing gate; `MODEL_REVIEWED`; not human gold |
| System/operations | receipts, committed manifests, test reports recorded in `IMPLEMENTATION_STATUS.md`, Git/CI history | only committed or reproducibly queried facts may be reported |

The first implementation task is an evidence registry mapping every final numeric claim to its source
file, dataset/hash, scorer version, command, split, label method, and limitations.

## 4. Scope

### 4.1 Canonical evaluation summaries

Each capability summary must use the same headings:

1. task and user value;
2. evaluated system boundary;
3. development and holdout datasets;
4. label provenance (`HUMAN_GOLD`, `MODEL_REVIEWED`, synthetic fixture, or other exact status);
5. frozen hashes and scorer/threshold versions;
6. final metrics and denominators;
7. safety results;
8. cost/latency only where evidence exists;
9. retained failures and corrections;
10. reproduction commands;
11. limitations and non-claims.

Canonical summaries may quote existing final results. They may not recompute a different metric under
the old name or describe development results as holdout results.

### 4.2 Ablations and comparisons

The design's B0–B5 sequence is a suggested experimental framing, not permission to fabricate a single
monotonic score. A comparison is admissible only when both sides use:

- the same frozen cases or an explicitly paired dataset;
- the same labels and split;
- the same scorer and metric definition;
- compatible system boundaries;
- recorded model/provider settings and run conditions.

If these conditions are absent, `ablations.md` must say `NOT_RUN` or `NOT_COMPARABLE`. It may still
record qualitative architecture differences and phase-local experiments, but must not present them as
measured improvement.

Retrieval ablations (`vector-only`, keyword/full-text, hybrid, reranker) are not required merely because
the design lists them. The implemented system did not introduce those alternatives; no new retrieval
stack may be built in Phase 8 to manufacture an ablation.

### 4.3 Failure cases

`docs/failure-cases.md` must retain representative failures across the pipeline, including:

- selection provenance/coverage limitations;
- grouping false merge/false split or diagnostic cases;
- research evidence insufficiency and source/tool failures;
- tracking missed/false material-change cases where recorded;
- Product Impact v1–v15 correction history, without treating consumed holdouts as reusable data;
- provider/schema/timeout, receipt, cache, and platform-specific failures;
- whether each failure was fixed, accepted, deferred, or remains a limitation.

Every entry names its evidence file/commit and distinguishes observed behavior from inference.

### 4.4 Architecture

Update `docs/architecture.md` additively to describe the implemented SentinelIntel V2 extension:

- deterministic AIHOT ingestion/editorial/grouping/publication base;
- TypeScript API/worker and Python Agent runtime boundary;
- Research, Tracking, and Product Impact responsibilities;
- TypeScript model/tool gateway, receipts, budgets, capabilities, timeouts, and allowlists;
- PostgreSQL state, Evidence lineage, human-review routing, and publication read model;
- Phase 7 Story/Admin/API/MCP exposure;
- safety switches and read-path rule that page views never invoke models or external tools.

Preserve upstream attribution and the original architecture facts. Do not claim infrastructure that is
not present.

### 4.5 README and resume-safe claims

README changes must clearly separate:

- the upstream AIHOT framework and attribution;
- the SentinelIntel V2 security-intelligence extension;
- reproducible demonstrated capabilities;
- known limitations and label provenance.

A numeric README/resume claim is allowed only when the evidence registry points to a committed report,
dataset/hash, exact metric definition, and reproduction command. Otherwise use a qualitative statement.
Do not call any benchmark human-labelled or human gold unless that requirement was actually satisfied.

No private deployment data, secrets, `.data` file, local database content, or unverifiable production
performance number may be used.

## 5. Explicit non-goals and prohibitions

Phase 8 must not:

- modify any frozen development/holdout case, label, manifest, threshold, or observed result;
- rerun a consumed holdout;
- tune code, prompts, models, routing, or thresholds against holdout outcomes;
- add product features, Agents, migrations, services, queues, retrieval stacks, or infrastructure;
- change Phase 1–7 production behavior merely to improve final metrics;
- merge metrics from different datasets/scorers into one improvement percentage;
- present `MODEL_REVIEWED` as human gold;
- infer missing token, cost, latency, recovery, or human-review statistics;
- execute paid models, external collection, or a new final evaluation before Gate 3 approval;
- enter post-Phase-8 feature work.

Formatting scripts or read-only report validators are allowed only if they make existing evidence
reproducible and do not alter frozen inputs.

## 6. Evidence audit and proposed evaluation decision

The audit must produce a matrix for the design's required metrics:

- selection: accuracy, precision, recall, F1, token, latency;
- grouping: macro F1, relation precision/recall, story merge/split metrics;
- research: claim correctness, evidence precision, unsupported claim rate, unresolved-question honesty;
- tracking: meaningful-change precision/recall, state/update correctness, missed update rate,
  unnecessary research rate;
- product impact: vendor accuracy, product/model F1, version accuracy, unsupported claim rate,
  evidence coverage;
- system: task success, tool errors/calls, LLM calls, latency, token/cost, human-review rate, recovery.

For every cell record one of:

- `REPRODUCIBLE_FINAL` — committed final result and command exist;
- `REPRODUCIBLE_PARTIAL` — valid but limited boundary/denominator;
- `HISTORICAL_ONLY` — retained consumed or superseded result;
- `NOT_COMPARABLE` — incompatible datasets/scorers;
- `NOT_RECORDED` — no trustworthy evidence;
- `REQUIRES_NEW_RUN` — feasible only through a separately approved run.

The audit, not the migration document's wish list, decides whether a new evaluation is necessary.
Missing evidence is reported honestly; it is not automatically a blocker to an honest final package.

## 7. Acceptance criteria

Phase 8 is complete only when:

1. Phase 7 is recorded as merged at `6cdac54`, with canonical CI passed.
2. An evidence registry covers every numeric statement in the final package.
3. All nine required output paths in §2 exist and agree on final status, hashes, label provenance,
   scorer boundaries, and limitations.
4. Canonical evaluation summaries preserve the existing frozen reports and identify exactly one final
   gate per capability where one exists.
5. `ablations.md` contains only valid paired experiments; missing comparisons are explicitly
   `NOT_RUN`/`NOT_COMPARABLE`.
6. `failure-cases.md` includes both fixed and unresolved failures and links each to evidence.
7. Architecture matches the merged Phase 7 system and preserves all security boundaries.
8. README retains MIT/upstream attribution, does not brand upstream AIHOT as SentinelIntel, and makes
   no unsupported performance or accuracy claim.
9. No frozen artifact changes: their repository blobs/hashes remain identical to `main@6cdac54`.
10. Any newly generated report is reproducible from committed inputs with a documented command.
11. Paid/external runs, if any, have separate pre-registration, explicit owner authorization, receipts,
    frozen inputs, budget limits, and one final-run rule.
12. Documentation links and named files resolve; a validator checks required paths, evidence links,
    frozen-artifact drift, and prohibited claim wording.
13. `npm run typecheck`, relevant documentation/report tests, web build/tests, Docker Compose config,
    and canonical Linux CI pass. A fresh DB migration is required only if runtime tests are added; no
    migration is expected in this documentation/evaluation phase.
14. `docs/IMPLEMENTATION_STATUS.md` records actual outcomes, deviations, deferred work, and the exact
    Phase 8 completion status.

## 8. Execution gates

### Gate 0 — contract review

This planning commit only. No evaluation execution.

### Gate 1 — evidence inventory (free, offline/read-only)

- build the evidence registry;
- verify frozen hashes/blob identity;
- map existing metrics and reproduction commands;
- enumerate gaps without filling them by inference.

### Gate 2 — package construction (free, offline/read-only)

- write canonical summaries, honest ablations, failure cases, architecture, and draft README claims;
- add validators/tests;
- do not execute models or external collection.

### Gate 3 — new-run decision

Present a bounded proposal only for cells marked `REQUIRES_NEW_RUN`, including dataset, split,
scorer, model/provider, expected calls, budget ceiling, success criterion, and stop rule. **Explicit
owner authorization is required before any paid or external run.** Approval of this Phase 8 plan is
not approval of Gate 3.

### Gate 4 — final verification and closeout

- incorporate only authorized, successfully reproduced results;
- otherwise retain `NOT_RECORDED`/limitations;
- run validation and canonical CI;
- close Phase 8 without inventing missing metrics.

## 9. Planned commit sequence

1. `docs: define Phase 8 final evaluation contract`
2. `eval: inventory reproducible SentinelIntel evidence`
3. `docs: consolidate final evaluation reports and failures`
4. `docs: update SentinelIntel architecture and README`
5. optional, only after Gate 3 authorization: separately pre-register and execute a bounded run
6. `test/docs: close Phase 8 acceptance`

## 10. Deferred decisions

These are intentionally not decided by this planning commit:

- whether any missing system-level cost/latency metric justifies a new paid run;
- whether a valid B0–B5 paired ablation can be reconstructed from frozen evidence;
- which resume-facing numbers, if any, are strong enough for README use;
- whether independent human adjudication will ever replace accepted `MODEL_REVIEWED` limitations.

The default is conservative: no new run, no numeric claim, and no implied comparability unless the
evidence audit proves otherwise.
