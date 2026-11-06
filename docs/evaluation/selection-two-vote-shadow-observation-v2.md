# Two-vote selection shadow observation v2

Status: `PREREGISTERED_NOT_STARTED`

Window: 2026-11-06 13:25:39 through 2026-11-07 01:25:39 Asia/Shanghai (12 hours).

This is a fresh operational observation after PR #24 verified that receipt 1156 followed the existing
one-release lifecycle and corrected the inaccurate operator wording. It does not reuse or modify the
consumed first observation. It changes no selection prompt, threshold, model routing, source policy,
historical row or frozen Evaluation asset.

## Fixed configuration

- Sources: Cisco Security Advisories, Fortinet PSIRT and Microsoft MSRC only. CISA remains disabled.
- Collection and model calls: enabled only inside the bounded window.
- Model: Spark X2.6 through the existing OpenAI-compatible receipt path, with the existing non-thinking
  provider configuration.
- LLM budget: 4/minute, 60/hour and 300/day.
- Security Research, Event Tracking and Product Impact Agent gates: disabled.
- Baseline: 271 articles; 241 analyses (max id 265); 1,184 receipts (max id 1,184).
- Pre-start receipt state: 1,118 completed, 13 failed, 53 received, 0 pending and 0 unknown.

## Read-only comparison

- Production two-vote passes only when both stored scores individually meet the stored tier threshold.
- The former mean rule passes when the score sum is at least twice the same threshold.
- A demotion is former-mean pass / production fail. A production pass / former-mean fail is
  mathematically impossible and is an integrity error.
- No page or database decision is changed by the shadow computation.

## Acceptance and reporting

Report new articles, completed analysis rows, selections, agreement/disagreement, every demotion,
per-source effects, queue remainder, receipt/attempt states, tokens, latency, recorded cost and public
health. The observation is informative only if it produces completed analysis rows from at least two of
the three sources; otherwise the source imbalance is a stated limitation rather than a passing result.

Stop immediately and fail closed on a new unknown receipt, repeated malformed/empty output, a pending
receipt beyond provider timeout, serious provider failure, abnormal retry volume, or no progress after
one diagnosis and one safe alternative. On closeout, collection and model calls are disabled, only the
normal Worker is recreated, the pre-run ten-source enablement and 300/6000/40000 LLM budget are restored,
and public pages are checked. All Agent gates remain disabled throughout.

The final report keeps owner labels, the disjoint 15-case validation and this live observation as three
separate evidence layers. A small or source-imbalanced sample cannot establish general improvement. Only
new policy-disagreement cases from this window may be offered for owner A/B/C/D review.
