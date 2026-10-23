# Failure cases — retained, classified, and linked to evidence

Phase 8 exists partly to prove this project was developed evaluation-first. This catalogue keeps the
failures: what broke, how a user would have felt it, what the evidence is, why it happened, what was
done, how regressions are guarded, and whether the final numbers are affected.

Dispositions: **FIXED** (code/test changed, regression exists), **ACCEPTED_LIMITATION** (documented
and retained), **DEFERRED** (needs a decision or a separately authorized run),
**HISTORICAL_ONLY** (consumed evidence, never reusable). Every entry names its evidence file; observed
facts and inferences are separated by wording ("observed" vs "likely").

---

## A. Selection

### SEL-1 — Half the benchmark is not URL-traceable

- **Symptom**: 50 of the 200 rows (`procurement`, `marketing-noise`, `irrelevant-IT`) come from web
  sources that are not registered in `industry/sources.json`, and no row carries a `url` field.
- **User impact**: a future adjudicator cannot re-open the original page; labels can only be re-checked
  from `sourceName` + `title` + ~240 characters of material.
- **Evidence**: `docs/evaluation/selection.md` §L item 10; `datasets/selection/README.md`.
- **Root cause**: the sampler used ad-hoc web sources and was git-ignored; the benchmark was built under
  a copyright constraint that kept only short excerpts.
- **Disposition**: ACCEPTED_LIMITATION.
- **Regression / verification**: the limitation is asserted in the canonical summary and in the
  registry entry's `limitations`.
- **Affects final results**: yes, as a provenance limitation on every selection number — not as a
  numeric correction.

### SEL-2 — Three benchmark strata have no production source

- **Symptom**: `procurement`, `marketing-noise` and `irrelevant-IT` exist in the benchmark only; the
  configured source pack has no procurement source and no noise source.
- **User impact**: benchmark coverage overstates the share of such items the live site will meet.
- **Evidence**: `docs/evaluation/selection.md` §L item 11.
- **Root cause**: benchmark sampling and the seeded source pack were built separately.
- **Disposition**: ACCEPTED_LIMITATION.
- **Regression / verification**: recorded in the canonical summary and the registry.
- **Affects final results**: no numeric effect; it bounds how far the accuracy figure generalizes.

### SEL-3 — The holdout's tier cells are badly unbalanced

- **Symptom**: of 45 holdout cases, 41 are `T1`; there are no `T1_5` rejects and no `T2` selects.
- **User impact**: the aggregate holdout validates the policy mostly on one tier; the tier-gap
  behaviour rests on the 24-case calibration supplement, which is deliberately balanced.
- **Evidence**: `docs/evaluation/selection.md` §L item 12 and §H.
- **Root cause**: the holdout was sampled from the natural distribution before the tier-gap gap was noticed.
- **Disposition**: ACCEPTED_LIMITATION.
- **Regression / verification**: the registry marks `SEL-TIER-CALIBRATION` as `NOT_COMPARABLE` so the
  two numbers can never be merged into one.
- **Affects final results**: no; it restricts interpretation.

### SEL-4 — Same-family annotation, no human adjudication

- **Symptom**: both the proposal pass and the review pass used the GPT-5.6 Sol family.
- **User impact**: a second pass by a similar model fixes some errors but shares systematic biases.
- **Evidence**: `docs/evaluation/selection.md` §B and §L items 1–2.
- **Root cause**: the project chose a reproducible model-reviewed benchmark over an unavailable human
  gold standard.
- **Disposition**: ACCEPTED_LIMITATION; human gold remains DEFERRED project-wide.
- **Regression / verification**: every capability summary and registry entry carries
  `human_gold: false`; the validator fails if any entry claims otherwise.
- **Affects final results**: labels are what they are; no number may be described as human-labelled.

---

## B. Event grouping

### GRP-1 — Roundup collapse

