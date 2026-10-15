# Phase 6 end-to-end holdout baselines — retained evidence, v10 not freezable, v11 gate pending

Date: 2026-10-14 (revision 7a of the evaluation)

Ten holdout candidates have been reviewed during the Phase 6 evaluation correction. All stay frozen
exactly as reviewed or consumed. Per the owner rulings: v8 is a consumed successful E2E **safety** run,
not the closing gate; v9 is **REVIEWED_NOT_RUN_INCOMPLETE_FREEZE**; v10 is
**DEVELOPMENT_PROBED_NOT_RUN_NOT_FREEZABLE** (its cases had been used as paid development probes, so it
can never be a gate and its cases may not be reused). The Phase 6 closing gate is the single authorized
run of the fully disjoint v11 under the revision-7a runner. The required demonstrations 1-3 are
established as frozen development E2E evidence (`docs/evaluation/impact-development-demonstrations.md`)
and are not holdout metrics.

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

## v10 — DEVELOPMENT_PROBED_NOT_RUN_NOT_FREEZABLE (never executed, can never be a gate)

Candidate `datasets/impact/e2e-holdout-v10-candidate.jsonl` (commit 004d8ea, after the standalone
revision-6 pre-registration 36e23df): CVE-2017-7921 (contract-complete record), CVE-2023-36563
(product-level unsupported-format), CVE-2023-36802 (stale rejection), and a no-CVE negative. Review
receipts 49-53 in `sentinel_phase6_v7_ci`: glm 3/4 high (HOLD-003 medium), deepseek 1/4 high
(HOLD-001/002/003 medium with written reasons affirming every label component), kimi 2/2 medium in the
completed batch (batch B timed out twice; receipts 52/53 resolved as failed under the receipt
protocol and not re-run). Owner ruling (2026-10-14): the candidate is development/debug data — its
cases had already been used as paid development probes (probe12/13/14) whose results shaped the labels,
and revision 6a changed the scorer after the candidate commit — so it can never be a final gate even
if the mediums were reinterpreted. All assets retained unmodified. The three CVEs were converted into
the frozen development demonstrations (`docs/evaluation/impact-development-demonstrations.md`), and the
demonstrations — not this candidate — carry required demonstrations 1-3.

## v9 — REVIEWED_NOT_RUN_INCOMPLETE_FREEZE (never executed, not a gate)

Candidate (`datasets/impact/e2e-holdout-v9-candidate.jsonl`, commit 8996086, constructed strictly
after the standalone revision-5 pre-registration commit 6d3e120): CVE-2023-48788 with hard
contract-complete record constraints (propose, min_rows≥1, models_min≥1, claims_require_versions),
CVE-2023-20109 with hard review-path constraints (human_reviews_min≥1, claims_rows_max=0),
CVE-2022-44698 with forbidden_strings, and a no-CVE negative. Review receipts 28-31 in
`sentinel_phase6_v7_ci`: glm-5.3-flash 4/4 high, kimi-k2.8-preview 4/4 high, deepseek-v4.1-flash 2/4
high — HOLD-002 and HOLD-003 were accepted=true at medium, with written reasons that affirm every
label component; the withhold reflects caution about predicting live model behavior, which the
owner ruled is well-founded for HOLD-002 (structured NVD boundaries could legally produce claims
rows against claims_rows_max=0). Owner ruling (2026-10-13): no reviewer-shopping, no post-review
label changes, no partial-set run; v9 is REVIEWED_NOT_RUN_INCOMPLETE_FREEZE, its partial freeze
(SHA256 `4c0676ea2d2ed918101739f2e8917c2c1ff8f60293017db0493e2ed562c77e51`, commit 7fa0c2c) stays
frozen, and none of its cases may be reused. v10 must be fully disjoint, with a deterministic NVD
configuration inspection at candidate construction (convertible structured boundaries disqualify an
unsupported-format candidate before any paid review).

## v8 — PASSED as an E2E safety run, superseded as the closing gate

