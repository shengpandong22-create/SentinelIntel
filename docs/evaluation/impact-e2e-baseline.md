# Phase 6 end-to-end holdout baselines — retained evidence, v7 gate pending

Date: 2026-10-11 (revision 4 of the evaluation)

Six end-to-end holdout generations were consumed during the Phase 6 evaluation correction. All stay
frozen exactly as consumed. **None of them is the Phase 6 end-to-end gate**: the final consumed run
(v6) passed gates whose scorer was later found defective (audit, 2026-10-11), and the actual gate is
the single authorized run of holdout v7 under the revision-4 runner and scorer.

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

## The Phase 6 end-to-end gate — holdout v7, single authorized run, pending

Candidate: `datasets/impact/e2e-holdout-v7-candidate.jsonl` (4 cases, explicitly UNREVIEWED, not
frozen until unanimous high-confidence review by three independently identified reviewers). Scoring:
`datasets/impact/thresholds-v2.json` revision 4 with the revision-4 runner
(`scripts/run-impact-e2e.ts`), which computes all thirteen hard safety counters with real assertions,
links receipts exactly by `run_id + trace_id + receipt_id`, snapshots the full Story row plus Facts
plus Story-Fact links, excludes non-propose outcomes from the row-recall denominator, and ends with a
fail-closed scorer that exits non-zero below any pre-registered maximum/minimum.

Required demonstrations and their cases:

| Demonstration | Case | Hard assertion |
|---|---|---|
| Complete claims record (product, models, exploit status) on a versionless advisory | IMP-E2E7-HOLD-001 (CVE-2023-20198, Cisco IOS XE Web UI, KEV yes) | `decisions=["propose"]`, `min_rows=1`, row keyword, ≥1 preserved unknown for the versionless affected condition |
| Unsupported version format → unknown + human review | IMP-E2E7-HOLD-002 (CVE-2024-55591, Fortinet FortiOS/FortiProxy, KEV yes) | global `unsupported_claim = 0` (prose ranges must route to review, never auto-claims), `known_exploited=yes` grounded in KEV evidence |
| Stale version rejection | IMP-E2E7-HOLD-003 (CVE-2023-23397, Microsoft Outlook, KEV yes; stale version sentence in the Story title) | global `stale_version_commits = 0` (supported ranges must be grounded verbatim in cited evidence) |
| Non-security negative | IMP-E2E7-HOLD-004 (no CVE) | deterministic skip before any run, receipt, or persistence; byte-identical Story snapshot |

KEV membership for all three CVE candidates was verified against the official CISA catalog feed on
2026-10-11 (catalogVersion 2026.10.08): Cisco | IOS XE Web UI | 2023-10-16; Fortinet | FortiOS and
FortiProxy | 2025-01-14; Microsoft | Office | 2023-03-14.

Deliberate scope note: the conflict-evidence → downgrade and cross-Story evidence → rejection
demonstrations are not fabricatable as single-Story live e2e cases (a live run acquires Story-local
evidence only; a genuine cross-Story citation is a corruption the store must reject). They are
deterministically demonstrated by the offline normalization fixture strata `conflicting-statements`
and by the TS store's Story-locality validation and unit tests, and every v7 case additionally runs
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

Phase 6 end-to-end gate: v7 candidate constructed; pending three-model review, freeze, and the single
authorized revision-4 run; canonical Linux CI afterwards.
