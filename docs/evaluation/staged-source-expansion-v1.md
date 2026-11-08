# Staged source expansion v1

Status: `PREFLIGHT_PASSED_AWAITING_FIXED_WINDOW`

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