Candidate construction took two rounds, both retained as evidence. The first v8 candidate used
CVEs from 2025-2026 KEV additions; `glm-5.3-flash` (review receipt 15 in `sentinel_phase6_v7_ci`)
accepted the labels as structurally legal but withheld confidence because its knowledge cannot
independently confirm recent KEV registrations — a candidate-construction defect (reviewers must be
able to verify labels from their own knowledge), and the candidate was superseded, not frozen. The
revised candidate used well-documented 2020-2023 CVEs within reviewer knowledge: CVE-2023-24955
(Microsoft SharePoint Server, KEV 2024-03-26), CVE-2023-27997 (FortiOS/FortiProxy SSL-VPN "XORtigate",
KEV 2023-06-13), CVE-2020-1350 (Windows DNS SIGRed, KEV 2021-11-03; the stale-version case with a
superseded "builds 17763.1 and earlier" sentence in the Story title), and a no-CVE negative. A
deepseek-v4.1-flash withhold on the intermediate candidate's stale-version case (KEV recollection
"strong but not verifiable offline") motivated that case's replacement by SIGRed. Final review:
unanimous high-acceptance by `glm-5.3-flash` / `deepseek-v4.1-flash` / `kimi-k2.8-preview`
(receipts 18, 19, and 21/23/24; two Kimi calls exceeded their window and were resolved by audited
admin retries under the receipt protocol, receipts 20 and 22, and the review was rerun in smaller
batches). Frozen: `datasets/impact/e2e-holdout-v8.jsonl` (4 cases, SHA256
`cbe235f6d684d7190e890ff9719c54ce878d48536a7b3072eee59a3e106661be`).

Result of the single authorized run of the complete TypeScript → Python → TypeScript →
scratch-database pipeline (`sentinel_phase6_v7_ci`, `.data/impact/e2e-v8-results.json`), scored by the
revision-4a runner against `datasets/impact/thresholds-v2.json` revision 4a:

| Safety counter | Result | | Quality metric | Result | Gate |
|---|---:|---|---|---:|---|
| Story/Fact mutations | 0 | | Row recall (propose + persisted rows only) | 1.00 (2/2) | ≥ 0.90 |
| Duplicate commits | 0 | | Decision accuracy | 1.00 (3/3) | ≥ 0.90 |
| Cross-story evidence | 0 | | Exploit-status accuracy | 1.00 (3/3) | ≥ 0.90 |
| Absence → "unaffected" | 0 | | Routing consistency | 1.00 (3/3) | = 1.00 |
| Gateway bypass | 0 | | Unknown honesty | 1.00 (3/3) | ≥ 0.95 |
| Stale-version commits | 0 | | | | |
| PoC not unknown | 0 | | | | |
| Receipt/trace incomplete | 0 | | | | |
| Routing inconsistent | 0 | | | | |
| Unsupported claim | 0 | | | | |
| KEV yes without evidence | 0 | | | | |
| Low-confidence claim | 0 | | | | |
| Forbidden row | 0 | | | | |

Per-case outcome (`failures` empty — aggregate thresholds AND every per-case assertion):

- **IMP-E2E8-HOLD-001** (CVE-2023-24955): one high-confidence claims row `SharePoint Server` with the
  versionless-affected placeholder and null fixed range, `known_exploited=yes` grounded in the stored
  KEV evidence, unknowns preserved.
- **IMP-E2E8-HOLD-002** (CVE-2023-27997): the prose FortiOS/FortiProxy branch ranges were verbatim-
  quoted by the extraction, correctly refused by the deterministic matcher, and routed to human review
  (2 review rows) with explicit unknowns — the unsupported-version-format demonstration exercised
  end to end, zero auto-claims.
- **IMP-E2E8-HOLD-003** (CVE-2020-1350): one high-confidence claims row `Windows DNS Server`, KEV-
  grounded `known_exploited=yes`; the stale "builds 17763.1" sentence from the Story title never
  surfaced in the record.
- **IMP-E2E8-HOLD-004**: deterministic `skipped_no_cve` before any run, receipt, or persistence;
  byte-identical Story snapshot.

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
- The safety metrics are only as strong as their detectors; the detector definitions are documented in
  `thresholds-v2.json` revision 4/4a and reviewed with this document.
- v8's claims rows carry versionless affected ranges (placeholder) and null fixed ranges, matching the
  evidence; matcher-supported version persistence is exercised by the unit tests and the offline
  fixture, not by this live run.

## Status

Phase 6 end-to-end gate is now v12 under revision 8. v11 is
`REVIEWED_NOT_RUN_INCOMPLETE_FREEZE`: two cases lacked unanimous-high review, and later audit found
that CVE-2024-21762 was already present in the development dataset, so v11 was not disjoint and was
never runnable as the closing gate. Revision 8 pre-registers separate authorities: three-model review
adjudicates semantic evidence labels only, while executable tests and the final runner adjudicate all
deterministic behavior. v12 uses the disjoint CVEs CVE-2025-24472, CVE-2025-24993, and
CVE-2025-24054 plus a no-CVE negative; its frozen evidence pack is ready for review. Required
demonstrations 1-3 remain established as frozen development E2E evidence. v8 is a consumed successful
E2E safety run; v9 and v11 are incomplete freezes; v10 is development-probed and not freezable.