- **Symptom**: all 9 `ROUNDUP` holdout cases were missed: 6 became `SAME_OCCURRENCE`, 3 `SAME_STORY`
  (per-class `ROUNDUP` recall 0.000).
- **User impact**: a multi-item roundup is filed as if it were one incident, so readers see a merged
  event instead of a list.
- **Evidence**: `docs/evaluation/event-grouping-baseline.md` (Stage B table and error taxonomy).
- **Root cause**: the batch judge's prompt has no explicit roundup category behaviour; the class exists
  in the schema but is never predicted.
- **Disposition**: DEFERRED — an explicit roundup-recognition change is a Phase 2 follow-up that needs
  its own evaluation; Phase 8 may not tune prompts.
- **Regression / verification**: the canonical summary states the zero recall instead of hiding it in
  the macro average.
- **Affects final results**: yes — it is the main driver of macro F1 0.629.

### GRP-2 — Occurrence/story boundary confusion

- **Symptom**: 3 `SAME_OCCURRENCE` cases were promoted to `SAME_STORY` (same-CVE cross-source, CERT
  republication, multi-vendor same-CVE) and 3 `SAME_STORY` cases collapsed to `SAME_OCCURRENCE`
  (two procurement corrections, one policy draft/final pair).
- **User impact**: a follow-up is attached to the wrong level — either a detail page loses its timeline
  entry, or two lifecycle stages merge into one Story.
- **Evidence**: `docs/evaluation/event-grouping-baseline.md`.
- **Root cause**: the judge reasons from title/summary similarity and does not distinguish lifecycle
  semantics (correction vs new development).
- **Disposition**: ACCEPTED_LIMITATION (baseline recorded; no prompt change was made in response).
- **Regression / verification**: the taxonomy is retained verbatim in the baseline report.
- **Affects final results**: yes — 6 of the 15 Stage B errors.

### GRP-3 — Conservative splitting dominates

- **Symptom**: Stage C precision 1.000 with recall 0.095; 38 attributable false splits.
- **User impact**: a Story page under-merges: related follow-ups appear as separate events, so heat is
  split and the reader sees several small events instead of one evolving Story.
- **Evidence**: `docs/evaluation/event-grouping-baseline.md` (false-split table by stratum).
- **Root cause**: the candidate/attachment path only merges when the deterministic branch surfaces a
  candidate and the judge accepts it; attachment of a new report to an existing Story is the weak link.
- **Disposition**: ACCEPTED_LIMITATION for the baseline; remediation DEFERRED to a separately
  authorized grouping improvement phase.
- **Regression / verification**: the canonical summary reports `recall 0.095` with the correct reading
  ("replay re-derivation rate"), and `ablations.md` forbids treating it as a product recall.
- **Affects final results**: yes — it is the headline grouping limitation.

### GRP-4 — Stage A measures only a lexical branch

- **Symptom**: candidate recall 60/60 comes from normalized-URL/title lexical candidate generation;
  there is no embedding provider claim.
- **User impact**: paraphrased coverage is not exercised by Stage A, so its 1.000 is not "we find every
  related report".
- **Evidence**: `docs/evaluation/event-grouping-baseline.md` (Stage A row, same-URL diagnostic).
- **Root cause**: the production design uses deterministic lexical candidates; embeddings were never
  introduced.
- **Disposition**: ACCEPTED_LIMITATION; adding a vector/hybrid stack is explicitly `NOT_RUN` in
  `ablations.md`.
- **Regression / verification**: the registry entry `GRP-STAGE-A-RECALL` states the boundary.
- **Affects final results**: it bounds what the number means.

---

## C. Research Agent

### RSR-1 — Twelve of twenty cases end in `insufficient_evidence`

- **Symptom**: B1 completed 8 cases and returned `insufficient_evidence` for 12, all with preserved
  unknowns and zero unsupported claims.
- **User impact**: for advisories whose official sources state no groundable claim, the Story shows
  "evidence insufficient" rather than a fabricated impact statement.
