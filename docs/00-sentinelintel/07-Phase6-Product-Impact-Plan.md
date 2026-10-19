# Phase 6 — Product Impact Agent implementation contract

Status: `ACCEPTED` — owner issued `REQUEST_CHANGES` on the initial draft (2026-10-10); the four required
revisions (row-per-product `product_impacts` model, PoC `unknown`-only, NVD/vendor-advisory/KEV source
alignment, explicit TypeScript model-gateway LLM boundary) were applied, and the owner pre-accepted the
revised contract for implementation on `phase/6-product-impact-agent`.

Checkpoint A completed on 2026-10-10: cross-runtime impact schemas sharing one fixture, the closed
grammar version matcher, migration `0044` (entities, Story links, row-per-product impacts with
`impact_version` history, human reviews), and the confidence-routing store with atomic supersession and
run idempotency (review-only runs neither supersede claims nor burn a version).

Checkpoint B completed on 2026-10-10: the Python impact graph acquires bounded official evidence,
emits structured extraction requests, and refuses to guess semantic rows; the TypeScript model gateway
(`impact-extraction.ts`) executes those requests through the paid path with receipts and attaches the
deterministic matcher's support flags — the model never decides support; the normalization node turns
gateway drafts into rows with authority-capped confidence (authoritative keeps high, primary caps at
medium, low becomes an unknown without claims), merges same-product conflicts in favor of the most
authoritative citation with a medium cap, keeps `known_exploited` KEV-only, and leaves PoC unknown-only.
Orchestration and the `agent.product-impact` queue stay behind default-off switches.

Checkpoint C completed on 2026-10-10: the evaluation contract, 24-case eight-stratum source-backed
development set, offline scorer, and pre-registered thresholds (`datasets/impact/thresholds.json`,
committed before holdout construction). The development replay passes every gate with all safety
counters zero and all quality metrics 1.0. Two candidate-defect rounds were caught by model review and
fixed before the freeze: evidence without frozen content (the evidence contract gained `title`/`excerpt`),
and CVE ids swapped in labels while evidence content still described the original CVEs. The final
candidate uses synthetic but self-consistent advisory content bound to fresh CVE ids. Three model
families (receipts 104-139) reviewed all 24 cases; `IMP-HOLD-UNRESOLV-001` was excluded (a template
product-attribution error a reviewer correctly refused) and the reviewed label was not changed. The
frozen 23-case holdout (`MODEL_REVIEWED`, not human gold) passed the single authorized final replay
with all safety counters zero and every quality gate at 1.0:
`docs/evaluation/impact-baseline.md`.

