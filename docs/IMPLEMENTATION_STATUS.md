# SentinelIntel Implementation Status

## Baseline

Upstream project: KKKKhazix/AIHOT

Audited baseline commit:

f6c2952a9984d4840442558be114ac959b512b0c

Baseline tag:

aihot-baseline-f6c2952

SentinelIntel design baseline commit:

659d6fff70804f465b04aea50f796e87983f6450

Working branch:

phase/1-security-verticalization

Accepted Phase 0 tag:

sentinelintel-phase0 → `1deb090`

## Phase 0

Phase: Phase 0 — Baseline Audit & Freeze

Status: ACCEPTED by the project owner.

Accepted state, frozen:

- tag `sentinelintel-phase0` → `1deb090`
- `main` = `origin/main` = `1deb090` (squash merge of the Phase 0 pull request; its tree is identical
  to the audited branch tip `2b75e36`, so no Phase 0 content was lost)

Phase 0 was delivered as `COMPLETED_WITH_LIMITATIONS`: the baseline was established and frozen with
reproducible evidence, but the harness was not fully green in the audit environment — 8 of 139 backend
tests and 9 of 16 web tests failed, all root-caused to the Windows platform and to KI-1. KI-1 and KI-2
were left unfixed because Phase 0 is read-only for business code.

Full Phase 0 record (frozen, do not edit): `docs/00-sentinelintel/03-Phase0-Baseline-Audit.md`

## Post-Phase-0 Baseline Portability Fix

Branch: `fix/baseline-portability`