- **Evidence**: `docs/evaluation/security-research-baseline-v4.md` (run shape).
- **Root cause**: the evidence set genuinely does not support a claim; the agent is designed to refuse.
- **Disposition**: ACCEPTED_LIMITATION (by design, not a defect) — but it means the benchmark's recall
  figures rest on the 8 resolvable cases.
- **Regression / verification**: `RSR-UNKNOWN-PRESERVATION` 1.00 and the safety counters.
- **Affects final results**: yes — it defines what "recall 1.00" is measured over.

### RSR-2 — NVD reliability depends on a warmed cache

- **Symptom**: the final run pre-fetched all 18 unique CVEs under the public rate limit before model
  execution; without that warm-up, NVD calls are unreliable.
- **User impact**: a cold deployment can produce `insufficient_evidence` on cases where the data is
  obtainable, i.e. false unknowns.
- **Evidence**: `docs/evaluation/security-research-baseline-v4.md` (final execution) and the Phase 4
  cache design.
- **Root cause**: public NVD rate limits and transient failures; the durable source cache was added to
  make provenance explicit.
- **Disposition**: ACCEPTED_LIMITATION with a documented operational requirement (warm cache).
- **Regression / verification**: cache provenance is recorded per evidence row; the Phase 6 preflight
  performs the same warm-up.
- **Affects final results**: no for the recorded run (it was warmed); yes for reproducibility.

### RSR-3 — Search snippets must never become Evidence

- **Symptom**: an earlier risk that generic search output would be cited as evidence.
- **User impact**: a claim resting on a search-result snippet is not traceable to an official document.
- **Evidence**: `security-research-baseline-v4.md` (`search snippets as Evidence = 0` gate).
- **Root cause**: search tools return text that looks citable; the contract had to distinguish
  "discovery" from "evidence".
- **Disposition**: FIXED in the Phase 4 contract (search results are discovery-only).
- **Regression / verification**: exact-zero gate plus unit tests on the evidence projection.
- **Affects final results**: yes — it is one of the seven zero safety gates.

---

## D. Tracking Agent

### TRK-1 — Four candidates excluded on a source-identity mismatch

- **Symptom**: four `stale-or-nonmaterial` candidates carried an NVD URL while declaring the
  development template's `cisa_advisory` source type; reviewers were not unanimous at high confidence,
  so the cases were excluded.
- **User impact**: none for readers; the consequence is a smaller holdout and an extra review round.
- **Evidence**: `docs/evaluation/event-tracking-baseline.md`; `datasets/event-tracking/holdout-manifest.json`.
- **Root cause**: candidate construction reused a template without fixing the source identity.
- **Disposition**: FIXED by constructing a disjoint six-case supplement with consistent CISA identities
  (reviewed and frozen); the original labels were not changed.
- **Regression / verification**: the excluded cases and their verdicts are recorded in the manifest.
- **Affects final results**: the holdout is 26 cases instead of 30.

### TRK-2 — Two review receipts left `unknown`

- **Symptom**: a six-case review batch timed out (receipt 1) and a two-case attempt died with a stale
  pending receipt (receipt 2); both were marked `unknown` by the standard recovery path.
- **User impact**: none directly; it cost review budget and time.
- **Evidence**: `docs/evaluation/event-tracking-baseline.md` (review process facts).
- **Root cause**: provider-side latency beyond the batch window; the receipt protocol correctly refused
  to guess an outcome.
- **Disposition**: FIXED operationally (smaller batches); the two receipts stay as failure evidence.
- **Regression / verification**: the receipt recovery path is exercised by tests and by later incidents
  (below).
- **Affects final results**: no — neither review was used.

### TRK-3 — Four intentional tool failures

- **Symptom**: tool error rate 0.20 across 20 calls.
- **User impact**: none — these are the dataset's failure-injection cases, verifying fail-closed
  behaviour.
