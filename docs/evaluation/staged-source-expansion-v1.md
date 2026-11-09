# Staged source expansion v1

Status: `COMPLETE_BOUNDED_OPERATIONAL_EVIDENCE`

Fixed window: 2026-11-08 22:05:33 through 2026-11-09 22:05:33 Asia/Shanghai.

This maintenance plan follows the completed hybrid-model observation in
`selection-two-vote-shadow-observation-v3.md`. It adds no product capability and changes no prompt,
threshold, selection predicate, frozen Evaluation asset or Agent behavior.

## Evidence and objective

The v3 observation established operational compatibility for the current split: Spark X2.6 handled
prefiltering, scoring, understanding and summarization; DeepSeek handled structure, grouping and group
review. All 185 post-baseline receipts completed, including 39 DeepSeek structure calls and 6 DeepSeek
grouping calls. Only one article was newly collected, so the run did not provide a source-balanced
quality sample.

The next objective is therefore source diversity, not another model or threshold change. The first
batch adds CERT-EU Security Advisories and UK NCSC Reports to the existing Cisco, Fortinet and MSRC
set. CISA remains excluded because its earlier HTTP 403 is recorded and must not be retried in a loop.

## Existing source-failure isolation audit

Repository inspection found that ordinary RSS sources already have the required isolation:

- `sources.schedule` enqueues one `sources.fetch` job per due source with a source-id singleton key;
- `registerSourceJobs()` executes each source independently;
- `collectSource()` catches a source fetch failure, records only that source's failed `fetch_runs` row,
  increments only that source's `fail_count`, marks only its `health`, and schedules an individual
  bounded backoff up to six hours;
- a successful source resets only its own health and cursor;
- the scheduler continues enqueuing every other due source.

Accordingly, a new global circuit-breaker implementation would duplicate existing behavior and add
risk without a reproduced defect. The staged observation will measure this existing isolation per
source. If a concrete cross-source disruption appears, it must be reproduced before code changes.

## Preflight gate

Before a window may be activated:

1. fetch the two new RSS endpoints without storing articles or enqueueing analysis;
2. require a successful parse with at least one candidate and record only counts and endpoint status;
3. capture the exact database baseline, source enablement and both service budgets;
4. commit a fixed start/end window and stop conditions before enabling collection or models.

A failed preflight excludes only that source. It does not block the other source or alter production
source health.

Preflight completed with collection, model calls and all Agent gates disabled. The read-only RSS parser
returned 10 candidates for CERT-EU and 20 for NCSC UK; neither request was a conditional `notModified`
response. No article, cursor, source-health row or analysis job was written. Both sources therefore pass
the activation gate. Their first stored import remains part of the later fixed-window measurement and
will be reported as first-import backfill rather than fresh publication.

## Fixed observation contract

The eventual window is 24 hours unless preflight evidence justifies a shorter safe run. During it:

- exactly Cisco Security Advisories, Fortinet PSIRT, MSRC, CERT-EU and NCSC UK may be enabled;
- Spark and DeepSeek keep the v3 routing;
- each provider has its own cap no higher than 4/minute, 60/hour and 300/day;
- Security Research, Event Tracking and Product Impact Agent gates remain off;
- the former mean selection policy is read-only shadow output;
- first-import backfill from the two new sources is reported separately from newly published material;
- per-source fetch success, candidates, created rows, analyses, selections, failures and backoff state
  are reported independently.

Stop fail-closed on a new unknown receipt, repeated malformed output from the same routed stage, a
pending receipt beyond provider timeout, serious provider failure, abnormal retries, or no forward
progress after one diagnosis and one safe alternative. A single ordinary source-fetch failure is not a
global stop: that source's existing backoff applies while the other sources continue. Repeated failure
of one new source excludes that source from the remainder of this window and is recorded.

At deadline or early stop, collection and model calls are disabled, the captured source and budget state
is restored, only the normal Worker is recreated, public health is verified and a durable report is
written. Small or source-imbalanced results remain operational evidence, not a general quality claim.

## Locked baseline