Status: ACCEPTED and MERGED into `main` at `2938249` (pull request #2).

Canonical Linux CI on that pull request: `check` PASS, `docker` PASS.

Resolved:

- **KI-1 — RESOLVED.** Windows SSR dynamic `import()` portability (`apps/web/server.ts`).
- **KI-2 — RESOLVED.** `scripts/mcp-check.ts` hardcoded the MCP tool-name prefix.

Scope was exactly those two findings. No Phase 1 work was included, and no production behaviour was
changed beyond the two fixes.

### KI-1 — FIXED

`apps/web/server.ts` passed a bare filesystem path — `D:\...` on Windows — to dynamic `import()`,
raising `ERR_UNSUPPORTED_ESM_URL_SCHEME`. The web process could not start on Windows, and all 9 cases
in `apps/web/tests/cache.test.ts` failed there.

Applied change (`apps/web/server.ts`, 1 added import + 1 changed line):

```ts
import { pathToFileURL } from "node:url";
const build = await import(pathToFileURL(path.resolve(import.meta.dirname, "build/server/index.js")).href);
```

No SSR logic, proxy, cache, routing or other web behaviour was modified.

### KI-2 — FIXED

`scripts/mcp-check.ts` hardcoded `aihot_*` tool names while the server derives them from
`SITE.mcpPrefix`, so every call ended in `ProtocolError: Tool aihot_get_hot_topics not found`.

Applied change (`scripts/mcp-check.ts`, 1 added import + 7 call sites): every tool name now comes from
the single canonical source `MCP_TOOL_NAMES` in `@aihot/contracts/mcp`. `SITE.mcpPrefix` itself, the MCP
server API, the MCP contracts' semantics and the tool count were not changed, and no business behaviour
was altered.

### Post-fix test results (Windows, actual output)

```text
npm run typecheck                     → pass, exit 0
npm run build -w @aihot/web           → pass, exit 0 (build/server/index.js 729.18 kB)
node --test apps/web/tests/*.test.ts  → tests 16 / suites 0 / pass 16 / fail 0 / cancelled 0, exit 0 (3.4 s)
```

Windows web tests were 7 of 16 passing before this fix; they are now 16 of 16. Note that
`scripts/` is not covered by any tsconfig project (`tests/tsconfig.json` includes only `tests/*.ts`),
so `npm run typecheck` cannot validate KI-2; that fix is verified by running the script itself, below.

End-to-end safe smoke on Windows with both safety valves closed (`COLLECT_ENABLED=false`,
`MODEL_CALLS_ENABLED=false`), api on `:3001` against a throwaway PostgreSQL 17, web on `:3100`:

```text
GET  :3001/api/health                    → 200 {"ok":true,"db":"ok","ms":2,"release":"dev"}
node apps/web/server.ts                  → {"level":"info","msg":"web started","port":3100,"pid":37644}
                                           ERR_UNSUPPORTED_ESM_URL_SCHEME occurrences: 0
GET  :3100/                              → 200 (29084 bytes of SSR HTML)
GET  :3100/api/health                    → 200 (the api proxy path is unaffected)
node scripts/mcp-check.ts :3001/api/mcp  → exit 0
    server: {"name":"myhot","version":"2.0.0"}
    tools:  myhot_get_latest, myhot_search, myhot_get_hot_topics, myhot_get_story, myhot_get_daily
    myhot_get_latest {"limit":2}         → ok
    myhot_search {"q":"OpenAI","limit":2}→ ok
    myhot_get_hot_topics {"limit":3}     → ok
    myhot_get_daily {}                   → ERROR | 还没有公开的AI 日报。   (business-level empty state)
    myhot_get_latest {"limit":99}        → ERROR | limit: Too big: expected number to be <=30
                                           (the script's intentional over-limit probe; a validation
                                            error, not a tool-name resolution failure)
```

Tool-name resolution now matches the current `SITE.mcpPrefix` (`myhot`). The two `ERROR` lines are
expected business/validation outcomes on an empty database; the point of the check is that the names
resolve, which they now do.

Deliberately not modified: `tests/analyze-shutdown.test.ts` and `tests/translate-shutdown.test.ts`
(the Windows POSIX `SIGTERM` limitation, out of scope here).

## Current Phase

Phase: **Phase 8 — Final Evaluation & Resume Package (COMPLETE; merged into `main` at `1f82857`,
pull request #10)**

Status: `COMPLETE_WITH_DOCUMENTED_EVALUATION_GAPS` — every Phase 8 deliverable exists and is verified;
the gaps are missing pre-existing metrics that are recorded as `NOT_RECORDED` / `REQUIRES_NEW_RUN`
rather than filled by a new paid run.

Phase 8 base: `main` = `6cdac54` (Phase 7 squash merge, pull request #9). Phase 7 is COMPLETE:
canonical Linux CI passed both required jobs and the CI-verified pull-request tree is identical to the
merge tree.

Phase 8 contract: `docs/00-sentinelintel/09-Phase8-Final-Evaluation-Resume-Plan.md`. The phase was
evaluation consolidation and documentation only: no product-code change, no frozen-artifact
mutation, **no paid model call**, **no external collection**, no holdout rerun, no threshold/prompt/
model tuning, and no new numeric claim.

**Gate 1 — evidence inventory.** `docs/evaluation/evidence-registry.json` (47 entries) is the single
machine-readable source; `docs/evaluation/evidence-registry.md` is generated from it and checked for
drift by `scripts/validate-final-package.ts`. Status distribution: 6 `REPRODUCIBLE_FINAL`, 27
`REPRODUCIBLE_PARTIAL`, 1 `HISTORICAL_ONLY`, 2 `NOT_COMPARABLE`, 10 `NOT_RECORDED`, 1
`REQUIRES_NEW_RUN`. Offline verification done while building it:

- the tracking holdout replay (26 cases, frozen fixture gateway) was re-executed and reproduced the
  recorded nine zero safety counters and five 1.00 quality metrics → `REPRODUCIBLE_FINAL`.
- the synthetic normalization fixture holdout could **not** be re-scored: the current scorer aborts
  with `unresolvable-range: development requires at least 3 cases, got 2` (the documented exclusion
  left two cases in that stratum), and normalization semantics changed in revisions 4–6 → the entry is
  `HISTORICAL_ONLY`, and `docs/evaluation/impact-baseline.md` stays as history only.
- all manifest-recorded holdout hashes match the committed Git blobs **except**
  `datasets/impact/holdout-manifest.json`'s `thresholds_sha256` (`0c7a0c7d…`), which matches the CRLF
  working copy; the committed blob is `f78bb9ba…`. Recorded, not edited (frozen artifact).
- several requested system metrics were never produced: selection tokens/latency, research latency,
  impact end-to-end latency/tokens, average LLM calls, task success rate, human-review rate and
  recovery rate are `NOT_RECORDED`; impact vendor/product/version ratios and evidence coverage were
  never emitted as ratios by the E2E scorer.

**Gate 2 — documentation package.** All nine required paths exist and agree with the registry:
`docs/evaluation/{selection,event-grouping,research-agent,tracking-agent,product-impact}.md`,
`docs/evaluation/ablations.md`, `docs/failure-cases.md`, `docs/architecture.md` (additive
SentinelIntel V2 section, upstream AIHOT facts untouched) and `README.md` (upstream framework vs
extension separated, MIT attribution preserved, no performance number quoted). `selection.md` keeps
every original detail and gained a canonical-summary header only. `ablations.md` admits exactly one
paired numeric ablation (research B0 snapshot-only vs B1 with external evidence on the same 20 cases
and scorer) plus the selection threshold re-scoring with its tuning-leakage caveat, and marks
everything else `NOT_COMPARABLE` / `NOT_RUN`; there is no B0–B5 curve.

**Gate 3 — new-run decision.** One proposal exists: per-case latency/token usage for the product
impact closing gate. It is `NOT_AUTHORIZED` and **not recommended**: the only dataset that could
produce it is the consumed v16 holdout, which may not be rerun, so a valid measurement needs a new
disjoint holdout outside Phase 8. No paid call was made.

**Gate 4 — verification.** `node scripts/validate-final-package.ts` passes (47 entries, 9 required
files, **88 frozen files** unchanged vs `6cdac54`, **43 registry dataset references verified against 7
unique committed datasets** (re-hashed from their Git blobs), registry Markdown in sync, no prohibited
wording, no broken internal link, README numbers traceable). `tests/final-package-validator.test.ts`
11/11. `npm run typecheck`,
`npm run build -w @aihot/web`, `node --test apps/web/tests/*.test.ts` and
`docker compose config --quiet` all pass. No database or migration change was made.

**Post-audit hardening (before the pull request).** The first validator only checked that a dataset
path existed; it now recomputes the SHA-256 of the bytes Git stores at `6cdac54` and compares it with
the registry's `dataset_sha256` (43 references covering 7 unique datasets; the counter in the report
keeps those two numbers apart; the one `.data/` development entry is warned as unverifiable rather
than silently accepted), so a wrong or tampered hash fails. The frozen set is no
longer a hand-written list of 14 canonical files: it is derived from `git ls-tree 6cdac54 --
datasets` and therefore covers all 88 tracked dataset files, including the consumed security-research
v1–v3 and impact v1–v15 corpora with their candidates, manifests and evidence packs. Regression tests
prove that a corrupted hash, a changed document and a deleted dataset each fail. Still unchanged:
`datasets/` matches `6cdac54` exactly.

Known gaps are documented rather than filled: the label method remains `MODEL_REVIEWED` everywhere,
and the missing metrics above stay `NOT_RECORDED` / `REQUIRES_NEW_RUN`.

**Canonical Linux CI** on pull request #10 passed both required jobs on the merged head `0657fad`
(`check` 1m32s, `docker` 48s, run `39981461670`; the preceding head `16688e0` was green as well).
Pull request #10 was squash-merged into `main` at `1f82857` on 2026-10-23, so Phase 8 is COMPLETE.
Two CI-only defects were found and fixed by the gate itself: the validator tests hardcoded a Windows
repository path (now derived from `import.meta.url`), and the workflow's depth-1 clone did not contain
the `6cdac54` base commit the frozen-artifact gate compares against (the check job now fetches full
history; a shallow clone is reported as an explicit error rather than a stack trace).

---

Phase: **Phase 7 — UI / Admin / MCP Extension (COMPLETE; merged into `main` at `6cdac54`)**

Phase 7 base: `main` = `63428dc` (squash merge of pull request #8, Phase 6). Phase 6 is COMPLETE and
merged. Phase 6 frozen holdouts v1–v16 (and their review receipts) are consumed evidence: they must
not be rerun, modified or relabelled, and Phase 6 evaluation iteration is closed. Phase 7 touches
neither Agent prompts, models, thresholds, routing, receipts, budgets nor holdouts.

Phase 7 contract: `docs/00-sentinelintel/08-Phase7-UI-Admin-MCP-Plan.md` — a single unified read
model (`publication/agent-intelligence.ts`) serving Story page, public API and MCP; six additive
Story Detail sections (Security Research / Tracking Status / Timeline Changes / Product Impact /
Evidence / Unknowns); five read-only Admin views (Agent Runs / Tracking Plans / Human Reviews /
Product Impact Review / Eval Results); additive MCP `get_story` extension; no new migrations
(current maximum `0046`). Acceptance criteria are fixed in that contract before implementation.

Phase 7 implementation (branch `phase/7-ui-admin-mcp`, contract-first commit chain): the unified
read model computes every section from the Phase 4/5/6 tables with a public-safe projection (no
tool traces, usage, input snapshots, capabilities, trace ids, receipts, prompt versions, evidence
internals, or human-review payloads); `loadStoryDetail` and `v1Story` both carry the same DTO
additively; the Story page renders six sections that degrade independently and stay silent without
agent data; the five admin views are read-only `adminHandler` GETs; MCP `get_story` gained a
compact honest text summary plus the structured DTO, with the tool list and old fields unchanged.
New MCP tools (`get_security_impact` / `get_story_tracking`) were deliberately NOT added: the
contract's five conditions are not met because `get_story` carries the same read model.

Pre-push review (2026-10-23) found two read-model defects that would have misled real readers, both
fixed with regressions: (1) the research view read the latest `agent_research_runs` row without a
`graph_version` filter, so a later Phase 6 run (whose production proposal has `claims: []`) would be
published as "research completed, no claims" and erase the real Phase 4 result — the query is now
scoped to `phase4-%`; (2) `productImpact.reviewRequiredCount` counted only persisted rows, but the
store routes medium rows to `impact_human_reviews` and persists none, so the Story page and MCP
never showed pending reviews — the count now includes open reviews, and `present` / `dataUpdatedAt`
do too. Both regressions were verified to fail against the unfixed code.

Local acceptance (2026-10-23): typecheck passed; all 43 migrations applied to the empty
`sentinel_phase7_ci` database; Phase 7 backend tests 26/26 (read model 8, API 5, admin auth 3,
admin views 6, MCP compatibility 3, MCP shutdown 1); web build passed; web tests 25/25 (19
pre-existing + 6 new); `docker compose config` passed. The full backend suite keeps its pre-existing
Windows-only failures (7 frozen-dataset hash checks broken by `core.autocrlf=true` on this machine,
and the KI-3 POSIX SIGTERM cascade) — both categories are identical on `main` and are covered by
the canonical Linux CI runs. Canonical Linux CI on pull request #9 passed both required jobs
(`check` and `docker`, final head `385430e`, run `39967709109`). Pull request #9 was squash-merged at
`6cdac54` on 2026-10-23; the merge tree is identical to that CI-verified branch head.

The Phase 6 record below is retained unchanged as consumed history.

---

Phase: **Phase 6 — Product Impact Agent (COMPLETE; merged into `main` at `63428dc`)**

Phase 5 branch: `phase/5-event-tracking-agent`

Phase 5 base: `main` = `d4e1520` (Phase 4 merge)

Phase 5 status: **ACCEPTED AND MERGED — `main` = `7b829d4` (squash merge of pull request #7), both
canonical GitHub checks (`check`, `docker`) passed on the pull request.** The frozen 26-case
`MODEL_REVIEWED` holdout passed the single authorized final replay with all nine hard safety metrics
zero and all five pre-registered quality gates at 1.0
(`docs/evaluation/event-tracking-baseline.md`). The frozen holdout and the review evidence remain
immutable.

Phase 5 implementation contract: `docs/00-sentinelintel/06-Phase5-Event-Tracking-Plan.md`.

The Phase 5 contract preserved the existing Story lifecycle and pg-boss scheduler, introduced only the
active tracking state absent from AIHOT, and separated Python semantic reasoning from deterministic
TypeScript scheduling, policy enforcement, validation, and persistence. Its acceptance gate required the
three migration-spec demonstrations, exact-zero safety failures, development-based threshold
preregistration, an immutable independently reviewed holdout, and canonical Linux CI.

Phase 6 — Product Impact Agent: **COMPLETE — v16 closing gate passed and pull request #8 merged into
`main` at `63428dc`.** Implementation (schemas, matcher, stores, orchestration, worker, the
model-gateway extraction round trip, and the deterministic normalization path) is accepted as
substantially built. The frozen 23-case holdout (`3b2e242e...`, receipts 104-139) is retained but
**reclassified as a synthetic normalization fixture holdout**: it measures only the frozen-drafts →
normalize → route half of the pipeline on synthetic advisory content, not the contract's end-to-end
demonstrations on real public evidence, and it is NOT the Phase 6 closing baseline. Its thresholds
cover only five of the contract's safety gates. `docs/evaluation/impact-baseline.md` carries a
correction notice to the same effect.

Evaluation correction progress (owner-mandated order): (1) status corrected; (2) the synthetic holdout
is frozen and never re-used; (3) the end-to-end evaluation was built and pre-registered
(`thresholds-v2.json` revision 2: full contract safety set, behavioral assertions, development hashes);
(4) the end-to-end development replay (4 real-CVE cases) passed every safety observation and quality
metric on the complete live pipeline; (5) the first end-to-end holdout (3 real-CVE cases, receipts
140-142) **FAILED** its single authorized run — CVE-2018-13379 and CVE-2020-0688 passed, but
CVE-2022-30190 produced zero grounded rows (thin MSRC evidence; extraction correctly refused to
fabricate) and the runner's repeat-skip assertion mishandled review-only outcomes
(`docs/evaluation/impact-e2e-baseline.md`). That failed holdout stays frozen unmodified.

Holdout v2 review was paused mid-session by a local Application Control policy denying `codebuddy.exe`;
the owner turned Smart App Control off (a machine-level, owner-made change) and the review resumed.
Six end-to-end holdout generations were consumed during the correction, all retained frozen: v1
FAILED (thin MSRC evidence), v2 FAILED (candidate construction defect), v3 FAILED (expectation-keyword
AND-semantics defect), v4 FAILED (KEV live-lookup instability — fixed by the catalog cache, migration
`0045`, seeded from the official feed), and **v5 FAILED on row_recall 0.67 under the revision-2
definition** (one case correctly took insufficient_evidence). The carried remediation
(OR-semantics expectation keywords anchored on official NVD wording; row_recall applies to propose
outcomes only; no model-knowledge-limited CVEs in candidacy) was applied, and holdout v6 (2 cases,
receipts 161-163, MODEL_REVIEWED, SHA256 `3d8f8038819660e15dd7cd0b3f0bfaaeb17efc882e4a4883cb326cfa4b108dee`)
completed its single authorized end-to-end run without runtime failure
(`docs/evaluation/impact-e2e-baseline.md`). Every consumed holdout and receipt is retained as evidence.

**Owner audit verdict on v6 (2026-10-11): NOT the gate — the v6 scorer was defective.** The v6 report's
four uninitialized safety counters, eight never-output threshold metrics, window-based receipt
matching, three-field Story check, N/A-as-1 recall scoring, and absent threshold adjudication do not
establish gate compliance. v6 stays frozen as a live smoke/pilot result. Remediation committed before
holdout-v7 construction (thresholds-v2.json revision 4): the revision-4 runner
(`scripts/run-impact-e2e.ts`) computes all thirteen hard safety counters with real assertions, links
receipts exactly by `run_id + trace_id + receipt_id` with provider outcome checks, snapshots the full
Story row plus Facts plus Story-Fact links, excludes non-propose outcomes from the row-recall
denominator, and ends with a fail-closed scorer that reads the pre-registered thresholds and exits
non-zero on any failure. Normalization semantics revision 4: a matcher-unsupported version expression
routes to human review with an explicit unknown and never persists as an auto claim (the offline
normalization fixture holdout keeps its pre-revision-4 frozen expectations as consumed evidence only).
**Holdout v7 (consumed, FAILED — frozen)**: the candidate (4 cases) was unanimously accepted at high
confidence by `glm-5.3-flash` / `deepseek-v4.1-flash` / `kimi-k2.8-preview` (review receipts 9-11 in
`sentinel_phase6_v7_ci`; the Kimi call exceeded its 360 s window once and was resolved by one audited
admin retry under the receipt protocol). After a development-set live smoke passed with all thirteen
safety counters zero, the single authorized v7 run completed. Post-run per-case audit: the aggregate
scorer was green, but (1) IMP-E2E7-HOLD-001 violated its frozen `min_rows: 1` — extraction verbatim-
quoted the advisory's affected condition ("Cisco IOS XE Software if the web UI feature is enabled"),
the matcher correctly refused it, and revision-4 semantics correctly routed the row to human review;
the frozen label over-specified what model quoting behavior cannot guarantee; (2) the revision-4
scorer still allowed aggregate metrics to stay green while a per-case assertion failed. v7 is
consumed as a FAILED gate and stays frozen (`.data/impact/e2e-v7-results.json`,
`docs/evaluation/impact-e2e-baseline.md`).

**Remediation (revision 4a, committed before v8 construction)**: the scorer now fails on ANY per-case
assertion error, and v8 labels use outcome sets robust to model quoting behavior with hard guarantees
carried by the safety detectors and grounded-KEV expectations. **Holdout v8 (PASSED — retained as the
E2E safety run, superseded as the closing gate)**: the first candidate (2025/2026 KEV CVEs) was
superseded in review when `glm-5.3-flash` correctly withheld confidence it could not verify from its
own knowledge (receipt 15, retained); the revised candidate used well-documented 2020-2023 CVEs
(CVE-2023-24955 SharePoint, CVE-2023-27997 XORtigate, CVE-2020-1350 SIGRed with a stale-version
sentence in the title, and a no-CVE negative) and was unanimously accepted at high confidence by
`glm-5.3-flash` / `deepseek-v4.1-flash` / `kimi-k2.8-preview` (receipts 18, 19, 21/23/24; two Kimi
window overruns resolved by audited admin retries, receipts 20 and 22). The single authorized run on
2026-10-12 (`sentinel_phase6_v7_ci`, `.data/impact/e2e-v8-results.json`) passed every gate: all
thirteen safety counters zero, all five quality metrics 1.0, zero per-case failures under the
revision-4a scorer
(`docs/evaluation/impact-e2e-baseline.md`).

**Owner acceptance audit on v8 (2026-10-12): not the closing gate.** v8 produced no contract-complete
record (all claims rows versionless with empty models), its labels allowed any main outcome with zero
floors, and revision 4a had been committed in the same commit as the v8 candidate (pre-registration
order defect). Mandated minimal path: pre-register revision 5 alone, then a disjoint v9/v10.

**Revision 5 / 5a / 6 / 6a / 7 / 7a (each committed alone, strictly before its candidate)**: extraction
prompt v2-v5 (closed-grammar expressions for machine-readable bounds, verbatim prose otherwise, fixed
versions only from vendor patched/fixed statements, evidence-backed models), boundary grounding,
four hard label constraints, `rows_or_reviews_min`, the bounded union matcher (contract revision 6:
pipe-separated unions of at most 8 closed-grammar branches), product-level review constraints
(`review_required_products` / `claims_forbidden_products` / `review_unknown_contains`),
`complete_claims_min`, zero-denominator metrics as N/A with a required non-zero recall denominator,
and an evidence-only reviewer rubric. Pipeline fixes along the way: NVD evidence now carries
deterministically flattened CPE configuration bounds (the model could never see structured ranges
before), and the vendor-advisory body extraction falls back past cookie banners.

**v9 (REVIEWED_NOT_RUN_INCOMPLETE_FREEZE)**: reviewed by three models (receipts 28-31); HOLD-002/003
excluded by deepseek medium whose written reasons affirm every label component; partial freeze retained
(commit 7fa0c2c); no v9 case may be reused.

**v10 (DEVELOPMENT_PROBED_NOT_RUN_NOT_FREEZABLE)**: the candidate's cases had already been used as
paid development probes, so the owner ruled it development/debug data that can never be a gate
(2026-10-14). Candidate, review receipts 49-53, probe results, and reviewer verdicts are retained
unmodified.

**Required demonstrations 1-3: ESTABLISHED as frozen development E2E evidence** (owner ruling
2026-10-14; `docs/evaluation/impact-development-demonstrations.md`):
- Demonstration 1 (contract-complete record): CVE-2017-7921, extraction receipt 47, seven claims rows
  each with evidence-backed models, matcher-supported affected range, matcher-supported fixed version,
  and vendor-advisory Evidence; offline re-verification with the revision-6 logic passed with all
  safety counters zero.
- Demonstration 2 (unsupported version format → review): CVE-2023-36563, receipt 48, ten named
  version-bearing products routed to human review with unsupported ranges, legal versionless claims
  rows for products without version statements, no unsupported expression in claims.
- Demonstration 3 (stale version rejection): CVE-2023-36802, receipt 54, the stale decoy surfaced
  nowhere in persisted state, product signal present.
- These are development evidence, not holdout metrics; the three CVEs may not be reused in any holdout.

**Holdout v11 (REVIEWED_NOT_RUN_INCOMPLETE_FREEZE)**: receipts 55-58 produced unanimous-high
semantic review only for HOLD-001/004; HOLD-002/003 were accepted at medium by at least one reviewer.
No partial freeze was run. The 2026-10-15 audit additionally found that HOLD-001's
`CVE-2024-21762` already appears in `datasets/impact/development.jsonl`, disproving the candidate's
disjointness claim. v11 is immutable, is not a gate, and none of its cases may be reused.

**Holdout v12 (consumed, FAILED — frozen)**: revision 8 separates independent semantic
evidence adjudication from executable deterministic conformance. The semantic reviewers see only
allowed outcomes, evidence-named product keywords, KEV status, and forbidden evidence strings;
matcher/routing/persistence/receipt/count behavior remains enforced by tests and the thirteen final-run
detectors. The automated disjointness gate passed for CVE-2025-24472, CVE-2025-24993, and
CVE-2025-24054 against every impact development and v1-v11 JSONL file. Candidate and frozen official
evidence pack were committed in separate ordered commits after revision 8. After the CodeBuddy
streaming correction below, all four cases received unanimous high acceptance from
`deepseek-v4.1-flash`, `glm-5.3-flash`, and `kimi-k2.8-preview` (receipts 10-21) and froze at SHA256
`88e257d8e23ed98fa6bbae0f0ba42d7f8f871725247985dada9492a6faf264c4`. The valid clean-scratch run
passed all thirteen safety counters at zero and all five aggregate quality metrics at 1.0, but FAILED
the pre-registered per-case gate: CVE-2025-24472 produced two supported affected-range claims and a
KEV-grounded exploit status, but no claim carried a fixed range (`complete_claims_min=1`). The live
pipeline acquired NVD and KEV only because NVD's official Fortinet reference uses
`fortiguard.fortinet.com`, while the controlled registry allowed only `www.fortiguard.com`; the
advisory containing the fixed releases was therefore rejected before fetch. v12 remains frozen and
cannot be rerun or relabelled. Remediation adds that official hostname to the existing Fortinet
registry with a regression test; a new disjoint holdout is required before Phase 6 can close.

**Holdout v13 (consumed, FAILED — frozen)**: revision 9 was committed alone before construction. It adds a
deterministic, model-free production-adapter preflight for the version-claims case; evidence-pack
reachability alone is no longer accepted as proof that the live pipeline can acquire the advisory.
The preflight passed for CVE-2025-32756 and Fortinet advisory FG-IR-25-254: the URL occurs in NVD's
reference set, passes the bounded registry, survives candidate discovery, and produces authoritative
text containing affected branches and explicit upgrade targets. The v13 CVEs (CVE-2025-32756,
CVE-2025-24991, CVE-2025-29824) pass the automated disjointness check against 24 prior impact JSONL
files. Candidate and frozen official evidence pack were committed separately after revision 9;
three-family one-case-at-a-time semantic review completed with all 12 verdicts high-accept
(`deepseek-v4.1-flash` receipts 1-4, `glm-5.3-flash` 5-8, `kimi-k2.8-preview` 9-12). All four cases
froze as `MODEL_REVIEWED`, not human gold, at SHA256
`6e20a4baffedc387f74fd8c5eac6abe0f55bc29871ec6780865cb24f9043b130`. The single clean-scratch run
kept all thirteen safety counters at zero but failed the quality/per-case gate. HOLD-001 acquired the
official Fortinet advisory and extracted five complete affected+fixed drafts, but duplicate
NVD/advisory drafts for the same products were all treated as conflicts and capped to medium, routing
every row to review (`min_rows` and `complete_claims_min` failed). HOLD-002 correctly routed thirteen
four-part Windows builds to review, but an already-medium extraction did not add the expected explicit
`matcher-unsupported` unknown. HOLD-003's model response carried an unexpected top-level `type` key and
was rejected fail-closed as unusable. v13 is immutable and will not be rerun or relabelled. The first
two findings are development defects to fix and verify before any new holdout; the third remains
recorded provider/model-output variance.

**Post-v13 development correction (revision 10)**: normalization now distinguishes contradictory
version assertions from compatible duplicate drafts. Compatible NVD/advisory drafts merge their
models, mitigations, Evidence ids and complementary fixed range without an automatic confidence cap;
genuine contradictory ranges still cap the survivor to medium and record a conflict. Matcher-rejected
expressions now always add the explicit review-routing unknown even when the incoming draft is already
medium. Focused Python regressions cover compatible merge, genuine conflict, and already-medium
unsupported routing. A fresh development E2E replay of CVE-2017-7921 produced seven high-confidence,
auto-routed, evidence-backed product claims with every safety detector at zero; a CVE-2023-36563 replay
was attempted twice but the paid provider returned schema-invalid UUID fields before normalization, so
no invalid result was accepted. The deterministic unsupported-medium behavior is verified by the
focused runtime regression. No v14 candidate may be built until this revision is committed; v13 stays
frozen and consumed.

**Holdout v14 (consumed, FAILED — frozen)**: after revision 10, a fully disjoint four-case candidate
and official evidence pack were frozen. DeepSeek-V4.1-Flash, GLM-5.3-Flash, and Kimi-K2.8-Preview
returned 12/12 high-accept verdicts; all four cases froze as `MODEL_REVIEWED` at SHA256
`394086a87eea35e359897cb2dc5230941d58734f56a0adbd406318916b9f728d`. The unique clean-scratch run
kept all thirteen safety counters at zero and scored decision, exploit, routing, and unknown honesty
at 1.0. The unsupported-version and stale-input cases passed. The version case correctly extracted a
complete FortiWeb affected/fixed record but still capped it to medium because different release
branches from the same advisory were treated as conflicting rather than as a finite union; therefore
row recall had no denominator and the run failed. v14 is immutable and will not be rerun or relabelled.

**Post-v14 development correction (revision 11)**: matcher-supported affected/fixed branches sharing
the same Evidence are merged with the frozen finite-union syntax. Differing assertions from disjoint
Evidence remain conflicts. Focused tests cover union merge and true cross-source conflict; the full
24-case development replay retains all safety counts at zero and 1.0 vendor/product/version/decision/
exploit/unknown metrics. A fresh disjoint v15 is required for the final gate.

**Holdout v15 (consumed, FAILED — frozen)**: the disjoint candidate received 12/12 high-accept verdicts
from the same three independent model families and froze at SHA256
`0d1ef2ba93b7e0c8971220fc3f7939f7dbccb53d87ecec31c131049ea58d50d6`. The unique clean-scratch run
kept all thirteen safety counters at zero and scored all five aggregate quality metrics at 1.0,
including non-zero row recall. Its sole failure was `complete_claims_min`: the FortiWeb affected-range
union persisted correctly at high confidence, but the official advisory fetch timed out/rejected after
the earlier production preflight had succeeded, so the model saw only cached NVD/KEV and honestly left
the fixed range null. v15 is immutable and will not be rerun or relabelled.

**Post-v15 reliability correction (revision 12)**: migration `0046` extends the existing source cache
to registry-validated official vendor advisories. A successful live fetch is cached; only a subsequent
live failure may use it, with a new Evidence id and explicit cache provenance. The production tool
gateway uses this persistent path while injected test fetches remain isolated. The model-free advisory
preflight now warms the same cache when `DATABASE_URL` is configured. A scratch-database test proves
live success followed by transient failure still returns the exact official advisory. The next final
database was therefore required to be migrated and prewarmed before the v16 run; the closing run below
followed that procedure.

**Holdout v16 (PASSED — Phase 6 closing gate)**: the fully disjoint four-case candidate and its frozen
ten-item official evidence pack passed the automated disjointness and evidence-integrity gates. All
twelve independent semantic reviews were high-accept (`deepseek-v4.1-flash` receipts 32-35,
`glm-5.3-flash` 28-31, `kimi-k2.8-preview` 36-39); all cases froze as `MODEL_REVIEWED`, not human gold,
at SHA256 `a679b11e04a9135a5f69b5eede5a592f96f9efe30f63fddca947db232234a4c5`. A clean scratch database
received all 43 migrations through `0046`, then the production preflight cached Fortinet FG-IR-25-910
in that same database. The single authorized complete replay passed with all thirteen safety counters
at zero, all five quality metrics at 1.0, a non-zero row-recall denominator, and no per-case failures.
The result is retained locally at `.data/impact/e2e-v16-results.json`; the committed baseline is
`docs/evaluation/impact-e2e-baseline.md`. No v16 case was relabelled or rerun.

**Phase 6 local closeout validation (2026-10-23)**: Python runtime tests 44/44; focused Phase 6
TypeScript tests 37/37 plus version-matcher tests 8/8; TypeScript typecheck passed; empty-database
migration applied all 43 migrations through `0046`; web build passed; web tests 16/16; Docker Compose
configuration passed. Canonical Linux CI is intentionally recorded as pending until the branch is
pushed and the pull request checks execute; it is the only remaining external verification item, not
an implementation or evaluation blocker.

Review execution note (2026-10-15): the dedicated scratch database
`sentinel_phase6_v12_ci` was migrated through `0045`. The frozen evidence gate and disjointness gate
passed before every attempted request. CodeBuddy's simple CLI health probe succeeded, but the
structured review channel returned no terminal result before its hard timeout for GLM-5.3-Flash,
DeepSeek-V4.1-Flash, and a one-case GLM-5.3 retry; their receipts are `unknown`, not verdicts. A Kimi
request interrupted during diagnosis remains subject to the normal stale-pending recovery path. No
review output was accepted, no case was frozen, and the calls must not be blindly repeated before the
receipt recovery policy releases them. This is an external review-channel blocker, not a Phase 6
quality result. Revision 8a then accepted a complete schema-valid assistant event when CodeBuddy
omitted its terminal `result` event; the one-case retry returned in seconds and the remaining reviews
completed normally. Two preflight attempts of the final runner were discarded before evaluation:
one had the Python product-impact switch disabled, and one used the production 5-second Agent client
timeout; neither reached extraction or produced model receipts. The runner now uses the task's
pre-registered 60-second deadline. The subsequent clean-scratch run is the consumed v12 result above.

### Phase 6 checkpoint 1 — contracts, matcher, migrations, stores

Implemented on 2026-10-10 without external or paid calls: strict cross-runtime impact task/proposal
schemas (`impact-contract.ts` + `agent-runtime/app/schemas/impact.py`) sharing one fixture
(`tests/fixtures/impact/task.json`) parsed by both runtimes; a closed-grammar deterministic version
matcher (`version-matcher.ts`: exact, `< <= > >=`, closed ranges, comma lists, numeric SemVer ordering;
everything else returns unsupported so callers degrade to unknown + human review); additive migration
`0044` with `security_entities` (alias-aware identity), `story_entities`, row-per-product
`product_impacts` (`impact_version` + current/superseded status + `persisted_kind` claims/unknown_only),
and `impact_human_reviews`; and `impact-store.ts` with confidence routing (high → claims, medium →
human review, low → unknown-only row with no claims), atomic supersession, and run idempotency that
covers both impact rows and review records. A review-only run neither supersedes current claims nor
burns a version. Verification: typecheck; Python runtime tests 32/32; impact contract/store/matcher
tests 13/13 against a scratch database; empty-database migration through `0044` (41 migrations).

### Phase 6 checkpoint 2 — runtime graph, orchestration, worker queue

A second execution under the owner's account added the Python impact graph (`2dafe25`): bounded
official-source acquisition through the Phase 4/5 gateway (NVD, KEV, vendor advisory search plus one
evidence fetch), an authenticated `/v1/impact/story/{id}` endpoint behind the default-off
`PRODUCT_IMPACT_ENABLED` switch, the TypeScript client `runAgentImpactTask` (fail-closed switch,
identity correlation, proposal validation), and fixture tests on both sides. The graph deliberately
preserves unknowns instead of guessing semantic rows: until the TypeScript model-gateway extraction
round trip from the contract lands, no impact rows are fabricated. The same session then added the
orchestration (`agents/impact.ts`): deterministic eligibility (Stories whose title or digest carries a
CVE id, with vendor aliases resolved deterministically), one research-run bookkeeping wrapper, evidence
persistence before the impact transaction, and skip semantics for already-analyzed and non-CVE stories;
plus the `agent.product-impact` pg-boss queue (`jobs/impact.ts`), worker registration, and a
`*/10` candidate scan guarded by the same switch. Verification: typecheck; Python tests 32/32; impact
TypeScript tests 21/21; Docker Compose configuration. No external, model, or paid call was made.

### Phase 5 implementation checkpoint 1 — deterministic tracking foundation

Implemented on 2026-10-10 without external or paid calls:

- matching strict Python/TypeScript schemas for plan snapshots, typed questions, declared observation
  targets, stored Evidence references, material changes, question transitions, and continue/stop output;
- additive migration `0042_event_tracking.sql` with one current plan per Story, stable due-plan indexing,
  append-only material changes, optimistic versions, and per-run idempotency;
- TypeScript plan creation, bounded stable due selection, stored-Evidence projection, proposal validation,
  atomic plan advancement, stop-condition enforcement, and retry-safe commits;
- an independently default-off `AGENT_TRACKING_ENABLED` switch and authenticated Python tracking route;
- a deterministic LangGraph tracking graph that resolves only explicitly declared observations in stored
  Evidence, otherwise preserves the question and extends the interval inside policy;
- a manual TypeScript -> Python -> TypeScript replay and an `agent.tracking` pg-boss queue whose singleton
  identity is plan id plus expected version; Python does not schedule or retry itself.

Verification: empty scratch database migration through `0042`; Python tracking/API tests 6/6 and full
Python runtime tests 21/21; TypeScript tracking contract/client/store tests 9/9; queue schedule tests 2/2;
TypeScript typecheck; Docker Compose configuration; and a real local cross-runtime replay all pass. The
replay committed one patch change, advanced the plan to version 2/stopped, and left Story version/digest
unchanged.

Next gate: reuse the Phase 4 bounded research gateway for evidence acquired since the last tracking
snapshot, then add fixture-first vulnerability/procurement/no-progress replays. No model, paid call,
development benchmark, or holdout has begun.

### Phase 5 implementation checkpoint 2 — required fixture scenarios

Fixture-first graph replays now cover all three required migration-spec demonstrations: a vendor
confirmation followed by a later patch, an official procurement award following a notice, and two
no-progress checks that first extend the interval and then stop at the declared threshold. Observation
projection is source-appropriate: vendor confirmation/patch require vendor-advisory Evidence,
procurement awards require official-procurement Evidence, generic material updates still require primary
or authoritative Evidence, and secondary Evidence resolves nothing.

Verification: Python scenario tests 3/3 and the TypeScript observation-policy test pass. These are
deterministic fixtures, not formal development or holdout cases. The next gate remains bounded research
delta acquisition through the Phase 4 gateway, followed by evidence-backed benchmark construction.

### Phase 5 implementation checkpoint 3 — bounded research delta

Tracking now reuses the Phase 4 capability, gateway, Evidence, trace, tool-limit, network-switch, and
research-run boundaries. The graph may select NVD, CISA KEV, registered vendor discovery, and official
advisory fetch from Story/plan context. Newly returned Evidence is validated and stored through the
existing research-run transaction before a tracking change may reference it. The next tracking snapshot
loads only Evidence retrieved after `last_checked_at`.

NVD/KEV produce only generic material-update observations. Vendor advisories produce confirmation and
produce a patch observation only when the official document contains deterministic remediation/update
language. TypeScript independently rechecks source type and authority before accepting any transition.
A search result never becomes Evidence. A gateway failure yields `insufficient_evidence`, keeps the
question open, and cannot satisfy a stop condition.

Verification after checkpoint 3: Python runtime tests 26/26; combined TypeScript tracking and adapter
tests 24/24; typecheck and Docker Compose configuration pass; the real local TypeScript -> Python ->
TypeScript replay still passes with the new research-run lifecycle. Network and paid switches remained
off. Next gate: add a controlled official-procurement delta adapter, then construct the evidence-backed
development benchmark and scorer.

### Phase 5 implementation checkpoint 4 — official procurement delta

The tracking plan now carries explicit, validated source parameters rather than depending on title
inference. Additive migration `0043` supplies those parameters to databases that already applied
`0042`. The Python graph may request the new `ted_procurement_lookup` tool only when the plan declares
both an official-procurement target and a safe TED procedure identifier.

The TypeScript adapter sends an exact procedure-identifier query to the anonymous TED Search API v3,
accepts only official contract-award/result notice types, derives a stable official notice URL, and
emits an authoritative procurement-award observation. Non-result responses remain unknown; query
injection, malformed identities, timeouts, and response-shape drift fail closed. The call goes through
the existing capability, network switch, trace, tool-call, and evidence-document counters and creates no
paid receipt.

Verification after checkpoint 4: empty scratch database migration through `0043`; research gateway and
tracking store tests 11/11; adapter and schedule tests 15/15; Python tracking API tests 6/6; TypeScript
typecheck; and one anonymous live development lookup of TED procedure
`8c068af4-57cc-4dff-ac84-8f6f7c79de89`, which returned official publication `696533-2026` with zero
receipts. This live check is source compatibility evidence, not a benchmark result. Next gate: construct
and validate the evidence-backed development set and offline scorer before setting any numeric quality
threshold.

### Phase 5 implementation checkpoint 5 — evaluation contract

The evaluation schema and scorer were committed before formal development cases or numeric thresholds.
Each transition case freezes the complete tracking task, expected material changes with admissible source
URLs, complete resolved/open question state, decision, interval, forbidden conclusions, and provenance.
Validation requires 20–50 formal cases, all six declared strata, at least three development cases per
stratum, source-backed expected changes, independent review for holdout, and three distinct reviewers
when the holdout is labelled `MODEL_REVIEWED`.

The harness refuses to invent missing output and enforces exactly one result per case. It reports the
contract's exact-zero safety counters separately from material-change recall, supported-change precision,
question-state accuracy, decision accuracy, interval accuracy, latency, tokens, tool calls, receipts,
cost, and tool error rate. Unit tests cover stratum completeness, holdout review provenance, perfect
fixture scoring, and missing/duplicate result rejection. TypeScript typecheck and the four evaluation
tests pass. No quality threshold has been selected and no benchmark result is claimed yet.

### Phase 5 implementation checkpoint 6 — development replay and threshold preregistration

`datasets/event-tracking/development.jsonl` contains 24 source-verified cases: four each for vendor
confirmation, patch release, procurement award, no material change, tool failure, and stale/non-material
evidence. Official source identities come from the accepted Phase 4 development material or from the
Phase 5 TED compatibility check. Every case freezes its task, Evidence references, fixture-gateway mode,
complete expected question state, decision, interval, forbidden conclusion, and provenance. The
construction script is deterministic and the formal validator reports 24 cases across all six strata.

The replay script executed the real Python tracking graph against the frozen gateway modes. It made no
external request and no model call. Results: all nine hard-safety counters zero; material-change recall,
supported-change precision, question-state accuracy, decision accuracy, and interval accuracy all 1.0;
15 ms aggregate graph latency; 20 tool calls; zero tokens, cost, and receipts. Four deliberately injected
gateway failures yield a 0.20 operational tool-error rate and correctly produce `insufficient_evidence`.
This is expected scenario coverage, not a production reliability estimate.

`datasets/event-tracking/thresholds.json` was committed after that development run and before holdout
construction. It preserves exact-zero hard safety gates and preregisters minimums of 0.90 change recall,
0.95 supported-change precision, 0.90 question-state accuracy, 0.90 decision accuracy, and 0.85 interval
accuracy. The evaluator applies these gates fail-closed, and a regression test proves a named metric below
threshold fails. The development replay passes the preregistered gates. Next gate: construct a disjoint
holdout, obtain independent review, freeze it, and run it exactly once.

### Phase 5 implementation checkpoint 7 — unreviewed holdout candidate

The deterministic candidate constructor now produces 24 holdout rows across the same six strata using
source identities disjoint from development. It checks the disjointness directly, labels every row
`UNREVIEWED`, writes only to ignored `.data`, and passes candidate validation. The formal evaluator
allows `--candidate --validate-only` but refuses to score any unreviewed row, preventing accidental
holdout consumption before adjudication.

No holdout has been frozen or run. The remaining independent-review step requires either a human
adjudicator or three separately identified model reviewers and, for model review, explicit paid calls
through the existing receipt and budget boundary. This deferred participation item does not invalidate
the completed implementation, development replay, or preregistered thresholds.

Review and freeze tooling is implemented without consuming the candidate. The review command refuses to
run unless `--allow-paid` and an actual reviewer id are supplied, routes through the existing paid-call
receipt/budget controls, and stores receipt ids. Freeze requires three distinct complete review sets and
unanimous high-confidence acceptance for every row. It writes dataset and threshold hashes plus an
explicit `MODEL_REVIEWED` limitation. Default-off review and missing-review freeze refusal were verified;
no paid call, frozen holdout, or holdout result was produced.

Pre-holdout local validation: all Python runtime tests 27/27; Web build and tests 16/16; TypeScript
typecheck; Docker Compose configuration; an empty scratch database migration through `0043`; and the
Phase 5 contract/evaluation test selection 10/10 pass. The repository-wide Windows run again reached the
known POSIX `SIGTERM` timeout cases, so canonical Linux CI remains the final platform gate after the
holdout is frozen and the branch is ready for review.

### Phase 5 implementation checkpoint 8 — paid holdout review executed

The independent review used three model families — `glm-5.3-flash`, `deepseek-v4.1-flash`, `kimi-k3-2` —
through the existing CodeBuddy receipt/budget boundary against a dedicated scratch review database
(`sentinel_phase5-review-db`, port 55455). Batches were capped at one or two cases after the original
six-case batch timed out (receipt 1, `unknown`, 180 s stream timeout) and a later two-case attempt died
leaving a stale-pending receipt that the standard recovery path marked `unknown` (receipt 2). Both
receipts are preserved as failure evidence; neither produced a review file and neither was counted.

All three reviewers completed all 24 candidate cases (receipts 34-58, 59-70) plus a later supplement
(receipts 71-79). Reviewers were not unanimous at high confidence for the four original
`stale-or-nonmaterial` rows: their evidence carried an NVD URL while keeping the development template's
`cisa_advisory` source type, a real source-identity defect the review surfaced. Those four reviewed labels
were preserved unchanged and excluded from the freeze.

A disjoint six-case `stale-or-nonmaterial` supplement (`holdout-candidate-supplement.jsonl`, built from
the development template with consistent advisory identities, checked disjoint against development and the
original candidate) was reviewed by the same three models and unanimously accepted at high confidence.

### Phase 5 implementation checkpoint 9 — frozen holdout and final replay

Freeze tooling was minimally extended: non-unanimous cases are now excluded from the frozen set and
recorded in the manifest (`excluded_cases`, plus a new tested `selectUnanimousHighAccept` helper and a
`fragment` validator mode for supplement files) instead of failing the whole freeze; the 20-50 case and
strata-coverage validations still gate the frozen set. The frozen holdout contains 26 cases
(`datasets/event-tracking/holdout.jsonl`, SHA256 `a5c6be8218d7af23ffe5b210fd1dddf5162cced8ad24cd4e1d20b0289a78ccea`;
strata 4/4/4/4/4/6), labelled `MODEL_REVIEWED` — explicitly not human gold — with all 46 review receipt
ids, the threshold hash, and the excluded cases in `holdout-manifest.json`.

The single authorized final replay then ran: `python scripts/run-event-tracking-development.py --cases
datasets/event-tracking/holdout.jsonl` (the runner already supported `--cases/--out`; verified, no fix
needed) followed by `node scripts/eval-event-tracking.ts` against the pre-registered thresholds. Result:
`passed: true`. All nine hard safety metrics are zero; material-change recall, supported-change
precision, question-state accuracy, decision accuracy, and interval accuracy are all 1.00 (zero false
positives, zero false negatives, zero open-question, stop/continue, or interval errors). Operations:
16 ms total replay latency, 20 tool calls, 0.20 tool error rate from the four intentional tool-failure
cases, 0 tokens, 0 receipts, $0. Review cost evidence: 46 completed receipts, 1,487,746 input and
85,082 output tokens, no provider-reported cost. Full report:
`docs/evaluation/event-tracking-baseline.md`. The frozen holdout is immutable from this point; any
future remediation requires a new disjoint holdout.



### Historical Phase 4 record

Planning was explicitly authorized on 2026-10-08. The contract was written before implementation and
limits Phase 4 to one bounded Security Research Agent. Python owns reasoning; the TypeScript backend
retains database writes, credentials, outbound-network controls, receipts, budgets, validation, and
persistence. The Agent returns an auditable proposal and cannot modify core Story/Fact state.

A repository-grounded contract audit on 2026-10-08 added independent research execution/network
switches, TypeScript-enforced per-run capabilities and limits, and fail-closed paid service budgets.
The deterministic foundation, development benchmark, paid pilot, and pre-registered thresholds were
completed. The first three immutable holdouts exposed safety or quality deficiencies and remain retained
as failed evidence. Development-only remediation produced persistent NVD evidence, stricter unknown
preservation, and a full development replay. The independently reviewed fourth holdout then passed every
pre-registered safety and quality gate. Phase 4 is complete; its canonical final report is
`docs/evaluation/security-research-baseline-v4.md`.

### Phase 4 implementation checkpoint 1 — deterministic foundation

Implemented on 2026-10-08 without external or paid calls:

- additive migration `0040_agent_research.sql` for immutable run snapshots, hashed/expiring run
  capabilities, backend-owned usage counters, and append-oriented external evidence;
- strict matching Python/TypeScript research schemas, including dangling evidence rejection and the
  rule that a confirmed critical claim cannot rely only on secondary evidence;
- `AGENT_RESEARCH_ENABLED` and `AGENT_RESEARCH_NETWORK_ENABLED`, both default false independently of
  `MODEL_CALLS_ENABLED`;
- authenticated internal research endpoint and deterministic LangGraph behavior that preserves every
  unanswered question as an explicit unknown;
- TypeScript research client, run lifecycle persistence, hashed capability checks, server-side tool and
  byte/document limits, and fail-closed paid-service budget validation;
- scratch-database tests proving evidence/run persistence without modifying Story state.

Verification: Python 11/11, TypeScript Agent client 10/10, scratch PostgreSQL persistence 5/5,
`npm run typecheck`, `docker compose config --quiet`, empty-database migration through `0040`, and
`git diff --check` pass. The initial scratch migration attempt used the Compose default password against
an older local Docker volume and failed at PostgreSQL authentication before any migration; verification
then used a dedicated `sentinelintel_phase4_test` database and test-only role successfully.

### Phase 4 implementation checkpoint 2 — deterministic callback loop

Implemented and verified on 2026-10-08:

- private `/api/internal/agent/tools/:tool` route with constant-time service-token authentication,
  trace/run/capability correlation, sanitized errors, and no-store responses;
- Python tool-gateway client carrying the run capability without persisting or returning it;
- TypeScript-owned `stub` adapter returning explicit fixture evidence with `external_network: false`, no
  paid receipt, and no claim that the underlying research question was answered;
- LangGraph tool invocation and trace assembly while preserving the real question as unknown;
- an isolated full loop: TypeScript run → Python graph → TypeScript tool callback → Python proposal →
  TypeScript validation/persistence, with one bounded tool call and one Evidence row while Story remains
  unchanged.

Verification after checkpoint 2: Python 12/12, TypeScript Agent client 10/10, persistence 5/5, internal
gateway 3/3, `npm run typecheck`, `docker compose config --quiet`, `git diff --check`, and the isolated
Docker-network end-to-end check pass. The end-to-end result recorded `status=completed`, `toolCalls=1`,
`evidence=1`, and `externalNetwork=false`. Temporary API/Agent check containers were removed.

Next implementation gate: no-cost NVD and CISA KEV adapters through the same TypeScript gateway, with
fixture-first tests and live development checks separately guarded by `AGENT_RESEARCH_NETWORK_ENABLED`.
Vendor discovery, generic search, real models, paid calls, and benchmark construction remain later gates.

### Phase 4 implementation checkpoint 3 — NVD and CISA KEV

Implemented and verified on 2026-10-08:

- NVD CVE API 2.0 adapter with strict CVE-id validation and normalized status, English description,
  timestamps, metrics, CWEs, and bounded references;
- CISA KEV JSON adapter with normalized vendor/product, date added, remediation deadline/action,
  ransomware-use marker, notes, and CWEs;
- guarded HTTP, size/time limits, zero paid receipts, authoritative provenance, and content hashes;
- deterministic Python CVE detection that selects `nvd_lookup` then `kev_lookup` within the backend-owned
  tool limit and emits only Evidence-supported critical claims;
- explicit negative semantics: NVD/KEV misses remain misses/unknowns and are not converted into claims
  that a vulnerability does not exist or has not been exploited.

Verification after checkpoint 3: Python 13/13, adapter fixtures 5/5, TypeScript Agent client 10/10,
persistence/gateway source flow 6/6, internal gateway 4/4, `npm run typecheck`, `git diff --check`, and
the isolated no-network callback replay pass. A live no-cost development check with the network switch
explicitly enabled returned CISA KEV `found=true`, one Evidence item, and zero receipts for
`CVE-2021-44228`. The NVD endpoint connection timed out (`UND_ERR_CONNECT_TIMEOUT`) before any HTTP
response in this Windows environment, both with and without the project's environment file; no success
is claimed. Fixture parsing and bounded gateway execution for NVD pass.

Next implementation gate: fixture-first vendor advisory registry/search and official advisory fetch.
Generic search, real models, paid calls, benchmark construction, holdout freeze, and final evaluation
remain later gates.

### Phase 4 implementation checkpoint 4 — vendor advisories

Implemented and verified on 2026-10-08:

- a fixed Cisco, Fortinet, Hikvision, and Microsoft advisory registry with explicit official hosts and
  advisory path patterns;
- `vendor_advisory_search` as discovery-only output and `evidence_fetch` as the separate authoritative
  document boundary;
- deterministic Microsoft CVE URL location and NVD-reference candidate hints, with every hint
  independently revalidated against the registry before use;
- guarded official-document fetching with redirect destination validation, HTTPS/credential/port checks,
  content-type and byte limits, sanitized text extraction, content hashes, CVE extraction, and zero
  receipts;
- deterministic Python vendor detection and the bounded NVD → KEV → vendor discovery → official fetch
  callback path;
- hostile-host, misleading-subdomain, credential, wrong-path, off-registry redirect, unsupported-content,
  and prompt-injection fixtures.

Verification after checkpoint 4: Python 14/14, adapter/client 21/21, scratch-database persistence flow
7/7, internal gateway 4/4, and `npm run typecheck`. A no-cost live fetch of Fortinet advisory
`FG-IR-25-254` returned authoritative vendor Evidence for `CVE-2025-32756` with zero receipts. The tested
Fortinet listing page did not return a CVE-filtered candidate, so real Fortinet location uses a validated
structured-source candidate such as an NVD reference. Microsoft CVE URLs are deterministically located,
but the raw client-rendered page did not contain usable advisory text and was correctly rejected; no live
Microsoft evidence success is claimed.

Next implementation gate: construct the Phase 4 development benchmark and deterministic evaluation
harness from evidence-backed cases. Generic search, real models, paid calls, holdout freeze, and final
evaluation remain later gates.

### Phase 4 evaluation checkpoint 5a — deterministic harness pilot

Implemented and verified on 2026-10-08:

- a strict JSONL case schema that freezes the existing versioned Story snapshot, objective, expected
  claims/unknowns/conflicts, forbidden conclusions, source identities, collection time, and label method;
- holdout provenance gates that reject source-only labels and require at least three distinct reviewers
  for `MODEL_REVIEWED` cases;
- a strict result schema for B0 snapshot-only and B1 bounded-tool proposals, including latency, tokens,
  cost, tool calls, receipts, policy violations, and core mutations;
- safety scoring for unsupported critical claims, missing Evidence, search snippets used as Evidence,
  policy violations, Story/Fact mutations, forbidden conclusions, and incomplete tool traces;
- quality scoring for expected-claim recall, authoritative-evidence recall, supported-claim precision,
  expected-unknown preservation, conflict preservation, tool errors, terminal status, and operations;
- a six-case `SOURCE_VERIFIED` development pilot covering all required strata once. It validates the
  harness but is neither the final benchmark nor a frozen/model-run baseline;
- cross-runtime rejection of conflicts that repeat one Evidence id instead of citing two distinct
  documents.

Verification after checkpoint 5a: Python 15/15, evaluation harness 5/5, combined adapter/client/harness
26/26, `npm run typecheck`, pilot parse/validation 6 cases / 6 strata, and `git diff --check`.

Next implementation gate: collect, verify, and adjudicate the remaining evidence-backed development
cases until the canonical `development.jsonl` contains 20–50 valid cases, then execute a small explicitly
budgeted real-model development pilot and pre-register thresholds. Holdout construction/freeze and final
B0/B1 remain later gates.

### Phase 4 evaluation checkpoint 5b — formal development benchmark

Completed on 2026-10-08:

- `datasets/security-research/development.jsonl` contains 24 `SOURCE_VERIFIED` development cases;
- all six required strata contain exactly four cases;
- every case freezes a complete versioned Story snapshot, expected claims/unknowns, forbidden conclusions,
  source URLs, collection time, and construction note;
- construction is deterministic from `datasets/event-relations/dev.jsonl` and explicitly reuses source
  evidence only, not Phase 2 relation labels;
- NVD/KEV and vendor claims retain exact admissible official identities, while PoC, source-comparison,
  and cross-CVE remediation questions preserve unknowns where the allowlisted evidence is insufficient;
- the formal validator now requires 20–50 cases and at least three cases in every development stratum.

Verification: deterministic reconstruction produced 24 cases; canonical validation passed with 6 strata;
the committed benchmark balance test passed; `npm run typecheck` passed.

Next gate: execute a small, budget-capped real-model development pilot on a representative subset, then
pre-register numeric quality thresholds before any holdout is constructed.

### Phase 4 evaluation checkpoint 6 — paid pilot and threshold pre-registration

Completed on 2026-10-08 against one representative from each of the six development strata. The direct
`deepseek-flash` provider returned usable evidence-bound B1 proposals through receipts. Every B1 hard
safety count was zero. Quality results were expected-claim recall `1.0`, authoritative-evidence recall
`0.8889`, supported-claim precision `0.6923`, expected-unknown preservation `1.0`, conflict preservation
`1.0`, and tool error rate `0.0769`.

`datasets/security-research/thresholds.json` was written from this development evidence before holdout
construction and must not be changed in response to holdout results.

### Phase 4 evaluation checkpoint 7 — holdout review and freeze

The deterministic constructor produced 20 candidates across all six strata from the independent Phase 2
holdout source corpus. Two independent reviews completed: `deepseek-flash` accepted 20/20 at high
confidence, and `deepseek-v4-pro` accepted 20/20 with 17 high and three medium-confidence
revision/unknown labels. `glm-5.3-flash` later accepted 20/20 at high confidence in four shards.

The direct endpoint explicitly rejects every model except `deepseek-flash` and `deepseek-v4-pro`.
Earlier CodeBuddy/GLM attempts are retained as failure evidence: native structured stdin timed out and
bounded argument modes without the owner shell's API-key environment did not return captured output.
No failed or empty response was used as a label. The successful owner-shell shards used receipts
`69`–`72`; the holdout was then frozen before final B0/B1 observed it.

### Phase 4 evaluation checkpoint 8 — frozen holdout and failed final gate

Completed on 2026-10-09 with a non-passing result:

- the third reviewer, `glm-5.3-flash`, accepted all 20 cases at high confidence in four receipt-backed
  shards;
- the 20-case holdout was frozen with three reviewer identities, receipt ids, threshold hash, and
  holdout hash before final B0/B1 execution;
- a new scratch database enforced a four-call final budget;
- two five-case requests completed, the third raw response was persisted but rejected by the strict
  schema, and the fourth request was not sent;
- the valid 10-case prefix already contained three unsupported critical claims; the rejected response
  contained four negative absence claims with empty Evidence references;
- expected-claim and authoritative-evidence recall on the valid prefix were both `0.4444`, while the
  tool error rate was `0.4545` due to NVD failures.

The exact-zero safety contract is not met. No retry, output repair, prompt change, or threshold change was
performed after observing holdout output. This holdout is consumed and frozen. Phase 4 remains incomplete;
future remediation requires development-only work followed by a new independently reviewed holdout.

### Phase 4 evaluation checkpoint 9 — development-only remediation

Completed on 2026-10-09 without reusing or modifying the consumed holdout:

- model claim ids are now restricted to the case's frozen expected allowlist, so a lookup target alone
  cannot authorize a positive or negative claim;
- the prompt forbids every zero-Evidence claim and preserves negative lookup results as unknowns;
- NVD requests are deterministically spaced by 6.1 seconds to stay below the public no-key limit;
- exact frozen unknown questions may be restored only when a provider appends a case-specific suffix;
- a six-stratum development-only paid replay passed every hard safety gate with expected-claim recall
  `1.0`, authoritative-evidence recall `0.8889`, supported-claim precision `1.0`, expected-unknown and
  conflict preservation `1.0`, and tool error rate `0.1538`;
- `thresholds-v2.json` was pre-registered from that replay before constructing the second holdout;
- the second 20-case candidate excludes all source rows and CVEs used by Phase 4 development or the
  consumed holdout and covers all six strata.

Phase 4 remains incomplete until this candidate receives three independent model reviews, is frozen as
`MODEL_REVIEWED`, and passes a fresh receipt-backed B0/B1 final run. The first holdout and its failure
report remain immutable evidence.

### Phase 4 evaluation checkpoint 10 — second frozen holdout failed

Completed on 2026-10-09 with a non-passing result. Three independent models unanimously accepted the
new 20-case holdout at high confidence, and it was frozen before execution. Three shards produced 15
valid result pairs; another shard was rejected because the model emitted NVD claims outside three
revision cases' empty allowlists. No rejected output was repaired or retried. A subset diagnostic also
exposed a scorer defect that can count duplicate expected claim ids more than once and report recall
above `1.0`. See `docs/evaluation/security-research-baseline-v2.md`.

The second holdout is consumed and immutable. Phase 4 remains incomplete. Any next attempt requires
development-only deterministic claim projection and duplicate-id validation, then a third independent
holdout and a fresh final database.

### Phase 4 evaluation checkpoint 11 — second development-only remediation

Completed on 2026-10-09. Non-allowlisted and duplicate model claims are now deterministically removed
before proposal validation, while the scorer rejects duplicate emitted claim ids rather than inflating
recall. NVD transient `TimeoutError` and `TypeError` failures receive at most two paced retries; every
retry observes the public no-key interval. The six-stratum development replay passed all safety gates
with claim recall `1.0`, authoritative-evidence recall `0.8889`, precision `1.0`, unknown/conflict
preservation `1.0`, and tool error rate `0.0769`. `thresholds-v3.json` was frozen from these results
before the third holdout was constructed.

### Phase 4 evaluation checkpoint 12 — third independent holdout frozen

Completed on 2026-10-10. The 20-case candidate excludes 64 previously used source rows and 72 CVEs,
covers all six strata, and was independently accepted by `deepseek-flash`, `deepseek-v4-pro`, and
`glm-5.3-flash`. All reviewers accepted 20/20; two GLM decisions used medium rather than high
confidence. The dataset is explicitly `MODEL_REVIEWED`, not human gold. Its holdout and v3 threshold
hashes are recorded in `holdout-v3-manifest.json`. No final result had been observed when it was frozen.

### Phase 4 evaluation checkpoint 13 — third final gate failed on quality

Completed on 2026-10-10. All four final shards completed once with 20/20 coverage and four completed
receipts. Every hard safety metric is zero; supported-claim precision and conflict preservation are
`1.0`, and tool error rate is `0.15`. The run still failed pre-registered quality gates: expected-claim
recall `0.70` versus `0.80`, authoritative-evidence recall `0.70` versus `0.75`, and expected-unknown
preservation `0.8333` versus `1.0`. Six cases lost NVD Evidence and two vendor-remediation cases omitted
the frozen unknown. See `docs/evaluation/security-research-baseline-v3.md`.

The third holdout is consumed and immutable. Phase 4 remains incomplete. No fourth holdout should be
constructed until development evidence demonstrates both durable NVD retrieval and source-appropriate
unknown preservation.

### Phase 4 evaluation checkpoint 14 — durable-source development remediation

Completed on 2026-10-10 without constructing a fourth holdout:

- migration `0041` adds a story-independent cache for successful structured NVD Evidence;
- live success atomically refreshes the cache, while a transient live failure may reuse only a prior
  successful authoritative record and marks provenance with `cache_hit`, cache time, and live error;
- misses and failures are never cached as negative facts, and each reuse receives a new Evidence id;
- the real TypeScript tool gateway and evaluation runner both use the same persistent NVD path;
- source-appropriate unknown preservation keeps vendor, PoC, insufficient-evidence, and unresolved
  revision questions open unless the required Evidence class exists;
- an empty-database migration and a forced live-failure cache test passed;
- the six-stratum paid development replay again passed every safety gate with claim recall `1.0`,
  authoritative-evidence recall `0.8889`, precision `1.0`, unknown/conflict preservation `1.0`, and
  tool error rate `0.0769`; six successful NVD records were persisted.

This is development evidence only. Phase 4 remains incomplete and no fourth holdout exists.

### Phase 4 evaluation checkpoint 15 — full development replay passed

Completed on 2026-10-10. All 24 development cases ran in four receipt-backed shards against a fresh
database. Every safety gate passed. B1 reached claim recall `0.9444`, authoritative-evidence recall
`0.9444`, supported-claim precision `1.0`, unknown/conflict preservation `1.0`, and tool error rate
`0.0385`; all satisfy the frozen v3 quality gates. Five strata scored `1.0` across all quality metrics.
Vendor remediation scored `0.8333` claim/evidence recall because two official-advisory fetches failed,
while precision and unknown preservation stayed `1.0`. The source cache persisted 23 NVD records.

The canonical development report is `docs/evaluation/security-research-development-full.md`. This
clears the development-evidence prerequisite only; Phase 4 remains incomplete and no fourth holdout has
been constructed.

### Phase 4 evaluation checkpoint 16 — fourth-holdout thresholds pre-registered

Completed on 2026-10-10 before constructing or reviewing a fourth holdout. `thresholds-v4.json` records
the complete 24-case development result while retaining the existing safety and quality gates. The
threshold contract is now immutable for the next final attempt.

### Phase 4 evaluation checkpoint 17 — fourth independent candidate constructed

Completed on 2026-10-10. Existing frozen relation corpora had no unused KEV cases after excluding
development and the first three holdouts. The constructor therefore did not recycle a consumed CVE:
three new source rows were collected from the official CISA KEV feed and paired with successful official
NVD retrievals. The resulting 20-case candidate excludes 84 prior source rows and 92 prior CVEs and
covers all six required strata. It remains an unfrozen candidate until three independent reviews agree.

### Phase 4 evaluation checkpoint 18 — fourth independent holdout frozen

Completed on 2026-10-10. `deepseek-flash`, `deepseek-v4-pro`, and `glm-5.3-flash` independently accepted
all 20 cases. Seventeen GLM decisions were high confidence and three were medium; the two direct reviewers
marked all cases high confidence. The dataset is frozen as `MODEL_REVIEWED`, not human gold, with its
holdout and v4 threshold hashes recorded in `holdout-v4-manifest.json` before final execution.

### Phase 4 evaluation checkpoint 19 — final gate passed

Completed on 2026-10-10. A fresh database applied migrations through `0041`, prewarmed all 18 unique
holdout CVEs under NVD's public limit, and executed four five-case final shards exactly once. All four
receipts completed. Every safety metric is zero. B1 expected-claim recall, authoritative-evidence recall,
supported-claim precision, expected-unknown preservation, and conflict preservation are all `1.0`; tool
error rate is `0.0`. All frozen v4 thresholds pass. The canonical report is
`docs/evaluation/security-research-baseline-v4.md`.

Phase: **Phase 4 — Security Research Agent**

Status: **COMPLETE**

The accepted benchmark is explicitly `MODEL_REVIEWED`, not human gold. The first three failed holdouts
and their reports remain immutable evaluation history.

Final local validation on 2026-10-10:

- Phase 4 adapter/cache/gateway/evaluation tests: 37 passed;
- Python Agent runtime: 15 passed;
- TypeScript typecheck: passed;
- web production build and tests: 16 passed;
- Docker Compose configuration: passed;
- empty-database migrations through `0041`: passed;
- the broad root suite was stopped after two unrelated Windows SIGTERM integration tests each exhausted
  their 120-second harness timeout; all Phase 4 tests completed before those timeouts and no Phase 4
  assertion failed. Canonical Linux CI remains the repository-wide merge gate.

## Phase 3 — completed history

Phase: **Phase 3 — Python Agent Foundation**

Branch: `phase/3-python-agent-foundation`

Base: `main` = `694973c` (Phase 2 squash merge)

Status: **COMPLETE**

Implementation contract: `docs/00-sentinelintel/04-Phase3-Agent-Runtime-Plan.md`.

The contract was written before implementation. Phase 3 is limited to an internal FastAPI/LangGraph
runtime, typed model/tool seams, a deterministic test graph, structured trace/error propagation, a
bounded TypeScript HTTP client, Docker integration, and no-network tests. It adds no database table,
real model call, research tool, scheduler, or Phase 4 business logic.

Verified locally on Windows on 2026-10-08: Python tests 7/7, TypeScript client tests 7/7,
`npm run typecheck`, `docker compose config --quiet`, native TypeScript-to-Python contract check, Agent
Docker image build/health, isolated-container dependency check, the in-network TypeScript-to-Python
contract check, the production web build, and web tests 16/16 all pass. The GitHub workflow now repeats
the Python, TypeScript, cross-runtime, Docker-health and in-network checks without credentials or external
service calls. Canonical Linux GitHub Actions run `37755597908` passed both jobs: `check` in 1m33s and
`docker` in 1m00s. All contract acceptance items are satisfied. Phase 3 is complete.

## Phase 2 — completed history

Phase: **Phase 2 — Security Event Grouping Benchmark**

Branch: `phase/2-security-event-grouping`

Base: `main` = `225e0f6473de8ac2b827c1ce34d4888a2111ac54` (tag `sentinelintel-phase1`)

Status: **COMPLETE_WITH_MODEL_REVIEWED_HOLDOUT_AND_BASELINE_LIMITATIONS**

Scope: establish a security event-relation benchmark, measure the current AIHOT grouping baseline with
it, and name the security hard cases the current system fails on. **Measure first** — Migration Spec §11
permits a grouping prompt or recall change only after that report shows a problem
(*只有此报告证明有问题，才允许改 grouping prompt/recall*).

Design and audit for owner review: `docs/evaluation/event-grouping-plan.md`. The design was **revised
after an independent Phase 2 design audit** — see `### Phase 2 design revision` below.

The three design rounds changed documentation only. Implementation began after owner approval on
2026-10-05 and completed on 2026-10-08; see `### Phase 2 implementation checkpoint` and the final
baseline below. No grouping prompt, threshold or production routing changed. Phase 1's frozen artifacts
are unchanged.

### Phase 2 baseline audit — verdicts

| question | verdict |
|---|---|
| Is the "370 labelled pairs" measurement reproducible? | **NOT_REPRODUCIBLE** — `git log --all -S "370"` / `-S "labelled pairs"` / `-S "170 real root pairs"` return only the upstream AIHOT import `877d6d5` and the Phase 0 audit that quotes the comment; `git log --all -- packages/backend/src/events/relate.ts` returns only `877d6d5`. No dataset in the repo, nothing in `.data/`, no schema/provenance doc. **Not usable as a Phase 2 baseline, and not to be rebuilt by guesswork.** |
| Does an event/grouping eval harness already exist? | **No** — classification (c): nothing anywhere. `scripts/eval-selection.ts` is binary select/reject and unrelated; `scripts/regroup-events.ts` is an operational tool that writes real membership and calls paid models even with `--dry-run`; `tests/events.test.ts` hardcodes every relation answer. |
| Which recall constants does production use? | All **module-private** in `group.ts`: `RECALL_DAYS 14`, `RECALL_MIN_COSINE 0.6`, `RECALL_TOP_FACTS 10`, `CONFIRM_BELOW_COSINE 0.85`, `SIGNAL_MIN_COSINE 0.72`, `SIGNAL_AUTO_COSINE 0.92`, `SIGNAL_TOP_FACTS 4`, `RELATED_MIN_REPORTS 2`, `REMATCH_HOURS 6`, `WAIT_HOURS 48`, lexical floor `0.25`. |
| Which recall branch runs here? | **Lexical fallback** — `embeddingsAvailable()` needs `MODEL_CALLS_ENABLED` **and** an embedding key, and this `.env` has no `EMBEDDING_*` and no `DASHSCOPE_API_KEY`. **The repository does not prove which branch any deployment runs**; the earlier statement here that "production runs the embedding path" was an inference from this local observation and is withdrawn. A recall number measured here is a lexical-branch number and must be reported as one. |

### Phase 2 baseline evidence (Windows, actual output)

```text
git diff --check                    → clean, exit 0
npm run typecheck                   → pass, exit 0
node --test tests/events.test.ts    → tests 10 / pass 10 / fail 0 / cancelled 0, exit 0, 4.5 s
node --test tests/signals.test.ts   → tests 3 / pass 3 / fail 0 / cancelled 0, exit 0, 1.9 s
```

Fresh throwaway database `p2_grouping_ci` (35 migrations) in the `sentinelintel-p1-pg` container. Both
suites stand local HTTP stubs in for every provider (`tests/setup.ts`), so they make no paid call and no
network request. They prove the grouping **invariants** (manual override races, revision keeps
membership, regroup, story root, two-model merge, related-story links) — and they say **nothing** about
relation accuracy, because every relation answer in them is hardcoded by the stub.

### Phase 2 design revision

An independent Phase 2 **design** audit raised ten findings. All ten are addressed in
`docs/evaluation/event-grouping-plan.md`; none of them required code:

| # | finding | resolution |
|---|---|---|
| 1 | The primary classifier was wrongly the pair path | The primary is now the production **batch** judge (`BATCH_SYSTEM`, `modelFor("group")`, `BatchSchema`) — the call that actually decides in production. `PAIR_SYSTEM` / the review model is a **confirmation/review diagnostic**, reported in a separate table and never averaged into the primary matrix |
| 2 | The schema lacked stable report identity, conflated the anti-leakage key with the event identity, and left the end-to-end direction/order/time fields implicit | Every report has a dataset-unique `reportId`; `splitGroupId` (anti-leakage only) is separated from `identity.eventKey`/`identity.storyKey`; each case states its query and candidate roles; `publishedAt` and `ingestedAt` are both recorded, with the query asserted to be the later arrival inside `RECALL_DAYS` |
| 3 | The quotas could not all hold at once | The band/rate quotas are withdrawn with the arithmetic shown, and replaced by a fixed, mechanically checkable allocation (240 = 180 + 60 over 16 strata and 4 classes — see the contract table below), which the validator must re-derive and fail on if it drifts |
| 4 | `multiple-cves-in-one-advisory` was labelled `SAME_OCCURRENCE` | **Corrected to `UNRELATED`**, aligned with `group-definitions.md`: several products *inside one advisory* are one happening (line 1), but two different **CVE identifiers** are two things (line 14) |
| 5 | The same-CVE cross-source case and the literal same-URL shortcut were conflated | Split: the cross-source case became stratum 9 (`same-cve-cross-source-different-url`, the judge decides), and the same-URL shortcut became a separate track. That track was then **demoted out of the primary set entirely** in the contract round below — it is now a deterministic diagnostic test, not a stratum |
| 6 | `AMBIGUOUS` was proposed as a fifth `gold.relation` | Removed. The vocabulary is exactly the four production relations; unsettled cases use `annotation.status` (`decisive` / `disputed` / `insufficient`) and are excluded from decisive metrics with their counts printed |
| 7 | SelectBench was described as unable to store multiple classes | Corrected: the text columns **could** store another label, but the importer's summary contract and the admin's hardcoded `fp/fn/tp/tn` outcome semantics are binary selection-specific — so reuse would need new columns *and* new semantics |
| 8 | The production embedding path was asserted as a repo fact | Downgraded to `LOCAL_OBSERVED`; the document now states that the repository does not prove which branch a deployment runs, and requires the recall stage to report the branch it used |
| 9 | The recorded HEAD could be confused with the documentation commit | §1 now records the **audit starting HEAD** (`225e0f6`) as the audited tree and lists the documentation commits separately |
| 10 | Phase 1's text still said "Phase 2 has not started" | Rewritten in the historical tense — it had not started **when Phase 1 closed**; it has since begun |

Owner decisions that were open in the first revision are now **settled** and recorded as constraints in
the plan's §12.1: 240/180/60; signals out of the primary benchmark; a minimal **non-runtime** evaluation
seam allowed, targeting the production batch judge; final paid Stage B/C authorized; and an
owner-approved replacement of human holdout adjudication with at least three independent model reviews.
Only unanimous high-confidence sufficient labels may freeze, they are recorded `MODEL_REVIEWED`, and
neither split may be described as human gold.

### Phase 2 benchmark contract correction

A follow-up review raised eight **contract** issues (as opposed to design issues). All eight are addressed
in `docs/evaluation/event-grouping-plan.md`; none required code:

| # | issue | resolution |
|---|---|---|
| 1 | Annotation provenance was case-level, while the gold relation is per candidate | `gold.relation` and the whole `annotation` block moved **onto each candidate** (`status`, `labelSource`, `labeller`, `confidence`, `humanAdjudicated`, `adjudicator`, `sourceUrls`, `note`). A case-level `humanAdjudicated` flag no longer exists. This originally required per-candidate human holdout adjudication; the later owner-approved three-model deviation supersedes that requirement while retaining candidate-level provenance. |
| 2 | Event/story identity was case-level, and Stage C had no mapping to it | `identity.eventKey` / `identity.storyKey` moved **onto each report** (query and every candidate). Stage C now reads: `SAME_OCCURRENCE` = same event + same story; `SAME_STORY` = **different** event + same story; `UNRELATED` = different story; `ROUNDUP` = **unconstrained**, explicitly not auto-treated as one story. A new §7.3.1 makes relation↔identity consistency a validator assertion |
| 3 | The per-stratum greedy split algorithm could not always satisfy the fixed table | Withdrawn: a `splitGroupId` may span strata, so taking groups whole stratum-by-stratum can miss the quota. The split is now assigned **globally at `splitGroupId` level, once, during construction**, recorded explicitly in the frozen file, and never re-decided by the harness — which only validates (no `splitGroupId` or `reportId` crossing the split, every case's reports on one side, every `caseId` once, the frozen totals and the frozen class/stratum counts). If the global allocation cannot reach the table, case selection is adjusted **before freeze**; a `splitGroupId` is never split to meet a quota |
| 4 | No time-rebasing contract, so the benchmark would expire | Added §7.8. The dataset keeps real `publishedAt`/`ingestedAt`; the **fixture** shifts both by one common `discoveryTimeShift` onto an `evaluationTimeAnchor` chosen relative to run time, preserving ingestion order and every real interval, and reports both in `meta`. Fixture rows use `backfill = false`, and the fixture asserts `discovered_at - published_at` equals the dataset's — without which `isHistorical()` (`materials.ts:91–93`, `STALE_ON_DISCOVERY_MS = 48 h`) would return `verdict: "historical"` (`group.ts:625–629`) for every case and silently empty Stage C. Stage A/C may not read wall-clock time directly |
| 5 | `literal-same-url-duplicate` did not deserve 16 of 240 primary cases | **Removed from the primary set.** The repo folds an identical normalised URL into one article before grouping: `identityKeyFor(m)` → `identityKeyForUrl(m.url)` (`materials.ts:114–120`, `lib/url.ts:48–55`), `articles.identity_key text NOT NULL UNIQUE` (`database/migrations/0001_core.sql:63`), and `upsertMaterial` inserts `ON CONFLICT (identity_key) DO NOTHING` (`materials.ts:141–149`). It becomes a **deterministic diagnostic / integration test** in the harness track. Its 16 cases went to two new security-relevant strata — `procurement-correction-or-cancellation` and `policy-amendment-or-implementation-date` (`group-definitions.md:9` and `:10`) — keeping 240/180/60. "Advisory scope/status revision" was not added because stratum 11 already is that case (`group-definitions.md:8`); "same procurement project different lot" was declined because the definitions do not settle it |
| 6 | Non-decisive labels were still allowed inside the formal cases | The frozen files are now **decisive-only**: `dev.jsonl` / `holdout.jsonl` may contain only candidates with `annotation.status === "decisive"`. A `disputed` or `insufficient` candidate may not sit in a case even uncounted, because `judgeBatch` answers the whole candidate list in one prompt, so an unsettled entry can change the answers for its neighbours. Unsettled material goes to a separate review pool / annotation queue. Removes the run-time exclusion step entirely |
| 7 | Blocker wording overstated what the open owner items block | Corrected at that revision. Both items were subsequently resolved by the owner: paid Stage B/C is authorized and the human holdout gate is superseded by the explicit unanimous three-model deviation. |
| 8 | Do not regress the already-corrected design | Verified in place: primary classifier = production `judgeBatch`/`BATCH_SYSTEM`/`modelFor("group")`; `PAIR_SYSTEM`/`groupReview` diagnostic only; exactly four production relation labels; signals out of the primary benchmark; SelectBench described by its actual binary summary/outcome semantics; `REPO_VERIFIED` kept distinct from `LOCAL_OBSERVED`; no prompt/threshold/algorithm change; no paid eval; no Phase 3 |

On 2026-10-07 the owner approved one final **pre-freeze semantic correction** after independent review:
a synchronous official/vendor confirmation and synchronous cross-vendor reporting of one disclosure are
`SAME_OCCURRENCE`; only a later confirmation, patch, revision, KEV/exploitation or status change is
`SAME_STORY`. This is an annotation-contract correction before freeze and before Stage B/C, not
result-driven production tuning. No production prompt, threshold or grouping behavior changed.

The current primary allocation is 16 strata: per class `SAME_STORY` 66 (dev 45 / holdout 21),
`SAME_OCCURRENCE` 76 (58 / 18), `UNRELATED` 64 (52 / 12), `ROUNDUP` 34 (25 / 9) — **240 (180 / 60)**.
The per-stratum table is in the plan's §7.5.

### Phase 2 implementation checkpoint

Implementation started from clean commit `41656ae` after explicit owner approval. The first checkpoint
adds only evaluation infrastructure:

- `scripts/event-grouping-eval-core.ts` implements the candidate-level JSONL schema/parser, the frozen
  16-stratum allocation, structural and anti-leakage validation, relation↔identity validation, the
  candidate-level holdout provenance gate (human adjudication or the approved unanimous three-model
  review), fixture time rebasing, and relation metrics with
  distractors reported separately;
- `scripts/eval-event-grouping.ts` validates the complete frozen dataset before running, uses the
  production batch judge for the relation stage, and requires both `MODEL_CALLS_ENABLED=true` and the
  explicit `--allow-paid` flag before making any model call. Its free `recall` stage now drives the
  production recall seam against temporary scratch-database fixtures and writes recall@K, missed cases,
  per-stratum results and the actual recall-branch distribution. `end-to-end` performs the real
  scratch-database replay; the `all` convenience stage remains fail closed so paid stages are explicit;
- `packages/backend/src/events/group.ts` exports the existing production `judgeBatch`, `confirmMerge`
  and four already-existing recall constants, plus a read-only `recallForEvaluation` wrapper over the
  existing `recallFacts`, for the non-runtime harness. Their prompts, models, temperatures, token limits,
  thresholds and production call sites are unchanged;
- `scripts/event-grouping-eval-fixture.ts` creates and cleans one rebased case at a time in an enforced
  `*_test`/`*_ci` database. It also runs the same-URL diagnostic through normal ingestion, proving that
  two normalized forms fold to one article before grouping;
- the pure core now includes Stage C pairwise story precision/recall plus attributable false-merge and
  false-split lists. The end-to-end stage now seeds prior reports into Fact/Story identities, runs the
  reports globally by `ingestedAt`, sends every unique report through the real `groupArticle()` path,
  follows `merged_into` to live stories, reports verdict distribution and story metrics, and cleans the
  scratch fixture. The earlier per-case replay remains only a fixture unit test, not the Stage C metric;
- the pair-confirmation diagnostic first obtains real recall scores, runs the production batch judge,
  and calls `confirmMerge` only for the production subset (`SAME_OCCURRENCE` below `0.85`); it remains
  behind the same explicit paid-call gate;
- receipt reporting deduplicates logical receipt ids and aggregates every `receipt_attempts` row,
  including retries, failures, tokens and latency. A WeakMap-backed evaluation seam captures reused
  report, confirmation and consolidation receipt ids without changing `GroupResult` or production output;
- `scripts/build-event-relation-development.ts` routes any whole case containing a non-decisive candidate
  to `.data` review storage and writes `dev.jsonl` only with `--freeze` after the exact 180-case,
  per-stratum development allocation validates. It refuses holdout input and never auto-resolves labels;
- owner-authorized development annotation now has a two-family path:
  `scripts/annotate-event-relation-development.ts` batches DeepSeek V4.1 Flash proposals and independent
  CodeBuddy GLM-5.3-Flash reviews. CodeBuddy runs for one turn with an empty tool whitelist, strict empty
  MCP configuration, no session persistence and JSON-Schema output. `providers/codebuddy.ts` places the
  subprocess behind the existing receipt lifecycle, and migration `0039_codebuddy_budget.sql` gives the
  service an explicit 5/minute, 50/hour, 300/day circuit breaker. Agreement becomes `model-reviewed`;
  missing evidence, model disagreement, and disputed or low-confidence SAME_OCCURRENCE/SAME_STORY
  boundaries remain outside the formal dataset in the review pool;
- owner-authorized holdout annotation now has a three-model path:
  `scripts/annotate-event-relation-holdout.ts` independently invokes CodeBuddy models
  `deepseek-v4.1-flash`, `glm-5.3-flash` and `kimi-k3-2` through the same receipt/budget controls. It
  freezes only unanimous, high-confidence, sufficient decisions; every other case is written to the
  review pool. Frozen candidates record the three model ids in `annotation.reviewers`, remain
  `humanAdjudicated: false`, and must be reported as `MODEL_REVIEWED`, never human gold;
- `tests/event-grouping-eval.test.ts`, `tests/event-grouping-fixture.test.ts`,
  `tests/codebuddy-provider.test.ts` and `tests/event-grouping-development-annotation.test.ts` cover schema parsing,
  frozen allocation, decisive-only and identity rejection, holdout adjudication, split leakage,
  relation/recall/story metrics, interval-preserving time rebasing, real lexical recall and URL folding,
  CodeBuddy envelope/command safety, complete batch coverage and deterministic dual-review merging.

Verification at this checkpoint (Windows, no provider/network calls):

```text
npm run typecheck                                  → pass, exit 0
node --test tests/codebuddy-provider.test.ts tests/event-grouping-development-annotation.test.ts tests/event-grouping-eval.test.ts
                                                   → tests 18 / pass 18 / fail 0, exit 0
node --test tests/event-grouping-eval.test.ts tests/event-grouping-fixture.test.ts tests/events.test.ts
                                                   → tests 25 / pass 25 / fail 0, exit 0
node --test tests/event-grouping-fixture.test.ts tests/events.test.ts
                                                   → tests 14 / pass 14 / fail 0, exit 0 (local HTTP model stubs)
node --test tests/events.test.ts tests/materials.test.ts
                                                   → tests 19 / pass 19 / fail 0, exit 0
git diff --check                                   → clean, exit 0
```

The database-backed suites used a fresh migrated `p2_impl_verify_ci` database. An earlier run against
the reused `p2_grouping_ci` database had one recall-pollution failure (`same-fact` instead of the
fixture's expected `new-story`); the same test passed on the clean database, so that run is recorded as
an environment/fixture-isolation issue rather than a code regression.

The initial development evidence-collection checkpoint used `scripts/collect-event-relation-evidence.ts` to read
the public GitHub Advisory, NVD 2.0 and CISA KEV feeds into a gitignored provenance pool. Its bounded,
incremental 0-30 and 30-60 day NVD passes currently retain 29,720 unique evidence rows and 118 CVEs
represented by more than one source. The direct-reference collector retained 2,266 bounded NVD
reference pages through the repository's SSRF guard without Jina/model fallback; 1,081 have an
attributable title, body and publication date. The assemblers now produce the complete 180 pending development cases:
21 same-CVE cross-source, 11 same-model/different-vulnerability, 11 same-product/different-CVE, 19
same-vendor/different-CVE, 25 roundup, 11 multi-CVE advisory, 11 disclosure-to-patch, 13 vendor
confirmation, 13 CERT republication, 7 PoC-to-disclosure, 11 same-CVE/multi-vendor-product, 5 exact-title
proposed/direct-final Federal Register pairs, 7 correction/effective-date Federal Register follow-ups,
5 TED procurement corrections, 7 TED competition-to-result transitions and 3 GitHub Advisory Database
revision-history pairs. At that checkpoint all 180 were `disputed`/`pending-dual-review`; the construction
gate routed them to `.data` review storage and froze zero cases. No model call was made during collection
or assembly. The later review and freeze outcome is recorded immediately below.

The evidence-backed development construction allocation is complete at 180 / 180 across all 16 strata.
On 2026-10-07 `scripts/finalize-event-relation-development.ts` mechanically froze
`datasets/event-relations/dev.jsonl`: exactly 180 decisive, independently dual-model-reviewed cases with
the exact 16-stratum allocation. It changes no review label; 31 disputed, relation-mismatched, duplicate
or surplus rows remain in `.data/event-relations/rejected-development.jsonl`. The two strata covered by
the approved semantic correction had only their derived event/story identity metadata migrated to match
their already-reviewed `SAME_OCCURRENCE` labels. On 2026-10-08 the holdout was frozen at exactly 60
unanimous high-confidence three-model-reviewed cases across the same 16 strata; the combined 240-case
validator passed. Final holdout scoring then completed against unchanged production behavior. Stage A
found 60/60 candidates on the lexical branch, Stage B produced accuracy 0.750 and macro-F1 0.629, and
Stage C produced pairwise precision 1.000, recall 0.095 and F1 0.174 (0 false merges, 38 false splits).
The independent pair-confirmation diagnostic admitted all 18 invoked low-similarity occurrence pairs.
The full baseline and security-specific error taxonomy are in
`docs/evaluation/event-grouping-baseline.md`; detailed receipt-backed reports remain under `.data/eval/`.
Phase 2 is therefore **COMPLETE_WITH_MODEL_REVIEWED_HOLDOUT_AND_BASELINE_LIMITATIONS**. The
owner authorized paid calls for development and holdout annotation, verified CodeBuddy CLI access, and
authorized final Stage B/C scoring. On 2026-10-06 the owner also accepted an explicit Phase 2 contract
deviation: the 60-case holdout may be frozen from unanimous high-confidence three-model review and is
recorded `MODEL_REVIEWED`, not human gold. The
`all` convenience stage also remains fail-closed; each implemented stage must be invoked explicitly.

The initial paid annotation wrapper exposed a CodeBuddy CLI exit-path issue rather than a model failure:
trace files showed successful model completion while `--output-format json` did not return control to the
caller. Those attempts remain `unknown` receipts and were never converted into labels. The provider now
uses `stream-json`, validates the terminal JSON with the same Zod schema, and terminates the child after
capturing the result event. A one-case receipt-backed probe then completed with DeepSeek V4.1 Flash plus
GLM-5.3-Flash (receipts 7 and 8): both independently returned `SAME_OCCURRENCE/high`, producing one
`decisive`, `model-reviewed` case in the gitignored probe output. The provider now consumes
`stream-json`; the complete 180-case development pool was subsequently reviewed by DeepSeek V4.1 Flash
and GLM-5.3-Flash through 30 completed receipts. Raw agreement produced 174 decisive and 6 disputed
rows, but a stricter relation-to-stratum audit rejected 35 additional decisive rows whose model label
did not match the frozen allocation. The resulting 41 replacement requirements are: 11 multi-CVE
advisory, 4 disclosure-to-patch, 13 vendor confirmation, 2 policy draft/final and 11 same-CVE
multi-vendor-product. This exposed construction hypotheses that paired same-occurrence coverage or
unrelated same-title policy documents rather than a real lifecycle transition. None of those rows is
frozen. A corrected multi-CVE collector now pairs two distinct CVE reports referenced by one real
advisory; its first four replacement probes were unanimously `UNRELATED/high`. Strict replacements
ultimately supplied all 11 accepted multi-CVE pairs, 4 disclosure-to-patch lifecycle pairs and the 2
missing policy draft/final transitions. Together with the 2026-10-07 owner-approved occurrence/story
boundary correction, these closed every development quota; the frozen result is recorded above.

## Phase 1 — accepted and frozen

Phase: Phase 1 — Security Verticalization

Branch: `phase/1-security-verticalization`

Base: `main` = `2938249`

Status: **ACCEPTED_WITH_LIMITATIONS**

**Accepted by the project owner.** This is an owner acceptance of a documented deviation; it is **not** a
claim that the original `150–250 human-labelled gold` requirement was satisfied.

- **Final accepted branch tip before merge:** `fac261816d608df55091033f9bd669dd95db6f6b`
- **Acceptance record commit:** `89355647fbc3803e3063bd5224041f41c7e02f8e`
  (`docs: accept Phase 1 with documented limitations`). It supersedes `fac2618` only as the branch tip: the
  accepted evaluation, thresholds, benchmark and code are unchanged from `fac2618`.
- **Canonical Linux CI on the acceptance commit:** GitHub Actions run `37189550495` — `Check / check`
  **PASS**, `Check / docker` **PASS**.
- **Owner explicitly accepts the `MODEL_REVIEWED` benchmark as the Phase 1 substitute delivery** — the
  200-case benchmark plus the 24-case tier calibration supplement — at this stage of the project.
- **This does NOT mean the original human-labelled gold requirement was satisfied.** It remains an
  **accepted deviation**, and the benchmark hardening behind it is a **deferred item**, not a completed
  requirement.
- **The documented limitations are neither deleted nor softened by this acceptance:**
  `MODEL_REVIEWED` instead of human gold, same-family annotation, a small and non-blind holdout, the
  holdout tier imbalance, the `T2` calibration-versus-`FreeBuf` source mismatch, and the production source
  coverage gaps. See `## Phase 1 acceptance-criterion deviation (explicit)` and
  `docs/evaluation/selection.md` §L.
- **No further Phase 1 selection tuning is authorized.** The thresholds, `industry/prompts/selection-score.md`
  and `industry/prompts/prefilter.md` stay frozen exactly as they are.
- **The final holdout remains frozen evidence and must not become a development set.**

The phase is implementation-complete, development-calibration-complete, tier-calibration-complete, and
the final holdout has been executed.

It implemented no Agent, runtime, retrieval or event-grouping change, and **at the time Phase 1 closed**
Phase 2 (the security event grouping benchmark) and Phase 3 (the Python Agent Runtime) **had not
started**. Phase 2 has since begun — see `## Current Phase`.

This Phase verticalizes the industry pack (`industry/`) from the AI demo domain to the security domain,
and produced the security selection benchmark and its evaluation. Full evaluation record:
`docs/evaluation/selection.md`.

### Phase 1 evaluation — final

| run | split | n | decisive | either | TP | FP | FN | TN | accuracy | precision | recall | F1 |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| development baseline (60/65/76) | development | 155 | 147 | 8 | 29 | 1 | 55 | 62 | 0.619 | 0.967 | 0.345 | 0.509 |
| calibrated development (32/55/60) | development | 155 | 147 | 8 | 67 | 1 | 17 | 62 | 0.878 | 0.985 | 0.798 | 0.882 |
| tier calibration (32/55/60) | calibration | 24 | 24 | 0 | 11 | 1 | 1 | 11 | 0.917 | 0.917 | 0.917 | 0.917 |
| **final holdout (32/55/60)** | holdout | 45 | 43 | 2 | 21 | 0 | 5 | 17 | 0.884 | 1.000 | 0.808 | 0.894 |

Frozen thresholds: `T1 = 32 / T1_5 = 55 / T2 = 60`, `understandFloor = 50`. `errors = 0` in all four
runs. The calibration changed **thresholds only** — `selection-score.md` and `prefilter.md` were not
changed, and the holdout was not used for tuning before the final run. Errors, run IDs and per-run
detail: `docs/evaluation/selection.md` §G, §H, §J, §M.

`precision = 1.000` on the holdout is a point estimate over 21 true positives and 0 false positives in a
45-case, **model-reviewed** holdout. It is not a guarantee of production precision.

All five holdout false negatives had `relevance = pass`: the residual errors are downstream
scoring/material-value errors, not prefilter blocking. The prefilter blocked 7 holdout cases and every
one of them was a `reject` from a noise stratum — zero false blocks.

### Phase 1 acceptance-criterion deviation (explicit)

The original Phase 1 acceptance wording requested **150–250 human-labelled gold cases**. What was
actually delivered is:

- a **200-case `MODEL_REVIEWED` benchmark** (`datasets/selection/candidates.jsonl`), and
- a **24-case `MODEL_REVIEWED` tier calibration supplement** (`datasets/selection/tier-calibration.jsonl`),

with **no independent human adjudication**. Both annotation passes were performed by the **same model
family** (first pass model-proposed, second pass model-reviewed), so the labels are not human labels and
the two passes do not constitute independent adjudication. Human annotation was unavailable during this
phase.

This is an **explicit acceptance-criterion deviation, not a satisfied requirement**. The metrics above
are valid as **project-internal, reproducible, model-reviewed benchmark metrics**. They must **not** be
represented as human-labelled accuracy or as production accuracy. The original requirement is not
rewritten here and is not claimed to have been met; the substitute delivery is named for what it is.

### Owner decision (final)

The project owner has **accepted this deviation** for Phase 1. Recorded as follows, so the scope of the
acceptance cannot be widened later by re-reading it:

| | |
|---|---|
| Decision | accept the `MODEL_REVIEWED` benchmark as the Phase 1 substitute delivery |
| Original requirement | `150–250 human-labelled gold cases` — **not satisfied** |
| Accepted substitute | 200-case `MODEL_REVIEWED` benchmark + 24-case `MODEL_REVIEWED` tier calibration supplement |
| Independent human adjudication | **none** — both annotation passes by the same model family |
| Status recorded | `ACCEPTED_WITH_LIMITATIONS` |
| Final accepted branch tip before merge | `fac261816d608df55091033f9bd669dd95db6f6b` |
| Acceptance record commit | `89355647fbc3803e3063bd5224041f41c7e02f8e` |
| Canonical Linux CI on the acceptance commit | run `37189550495` — `check` PASS, `docker` PASS |

What the acceptance does **not** do:

- It does **not** convert the `MODEL_REVIEWED` labels into human gold, and it does **not** make any metric
  here a human-labelled or production accuracy figure.
- It does **not** remove, downgrade or reinterpret any limitation listed in
  `docs/evaluation/selection.md` §L. Those remain the accurate description of the benchmark.
- It does **not** authorize further selection tuning: the frozen thresholds
  (`32 / 55 / 60`), `selection-score.md` and `prefilter.md` stay as they are.
- It does **not** unfreeze the holdout. The final holdout stays a one-shot evaluation set and must not be
  reused as a development set.

**Deferred item (no longer a Phase 1 merge blocker).** Future benchmark hardening: independent human
adjudication of a representative sample, or of the full benchmark, by a human whose judgement matches the
site's readership. Doing that would convert the accepted deviation into a satisfied requirement; nothing
in this repository claims it has been done.

### Phase 1 final verification (Windows, actual output)

Run at finalization, on the frozen tree, against a throwaway PostgreSQL 17 (`postgres:17-alpine`,
database `sentinelintel_p1_final_ci`, 35 migrations applied). Safety valves closed
(`COLLECT_ENABLED=false`, `MODEL_CALLS_ENABLED=false`).

```text
git diff --check                      → clean, exit 0
npm run typecheck                     → pass, exit 0
npm run build -w @aihot/web           → pass, exit 0
node --test apps/web/tests/*.test.ts  → tests 16 / pass 16 / fail 0 / cancelled 0, exit 0 (3.6 s)
npm test                              → tests 139 / pass 127 / fail 6 / cancelled 6 / skipped 0,
                                        exit 1, duration 785089.7 ms
```

Classification of the 6 failures and 6 cancellations:

| group | count | files | kind |
|---|---|---|---|
| deterministic, platform-independent | 4 | `tests/analyze.test.ts` (:95, :117, :140, :169) | **CODE_FAILURE** — assertion contract vs. the calibrated thresholds |
| Windows POSIX `SIGTERM` cascade | 2 fail + 6 cancelled | `tests/analyze-shutdown.test.ts`, `tests/translate-shutdown.test.ts`, `tests/translate.test.ts` | **ENVIRONMENT_BLOCKED** (KI-3) |

Causality evidence, not inference:

```text
node --test tests/analyze.test.ts   (fresh DB, isolated)
  → tests 8 / pass 4 / fail 4, exit 1, 2.6 s — the same four assertions, no timeouts, no other test
    file involved; therefore these fail on Linux too and are not a Windows artefact.

node --test tests/translate.test.ts (fresh DB, isolated)
  → tests 3 / pass 3 / fail 0, exit 0, 2.4 s — so the 2 translate failures + 1 cancellation in the
    full run are the known cascade from translate-shutdown.test.ts.
```

See `## Phase 1 Acceptance Prerequisites` §3 for the four failing assertions.

**3. Commit `1cbc429` (frozen thresholds `32/55/60`, after the remediation).** GitHub Actions run
`37187760717`: **both jobs PASS.**

| job | result | steps |
|---|---|---|
| `Check / check` | **PASS** | 16 steps, all success — Set up job, Initialize containers, checkout, setup-node, Install, Typecheck, Build web, Web tests, Migrate and seed topics, Smoke check of the built site, **Backend tests** |
| `Check / docker` | **PASS** | Configure a throwaway site, Build and start with docker compose, Smoke check |

`Backend tests` is the step that failed on `02d2049`. It passing here is the canonical Linux confirmation
that the four `tests/analyze.test.ts` contract failures are gone, and that the Windows-only non-passing
tests (KI-3, POSIX `SIGTERM`) pass on Linux as before. See `## Phase 1 audit remediation`.

### Phase 1 implementation — earlier checkpoint (`PHASE 1 IMPLEMENTATION CHECKPOINT REACHED`, historical)

**Branding (`industry/site.ts`).** `name: SentinelIntel`, `subject: 安防`, `mcpPrefix: sentinelintel`,
`crawlerName: SentinelIntelBot`, `organization.name: SentinelIntel`, homepage/about copy rewritten.
`footerNote` deliberately kept as the AIHOT upstream attribution. `mcpPrefix` has no length/regex
validator in the repo (only the comment's "lowercase letters, digits, underscores"); `sentinelintel`
satisfies it.

**Feature flags (`industry/features.ts`).** `leaderboard: false`, `codexResetMonitor: false`. Their
implementations were not deleted.

**Categories (7).** Owner MVP core: `vulnerability`, `vendor`, `policy-standard`, `procurement`.
Kept for production-code compatibility, each with a written reason:
`tip` and `opinion` — `apps/api/src/routes/v1.ts:65` passes the literal `"tip"` where the parameter
type is `PublicApiCategoryKey` (= `CategoryKey`, derived from `CATEGORIES`), so removing it is a
compile error; `packages/backend/src/publication/items.ts:98` also maps v1/RSS `tip` to
`IN ('tip','opinion')`. `industry` — `packages/backend/src/reports/compose.ts:20` takes
`DEFAULT_SECTION = SECTION_OF.industry`, so keeping it makes unclassified items land in the explicit
"其他安全动态" section instead of the last section. `incident` / `technology` were not added
(owner: not required for Phase 1 core).

**Item types (9).** `vulnerability_disclosure`, `vendor_advisory`, `vendor_response`, `policy_standard`,
`procurement_notice`, `procurement_award`, `incident_report`, `practical_guidance`, `analysis_opinion`.
These are consumed by `z.enum(ITEM_TYPES)` in `editorial/analyze.ts:131` **without** `.catch()`, so
`prompts/content-understanding.md` lists exactly the same nine values.

**Taxonomy.** `CATEGORY_TAGS` (11), `TOPIC_TAGS` (16), `ENTITY_TAGS` (14), `TAG_SYNONYMS` (63),
`CATEGORY_BY_ITEM_TYPE` (9), `ENTITIES` (17), `IDENTITY_LEXICON` (17),
`PUBLISHER_DOMAINS` (17), `IDENTITY_CONTEXT_ALIASES` (3). Entities are limited to subjects the Phase 1
sources will actually produce: 7 network/security vendors that appear in the advisory feeds, 6 physical
security vendors, and 4 government/CERT bodies that are themselves sources.

**Topics (19).** 8 company (entity-backed) + 5 field + 6 genre, down from the AI pack's ~30. Every
`related` slug resolves; every non-entity topic's tags are members of the taxonomy vocabulary.

**Sources (10, all actually verified on 2026-10-01).** Each entry in `industry/sources.json` carries a
`$note` with the HTTP status, format and item count. T1=8, T1_5=1, T2=1:

| source | URL | tier | verified |
|---|---|---|---|
| CISA Cybersecurity Advisories | cisa.gov/cybersecurity-advisories/all.xml | T1 | 200, RSS, 30 items |
| CISA News | cisa.gov/news.xml | T1 | 200, RSS, 10 |
| CERT-EU Security Advisories | cert.europa.eu/publications/security-advisories-rss | T1 | 200, RSS, 10 |
| UK NCSC Reports | ncsc.gov.uk/api/1/services/v1/report-rss-feed.xml | T1 | 200, RSS, 20 |
| JPCERT/CC Alerts | jpcert.or.jp/rss/jpcert.rdf | T1 | 200, RDF, 36 (rss.ts has an `rdf:RDF` branch) |
| Cisco Security Advisories | sec.cloudapps.cisco.com/.../CiscoSecurityAdvisory.xml | T1 | 200, RSS, 50 |
| Fortinet PSIRT | fortiguard.com/rss/ir.xml | T1 | 200, RSS, 50 |
| Microsoft MSRC Update Guide | api.msrc.microsoft.com/update-guide/rss | T1 | 200, RSS, 4616 (capped by initialBackfillLimit) |
| Zero Day Initiative | zerodayinitiative.com/rss/published/ | T1_5 | 200, RSS, 200 |
| FreeBuf 安全资讯 | freebuf.com/feed | T2 | 200, RSS, 20 |

**Source gaps (recorded, not worked around).** `BLOCKED` / not usable, with the observed status:
Palo Alto `security.paloaltonetworks.com/rss` (404), BleepingComputer (403), HelpNetSecurity (202
challenge), SecurityWeek (403), TheHackerNews (fetch failed), CNVD (521 JS challenge), MSRC blog feed
(HTML), IPA alert feed (404), ENISA (404), Axis/Dahua/Hanwha advisory pages (404 or HTML only),
ccgp.gov.cn (HTML only). **No procurement source exists at all** with the current adapters, and no
physical-security vendor PSIRT publishes a usable feed; both are real Phase 1 coverage gaps for the
`procurement` category and the 安防 vendor tier.
`CAPABILITY_GAP` (deliberately not built in Phase 1, per Migration Spec §8.6): CISA KEV JSON
(200, 1.76 MB single-object API), NVD CVE API 2.0 (200, paginated, rate-limited without a key), and
`std.samr.gov.cn` 国标查询 (200 JSON, POST-oriented). Wiring these needs `json_list` config work that
was not attempted, so they are not in the MVP seed.

**Prompts (19 modified of 27).** Rewritten for the domain: `prefilter.md`, `selection-score.md`,
`content-understanding.md`, `structure.md`, `rules-domain.md`, `group-definitions.md`,
`group-method.md`, `group-batch.md`, `group-pair.md`, `group-signal.md`, `story-digest.md`,
`report-daily-lead.md`, `report-period.md`, `identity-context.md`, `summarize-article.md`,
`summarize-long-post.md`, `rules-self-contained-title.md`, `translate-body.md`, `translate-post.md`.
The grouping definitions explicitly cover the eight hard cases (disclosure vs. vendor confirmation /
patch / PoC, one CVE across vendors, one vendor's different CVEs, one model's different
vulnerabilities, tender vs. award, draft vs. final standard). `selection-score.md` has a new 9-row
integer weight table (each row sums to 10, preserving the existing five-axis arithmetic and the
single-field output contract) and states that vendor fame, length, jargon density, the presence of a
CVE number or the words 高危/严重 must never by themselves make an item high-value.
`rules-domain.md` now requires CVE / model / firmware / fixed version / amount / CVSS level to be kept
verbatim, and forbids adding severities the source does not state.
Untouched: `safety.md`, `understand.md`, `rules-anti-hallucination.md`, `rules-answer-first-summary.md`,
`summarize-short-post.md`, `summarize-article-empty.md`, `summarize-long-post-quoted.md`,
`summarize-short-post-quoted.md` (generic, no domain vocabulary).

**Selection thresholds — earlier checkpoint value, since superseded.** At this checkpoint the thresholds
were still `T1 60 / T1_5 65 / T2 76` with `understandFloor 50`, and `selection.ts` carried an
`UNVALIDATED FOR SECURITY DOMAIN` note; no accuracy/precision/recall/F1 claim was made. They were
subsequently calibrated to the frozen `T1 32 / T1_5 55 / T2 60` — see
`### Phase 1 evaluation — final` above and `docs/evaluation/selection.md`. The `UNVALIDATED` note and the
commented-out old threshold line were removed from `industry/selection.ts` in
`e1e840b docs: clean up calibrated threshold comments`.

**Security benchmark — earlier checkpoint state, since superseded.**

At this checkpoint the agent had completed only its own half: candidate sampling and structuring.
`datasets/selection/candidates.jsonl` held **150 unlabelled rows** read through the repository's real RSS
reader (`fetchRss`), capped per source, quota'd per stratum and split deterministically (`i % 4 === 3` →
holdout). Every row carried `gold.decision = "either"` and a `"$label": "TODO"` marker. The labelled count
was **0** (0 development, 0 holdout); no `gold.decision` value had been produced.

Sampling at that checkpoint also produced harder evidence for the source-coverage gap: the required strata
`procurement`, `marketing-noise` and `irrelevant-it` had **zero** candidates from the then-ten first-party
government/CERT/vendor feeds, so the set covered only four of the seven strata.

**Superseded.** The benchmark was afterwards extended to **200 rows covering all seven strata**, with
`MODEL_REVIEWED` labels — 110 `select` / 80 `reject` / 10 `either`, development 155 / holdout 45 — and a
separate **24-case tier calibration supplement** was added. Current dataset state and labelling
protocol: `datasets/selection/README.md`; label distribution and provenance:
`docs/evaluation/selection.md` §B, §C.

Source provenance of the 200-row benchmark, verified from the files:

- The **150 `rss` rows** come from the ten sources registered in `industry/sources.json`; all ten source
  names match entries in that pack.
- The **50 `web` rows** — all 20 `procurement`, 15 `marketing-noise` and 15 `irrelevant-IT` — come from
  **web sources that are not registered in `industry/sources.json`** (EU Public Procurement Portal,
  SAM.gov, vendor newsrooms, AWS/Google/Apple blogs, and others). `industry/sources.json` **still holds
  exactly 10 sources**: the seeded pack was **not** extended, so the benchmark covers strata the running
  site still has no source for.
- **Neither `candidates.jsonl` nor `tier-calibration.jsonl` carries a `url` field.** The 50 `web` rows
  therefore cannot be traced to a URL from the repository alone, and the local sampler that produced
  them is git-ignored and was not preserved. This is a provenance limitation, recorded rather than
  glossed over — see `docs/evaluation/selection.md` §L.

**Evaluation — earlier checkpoint state, since superseded.** At this checkpoint the evaluation had not been
run: no labelled set existed, no model key was available and no cost authorization had been given, so
`MODEL_CALLS_ENABLED` stayed `false` and the Selection baseline and holdout were both `NOT RUN`. That is no
longer the state. The evaluation has since been executed in full under the project owner's cost
authorization — development baseline, calibrated development, tier calibration and a single final holdout
— with the results in `### Phase 1 evaluation — final` above.

### Phase 1 verified results (Windows, actual output)

```text
node .data/validate-industry.mjs        → sources 10 / topics 19 / categories 7 / item types 9;
                                          all industry-pack checks passed;
                                          27 prompt files scanned, prompt ↔ taxonomy consistency
                                          passed, no AI-industry leftovers
npm run typecheck                       → pass, exit 0
node scripts/migrate.ts   (fresh DB)    → 35 migration(s) applied
node scripts/seed.ts --topics-only      → topics: 19
node --test tests/*.test.ts (minus the 2 shutdown files)
                                        → tests 133 / pass 130 / fail 3 / cancelled 0, 45.9 s
```

The 3 failures are all in `tests/publication.test.ts`: "an early release keeps the selected ledger in
order", "a withdrawal waiting behind an unreleased item leaves new snapshots at once", "minimal sync
projection preserves snapshot fields, pagination bindings and ordered changes". They are **not**
attributable to the verticalization: the same file passes 13/13 in isolation on a fresh database, the
assertions concern the global `selected_ledger` watermark rather than categories or tags, and every
future-dated row in the database after a batch run belongs to `test-publication-*` itself. Root cause is
narrowed to that file's internal order/clock coupling with `effectiveWatermark()`; no assertion was
weakened. The canonical Linux CI run then passed **all 139 backend tests**, including these three, so
they are **environment-specific (Windows)** rather than a code regression. The precise Windows trigger
is still unexplained and is recorded as an open question rather than a fix. The two
shutdown test files were excluded here because of the known Windows POSIX `SIGTERM` limitation (KI-3);
their fixtures were still updated for the new taxonomy so they remain valid on Linux/CI.

```text
npm run build -w @aihot/web             → pass, exit 0
node --test apps/web/tests/*.test.ts    → tests 16 / pass 16 / fail 0 / cancelled 0
```

### Canonical Linux CI

Two CI observations exist for this branch. Both are recorded: the second is what found the regression the
remediation fixes.

**1. Commit `d93f466` (pre-calibration thresholds).** Both jobs passed. `docker` failed on the first run
and was fixed in that same commit (see below); its green re-run is what confirms the diagnosis.

| job | result | what it covers |
|---|---|---|
| `Check / check` | **PASS**, 1m | install, typecheck, web build, 16 web tests, 35 migrations, seed, smoke of the built site, `npm test` (all 139 backend tests) |
| `Check / docker` | **PASS**, 59s (FAIL 53s before the fix) | docker compose build + up + smoke + seeded source count |

`check` passing there settles three earlier questions in favour of the verticalization: the 5 shutdown
tests that cannot pass on Windows (KI-3) pass on Linux, the 3 `translate.test.ts` failures were the
Windows cascade described above, and the 3 `publication.test.ts` failures are Windows-specific rather
than a regression.

**2. Commit `02d2049` (frozen thresholds `32/55/60`, pushed).** GitHub Actions ran on this commit. This is
the run that exposed the `tests/analyze.test.ts` contract regression:

| job | result |
|---|---|
| `Check / docker` | **PASS** |
| `Check / check` | **FAIL** |

Steps inside the failing `check` job: Typecheck PASS, Build web PASS, Web tests PASS, Migrate and seed
PASS, Smoke PASS, **Backend tests FAIL** — `tests/analyze.test.ts`, 4 failures at `:95`, `:117`, `:140`
and `:169`. Those four assertions encoded the pre-calibration threshold contract, so the failure was
deterministic and platform-independent, not a Windows artefact.

This corrected an earlier statement in this document, which had assumed the calibration commits were
unpushed and therefore unseen by CI. They had in fact been pushed, CI had run, and CI had already found
the regression on Linux. The remediation that followed is in `## Phase 1 audit remediation`.


The `docker` failure was **not** caused by the industry pack failing to build or seed. Reproduced
locally, step by step: `docker compose up -d --build` exited 0 (64.3 s), `setup` exited 0 after migrate +
seed, `/api/health` returned 200, and `scripts/smoke.ts --base http://web:3000` exited **0**. The only
failing step was the last line of the `Smoke check` block, which hardcoded the AIHOT demo source count:
`... select count(*) from sources | grep -q '^18$'` against the pack's actual **10** sources.

That assertion is CI configuration encoding demo data, so the workflow was corrected under explicit
owner authorization to read the expected number from the pack instead (`.github/workflows/check.yml`,
one line replaced by three): `EXPECTED_SOURCES=$(node -e "process.stdout.write(String(require('./industry/sources.json').sources.length))")`
followed by `grep -qx "$EXPECTED_SOURCES"`. Verified locally: the dynamic read returns 10 and matches
the database count. This is the only file outside `industry/`, `tests/`, `docs/` and `datasets/` that
Phase 1 touched.

Not run: `docker compose --profile https` (needs a real domain and certificate).

## Completed

- Read `AGENTS.md`, Technical Design, Migration Spec, AIHOT `docs/architecture.md` and
  `docs/selection.md`, and the real build/test/docker/frontend configuration files.
- Verified the Git baseline with `git status`, `git branch -vv`, `git log --oneline --decorate -n 10`:
  branch `phase/0-baseline-audit` at `659d6ff`, tag `aihot-baseline-f6c2952` at `f6c2952`.
  No Git history was modified.
- Installed dependencies, ran the root typecheck and the web production build.
- Applied all 35 migrations on a fresh PostgreSQL 17 and ran the seed.
- Ran the full backend suite and the full web suite, with timing and per-test failure capture.
- Built and started the whole Docker Compose stack, ran the smoke check inside the compose network,
  verified seeded row counts, and tore the stack down.
- Started `apps/api` and `apps/worker` natively on Windows and checked the api health endpoint.
- Verified 20 AIHOT capabilities against source (all present) and confirmed that
  Python/FastAPI/LangGraph/Kafka/Neo4j/Kubernetes/CrossEncoder/GraphRAG do not exist in the repo.
- Audited `database/migrations/`: 35 files, max `0038`, no destructive statements, numbering gaps at
  0012/0025/0035.
- Classified every observed failure as CODE_FAILURE or ENVIRONMENT_BLOCKED, with reproduction steps.
- Produced `docs/00-sentinelintel/03-Phase0-Baseline-Audit.md`.

## Environment

| Item | Value |
|---|---|
| OS | Windows (win32) 10.0.26200 |
| Node.js | v24.16.0 (`engines.node >=24.11` satisfied) |
| npm | 11.13.0 |
| Docker | 29.6.1 |
| Docker Compose | v5.3.0 |
| PostgreSQL | `postgres:17-alpine` (throwaway container on port 55432; same image as CI) |
| Local psql client | not installed |
| Caddy | not pulled, not run |

Environment constraints encountered:

- Port 3000 is held by an unrelated project (`personal-rag-bot-frontend-1`); the compose web service
  was published on `PORT=3010` instead.
- Port 5432 is held by an unrelated project (`personal-rag-bot-db-1`, pgvector/pg16); a separate
  throwaway PostgreSQL 17 container on 55432 was used so no other project's data was touched.
- `registry.npmjs.org` is unreachable behind a TLS-intercepting middlebox
  (`ERR_TLS_CERT_ALTNAME_INVALID`, `DEPTH_ZERO_SELF_SIGNED_CERT`). Installed with
  `--registry=https://registry.npmmirror.com`, the switch documented in the `Dockerfile`.
- `npm ci` was blocked by the command sandbox (it deletes 507 `node_modules` entries in bulk:
  `SAFE_DELETE_BULK_CONFIRM_REQUIRED`). `npm install` was used instead, so the installed tree is not
  a clean `npm ci` result.
- Safety valves were kept closed throughout: `COLLECT_ENABLED=false`, `MODEL_CALLS_ENABLED=false`.

## Tests

These are the Phase 0 audit-time results, kept as the frozen evidence for that Phase. The post-fix
results for KI-1 / KI-2 are in `## Post-Phase-0 Baseline Portability Fix` above.

Backend, `npm test` against a freshly migrated `aihot_ci` database:

```text
command: DATABASE_URL=postgres://postgres:baseline@127.0.0.1:55432/aihot_ci npm test
result:  tests 139 / suites 0 / pass 131 / fail 2 / cancelled 6 / skipped 0
exit code: 1
duration: 801108.829 ms (~802 s)
failure reason: see below
```

| Failing test | Kind | Reason |
|---|---|---|
| `tests/analyze-shutdown.test.ts` — SIGTERM during the final paid writing call… | cancelled | 120 s timeout; Windows cannot deliver SIGTERM to a child (ENVIRONMENT_BLOCKED) |
| `tests/analyze-shutdown.test.ts` — SIGTERM during successful first score… | cancelled | same |
| `tests/analyze-shutdown.test.ts` — SIGTERM during failed first score… | cancelled | same |
| `tests/translate-shutdown.test.ts` — SIGTERM finishes the sent normal batch… | cancelled | same |
| `tests/translate-shutdown.test.ts` — SIGTERM finishes the sent misaligned batch… | cancelled | same |
| `tests/translate.test.ts` — a text corrected while its translation was running… | fail | AssertionError: the run ended without asking the model; cascades from the cancelled shutdown tests |
| `tests/translate.test.ts` — links and images inside a paragraph survive… | fail | TypeError: Cannot read properties of undefined (reading 'body_html'); same cascade |
| `tests/translate.test.ts` — the post a selected X post quotes… | cancelled | 120 s timeout; same cascade |

Causality evidence (not inference):

- `node --test tests/translate.test.ts` alone on a fresh database: tests 3 / pass 3 / fail 0 (3.2 s).
- `node --test tests/translate-shutdown.test.ts tests/translate.test.ts` on a fresh database:
  tests 5 / pass 0 / fail 2 / cancelled 3 (363 s).
- Node documentation (checked 2026-10-01): `process` docs — "'SIGTERM' is not supported on Windows";
  `child_process` docs — on Windows SIGTERM/SIGKILL "terminate the process forcefully and abruptly
  (similar to 'SIGKILL')". The shutdown tests require the child's SIGTERM handler to run.

Web, after `npm run build -w @aihot/web`:

```text
command: node --test apps/web/tests/*.test.ts
result:  tests 16 / pass 7 / fail 9
exit code: 1
duration: 1001.185 ms
failure reason: all 9 are apps/web/tests/cache.test.ts, all ERR_UNSUPPORTED_ESM_URL_SCHEME
```

Typecheck and build:

```text
command: npm run typecheck
result:  pass (no diagnostics)
exit code: 0

command: npm run build -w @aihot/web
result:  pass (build/server/index.js 729.18 kB, vite 3.93 s)
exit code: 0
duration: 15.9 s
```

## Evaluation (Phase 0, historical — the Phase 1 evaluation is in `## Current Phase`)

At Phase 0 this was NOT RUN.

- `scripts/eval-selection.ts` (Selection Eval / SelectBench): NOT_APPLICABLE / NOT_EXECUTED —
  external dependency / cost / authorization boundary. It calls the real scoring prompts through
  `runAnalysis`, has no offline or fake mode, and at that time the repository had no gold set (no
  `.data/`; only `industry/gold.example.jsonl` with two made-up cases). It has since been executed in
  Phase 1.
- Event grouping benchmark: NOT RUN — no dataset in the repository. `events/relate.ts` only records a
  historical measurement ("measured 2026-09-28 on 370 labelled pairs"); those labels are not in the
  repo and cannot be reproduced.
- Research / Tracking / Product Impact eval: NOT RUN — belong to Phases 4–6 and have no implementation
  or dataset yet.

Smoke, `scripts/smoke.ts` inside the compose network:

```text
command: docker compose run --rm --no-deps --entrypoint node setup scripts/smoke.ts --base http://web:3000
result:  all checks passed (15 pages, 1 feature page, 14 machine endpoints, /api/mcp initialize)
         three /leaderboard pages answered 503 "no leaderboard round published yet" by design
exit code: 0
```

The native Windows smoke run was NOT executed (the web process cannot start on Windows, see
Known Issues KI-1); it was performed in Docker instead.

## Docker

| Step | Result |
|---|---|
| `docker compose config --quiet` | pass (exit 0) |
| `docker compose build --build-arg NPM_REGISTRY=https://registry.npmmirror.com` | pass (120.6 s) |
| `docker compose up -d` | `db` healthy → `setup` exited 0 → `api`/`worker`/`web` up; healthy at 18.3 s |
| `GET /api/health` on the published port | `200 {"ok":true,"db":"ok","ms":2,"release":"dev"}` |
| `sources` / `topics` / `schema_migrations` in the container | 18 / 38 / 35 |
| `docker compose down -v` | pass, containers/network/volumes removed |

Two intermediate build failures were transient external network errors, not code problems, and both
passed on retry: `auth.docker.io` oauth timeout, then a `502 Bad Gateway` from `deb.debian.org` for
two `postgresql-client` packages. The `--profile https` (Caddy) path was NOT executed (needs a real
domain and certificate).

## Known Issues

**KI-1 (CODE_FAILURE, Windows only) — `apps/web/server.ts:38` could not load the SSR build.
FIXED in the Post-Phase-0 Baseline Portability Fix (see `## Post-Phase-0 Baseline Portability Fix`).**

```text
node apps/web/server.ts
→ Error [ERR_UNSUPPORTED_ESM_URL_SCHEME]: Only URLs with a scheme in: file, data, and node are
  supported by the default ESM loader. On Windows, absolute paths must be valid file:// URLs.
  Received protocol 'd:'
```

`path.resolve()` yields a bare Windows path that is passed to dynamic `import()`. Reproduced
independently: `import('D:/.../build/server/index.js')` fails, while
`import(pathToFileURL('D:/.../build/server/index.js').href)` succeeds. On Linux an absolute `/path`
is a legal specifier, so CI never sees this. Effects: the web process cannot run natively on Windows,
so the native smoke check is impossible, and all 9 tests in `apps/web/tests/cache.test.ts` fail
(that file spawns the production server).

Not fixed in Phase 0 (read-only rule; the baseline runs via Docker). **Applied** in the Post-Phase-0
Baseline Portability Fix — the change below is exactly what now sits in `apps/web/server.ts`, and the
Windows web suite is 16 of 16:

```ts
import { pathToFileURL } from "node:url";
const build = await import(pathToFileURL(path.resolve(import.meta.dirname, "build/server/index.js")).href);
```

**KI-2 (CODE_FAILURE) — `scripts/mcp-check.ts` hardcoded tool names that do not exist.
FIXED in the Post-Phase-0 Baseline Portability Fix (see `## Post-Phase-0 Baseline Portability Fix`).**

```text
node scripts/mcp-check.ts http://127.0.0.1:3001/api/mcp
→ server: {"name":"myhot","version":"2.0.0"}
→ tools: myhot_get_latest, myhot_search, myhot_get_hot_topics, myhot_get_story, myhot_get_daily
→ ProtocolError: Tool aihot_get_hot_topics not found  (code -32602)
```

`packages/contracts/src/mcp.ts` builds tool names from `SITE.mcpPrefix` (`myhot` in
`industry/site.ts:27`), but the script hardcoded `aihot_*` at `scripts/mcp-check.ts:12-21`. Not fixed
in Phase 0. **Applied** in the Post-Phase-0 Baseline Portability Fix: the script now imports
`MCP_TOOL_NAMES` from `@aihot/contracts/mcp` as its only tool-name source.

**KI-3 (ENVIRONMENT_BLOCKED) — POSIX signals.** 5 shutdown tests cannot pass on Windows
(see Tests). Unaffected on Linux/CI.

**KI-4 (ENVIRONMENT_BLOCKED) — ports and registries.** Ports 3000 and 5432 are held by an unrelated
project; the npm public registry is behind a TLS-intercepting middlebox; the command sandbox blocks
`npm ci`'s bulk delete. See Environment.

**KI-5 — dependency install fidelity.** Because `npm ci` could not run, the installed tree came from
`npm install` over a partially populated `node_modules`. Typecheck, build and tests all ran against
it, but this is not a byte-for-byte `npm ci` tree.

**KI-6 — AI-only modules: RESOLVED.** `industry/features.ts` now has `leaderboard: false` and
`codexResetMonitor: false` (Phase 1), with both implementations left in place rather than deleted. The
Phase 0 observation that the smoke check exercised `/codex-reset` and expected 503 on the leaderboard
pages no longer applies.

## Design Deviations

Full detail in `docs/00-sentinelintel/03-Phase0-Baseline-Audit.md` §12. Summary:

1. The 20 AIHOT capabilities listed in the Technical Design (§3) and the Migration Spec (§2) were all
   found in source. No documented capability is missing. This is the audit's main positive finding.
2. "dedupe" is a pipeline step but not a module: it lives in `content/materials.ts`
   (`articles.identity_key` unique key plus `ON CONFLICT (identity_key) DO NOTHING`) and in
   `sources/collect.ts` (per-run `seen` set). There is no `dedupe.ts`.
3. Migration numbering is not contiguous: `0012`, `0025`, `0035` are absent; the maximum is `0038`.
   New SentinelIntel migrations must continue from `0039` and must not backfill the gaps.
4. SelectBench supports development/holdout as designed, but the repository contains no gold dataset.
5. `industry/site.ts` uses the open-source default branding `MyHOT` (`mcpPrefix: "myhot"`,
   `crawlerName: "MyHOTBot"`), not AIHOT branding, so the "do not use AIHOT branding" rule is already
   satisfied. However the root `package.json` name and the workspace package names are still
   `aihot` / `@aihot/*`; renaming them would touch `docker-compose.yml`, `Dockerfile` and every
   `npm run -w` invocation, so it needs a separate decision.
6. `structure` really does run concurrently with `scores` (`editorial/analyze.ts:349-352`), as the
   Migration Spec claims.

## Phase 1 audit remediation

Branch: `phase/1-security-verticalization`. Scope: the findings of the independent Phase 1 audit —
documentation corrections and the four deterministic `tests/analyze.test.ts` failures. No threshold, no
prompt, no benchmark label and no evaluation result was changed, and no evaluation was re-run. Frozen
artifacts verified unchanged: `industry/selection.ts`, `industry/prompts/selection-score.md`,
`industry/prompts/prefilter.md`, `datasets/selection/candidates.jsonl` (blob identical to `02d2049`),
`datasets/selection/tier-calibration.jsonl`.

### Code — `packages/backend/src/editorial/analyze.ts`

The threshold calibration exposed two writing-routing regressions that the old, higher threshold had been
masking. `runUnderstand` now declines the two cases where a score must not decide the copy, falling
through to the existing `runSummarize` (which already returns `none` and `verbatim`):

```ts
const t = translateInputOf(a);
if (missingEvidence(a) || (isShortTweetInput(t) && !needsShortTweetTranslation(collapseWhitespace(t.mainText || t.title)))) return null;
```

- **A title alone must not become publishable.** `BARE` (no body, no excerpt, no fetchable page) scores
  30+34, so its mean of 32 lands exactly on the new T1 threshold. Under the old 60 it was not selected;
  under 32 it was, and the understanding wrote it up into a publishable copy with no evidence behind it.
  It now stays `relevance = unknown`, `selected = false`, `writer = none`, with an empty title and summary.
- **A short post already in Chinese keeps its own text.** The post scored 40+40 ≥ 2 × 32, so it was routed
  to the understanding and rewritten, even though its own text is already the reader-facing copy. It now
  stays `writer = verbatim` while the score still selects it: the score decides 精选, it does not decide
  whether a readable post needs rewriting.

`missingEvidence`, `isShortTweetInput`, `needsShortTweetTranslation` and `runSummarize`'s `verbatim` branch
are the repository's existing predicates — no second material-quality or language judgement was added. The
guard sits in `runUnderstand`, which only `runAnalysis`'s full path calls, so the `stages: "selection"`
path used by `scripts/eval-selection.ts` is untouched and the frozen evaluation results cannot move.

### Tests — `tests/analyze.test.ts`

Fixtures were updated; no assertion was weakened and none was deleted:

- `tierThreshold("T1") === 60` → `32`, with new assertions pinning `T1_5 = 55` and `T2 = 60`, and the
  arithmetic message `78 + 72 = 150 ≥ 2 × 32`.
- `RESCUE` and `LOW` moved to a new **test-only** T1_5 source. Mean 53 sits between `understandFloor` (50)
  and the T1_5 threshold (55), so the original "near-selected but not selected" band is expressible again
  at the frozen thresholds; `LOW` (mean 42) stays below the floor. Both now also assert the `writer` they
  produce (`understand` / `summarize`).
- `BARE` now also asserts that no understanding call happens, that `writer` is `none`, and that no
  publishable title or summary is written.
- The short Chinese post now also asserts that it is still selected, that `writer` is `verbatim`, and that
  no understanding call rewrites it.

### Documentation

`docs/IMPLEMENTATION_STATUS.md` (this file) and `docs/evaluation/selection.md` were corrected for the
audit findings: the stale "unpushed / CI has never seen it" Git statements, the over-general benchmark
provenance sentence, the overstated holdout blindness, and two missing limitations (holdout tier-cell
coverage; the T2 calibration-versus-production source mismatch). The frozen Phase 0 record
`docs/00-sentinelintel/03-Phase0-Baseline-Audit.md` was not touched.

### Verification

Local (Windows, fresh throwaway PostgreSQL 17, safety valves as noted):

```text
git diff --check                        → clean, exit 0
npm run typecheck                       → pass, exit 0
node --test tests/analyze.test.ts       → tests 8 / pass 8 / fail 0, exit 0
npm run build -w @aihot/web             → pass, exit 0
node --test apps/web/tests/*.test.ts    → tests 16 / pass 16 / fail 0, exit 0
npm test                                → tests 139 / pass 131 / fail 2 / cancelled 6,
                                          exit 1, 773.9 s
```

`tests/analyze.test.ts` has no failures left. The 8 non-passing in `npm test` are exactly the KI-3
cascade (5 shutdown tests at their 120 s Windows `SIGTERM` timeout, 1 `translate.test.ts` timeout and the
2 `translate.test.ts` assertions that follow from it) — all inside the files this remediation does not
touch, and all passing on Linux.

Canonical Linux CI (run `37187760717` on `1cbc429`): `Check / check` **PASS** (16 steps, incl.
Backend tests), `Check / docker` **PASS**.

A note for future runs of these suites: `MODEL_CALLS_ENABLED=false` must **not** be set when running
`tests/*.test.ts`. It is enforced in `packages/backend/src/providers/llm.ts` (`chatJson`) and throws
before the tests' own local HTTP stubs are reached, which inflates the failure count (observed:
`tests/analyze.test.ts` 6 failures instead of 4, `tests/translate.test.ts` 3 instead of 0). The tests
already point every provider at a local stub and forbid real credentials via
`AIHOT_CREDENTIALS_DIR=/nonexistent-test-credentials`, so no paid call is possible either way.
`COLLECT_ENABLED=false` is harmless.

## Phase 1 Start Blockers

NO.

Nothing in this baseline blocks *starting* Phase 1 work (industry-pack verticalisation). None of the
observed failures touch `industry/`, the taxonomy, the prompts, the selection thresholds or the
sources, and the Docker path that Phase 1 will use for verification is fully green.

## Phase 1 Acceptance Prerequisites

These do **not** block the Phase 1 implementation, but each of them must be resolved before Phase 1 can
be accepted as complete.

1. **The human-labelled gold requirement was not met — an explicit deviation.** The Migration Spec's
   Phase 1 asks for 150–250 **human-labelled** gold cases with development/holdout splits. Delivered
   instead: a 200-case `MODEL_REVIEWED` benchmark plus a 24-case `MODEL_REVIEWED` tier calibration
   supplement, annotated by a single model family in two passes, with no independent human adjudication.
   The owner must either accept the deviation explicitly or commission a human labelling pass. Until
   then, no metric in this repository may be described as human-labelled.
2. **Cost authorization — resolved.** The project owner authorized the paid model calls and the full
   evaluation has been executed: development baseline, calibrated development, tier calibration and one
   final holdout. See `### Phase 1 evaluation — final`.
3. **Deterministic test failure introduced by the threshold calibration — RESOLVED.** After the frozen
   thresholds changed from `60/65/76` to `32/55/60`, `tests/analyze.test.ts` failed **4 of its 8 tests on
   any platform**, including on a fresh database in isolation (tests 8 / pass 4 / fail 4, exit 1, 2.6 s —
   no timeouts, no other test file involved). The four were confirmed independently by the Linux CI run on
   `02d2049` (see `### Canonical Linux CI`) and reproduced locally:
   - `tests/analyze.test.ts:95` — `assert.equal(tierThreshold("T1"), 60)` hardcoded the old threshold; the
     code returned `32` (`32 !== 60`).
   - `tests/analyze.test.ts:117` — expected the 56+50 (average 53) material to be **not** selected; at
     `T1 = 32` it was.
   - `tests/analyze.test.ts:140` — expected a bare-title item scoring 32 to be **not** selected; at
     `T1 = 32` it was.
   - `tests/analyze.test.ts:169` — expected a short Chinese X post to remain its own copy; it received an
     understanding title.

   Two of the four were stale fixtures; the other two were real writing-routing regressions the old
   threshold had been masking. Both were fixed in `## Phase 1 audit remediation` without changing any
   threshold, prompt, label or evaluation result. `tests/analyze.test.ts` is now 8 of 8 on Windows, the
   full Windows suite is back to its Phase 0 shape (139 tests / 131 pass / 2 fail / 6 cancelled, where
   the 8 non-passing are the KI-3 POSIX `SIGTERM` cascade), and the canonical Linux CI run
   `37187760717` on `1cbc429` passes both jobs including `Backend tests` — see
   `### Canonical Linux CI` item 3.
4. **KI-1 / KI-2 — RESOLVED and merged.** Both were fixed in the Post-Phase-0 Baseline Portability Fix
   and merged into `main` at `2938249` (see `## Post-Phase-0 Baseline Portability Fix`). With KI-1
   fixed the Windows web suite is 16 of 16, so the earlier caveat that "all tests pass cannot be
   claimed on Windows" no longer applies to the web tests. It still applies to the shutdown tests
   blocked by the Windows POSIX `SIGTERM` limitation (KI-3), which is covered by the canonical Linux run
   instead.
5. **Benchmark provenance and distribution.** 150 of the 200 benchmark cases came from the configured
   Phase 1 RSS source pack (`industry/sources.json`, 10 sources). The remaining 50 came from external web
   sources, added deliberately to cover the `procurement`, `marketing-noise` and `irrelevant-IT` strata
   that the production pack does not provide; those rows carry no URL and are not traceable from the
   repository. Production mix, volume and prefilter input differ materially, and the pack still has no
   procurement source; see `docs/evaluation/selection.md` §L.

## Next Action

Phase 0 is accepted and frozen at tag `sentinelintel-phase0` (`1deb090`). The Post-Phase-0 Baseline
Portability Fix is accepted and merged into `main` at `2938249`.

**Phase 1 was merged.** `main` = `225e0f6473de8ac2b827c1ce34d4888a2111ac54`, tagged
`sentinelintel-phase1`. The merge is a **squash** (one parent, `2938249`) and its tree is **identical** to
the Phase 1 branch tip `c483efb` — `git rev-parse '225e0f6^{tree}'` equals `c483efb^{tree}`
(`8cc023ed957ff367d8d79dc5ddd9d91178105c7a`) — so no Phase 1 content was lost, and `main`'s tree carries
this document's Phase 1 acceptance record, which was the merge condition recorded here before the merge.

**Phase 2 — Security Event Grouping Benchmark is complete** on `phase/2-security-event-grouping`, status
`COMPLETE_WITH_MODEL_REVIEWED_HOLDOUT_AND_BASELINE_LIMITATIONS`. The design was revised after an independent design audit
(`### Phase 2 design revision` above) and then corrected for contract consistency
(`### Phase 2 benchmark contract correction` above). The plan now reports
`READY_FOR_PHASE2_BENCHMARK_IMPLEMENTATION_REVIEW`.

The decisions are **settled by the owner** and recorded in
`docs/evaluation/event-grouping-plan.md` §12.1: 240 / 180 / 60; signals out of the primary benchmark;
a minimal non-runtime evaluation seam targeting the **production batch judge**; final paid Stage B/C
authorization; and the 2026-10-06 acceptance deviation allowing the 60-case holdout to use independent
three-model review. Only unanimous high-confidence sufficient labels may freeze. They must be recorded
`MODEL_REVIEWED` with all reviewer ids, and must never be described as human gold.

There is no remaining owner-decision blocker. Dataset construction, independent review, freeze validation
and authorized evaluation execution are complete.

Benchmark implementation began before paid authorization. The owner first authorized development
construction/annotation and confirmed CodeBuddy `glm-5.3-flash` access, then on 2026-10-06 explicitly
authorized the final paid Stage B/C baseline runs. The schema/validator, minimal evaluation
seams, relation-stage harness, free Stage A recall fixture/metrics, deterministic same-URL diagnostic,
Stage C scratch replay, pair diagnostic, receipt aggregation and development construction gate are
present, together with receipt-backed development dual-review and holdout three-model-review commands.
Development and holdout are frozen. Stage A/B/C and the pair diagnostic have completed; the baseline and
error taxonomy are recorded in `docs/evaluation/event-grouping-baseline.md`.

Two further items are implementation-time choices the design constrains but deliberately does not
pre-empt: which recall branch the recall stage targets (this environment can only measure the lexical
one), and the concrete distractor count and seed per case.

**The 180-case development benchmark and 60-case `MODEL_REVIEWED` holdout are frozen, and the authorized
paid baseline has run. No production grouping behaviour, threshold or prompt changed.**

**Phase 3 was merged** into `main` at `7282efd`. **Phase 4 was merged** into `main` at `d4e1520` after both
canonical GitHub checks passed. Phase 5 planning now lives on `phase/5-event-tracking-agent`; review and
accept `docs/00-sentinelintel/06-Phase5-Event-Tracking-Plan.md` before implementation begins.

Still open as **deferred work, not blockers**: the seeded source pack has no procurement source and no
physical-security vendor feed, and the Phase 1 benchmark's 50 `web` rows are not URL-traceable.
**Future Phase 1 benchmark hardening — independent human adjudication of a representative sample or of the
full benchmark — remains the item that would turn Phase 1's accepted deviation into a satisfied
requirement.**

**Phase 6 was merged** into `main` at `63428dc` (pull request #8) after both canonical GitHub checks
passed; the v16 end-to-end holdout is the Phase 6 closing gate (13 safety counters zero, 5 quality
metrics 1.0, `MODEL_REVIEWED` labels). **Phase 7 (UI / Admin / MCP Extension) is the current phase**:
implementation and local acceptance are complete on `phase/7-ui-admin-mcp` (contract, unified read
model, API exposure, Story sections, read-only admin views, MCP `get_story` extension — see
`docs/00-sentinelintel/08-Phase7-UI-Admin-MCP-Plan.md` §7 for the acceptance matrix). Canonical Linux
CI on the Phase 7 pull request is the final post-push check before Phase 7 may be marked complete.
Phase 8 (final evaluation) must not begin before Phase 7 closes.

## Post-Phase-8 interview-readiness hardening

This work is maintenance after the accepted Phase 8 closeout, not a new Phase and not a revision of
any frozen evaluation result.

- **P0 runtime wiring:** the Docker agent now receives the default-off Product Impact feature gate,
  and the Security Research Agent has a production queue, scheduler and TypeScript orchestrator.
  Both research network gates remain required; no model or network call is enabled by default.
- **P1 human review loop:** open `impact_human_reviews` can now be dismissed or, for an immutable
  medium-confidence row only, accepted through an authenticated CSRF-protected admin command. Accept
  reparses the stored row, verifies every Evidence id belongs to the same Story, requires a completed
  Phase 6 source run, appends a product-specific current impact row, preserves exploit status as
  `unknown`, and never mutates Story or Fact state. Pure-unknown reviews cannot be accepted.
- Review resolution uses an optimistic version, records actor/reason/time on the review, appends an
  `impact_human_review_actions` audit row, and also writes the common admin audit log. Concurrent or
  repeated resolution fails closed.
- Verification: migration `0047` applies on an empty PostgreSQL 17 database; the focused backend
  review/API/auth/view tests pass (13 tests including the transactional and API command cases), the production
  web build and five admin-view tests pass, TypeScript typecheck passes, and Compose config validates.
- **Free local demo deployment:** an account-less Cloudflare Quick Tunnel exposed only the loopback-bound
  Web service, with collection, models and all Agent gates disabled. Local and public smoke checks passed,
  MCP initialization passed after explicit host allowlisting, `/admin` remained authentication-protected,
  and no database/API/Agent port was published. This is an ephemeral interview demo rather than an uptime
  claim; evidence and limitations are recorded in `docs/evaluation/local-demo-deployment.md`.
