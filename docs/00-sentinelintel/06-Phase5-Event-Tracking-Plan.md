# Phase 5 — Event Tracking Agent implementation contract

Status: `IN_PROGRESS`

Checkpoint 1 completed on 2026-10-10: cross-runtime contracts, additive migration `0042`, durable plan
and change stores, deterministic Evidence observation projection, optimistic concurrency, retry
idempotency, the independently disabled Python tracking endpoint, manual TypeScript -> Python ->
TypeScript replay, and the `agent.tracking` queue/schedule boundary are implemented. External research
delta acquisition, benchmark construction, model evaluation, and holdout work remain later checkpoints.

This contract is written before Phase 5 implementation. Phase 5 adds bounded, evidence-backed active
tracking to an existing Story. It does not replace the Story lifecycle, event grouping, digest generation,
or pg-boss scheduling already owned by deterministic TypeScript code.

## 1. Objective

Phase 5 proves that SentinelIntel can maintain a durable tracking plan for a high-value Story, revisit
the plan at a deterministic due time, identify evidence-backed material changes, preserve unanswered
questions, and recommend a bounded next interval or stop decision.

The Agent reasons about what changed and what remains unknown. TypeScript owns eligibility, scheduling,
capabilities, network policy, validation, persistence, and queue behavior.

## 2. Required demonstrations

The accepted phase must reproduce all three migration-spec scenarios:

1. vulnerability disclosure -> vendor confirmation -> patch;
2. procurement notice -> award;
3. no material progress -> longer interval or stop.

Each transition must cite stored Evidence. Absence of a result is not evidence that an event did not
happen.

## 3. Scope

Phase 5 adds:

- additive `tracking_plans` and `tracking_changes` persistence;
- a versioned tracking snapshot and proposal contract shared by TypeScript and Python;
- one bounded Event Tracking Agent graph in the existing Python runtime;
- deterministic TypeScript plan creation, due-plan selection, `agent.tracking` enqueueing, proposal
  validation, optimistic version checks, and persistence;
- reuse of the Phase 4 allowlisted research gateway and stored Evidence boundary;
- interval policies and stop conditions represented as data and enforced by TypeScript;
- fixture-first replay and an evidence-backed development/holdout evaluation;
- an operations report containing quality, safety, latency, token, tool, receipt, and cost results.

The first implementation slice is an explicitly invoked tracking run. Automatic due-plan enqueueing is
added only after proposal validation and idempotent persistence pass in isolation.

## 4. Non-goals

Phase 5 does not:

- replace or reinterpret `stories.status` values `active`, `watching`, or `settled`;
- recalculate event membership, merge/split Stories, or regenerate Story digests;
- implement a scheduler in Python or let the Agent enqueue its own next run;
- add Product Impact analysis, asset inventory, multi-agent coordination, or autonomous delegation;
- grant Python database, provider-secret, arbitrary URL, SQL, shell, or filesystem access;
- expose tracking through public web, REST, RSS, or MCP endpoints;
- treat a search snippet, HTTP miss, tool error, or stale snapshot as a material change;
- modify a frozen holdout after results have been observed.

## 5. Ownership and execution boundary

```text
deterministic TypeScript due-plan selector
  -> pg-boss `agent.tracking` job with plan id + expected version
  -> TypeScript loads immutable Story, plan, prior snapshot, and Evidence
  -> Python identifies open questions and requests allowlisted tools
  -> TypeScript gateway executes tools under a run capability and limits
  -> Python returns a tracking proposal
  -> TypeScript validates Evidence, policy, version, and interval bounds
  -> one transaction appends changes and advances the plan
```

- Python owns semantic comparison, materiality reasoning, open-question updates, and the proposed
  continue/stop decision.
- TypeScript owns clock comparisons, queue uniqueness, retries, interval clamps, optimistic concurrency,
  database transactions, credentials, receipts, budgets, and all durable writes.
- A proposal never directly mutates Story or Fact rows.
- Stale plan versions are rejected or safely reloaded; they are never silently committed.

## 6. Data contract

An additive migration following `0041` will introduce the minimum durable state.

`tracking_plans` records one current plan per Story: status, why-track text, typed open questions,
allowlisted source targets, next/last check times, deterministic interval policy, stop condition, version,
and timestamps.

`tracking_changes` is append-oriented and records the tracking run, change type, summary, before/after
snapshots, distinct Evidence ids, and creation time. A uniqueness key prevents one run from committing
the same proposed change twice.

The Python proposal contains no database authority. At minimum it returns:

- the observed plan version and Story snapshot identity;
- material changes with before/after values and Evidence ids;
- resolved and still-open question ids;
- `continue`, `stop`, or `insufficient_evidence`;
- a reason and bounded interval suggestion;
- complete tool trace, usage, and unknowns.

## 7. Deterministic policy