Sources of truth: `01-SentinelIntel-V2-Technical-Design.md` §6.3, §11 (trigger), §12 (confidence gate),
§15.5 (eval); `02-AIHOT-to-SentinelIntel-Migration-Spec.md` §15. Phase 6 starts only from the merged
Phase 5 state (`main` = `7b829d4`, PR #7, 2 canonical checks passed).

## 1. Objective

Phase 6 adds public-evidence product impact analysis for vulnerability and vendor-advisory Stories: the
Agent extracts and normalizes vendor, product, model, firmware, affected-version, fixed-version,
exploit-status, and mitigation claims from allowlisted official sources, attaches each claim to stored
Evidence, and proposes an impact record that deterministic TypeScript validates and persists.

The headline is scope honesty, not breadth: "Product-level impact analysis based on public evidence" —
never "Enterprise asset risk assessment". No real enterprise asset inventory exists in this project.

## 2. Required demonstrations

1. NVD / vendor-advisory-backed impact record: vendor, affected product family, models, affected
   versions, fixed versions, each with Evidence ids. Product and version claims come from NVD and
   official vendor advisories; CISA KEV is the only source for `known_exploited`.
2. Exploit status honesty: `poc` is `unknown`-only in Phase 6 (no PoC source tool is allowlisted, so
   `reported`/`confirmed` are unreachable values this phase); `known_exploited` may leave `unknown`
   only with CISA KEV catalog evidence for `yes`; absence of evidence stays unknown.
3. Version-range honesty: an unresolvable or conflicting version range — including vendor-specific
   firmware formats the deterministic matcher does not support — yields `unknown` plus a human-review
   item, never a guessed range and never a guessed version ordering.
4. Low-evidence degradation: when official sources are missing or conflicting, the proposal degrades to
   `unknown` with explicit unknowns — it never concludes "not affected" from a failed lookup.

CISA ICS Advisories are not a Phase 6 source: no ICS-advisory lookup tool exists in the allowlist. Using
one would require a dedicated controlled adapter with its own evidence-level definition, approved
separately.

## 3. Scope

Phase 6 adds:

- additive migrations: `security_entities` (normalized vendor/product identities with aliases),
  `story_entities` (Story ↔ entity links), `product_impacts` (one row per product/model impact
  conclusion, versioned by `impact_version`, with an append-oriented impact history);
- a TypeScript-owned model gateway path for extraction: Python never calls a model, holds no
  credentials, and cannot bypass receipts — the extraction round-trip is: Python emits a structured
  extraction request → the TypeScript model gateway executes it under receipts, budgets, timeout, and
  trace → Python receives the structured result → TypeScript re-validates and persists;
- a deterministic version-range matcher with a predeclared MVP grammar (see §7), owned by TypeScript;
- one bounded Product Impact Agent graph in the existing Python runtime;
- deterministic TypeScript triggers, eligibility, capability and limit enforcement, proposal validation,
  optimistic versioning, idempotent persistence, and an `agent.product-impact` queue;
- deterministic version-range comparison owned by TypeScript (or a pure shared function), never computed
  by the LLM;
- a confidence gate: high → store; medium → `human_reviews` queue (table may already exist from earlier
  phases; if absent, additive migration); low → unknowns only;
- reuse of the Phase 4/5 allowlisted tools (`nvd_lookup`, `kev_lookup`, `vendor_advisory_search`,
  `evidence_fetch`) under a new impact-specific capability; no arbitrary URL, shell, SQL, or filesystem;
- a source-verified development set, pre-registered thresholds, an independently reviewed frozen holdout
  (three model families, `MODEL_REVIEWED`, not human gold), and one final authorized holdout run;
- an operations report: safety, quality, latency, tool calls, tokens, receipts, provider cost.

## 4. Non-goals

Phase 6 does not:

- set PoC status to anything but `unknown` (no PoC source tool is allowlisted; `reported`/`confirmed`
  require a dedicated controlled PoC source adapter with defined evidence levels, approved separately);
- query CISA ICS Advisories (no such adapter exists in the allowlist; adding one is a separate,
  owner-approved decision);
- claim enterprise asset impact or connect any asset/CMDB system;
- re-do Story/Fact/grouping/digest logic or touch `stories.status` semantics;
- let Python compute version ranges, schedule itself, write to the database, or hold credentials;
- add `search_web` or any generic search tool (the design lists it, but Phase 4/5 built the boundary
  without it; adding it requires separate evidence and owner approval);
- expose impact data through public web/REST/RSS/MCP (that is Phase 7);
- run `examples/demo-assets.csv` as anything other than an explicitly synthetic, default-off demo;
- auto-publish impact records; Medium confidence always routes to human review.

## 5. Ownership and execution boundary

```text
deterministic TypeScript trigger (Vulnerability / Vendor Advisory / product-impact Incident Stories only)
  -> pg-boss `agent.product-impact` job (story id + expected impact version)
  -> TypeScript loads Story, stored Evidence, prior impact records, and run capability
  -> Python identifies what to extract, emits a structured extraction request,
     and requests allowlisted tools
  -> TypeScript model gateway executes the extraction under receipts, budgets, timeout, trace;
     TypeScript gateway executes tools under limits; acquired Evidence persists first
  -> Python receives structured extraction results and proposes impact rows
     (claims + evidence ids + unknowns + confidence)
  -> TypeScript validates claims against stored Evidence, normalizes entities,
     runs the deterministic version-range matcher, enforces confidence routing
  -> one transaction persists entities/links/impact rows (append-oriented)
```

- The LLM is only reachable through the TypeScript model gateway; Python holds no credentials and
  cannot bypass receipts. LLM output is extraction and semantic normalization only — it never
  calculates a version range and never concludes "unaffected" from absence.
- TypeScript: entity identity, alias tables, version matching, evidence linkage checks, confidence
  routing, persistence, retries, receipts, budgets.
- Stale impact versions are rejected or safely reloaded, never silently committed.

## 6. Data contract

- `security_entities`: stable entity id, kind (`vendor` | `product_family`), canonical name, aliases,
  provenance. Additive; no AIHOT core table changes.
- `story_entities`: Story ↔ entity link with role and Evidence id.
- `product_impacts`: one row per product/model impact conclusion — Story id, `impact_version`, vendor
  entity, CVE, `product_entity_id`, models, `affected_range`, `fixed_range`, confidence, evidence ids,
  exploit status, mitigations, unknowns, timestamps. A Story therefore has as many impact rows as it
  has product conclusions; there is no claims-array blob row.
- `product_impact_history`: append-oriented predecessor of superseded rows (or an equivalent
  `impact_version` supersession chain); uniqueness on (run, product) prevents duplicate commits per
  run and per-run idempotency is retry-safe.

The Python proposal contains no database authority: claims must cite Evidence ids that exist and were
retrieved for that Story; unknowns must be explicit; confidence is a routing hint validated by
TypeScript, not a license.

## 7. Deterministic policy

- Trigger: Story type is Vulnerability or Vendor Advisory (or a product-impact Incident explicitly
  marked by the taxonomy), and no current impact rows exist (or a re-run is requested).
- Current impact state per Story is the set of unsuperseded `product_impacts` rows; superseded rows
  move to history. Claim changes are append-oriented.
- `"not found" != "not affected"`: failed lookups produce unknowns; only an authoritative statement
  supports an unaffected claim.
- Version-range matcher MVP grammar, predeclared and closed: exact equality, the comparators
  `< <= > >=`, closed ranges (`a .. b` inclusive), and standard SemVer ordering. Anything else —
  vendor-specific firmware naming, partial versions, unbounded "prior to" without a resolvable bound,
  conflicting ranges — returns `unknown` plus a human-review item. The matcher never guesses vendor
  version ordering to raise coverage, and the proposal may only select among matcher-supported
  outputs.
- Confidence routing is enforced by TypeScript: high → persist; medium → human review; low → unknowns
  persisted as unknown, no claims.
- Tool failure yields degraded unknowns and cannot fabricate claims.

## 8. Safety switches and limits

A `PRODUCT_IMPACT_ENABLED` run switch defaulting to false, independent of `MODEL_CALLS_ENABLED`,
`COLLECT_ENABLED`, and the Phase 4 network switch. Per-run backend-owned limits: rounds, tool calls,
documents, bytes, wall time, tokens, paid cost. Tests use fixtures and prohibit external sockets; live
and paid checks are explicit, scratch-database only.

## 9. Evaluation contract

Staged, mirroring Phase 5:

1. deterministic fixtures for persistence, triggers, concurrency, evidence linkage, confidence
   routing, and version-matcher behavior;
2. a source-verified development set across strata such as: single-product CVE, multi-product family,
   model-alias conflict, unresolvable firmware range, missing advisory (unknown), conflicting official
   statements, KEV-listed (`known_exploited = yes`), KEV-absent (`known_exploited = no` with catalog
   evidence), non-security-product negative case. There is no PoC-reported stratum: PoC has no
   allowlisted source in Phase 6 and stays `unknown`;
3. development replay and pre-registered numeric thresholds before holdout construction;
4. an independent frozen holdout reviewed by three distinct model families through receipts, frozen
   only on unanimous high-confidence acceptance, labelled `MODEL_REVIEWED`, never human gold; non-
   unanimous cases are excluded and preserved, exactly as in Phase 5;
5. one final authorized holdout run and a durable baseline report; the frozen holdout is immutable
   afterwards; failure requires a new disjoint holdout.

### Metrics

Hard safety gates, all zero:

- impact claims without Evidence;
- claims citing Evidence not retrieved for that Story;
- "unaffected" concluded from absence;
- LLM-computed version ranges or matcher-unsupported range outputs;
- model calls outside the TypeScript model gateway (no credential in Python, no receipt bypass);
- Story/Fact/grouping/digest mutation;
- out-of-policy confidence routing (e.g. low-confidence claims persisted);
- PoC status other than `unknown`;
- stale-version or duplicate commits;
- incomplete tool traces or bypassed receipts/budgets.

Quality metrics:

- vendor extraction accuracy;
- product/model extraction precision/recall (F1);
- affected/fixed version exact and semantic accuracy;
- unsupported impact claim rate;
- unknown honesty (unknowns preserved where evidence is absent);
- evidence coverage;
- operations: tool error rate, latency, tokens, tool calls, receipts, provider cost, human-review rate.

Numeric thresholds come only from development evidence and are committed before holdout construction.

## 10. Implementation order

1. Contract acceptance; branch `phase/6-product-impact-agent` from merged `main`.
2. Cross-runtime schemas and fixture tests (request, proposal, claim, entity).
3. Additive migrations, stores, optimistic concurrency, idempotency tests.
4. Deterministic version-range matcher with its own unit tests (pure function, no LLM).
5. Impact graph in Python reusing Phase 4/5 tools under impact capability; fixture replays.
6. `agent.product-impact` worker handler, trigger eligibility, confidence routing.
7. Development set construction, validator, offline scorer; development replay.
8. Threshold preregistration; holdout candidate construction (disjoint sources).
9. Three-model paid review through receipts; freeze (unanimous high-confidence only).
10. One final holdout replay and evaluation; baseline report.
11. Documentation, full validation, canonical Linux CI, Phase 6 closeout.

## 11. Acceptance checklist

Phase 6 is complete only when all items pass:

1. All four required demonstrations replay end to end with correct durable state and Evidence-backed
   claims.
2. Schemas reject dangling Evidence, evidence not retrieved for the Story, LLM-computed ranges, and
   unsupported terminal states.
3. Scratch-database tests prove entity normalization, append-oriented claims, optimistic concurrency,
   retry idempotency, confidence routing, and no Story/Fact mutation.
4. Tool access stays allowlisted and bounded; Phase 4/5 network, model, receipt, budget, auth, and trace
   boundaries remain intact; `PRODUCT_IMPACT_ENABLED` is default-off.
5. The benchmark validator, development replay, pre-registered thresholds, immutable holdout, and final
   report are committed without describing model review as human gold.
6. Every hard safety metric is zero and every pre-registered quality threshold passes on the final
   holdout; otherwise the phase remains incomplete and the failed holdout stays frozen.
7. Targeted Python and TypeScript tests, typecheck, empty-database migration, web build/tests, Docker
   Compose configuration, and canonical Linux CI pass.
8. `docs/IMPLEMENTATION_STATUS.md` records commands, results, limitations, deviations, and the exact
   merge-ready state; README wording stays "product-level impact analysis based on public evidence".

## 12. Planned completion state

A bounded Product Impact Agent with reproducible evidence-backed evaluation. Public exposure (Story page
Product Impact block, admin review UI, REST/MCP) is Phase 7, not here.

## 14. Revision 7 — demonstrations vs holdout separation (owner ruling 2026-10-14)

The v10 candidate was ruled `DEVELOPMENT_PROBED_NOT_RUN_NOT_FREEZABLE`: its cases had already been
used as paid development probes, so it was development/debug data and could never be a final gate. The
evaluation model is therefore split explicitly:

1. **Required demonstrations** (the four demonstrations of §2) may be satisfied by frozen,
   reproducible development end-to-end evidence on real public evidence — committed case files, result
   files with hashes, receipt ids, and offline re-verification with the revision-6 assertion logic.
   Demonstrations 1-3 are established this way (`docs/evaluation/impact-development-demonstrations.md`:
   the CVE-2017-7921 contract-complete record with seven complete claims rows; the CVE-2023-36563
   product-level matcher-unsupported review routing; the CVE-2023-36802 stale-version rejection). The
   non-security negative may be re-demonstrated on a fresh disjoint case.
2. **The final holdout (v11)** validates safety and generalization on unseen real sources. It does
   NOT need to repeat the unique scarce CVE (CVE-2017-7921 is the only public advisory found that
   carries device models together with machine-resolvable affected and fixed versions and is fetchable
   by the pipeline). If no second such case exists in public evidence, v11 may instead verify **version
   claims generalization** and **model extraction generalization** as separate cases; this fallback is
   pre-authorized here, before any v11 result, and must not be retrofitted after the run.
3. The holdout must keep every revision-6 mechanism: the thirteen hard safety gates, per-case
   fail-closed scoring, product-level review constraints, the bounded union matcher, exact
   receipt/trace linkage, Story/Fact immutability, and zero-denominator quality metrics recorded as
   N/A — with at least one case required to contribute a non-zero row-recall denominator.
4. v11 must be fully disjoint from every development dataset and every candidate or consumed holdout
   v1-v10 (including the three demonstration CVEs) and must contain at least: one case that must
   produce version-bearing claims; one case that must produce a specified-product review; one
   stale/unsupported defense case; one no-CVE negative.

## 13. Revision 6 — limited range-union matcher and record-completeness semantics

Owner ruling of 2026-10-13: the closed MVP grammar in §7 cannot express the version sets that real
official evidence states. Vendor advisories for the allowlisted vendors state affected product sets as
per-branch ranges (FortiOS 7.0.x / 7.2.x / 7.4.x; FortiProxy 1.x / 7.x; IOS trains), which are unions
of contiguous ranges, and the offline union is the only faithful representation. The revision below
extends the deterministic matcher — never the LLM's authority — and is committed alone, strictly before
any code, thresholds, or holdout changes.

1. **Union grammar.** An affected/fixed expression is a pipe-separated union of at most 8 branches.
   Each branch must parse under the existing closed grammar on its own: exact version, the comparators
   `< <= > >=`, a comma-separated comparator list (at most 4 clauses), or a closed `a..b` range.
   Canonical form:

   ```text
   >=7.0.0,<7.0.10 | >=7.2.0,<7.2.3
   ```

   Limits: at most 8 branches, at most 240 characters per expression, at most 4 clauses per branch.
   No nesting, no empty branches, no wildcards, no vendor-specific ordering, no free text. If any
   branch fails to parse, the whole expression is `unknown` (supported = false) and the row routes to
   human review; partial unions are never accepted.
2. **Deterministic ownership.** The TypeScript matcher parses, normalizes, sorts branches
   deterministically, and answers membership (`versionInRange` = true if any branch matches; null if
   the version is unparsable and no branch already decided). The LLM only extracts branches; it never
   computes, repairs, or orders ranges.
3. **Evidence constraints.** Every boundary version of every branch must appear in the row's cited
   Evidence (NVD `versionStart*` / `versionEnd*` fields may prove an *affected* boundary). A
   `fixed_range` must come from an explicit vendor patched/fixed/upgrade-to statement; an NVD affected
   boundary (including `versionEndExcluding`) never implies a fixed version. When the correspondence
   between affected branches and fixed versions is not explicit in the official evidence, the row
   routes to human review instead of guessing.
4. **Models semantics.** `models` may only contain hardware model numbers, SKUs, appliance/model
   identifiers, or editions that the vendor evidence explicitly identifies as models. Versions,
   edition years used as version numbers, and product family names are never mechanically placed in
   `models` to satisfy a metric. A case whose official evidence provides only a product family with
   version branches cannot demonstrate the complete-model record.
5. **Gate consequence.** The closing v10 holdout must contain at least one case that truly satisfies:
   decision `propose`, `min_rows >= 1`, `models_min >= 1`, `claims_require_versions = true`, an
   affected union whose branches are all matcher-supported and evidence-grounded, and a fixed union
   likewise. This is a capability extension, not a relaxation of the acceptance standard.

## 15. Revision 8 — separate semantic adjudication from deterministic conformance

Audit on 2026-10-15 found that v11 cannot close the phase. Two cases lacked unanimous-high review,
and `CVE-2024-21762` was already present in `datasets/impact/development.jsonl`, contradicting the
candidate's disjointness claim. v11 remains immutable as `REVIEWED_NOT_RUN_INCOMPLETE_FREEZE`; none of
its cases may be reused.

For v12, independent model review has one bounded responsibility: adjudicate semantic labels against
the frozen official evidence pack — allowed conservative outcomes, evidence-named product keywords,
CISA KEV status, and absence of explicitly forbidden evidence strings. A model reviewer is not asked
to predict deterministic code behavior such as matcher support, routing, persistence, receipt
linkage, counts, or safety detectors. Those assertions remain frozen in the candidate and are enforced
by executable unit/integration tests and the final runner's thirteen fail-closed safety detectors.
This is a separation of authorities, not a relaxation: semantic labels still require three distinct
unanimous-high reviewers, while every deterministic per-case assertion must pass independently.

Before any paid v12 review, an automated disjointness gate must reject every CVE appearing in any
development dataset or v1-v11 candidate/holdout. The evidence pack and its manifest are frozen before
review, and the existing rule remains: an incomplete unanimous-high semantic freeze is never run.

Revision 8a is a transport-only correction made after v12 construction but before any usable v12
verdict. It changes no candidate, Evidence, label, rubric, threshold, or scorer. Each paid review now
contains exactly one case, sends its frozen Evidence through stdin rather than a Windows command-line
argument, allows 600 seconds, and records stream event counts/bytes and stderr in any timeout. Earlier
timeouts remain unknown receipts under the existing no-blind-retry recovery policy. A complete,
schema-valid JSON assistant event is accepted when the CLI omits its terminal `result` event, after
which the child is terminated; partial, thinking, malformed, and schema-invalid events remain
fail-closed.

## 16. Revision 9 — production-adapter preflight before v13

The consumed v12 run passed every aggregate metric and all thirteen safety gates, but failed its
pre-registered complete-version assertion. Its frozen review evidence pack could fetch the Fortinet
advisory, while the live production registry rejected NVD's official `fortiguard.fortinet.com` URL
before fetch because only `www.fortiguard.com` was registered. v12 stays frozen and is never rerun or
relabelled. The official alternate hostname is now part of the same bounded Fortinet registry.

Before v13 construction, freeze, or paid review, its version-claims case must pass a deterministic
production-adapter preflight with no model call: the advisory URL must come from the CVE's NVD
references, pass `assertVendorAdvisoryUrl`, survive `vendor_advisory_search` as a validated candidate,
and produce authoritative `vendor_advisory` Evidence through `evidence_fetch` whose usable text
contains both affected-version and explicit fixed/upgrade wording. Evidence-pack reachability alone
does not satisfy this gate. v13 otherwise preserves revision 8 unchanged: complete disjointness from
development and v1-v12, three-family unanimous-high semantic review, immutable freeze, all thirteen
safety counters at zero, every quality threshold, every per-case assertion, and a non-zero recall
denominator.
