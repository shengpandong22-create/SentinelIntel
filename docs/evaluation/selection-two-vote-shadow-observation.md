# Two-vote selection shadow observation

Status: `ACTIVE`

Window: 2026-11-05 22:34:19 through 2026-11-06 22:34:19 Asia/Shanghai (24 hours).

This operational observation follows the owner-blinded validation in
`selection-aggregation-validation-plan.md`. It does not change prompts, model routing, source-tier
thresholds or historical rows. The deployed two-vote rule is the production decision for new analyses;
the former mean-of-two rule is computed read-only from the same stored score pair.

## Fixed configuration

- Sources: Cisco Security Advisories, Fortinet PSIRT and Microsoft MSRC only.
- Collection and model calls: enabled only for this bounded window.
- Model: Spark X2.6 through the existing OpenAI-compatible receipt path, JSON mode off, thinking and
  provider search disabled.
- LLM database budget: 4/minute, 60/hour and 300/day.
- Security Research, Event Tracking and Product Impact Agent gates: disabled.
- CISA remains disabled after its previously recorded HTTP 403; it is not retried during this run.
- Start baseline: 203 articles, 223 analyses (max id 247) and 1,069 receipts (max id 1,069).

## Read-only shadow definitions

- Production two-vote: both stored scores are individually greater than or equal to the stored tier
  threshold.
- Former mean rule: the sum of both stored scores is greater than or equal to twice the threshold.
- A `demoted` item passes the former mean rule but not the production two-vote rule.
- A `promoted` item would pass production but not the former rule; this is mathematically impossible
  for the same two numeric scores and threshold, so any occurrence is an integrity error.

## Required report

At closeout report, for rows created after analysis id 247:

1. new articles, completed analyses and selected items;
2. score-pair agreement/disagreement and threshold crossings;
3. old-mean versus production counts, including every demoted article;
4. results by source, so one feed cannot hide an asymmetric impact;
5. model receipts by status, attempts, tokens, latency and recorded/estimated cost;
6. collection/model failures, malformed output, retries and remaining queue state.

Stop early and disable collection/model calls on a new unknown receipt, repeated malformed output,
serious provider failure, abnormal retry volume or no safe forward progress after one diagnosis and one
safe alternative. At the deadline, disable both valves, recreate only the normal worker, keep all Agents
off, restore the broader source enablement state recorded before this window, and present 5–10 new
strategy-disagreement items to the owner without scores. No threshold or prompt is changed from this
observation alone.