- **Evidence**: `docs/evaluation/event-tracking-baseline.md`.
- **Root cause**: deliberate.
- **Disposition**: ACCEPTED_LIMITATION (a designed property, not a defect).
- **Regression / verification**: the replay asserts the expected tool sequence per case.
- **Affects final results**: it is why 0.20 appears in the operations table; it is not an operational
  error rate.

---

## E. Product Impact (v1–v16 correction history)

Each generation is frozen and consumed; none may be rerun, relabelled or reused.

### IMP-1 — v1: thin MSRC evidence

- **Symptom**: zero grounded rows for CVE-2022-30190; the repeat-skip assertion also mishandled
  review-only outcomes.
- **User impact**: a Story whose advisory page carries little usable text produced no impact record.
- **Evidence**: `docs/evaluation/impact-e2e-baseline.md` ("Earlier generations"), receipts 140–142.
- **Root cause**: the official MSRC page exposed too little extractable text; the runner's repeat-skip
  rule assumed a persisted row.
- **Disposition**: HISTORICAL_ONLY; remediation moved into v2+.
- **Regression / verification**: repeat-skip now applies only after a run persisted current rows.
- **Affects final results**: no.

### IMP-2 — v2: swapped CVE ids in labels

- **Symptom**: candidate construction swapped CVE ids while the evidence content still described the
  original CVEs.
- **User impact**: would have published evidence for the wrong CVE.
- **Evidence**: `impact-e2e-baseline.md`; the candidate is retained.
- **Root cause**: manual/artifact-based candidate assembly without a content-vs-id consistency check.
- **Disposition**: FIXED by content-bound candidate construction; v2 not frozen as a gate.
- **Regression / verification**: later candidates bind evidence to case ids; v11's disjointness audit
  grew out of this class of defect.
- **Affects final results**: no.

### IMP-3 — v3: AND-semantics recall defect

- **Symptom**: `row_recall 0.5`; expected keywords required product words the model legitimately
  normalized away (CVE-2021-1675 → "Windows").
- **User impact**: would have under-credited correct rows.
- **Evidence**: `impact-e2e-baseline.md`, receipts ~148–153.
- **Root cause**: the label used AND semantics over keywords instead of an anchored OR set.
- **Disposition**: FIXED (OR-semantics expectation keywords anchored on official wording).
- **Regression / verification**: the runner scores keywords with the corrected semantics.
- **Affects final results**: no.

### IMP-4 — v4: KEV live lookups failed intermittently

- **Symptom**: KEV checks failed because Node's fetch does not honour the system proxy; KEV evidence
  was missing for some cases.
- **User impact**: a genuinely KEV-listed CVE could be recorded as "exploit status unknown".
- **Evidence**: `impact-e2e-baseline.md`; migration `0045_kev_source_cache.sql`.
- **Root cause**: network egress assumptions in the runtime, not a semantic bug.
- **Disposition**: FIXED — durable KEV catalog cache seeded from the official feed, used by
  `lookupKevPersistent`.
- **Regression / verification**: KEV lookups read the cache; KEV membership audited against the
  official feed (catalogVersion recorded per dataset).
- **Affects final results**: no (v16 used the cache).

### IMP-5 — v5: `row_recall 0.67` under the revision-2 definition

- **Symptom**: one case legitimately took `insufficient_evidence`, but was scored as a recall miss.
- **User impact**: would have penalized correct conservative behaviour.
- **Evidence**: `impact-e2e-baseline.md`; `datasets/impact/thresholds-v2.json` revision 2 note.
- **Root cause**: recall scored outcomes that never proposed.
- **Disposition**: FIXED (revision 3: recall applies only to propose outcomes).
- **Regression / verification**: v6+ scoring excluded non-propose outcomes; v16's denominator is one.
- **Affects final results**: no.

### IMP-6 — v6: a scorer that produced a false green

