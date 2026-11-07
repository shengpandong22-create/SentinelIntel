# Hybrid-model two-vote shadow observation v3

Status: `COMPLETE_BOUNDED_OPERATIONAL_EVIDENCE`

Window: 2026-11-06 21:19:29 through 2026-11-07 21:19:29 Asia/Shanghai (24 hours).

This is a fresh operational observation of the deployed two-vote selection policy with the existing
Spark X2.6 and DeepSeek split. It does not reuse or modify either consumed observation. It changes no
selection prompt, threshold, deterministic predicate, frozen Evaluation asset or Agent behavior.

## Question and fixed routing

The observation asks whether the split can run for one day without the repeated Spark `group_article`
no-JSON failures that stopped v2, while preserving the existing selection behavior.

- Spark X2.6 (`default`): prefilter, both scoring calls, understanding and summarization.
- DeepSeek (`deepseek-flash`): structure extraction, grouping and group review.
- Exactly three sources: Cisco Security Advisories, Fortinet PSIRT and Microsoft MSRC.
- Security Research, Event Tracking and Product Impact Agent gates remain disabled.
- Collection and model calls are enabled only inside the fixed window.
- Spark budget: 4/minute, 60/hour and 300/day.
- DeepSeek budget: 4/minute, 60/hour and 300/day.

The two service budgets are independent caps; the report must not describe them as one aggregate cap.
Every call continues through receipts and database budgets.

## Locked baseline

- Articles: 271; analyzed 229; failed 6; waiting 36.
- Analyses: 263 rows, maximum id 287.
- Receipts: 1,322 rows, maximum id 1,322.
- Receipt states: 1,257 completed, 15 failed, 50 received, zero pending and zero unknown.
- Pre-run budgets: `llm` 300/6000/40000 and `deepseek` 100/2000/20000.
- Pre-run source enablement is captured in `.data/selection-shadow-observation-v3.json` and must be
  restored at closeout while runtime valves remain off.

The 36 pre-existing waiting articles are reported separately from articles first collected in this
window. Analysis rows are attributed by id and article creation time so backlog completion cannot be
mistaken for new-source throughput.

## Read-only shadow and measurements

Production uses the deployed two-vote rule: both scores must individually meet the unchanged tier
threshold. The former mean rule is computed read-only from the same stored scores. It never changes a
page or database decision.

The closeout reports:

- new articles, completed analyses and Story/Fact outcomes, separated into prior backlog and new input;
- production selections, former-mean selections, agreement, demotions and impossible promotions;
- per-source collection, analysis, selection and grouping outcomes;
- DeepSeek structure/group/group-review success, schema/malformed failures and grouping results;
- receipts and attempts by service/purpose/status, latency, tokens and recorded cost;
- pending/unknown outcomes, retries, queue remainder and local/public page health.

No prompt, threshold or routing change may be inferred from this operational sample. Group quality is
reported as observed operational behavior, not labelled precision or recall.

## Stop and closeout contract

Stop immediately and fail closed on any new unknown receipt, repeated malformed/empty output from the
same routed stage, a pending receipt beyond provider timeout, serious provider failure, abnormal retry
volume, or no forward progress after one diagnosis and one safe alternative. On stop or deadline:

1. disable collection and model calls;
2. restore the captured source enablement and both original service budgets;
3. recreate only the normal Worker with all Agent gates disabled;
4. verify `/`, `/hot`, health, static assets and protected admin behavior;
5. write a durable closeout separating owner labels, independent development validation and this live
   operational evidence.

This observation is informative only. A small or source-imbalanced sample cannot establish general
quality improvement, and no consumed holdout is rerun.

## Closeout

The fixed window completed at 2026-11-07 21:19:29 Asia/Shanghai without triggering an early-stop
condition. Collection and model calls were disabled, the captured ten-source enablement was restored,
the `llm` budget was restored to 300/6000/40000, the `deepseek` budget was restored to
100/2000/20000, and only the normal Worker was recreated. All Agent gates remain disabled.

### Pipeline and provider results

- The 36 pre-existing waiting articles were all cleared. One previously failed article also recovered;
  final state was 266 analyzed, 5 failed and 0 waiting out of 272 articles.
- The window created 39 analysis rows: 7 Cisco, 2 Fortinet and 30 MSRC. Of those rows, 38 belonged to
  the pre-existing queue and one to a newly collected MSRC article.
- All 72 scheduled source fetches succeeded (24 per source). They observed 1,200 Cisco entries, 1,200
  Fortinet entries and 5,388 MSRC entries; only MSRC produced one unseen article.
- The new article, `CVE-2026-83844 Windows Paint Remote Code Execution Vulnerability`, completed the
  full collection, Spark scoring/understanding, DeepSeek structure/group and Story-digest path and was
  selected by the production policy.
- DeepSeek completed 39 structure receipts and 6 grouping receipts. There were no malformed, failed,
  pending or unknown DeepSeek receipts. The grouping calls produced valid structured decisions; this
  operational run does not provide labelled grouping precision or recall.
- Spark completed 140 receipts and DeepSeek completed 45 receipts. Every one of the 185 post-baseline
  receipts finished `completed`; receipt attempts contained no terminal error. A transient Spark
  understanding attempt was retried safely and its receipt completed.
- Provider-reported usage was 507,774 Spark tokens and 77,412 DeepSeek tokens. Mean/max attempt latency
  was about 5.2/75.2 seconds for Spark and 1.5/3.4 seconds for DeepSeek. Recorded database cost remained
  zero and is not an independently verified invoice.
- Five Stories and one Fact were created during the window while the prior backlog was being drained;
  these raw counts are not a grouping-quality metric because the backlog predates the observation.

### Read-only selection comparison

The production two-vote policy selected 25 of the 39 analysis rows. The former mean policy would have
selected 33. Agreement was 31/39 (79.5%); all 8 disagreements were former-mean pass / two-vote fail,
and impossible promotions were zero.

| Source | Analysed | Two-vote | Former mean | Demotions |
| --- | ---: | ---: | ---: | ---: |
| Cisco Security Advisories | 7 | 7 | 7 | 0 |
| Fortinet PSIRT | 2 | 2 | 2 | 0 |
| Microsoft MSRC | 30 | 16 | 24 | 8 |

All eight demotions were incomplete MSRC Chromium relay entries with split score pairs. This is
directionally consistent with the owner's earlier labels and the first two observations, but the
sample remains heavily MSRC-weighted and contains only one newly collected article. It therefore does
not prove a general quality improvement or close the score-stability limitation.

### Safety and health

No new unknown receipt, repeated malformed output, stale pending receipt, abnormal retry volume or
provider failure occurred. The final local smoke suite passed every public route, API, feed, static
asset and MCP initialization check. `/admin` remained protected by a redirect to login. Database and
Agent containers were healthy; the Web, API and normal Worker remained running. No prompt, threshold,
model routing, two-vote predicate, frozen dataset or historical decision was changed.
