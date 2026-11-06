# Two-vote selection shadow observation

Status: `STOPPED_EARLY_UNKNOWN_RECEIPT`

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

## Early closeout

The run stopped fail-closed at 2026-11-06 00:39:04 Asia/Shanghai, about two hours after start. Receipt
1156 (`structure_article`) entered `unknown` after the provider request timed out at 120 seconds. This was
an explicit preregistered stop condition, so collection and model calls were disabled immediately; only
the normal worker was recreated, with all Agent gates still disabled. The broader pre-observation source
enablement and the prior LLM budget were restored while both runtime valves remained off.

This short operational sample is not evidence of general policy improvement. It is retained because it
does reveal the direction and concentration of policy differences before the provider failure.

### Verified operational results

- Collection: 9 successful fetch runs, 0 failed fetch runs and 68 new articles (Cisco 8, Fortinet 1,
  MSRC 59).
- Analysis: 18 new analysis rows after baseline id 247; 13 of the newly collected articles had reached a
  new analysis when the run stopped, leaving 55 newly collected articles without a new analysis.
- Production two-vote selections: 13 of 18 analysis rows.
- Read-only former-mean selections: 17 of 18 rows.
- Policy agreement: 14 of 18 (77.8%); disagreement: 4 of 18 (22.2%). All four differences were former
  mean pass / two-vote fail; impossible promotions were 0.
- Source effect among analyzed rows: Fortinet 5 analyzed, 5 selected by both rules, 0 demotions; MSRC 13
  analyzed, 12 former-mean selections, 8 two-vote selections and 4 demotions. Cisco had no completed
  analysis row before shutdown, so its policy effect is not estimable from this run.
- Demoted titles: `Chromium CVE-2026-76028: Use after free`, `Chromium CVE-2026-76027: Memory
  corruption`, `Chromium CVE-2026-76031: Use after free`, and `Chromium: CVE-2026-118343 Improper input
  validation in ReadingList`.
- Receipts after baseline id 1069: 83 completed, 31 received and 1 unknown. Attempts: 116 received, 2
  failed and 1 unknown. The unknown attempt lasted about 120 seconds. Provider-reported usage totals
  284,620 tokens across received/completed receipts; recorded cost is 0, which reflects database records
  rather than an independently verified invoice.
- Public checks after shutdown: `/` 200 and `/hot` 200. Collection and model calls are off.

### Interpretation and limitation

The observed demotions are concentrated entirely in MSRC Chromium relay-style entries, which is
consistent with the owner-labelled preference for treating incomplete Chromium relay notices as ordinary
dynamics. However, the sample is incomplete, source-imbalanced and terminated by a provider timeout.
It cannot establish a general reduction in low-value selections, estimate recall, or close the scoring
stability weakness. The deterministic predicate, prompts and thresholds remain unchanged.

The four disagreement cases above are the only eligible owner-review set from this abbreviated run. A
fresh bounded observation requires a separate preregistration and a provider path with no new unknown
receipt before it can supply the intended 5–10 independent cases.