- **Symptom**: the v6 report showed four safety counters as zero that were never computed, eight
  required metrics never output, receipts matched by a time window, only three Story fields compared,
  N/A scored as a recall hit, and no threshold adjudication at all.
- **User impact**: the pipeline itself was fine, but the *gate* was fiction — a defective scorer would
  have certified anything.
- **Evidence**: `impact-e2e-baseline.md` ("v6 — consumed ... scorer defective"), owner audit.
- **Root cause**: counters initialized to zero and never wired; report assembled by hand.
- **Disposition**: FIXED — revision 4 rewrote the runner: 13 real detectors, exact
  `run_id + trace_id + receipt_id` linking, full Story/Fact/Fact-Article snapshots, and a fail-closed
  threshold scorer.
- **Regression / verification**: every detector now has a negative fixture;
  `tests/agent-impact-*` and later runner revisions assert them.
- **Affects final results**: yes historically (v6 is not a gate); no impact on v16.

### IMP-7 — v7: per-case label over-specification plus a second scorer gap

- **Symptom**: HOLD-001 required `min_rows: 1`, but extraction verbatim-quoted a prose affected
  condition, the matcher correctly refused it, and the row routed to human review; the aggregate
  scorer stayed green because per-case errors did not gate.
- **User impact**: a correct conservative outcome was labelled a failure, while a real per-case
  violation could still pass the gate.
- **Evidence**: `impact-e2e-baseline.md` ("v7 — consumed, FAILED").
- **Root cause**: labels specified model quoting behaviour that cannot be guaranteed; the scorer
  adjudicated aggregates only.
- **Disposition**: FIXED — revision 4a makes any per-case error fail the gate, and later labels use
  quoting-robust outcome sets.
- **Regression / verification**: v8+ passes only with `failures: []`.
- **Affects final results**: no.

### IMP-8 — v9: incomplete unanimous freeze

- **Symptom**: deepseek-v4.1-flash accepted HOLD-002/003 at medium; the freeze rule requires unanimous
  high confidence.
- **User impact**: none; the gate was not run.
- **Evidence**: `impact-e2e-baseline.md` ("v9 — REVIEWED_NOT_RUN_INCOMPLETE_FREEZE"), receipts 28–31.
- **Root cause**: reviewers could not predict live model behaviour for two constructor-strict labels.
- **Disposition**: HISTORICAL_ONLY; owner ruled out reviewer shopping, label edits and partial runs.
- **Regression / verification**: later candidates used quoting-robust outcome sets.
- **Affects final results**: no.

### IMP-9 — v10: cases already used as development probes

- **Symptom**: the three CVEs had been run as paid development probes before the candidate was
  reviewed; their results shaped the labels.
- **User impact**: a holdout that has already been seen cannot measure generalization.
- **Evidence**: `impact-e2e-baseline.md` ("v10 — DEVELOPMENT_PROBED..."), `impact-development-demonstrations.md`.
- **Root cause**: probe reuse in candidate construction.
- **Disposition**: HISTORICAL_ONLY — the cases may never be reused; the demonstrations they produced
  remain valid development evidence.
- **Regression / verification**: the disjointness gate now inspects every prior JSONL file.
- **Affects final results**: no; it forced v11+.

### IMP-10 — v11: not disjoint and not unanimously frozen

- **Symptom**: two cases lacked unanimous-high review, and CVE-2024-21762 was already present in the
  development dataset.
- **User impact**: the intended closing gate could never be a gate.
- **Evidence**: `impact-e2e-baseline.md` (Status).
- **Root cause**: the disjointness check was manual.
- **Disposition**: HISTORICAL_ONLY; automated disjointness validation added.
- **Regression / verification**: `scripts/validate-impact-e2e-disjoint.ts` + test.
- **Affects final results**: no.

### IMP-11 — v12: allowlist hostname mismatch lost the fixed range

