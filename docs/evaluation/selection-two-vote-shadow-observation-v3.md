# Hybrid-model two-vote shadow observation v3

Status: `PREREGISTERED_ACTIVE`

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
