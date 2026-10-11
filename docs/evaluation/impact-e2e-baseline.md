# Phase 6 end-to-end holdout baselines — retained evidence, v7 consumed FAILED, v8 gate pending

Date: 2026-10-11 (revision 4a of the evaluation)

Seven end-to-end holdout generations have been consumed during the Phase 6 evaluation correction. All
stay frozen exactly as consumed. **None of them is the Phase 6 end-to-end gate**: the actual gate is
the single authorized run of holdout v8 under the revision-4a runner and scorer.

## v6 — consumed as a live smoke/pilot result, NOT the gate (scorer defective)

Dataset: `datasets/impact/e2e-holdout-v6.jsonl` (2 cases after a rule-mandated exclusion, SHA256
`3d8f8038819660e15dd7cd0b3f0bfaaeb17efc882e4a4883cb326cfa4b108dee`, MODEL_REVIEWED by
`glm-5.3-flash` / `deepseek-v4.1-flash` / `kimi-k2.8-preview`, receipts 161-163, unanimous
high-confidence; IMP-E2E6-HOLD-003 was excluded when Kimi withheld high on a factual claim the official
CISA feed disproves — both CVE-2021-38648 and -38647 are catalog members, verified against the seeded
feed). The single authorized run completed the full TypeScript → Python → TypeScript →
scratch-database pipeline without runtime failure.

Audit findings on the v6 report (all confirmed):

- `cross_story_evidence`, `absence_unaffected`, `gateway_bypass`, `stale_version_commits` were
  initialized to zero and never detected;
- `unsupported_claim`, `kev_yes_without_evidence`, `low_confidence_claim`, `forbidden_row` were
  required by the thresholds but never output;
- receipt/trace validation counted any recent `service='llm'` receipt instead of the run's own
  receipt, and never checked provider outcome;
- the Fact invariance claim covered three Story fields only, not Facts or Story-Fact links;
- both cases allowed any main outcome with `min_rows: 0` / `unknowns_min: 0`, and a
  `insufficient_evidence` outcome scored row recall 1 instead of being excluded from the denominator;
- the runner never read the thresholds or adjudicated pass/fail.

The two cases remain valid evidence that the pipeline runs end to end and persisted a high-confidence
claims row (CVE-2024-43451, Windows) and a legitimate insufficient_evidence with preserved unknowns
(CVE-2019-0604). They do not establish gate compliance.

## v7 — consumed, FAILED the gate (per-case label defect + second scorer defect)

Dataset: `datasets/impact/e2e-holdout-v7.jsonl` (4 cases, frozen, SHA256
`8b45bec4d13f7890201908630e5f9ba05026dc69a8583abd81f81311c5901ab8`, MODEL_REVIEWED by
`glm-5.3-flash` / `deepseek-v4.1-flash` / `kimi-k2.8-preview`, review receipts 9-11 in
`sentinel_phase6_v7_ci`, unanimous high-confidence; the Kimi review exceeded its 360 s window once and
was resolved by one audited admin retry under the receipt protocol). The single authorized run of the
complete pipeline completed on a fresh scratch database (`sentinel_phase6_v7_ci`) after a
development-set live smoke passed with all thirteen safety counters zero and all quality metrics 1.0.

Run outcome (`.data/impact/e2e-v7-results.json`): the aggregate revision-4 scorer reported all
thirteen safety counters zero and all five quality metrics 1.0 — but the post-run per-case audit found:

1. **IMP-E2E7-HOLD-001 violated its frozen `min_rows: 1`.** The extraction verbatim-quoted the
   advisory's affected condition (`"Cisco IOS XE Software if the web UI feature is enabled"`), which
   the deterministic matcher cannot parse; under revision-4 semantics the row correctly routed to
   human review with an explicit unknown instead of persisting a claims row. The behavior is
   contract-correct — the frozen label (`decisions=["propose"]` with `min_rows=1`) over-specified what
   model quoting behavior cannot guarantee. The three-model review unanimously accepted that label,
   which shows it was not determinable a priori.
2. **The revision-4 scorer still had a gap: per-case assertion errors did not gate.** Aggregate
   metrics stayed above threshold while a frozen floor was violated — the same "aggregate green,
   per-case red" shape the audit had removed once already.

Verdict: v7 is **consumed as FAILED** and stays frozen exactly as run. Remediation (revision 4a,
committed before v8 construction): the scorer now fails on any per-case assertion error, and holdout
labels must use outcome sets robust to model quoting behavior — hard guarantees are carried by the
safety detectors and grounded-KEV expectations, not by min_rows claims that depend on whether the
model returns a version expression or null.