- **Symptom**: all thirteen counters zero and quality 1.0, but `complete_claims_min=1` failed: NVD
  referenced `fortiguard.fortinet.com` while the registry allowed only `www.fortiguard.com`, so the
  advisory was never fetched and the fixed range stayed null.
- **User impact**: a record with affected versions but no fixed version — exactly the "is it fixed?"
  question readers ask.
- **Evidence**: `impact-e2e-baseline.md` (Status).
- **Root cause**: allowlist configured from memory of the domain, not from the official reference.
- **Disposition**: FIXED — hostname added with a regression test.
- **Regression / verification**: allowlist tests cover both Fortinet hosts.
- **Affects final results**: no (but it is why v13–v16 exist).

### IMP-12 — v13: duplicate drafts read as conflicts, missing review text, unexpected key

- **Symptom**: five evidence-grounded drafts (with affected **and** fixed ranges) all became medium
  reviews because duplicate NVD/advisory drafts for one product were treated as conflicts; the explicit
  `matcher-unsupported` unknown text was not added when extraction was already medium; HOLD-003 was
  rejected fail-closed on an unexpected top-level `type` key.
- **User impact**: a complete record was downgraded to review-only, and one valid case was dropped.
- **Evidence**: `impact-e2e-baseline.md` ("v13 — consumed failure"), `sentinel_phase6_v13_final_ci`.
- **Root cause**: conflict semantics did not distinguish "same product, advisory adds the fixed
  version" from a true disagreement; the unsupported-format unknown was not surfaced for medium rows;
  schema strictness was correct but the provider emitted an extra key.
- **Disposition**: FIXED by revisions 10–11 (union merge for same-evidence branches; explicit unknown
  text) with focused regressions.
- **Regression / verification**: union-merge and true-conflict unit tests; the fail-closed key
  rejection is retained (it protected the record).
- **Affects final results**: no.

### IMP-13 — v14: release branches treated as conflicts

- **Symptom**: a complete FortiWeb affected/fixed record was capped to medium because different release
  branches from the same advisory were read as conflicts; row recall then had no denominator.
- **User impact**: same as IMP-12 — a correct record under-credited.
- **Evidence**: `IMPLEMENTATION_STATUS.md` (Holdout v14), SHA256 `394086a8...`.
- **Root cause**: branch ranges sharing one authoritative Evidence were not merged as a finite union.
- **Disposition**: FIXED (revision 11: finite-union merge for same-Evidence branches; cross-source
  disagreement still a conflict).
- **Regression / verification**: focused union-merge and true-conflict tests; 24-case development
  replay green.
- **Affects final results**: no.

### IMP-14 — v15: advisory fetch timeout after a successful preflight

- **Symptom**: the affected-range union persisted at high confidence, but the live advisory fetch timed
  out after the preflight had succeeded, so the model saw only cached NVD/KEV and honestly left the
  fixed range null; `complete_claims_min` failed.
- **User impact**: the same "no fixed version" gap as IMP-11, caused by network flakiness rather than a
  configuration error.
- **Evidence**: `IMPLEMENTATION_STATUS.md` (Holdout v15), SHA256 `0d1ef2ba...`.
- **Root cause**: no durable cache for vendor advisories; a transient failure silently degraded the
  evidence set.
- **Disposition**: FIXED — revision 12: migration `0046` extends the source cache to
  registry-validated official advisories (successful fetch cached; a later live failure may use it with
  a new Evidence id and explicit cache provenance).
- **Regression / verification**: scratch-database test proves the cache path; the advisory preflight
  warms the same cache.
- **Affects final results**: no (v16 used the cached advisory).

### IMP-15 — the fixture holdout can no longer be re-scored

- **Symptom**: running the frozen 23-case synthetic normalization holdout against the current scorer
  aborts with `unresolvable-range: development requires at least 3 cases, got 2`.
- **User impact**: none directly (it was never the user-facing path), but it means the published 1.00
  fixture numbers cannot be regenerated.