- Articles: 272 total; 267 analyzed, 5 failed and 0 waiting.
- Analyses: 302 rows, maximum id 326.
- Receipts: 1,507 rows, maximum id 1,507; 1,463 completed, 15 failed, 29 received, zero pending and zero unknown.
- Pre-run budgets: `llm` 300/6000/40000 and `deepseek` 100/2000/20000.
- CERT-EU and NCSC UK have no stored `initializedAt`, so their first stored results are explicitly
  first-import backfill. Cisco, Fortinet and MSRC are already initialized.
- Exact pre-run source enablement and budgets are captured in ignored
  `.data/staged-source-expansion-v1.json` for closeout restoration.

## Closeout

The fixed window completed at 2026-11-09 22:05:33 Asia/Shanghai without an early-stop condition.
Collection and model calls were disabled, the captured ten-source enablement was restored, `llm` was
restored to 300/6000/40000, `deepseek` was restored to 100/2000/20000, and only the normal Worker was
recreated. All Agent gates remain disabled.

### Source isolation and collection

Every scheduled fetch completed successfully. No source entered degraded/failing health and every final
`fail_count` was zero.

| Source | Successful runs | Candidates observed | Created |
| --- | ---: | ---: | ---: |
| CERT-EU | 20 | 200 | 10 |
| Cisco Security Advisories | 24 | 1,200 | 0 |
| Fortinet PSIRT | 24 | 1,200 | 0 |
| Microsoft MSRC | 24 | 5,377 | 0 |
| UK NCSC | 18 | 80 | 20 |

The two added sources created 30 articles. Twenty-eight were marked backfill and two recent CERT-EU
items were not; no UK NCSC item was fresh. One existing MSRC row was analysed after the baseline, so
the analysis set has 31 rows rather than 30 newly created articles. This is predominantly a first-import
onboarding sample, not a normal daily publication-rate measurement.

The result verifies the existing isolation contract under healthy operation: five independently
scheduled sources completed at different intervals without interfering with one another. It did not
exercise the failure/backoff branch, so no new claim is made about recovery time beyond the repository's
tested deterministic behavior.

### Analysis, routing and receipts

- Final article state: 297 analyzed, 5 historical failures and 0 waiting out of 302 articles.
- Analysis rows after baseline: 31 (10 CERT-EU, 20 UK NCSC and 1 MSRC); 28 were backfill.
- DeepSeek completed 30 structure and 2 grouping receipts with no malformed, failed, pending or unknown
  result. Two Facts and two Stories were created during the window.
- Spark completed 124 receipts and DeepSeek completed 32. All 156 post-baseline receipts finished
  `completed`; no terminal error or unknown outcome occurred.
- Provider-reported usage was 511,605 Spark tokens and 59,819 DeepSeek tokens. Mean/max attempt latency
  was about 4.9/27.8 seconds for Spark and 1.3/1.9 seconds for DeepSeek. Recorded database cost was zero,
  which is not an independently verified invoice.

### Read-only selection comparison

The production two-vote rule selected 18/31 rows; the former mean rule would have selected 21/31.
Agreement was 28/31 (90.3%). All three differences were former-mean pass / two-vote fail and impossible
promotions were zero.

| Source | Analysed | Two-vote | Former mean | Demotions | Backfill |
| --- | ---: | ---: | ---: | ---: | ---: |
| CERT-EU | 10 | 10 | 10 | 0 | 8 |
| MSRC | 1 | 1 | 1 | 0 | 0 |
| UK NCSC | 20 | 7 | 10 | 3 | 20 |

The three demotions were `ACD - The Fifth Year`, `Malware analysis report on SparrowDoor malware`, and
`A method to assess 'forgivable' vs 'unforgivable' vulnerabilities`. They are retained as future owner
review candidates; no label is inferred from either policy. Cisco and Fortinet produced no unseen
articles, and most analysed material was first-import backfill, so this sample cannot establish general
selection improvement or ordinary per-source yield.

### Safety and health

No new unknown receipt, malformed output, stale pending receipt, abnormal retry volume or provider
failure occurred. The final smoke suite passed every public route, API, feed, static asset and MCP
initialization check. `/admin` remained protected by a 302 redirect to login. Database and Agent
containers were healthy; Web, API and the recreated normal Worker remained running. No prompt,
threshold, model routing, two-vote predicate, frozen dataset or historical decision changed.