## The Phase 6 end-to-end gate — holdout v8, single authorized run, pending

Candidate: `datasets/impact/e2e-holdout-v8-candidate.jsonl` (UNREVIEWED until three-model review).
Scoring: `datasets/impact/thresholds-v2.json` revision 4a with the revision-4a runner
(`scripts/run-impact-e2e.ts`): all thirteen hard safety counters with real assertions, receipts linked
exactly by `run_id + trace_id + receipt_id`, full Story row + Facts + Story-Fact link snapshots,
non-persisting outcomes excluded from the row-recall denominator, and a fail-closed scorer that
adjudicates aggregate thresholds AND per-case assertions, exiting non-zero on any failure.

Required demonstrations and their cases:

| Demonstration | Case | Hard assertion |
|---|---|---|
| KEV-grounded claims record with product keyword | IMP-E2E8-HOLD-001 | `known_exploited=yes` grounded in stored KEV evidence; row keywords scored by recall when rows persist; outcome set robust to quoting behavior |
| Unsupported version format → unknown + human review | IMP-E2E8-HOLD-002 | global `unsupported_claim = 0` (prose ranges must route to review, never auto-claims) |
| Stale version rejection | IMP-E2E8-HOLD-003 | global `stale_version_commits = 0` (supported ranges must be grounded verbatim in cited evidence; the Story title carries a stale sentence extraction never sees) |
| Non-security negative | IMP-E2E8-HOLD-004 | deterministic skip before any run, receipt, or persistence; byte-identical Story snapshot |

Deliberate scope note: the conflict-evidence → downgrade and cross-Story evidence → rejection
demonstrations are not fabricatable as single-Story live e2e cases (a live run acquires Story-local
evidence only; a genuine cross-Story citation is a corruption the store must reject). They are
deterministically demonstrated by the offline normalization fixture strata `conflicting-statements`
and by the TS store's Story-locality validation and unit tests, and every v8 case additionally runs
the cross-story and conflict-routing detectors (`cross_story_evidence`, `routing_inconsistent`,
`low_confidence_claim`, `forbidden_row` — a conflict-capped medium row can never persist as a claim).

Normalization semantics revision 4: a real version expression the deterministic matcher cannot parse
routes its draft to human review with an explicit unknown and never persists as an auto claim. The
offline normalization fixture holdout (23 cases) retains its pre-revision-4 frozen expectations as
consumed evidence only and is not re-runnable as a gate without a newly constructed fixture holdout.

## Earlier generations — retained failure/progress evidence

- **v1** (`e2e-holdout.jsonl`, 3 cases, receipts 140-142): FAILED — thin MSRC evidence produced zero
  grounded rows for CVE-2022-30190; repeat-skip assertion mishandled review-only outcomes.
- **v2** (`e2e-holdout-v2.jsonl`, 2 of 3 frozen, receipts 143-159 era): FAILED — candidate construction
  swapped CVE ids without syncing evidence content; caught and fixed before v3.
- **v3** (`e2e-holdout-v3.jsonl`, 2 of 3 frozen, receipts 148-153 + admin-audited retry): FAILED on
  row_recall 0.5 — AND-semantics expected keywords omitted the product word the model legitimately
  normalized to (CVE-2021-1675 → "Windows"). All safety counters zero.
- **v4** (`e2e-holdout-v4.jsonl`, 3 cases, receipts ~19-29 of the e2e run): FAILED — KEV live lookups
  failed intermittently because node fetch does not use the system proxy; led to the KEV catalog cache
  (migration `0045`, `lookupKevPersistent`, seeded from the official feed).
- **v5** (`e2e-holdout-v5.jsonl`, 3 cases, receipts 157-159): FAILED on row_recall 0.67 under the
  revision-2 definition — one case took the legitimate insufficient_evidence outcome.

## Limitations

- Labels are MODEL_REVIEWED (three families), not human gold.
- The extraction half of the round trip uses the live model through the receipted gateway; the
  benchmark freezes its drafts only for the normalization fixture holdout (23 cases, retained).
- The revision-4 safety metrics are only as strong as their detectors; the detector definitions are
  documented in `thresholds-v2.json` revision 4 and reviewed with this document.

## Status

Phase 6 end-to-end gate: v7 consumed as FAILED (frozen, retained); v8 candidate constructed with
quoting-robust labels and revision-4a gates; pending three-model review, freeze, and the single
authorized run; canonical Linux CI afterwards.