- **Evidence**: `docs/IMPLEMENTATION_STATUS.md` revision-4 note; the Phase 8 audit reproduced the abort
  (`.data` scratch output); `impact-baseline.md` correction header.
- **Root cause**: the documented exclusion of `IMP-HOLD-UNRESOLV-001` left two cases in a stratum the
  later validator requires to have three; normalization semantics also changed in revisions 4–6.
- **Disposition**: HISTORICAL_ONLY (owner reclassified it as a fixture holdout, not a gate).
- **Regression / verification**: the registry marks `IMP-FIXTURE-HOLDOUT` `HISTORICAL_ONLY` with the
  abort reason, so no summary can quote its 1.00s as current.
- **Affects final results**: no — v16 is the gate.

---

## F. Providers, network, platform

### PRV-1 — Provider schema variance

- **Symptom**: the paid provider returned schema-invalid UUID fields during a CVE-2023-36563 replay
  (rejected before normalization), and once an unexpected top-level `type` key (v13 HOLD-003).
- **User impact**: a case can be dropped even though the model's content was usable.
- **Evidence**: `IMPLEMENTATION_STATUS.md` (revision-10 note), `impact-e2e-baseline.md` (v13).
- **Root cause**: models do not guarantee strict schemas; the pipeline validates strictly on purpose.
- **Disposition**: ACCEPTED_LIMITATION (fail-closed is the correct trade); retries are bounded and
  receipted.
- **Regression / verification**: schema tests assert rejection; the receipt protocol prevents paying
  twice for a retry.
- **Affects final results**: no for v16.

### PRV-2 — Review-window timeouts and `unknown` receipts

- **Symptom**: review batches exceeded their window repeatedly (Kimi 360 s then 600 s; a six-case
  tracking batch; a two-case batch); each left an `unknown` receipt resolved by the documented admin
  path before a smaller retry.
- **User impact**: review latency and cost, plus a risk of treating an unknown as a verdict.
- **Evidence**: `impact-e2e-baseline.md` (v7/v8/v16 review notes), `event-tracking-baseline.md`,
  `datasets/impact/e2e-holdout-v16-manifest.json`.
- **Root cause**: long generations plus batch size; provider windows are not controlled by us.
- **Disposition**: FIXED operationally (smaller batches, explicit resolution, no silent reuse).
- **Regression / verification**: `unknown` receipts are never counted as verdicts; the freeze requires
  twelve high-accept verdicts and the manifest lists them.
- **Affects final results**: no — unresolved calls were discarded, not reinterpreted.

### NET-1 — Egress assumptions (proxy, DNS, allowlists)

- **Symptom**: `node fetch` ignored the system proxy (KEV failures, IMP-4); during one Phase 6 window
  the direct NVD path was blocked and `EGRESS_PROXY_URL` had to be set; a vendor advisory hostname did
  not match the allowlist (IMP-11).
- **User impact**: missing evidence → honest but degraded records (unknown exploit status, null fixed
  range).
- **Evidence**: `impact-e2e-baseline.md` (v4, v12), `impact-development-demonstrations.md` (proxy note).
- **Root cause**: network environment assumptions baked into runtime code paths.
- **Disposition**: FIXED by the KEV catalog cache (`0045`), the vendor-advisory cache (`0046`) and
  allowlist corrections with tests; residual proxy sensitivity is ACCEPTED.
- **Regression / verification**: cache tests with a scratch database; allowlist tests per vendor.
- **Affects final results**: no for v16; it explains several earlier generations.

### WIN-1 — Windows `core.autocrlf` breaks frozen-hash checks

- **Symptom**: seven backend tests fail on a Windows checkout because they hash working-tree dataset
  bytes while the manifests hash the LF blob; the Phase 8 audit also found that
  `datasets/impact/holdout-manifest.json` records `thresholds_sha256 = 0c7a0c7d...`, which is the CRLF
  working copy, while the committed blob hashes to `f78bb9ba...`.
