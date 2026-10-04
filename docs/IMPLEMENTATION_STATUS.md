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

Phase: **Phase 1 — Security Verticalization**

Branch: `phase/1-security-verticalization`

Base: `main` = `2938249`

Status: **ACCEPTED_WITH_LIMITATIONS**

**Accepted by the project owner.** This is an owner acceptance of a documented deviation; it is **not** a
claim that the original `150–250 human-labelled gold` requirement was satisfied.

- **Final accepted branch tip before merge:** `fac261816d608df55091033f9bd669dd95db6f6b`
- **Acceptance record commit:** the commit whose subject is `docs: accept Phase 1 with documented
  limitations`, i.e. the one that introduces this status. Find it with
  `git log --oneline --grep="accept Phase 1 with documented limitations"`. It supersedes `fac2618` only as
  the branch tip: the accepted evaluation, thresholds, benchmark and code are unchanged from `fac2618`.
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

It does not implement any Agent, runtime, retrieval or event-grouping change: Phase 2 (security event
grouping benchmark) and Phase 3 (Python Agent Runtime) have not started.

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

**Phase 1 — Security Verticalization is accepted with limitations** (`ACCEPTED_WITH_LIMITATIONS`) on
`phase/1-security-verticalization`. The owner decision that was outstanding is now recorded in
`## Phase 1 acceptance-criterion deviation (explicit)` → `### Owner decision (final)`.

- **Pull request #3 is ready for the owner to merge**, once this acceptance-status commit passes the
  canonical Linux CI.
- **Phase 2 may begin only after Phase 1 is merged into `main` and the merged state is recorded here** —
  that is, the merge commit, plus confirmation that `main`'s tree now carries this acceptance record. The
  acceptance travels with this file, so the merge must keep it.
- Nothing in this document authorizes further Phase 1 selection tuning or a holdout re-run.

Still open as **deferred work, not Phase 1 merge blockers**: the seeded source pack has no procurement
source and no physical-security vendor feed, and the benchmark's 50 `web` rows are not URL-traceable.
**Future benchmark hardening — independent human adjudication of a representative sample or of the full
benchmark — remains the item that would turn the accepted deviation into a satisfied requirement.**

**Phase 2 implementation has not started.**