- Due selection is `status = active` and `next_check_at <= now`, with stable ordering and a bounded batch.
- Queue uniqueness is based on plan id plus plan version.
- Interval suggestions are clamped to a predeclared policy; model output cannot schedule arbitrary dates.
- Retry/backoff for technical failure remains pg-boss behavior and does not count as an event-tracking
  decision.
- A successful no-change check may extend the interval. Repeated no-change checks may stop only when the
  plan's predeclared stop condition is satisfied.
- Tool failure preserves questions and yields `insufficient_evidence`; it cannot resolve a question or
  cause a semantic stop.
- Story status is read-only input. Tracking status is independent.

## 8. Safety switches and limits

Phase 5 will add a tracking execution switch defaulting to false. External research remains separately
guarded by the Phase 4 network switch, and paid calls remain guarded by `MODEL_CALLS_ENABLED`, receipts,
and fail-closed budgets.

Every run has backend-owned limits for rounds, tool calls, documents, bytes, wall time, tokens, and paid
cost. Tests use fixtures and prohibit external sockets. Live and paid checks require explicit invocation
and use a scratch database.

## 9. Evaluation contract

Evaluation is staged and cannot tune against a consumed holdout:

1. deterministic fixtures for persistence, scheduling, concurrency, evidence linkage, no-change, and
   stop-policy behavior;
2. an evidence-backed development set covering the three required demonstrations plus conflicts, tool
   failure, stale snapshots, and non-material updates;
3. a bounded development pilot, if a real model is necessary, followed by threshold preregistration;
4. an independent frozen holdout reviewed by a human or by three independent models and explicitly
   labelled `MODEL_REVIEWED` when it is not human gold;
5. one final authorized holdout run and a durable baseline/error report.

The primary unit is a tracking transition, not an isolated article. Development and holdout cases must
freeze the prior snapshot, candidate new evidence, expected material changes, expected open-question
state, expected continue/stop class, forbidden conclusions, and provenance.

### Metrics

Hard safety gates, all requiring zero:

- unsupported material changes;
- material changes without Evidence;
- questions resolved from search snippets, misses, or tool errors;
- Story/Fact/grouping/digest mutation;
- out-of-policy scheduling or stop decisions;
- incomplete tool traces or bypassed receipts/budgets;
- duplicate commits from retry or stale-version commits.

Quality and operations metrics reported separately:

- material-change precision and recall;
- open-question preservation and resolution accuracy;
- continue/stop accuracy;
- authoritative-evidence recall;
- no-change specificity;
- tool error rate, latency, tokens, tool calls, receipts, and provider-reported cost.

Numeric quality thresholds are set only from development evidence and committed before holdout
construction. No unmeasured improvement may be claimed.

## 10. Implementation order

1. Cross-runtime schemas and fixture tests.
2. Additive migration, store, optimistic concurrency, and idempotency tests.
3. Deterministic plan lifecycle and manual TypeScript -> Python -> TypeScript replay.
4. Reuse of Phase 4 tools under tracking-specific capabilities and limits.
5. `agent.tracking` worker handler and due-plan enqueueing.
6. Evidence-backed development construction, validator, and offline scorer.
7. Development replay/pilot and threshold preregistration.
8. Independent holdout construction, review, freeze, and final evaluation.
9. Documentation, full validation, canonical Linux CI, and Phase 5 closeout.

## 11. Acceptance checklist

Phase 5 is complete only when all items pass:

1. The vulnerability, procurement, and no-progress demonstrations replay end to end with correct durable
   plan state and Evidence-backed changes.
2. Python/TypeScript schemas reject dangling Evidence, invalid question transitions, arbitrary intervals,
   and unsupported terminal decisions.
3. Scratch-database tests prove append-only changes, atomic plan advancement, optimistic concurrency,
   retry idempotency, and no Story/Fact mutation.
4. The worker enqueues only due active plans, uses a stable singleton identity, and leaves scheduling and
   technical retry to deterministic TypeScript/pg-boss code.
5. Tool access is allowlisted and bounded; network, model, receipt, budget, authentication, and trace
   boundaries from Phase 4 remain intact.
6. The benchmark validator, development replay, pre-registered thresholds, immutable holdout, and final
   report are committed without describing model review as human gold.
7. Every hard safety metric is zero and every pre-registered quality threshold passes on the final
   holdout; otherwise the phase remains incomplete and the failed holdout stays frozen.
8. Targeted Python and TypeScript tests, typecheck, empty-database migration, web build/tests, Docker
   Compose configuration, and canonical Linux CI pass.
9. `docs/IMPLEMENTATION_STATUS.md` records commands, results, limitations, deviations, and the exact
   merge-ready state.

## 12. Planned completion state

The phase closes with a bounded Event Tracking Agent and reproducible evaluation evidence. Public
tracking UI/API exposure and Product Impact work remain later phases. Implementation must not begin
until this contract is accepted as the Phase 5 boundary.