- **User impact**: none for readers; a Windows contributor sees red tests and may distrust the gate.
- **Evidence**: `IMPLEMENTATION_STATUS.md` (Windows-only failures), Phase 8 audit output, the two
  hashes above.
- **Root cause**: `git config core.autocrlf=true` on the Windows machine; one manifest line was
  generated from a Windows working copy.
- **Disposition**: ACCEPTED_LIMITATION for the environment (canonical CI runs on Linux and passes);
  the manifest anomaly is recorded as HISTORICAL_ONLY — the frozen file must not be edited.
- **Regression / verification**: the Phase 8 validator compares **Git blob ids** (CRLF-safe), not
  working-tree bytes, so drift detection is platform-independent.
- **Affects final results**: no — the data itself is identical; only local hash comparisons differ.

### WIN-2 — KI-3: POSIX `SIGTERM` cascade on Windows

- **Symptom**: several worker-drain tests time out on Windows because the platform does not deliver
  POSIX `SIGTERM` to child processes the way the drain logic assumes.
- **User impact**: none in production (containers are Linux); local developer experience only.
- **Evidence**: `IMPLEMENTATION_STATUS.md` (KI-3) and the Phase 7 full-suite run.
- **Root cause**: OS signal semantics.
- **Disposition**: ACCEPTED_LIMITATION; canonical Linux CI covers these paths.
- **Regression / verification**: the same tests pass on Linux CI.
- **Affects final results**: no.

---

## G. Phase 7 (UI / Admin / MCP) — audit findings

### P7-1 — Research panel could read another agent's run

- **Symptom**: the read model selected the latest `agent_research_runs` row without a
  `graph_version` filter. Because all three agents share the table and the impact agent completes its
  run with `claims: []`, a later Phase 6 run was parsed as research and would publish "research
  completed, no claims", erasing the real Phase 4 claims.
- **User impact**: a Story page could silently lose its entire research section.
- **Evidence**: pre-push review finding; fix commit `355463c`; `packages/backend/src/publication/agent-intelligence.ts`.
- **Root cause**: shared table read without an agent discriminator.
- **Disposition**: FIXED — query scoped to `graph_version LIKE 'phase4-%'`.
- **Regression / verification**: `tests/publication-agent-intelligence.test.ts` seeds a Phase 4 run
  followed by a later Phase 6 run and asserts the Phase 4 claim/summary survive; the test was verified
  to fail against the unfixed code.
- **Affects final results**: no (evaluation numbers); it protected the presentation layer.

### P7-2 — Pending human reviews were invisible

- **Symptom**: `productImpact.reviewRequiredCount` counted only persisted rows, but the store routes
  medium rows to `impact_human_reviews` and persists none, so the Story page and MCP never showed
  "under review".
- **User impact**: a Story whose only impact signal was a pending review rendered as "no conclusions".
- **Evidence**: same review; fix commit `355463c`.
- **Root cause**: the count was computed from the wrong source for the real persistence semantics.
- **Disposition**: FIXED — the count now includes open reviews, and `present` / `dataUpdatedAt` do too.
- **Regression / verification**: a read-model test builds a review-only story through
  `applyImpactProposal` (real medium routing) and a Story UI test asserts the "under review" message.
- **Affects final results**: no.

### P7-3 — New admin routes were not discovered

- **Symptom**: five new admin pages type-checked against missing `+types` modules because the project
  uses an explicit route manifest (`apps/web/app/routes.ts`) rather than directory discovery.
- **User impact**: none in production; the pages would simply not exist.
- **Evidence**: Phase 7 implementation notes; fix in commit `6c9de0c`.
- **Root cause**: assumption about React Router file-based routing.
- **Disposition**: FIXED — routes registered in the manifest.
- **Regression / verification**: admin UI tests fetch all five pages through the real server.
- **Affects final results**: no.
