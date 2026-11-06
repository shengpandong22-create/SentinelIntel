# Two-vote selection shadow observation v2

Status: `STOPPED_EARLY_REPEATED_MALFORMED_OUTPUT`

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

## Early closeout

The observation stopped fail-closed at 2026-11-06 15:36:59 Asia/Shanghai, about two hours after
activation. Two separate `group_article` receipts (1201 and 1295) returned unusable output with no JSON
object. The second occurrence satisfied the preregistered repeated-malformed-output stop condition.
There were no new pending or unknown receipts at shutdown. Collection and model calls were disabled,
all Agent gates remained off, only the normal Worker was recreated, and the ten-source enablement plus
300/6000/40000 LLM budget were restored while runtime valves stayed off.

### Verified operational results

- Collection: 9 successful fetch runs, 0 failed fetch runs and 0 new articles. The three feeds contained
  no unseen material during this short window.
- Analysis: 19 new analysis rows completed against the already collected queue. The production two-vote
  rule selected 13; the former mean rule would have selected 16.
- Policy agreement: 16/19 (84.2%); disagreement: 3/19 (15.8%). All differences were former-mean pass /
  production fail; impossible promotions were 0.
- Per-source analysis: Cisco 1/1 selected by both rules, Fortinet 1/1 selected by both rules, and MSRC
  17 analyzed with 11 production selections, 14 former-mean selections and 3 demotions. This technically
  covers all three sources but is too imbalanced for source-level generalization.
- Demoted titles: `Chromium: CVE-2026-118345 Use after free in PDFium`, `Chromium: CVE-2026-118342 Out
  of bounds write in Editing`, and `Chromium CVE-2026-119267: Memory corruption`.
- Receipts after baseline id 1184: 106 completed, 21 received and 2 failed; no pending or unknown receipt
  remained. The two failed receipts are the no-JSON outputs that stopped the run. Provider-reported usage
  totals 370,981 tokens; recorded cost is 0, which is a database value rather than an independently
  verified invoice. The 133 received attempts averaged about 10.2 seconds and had a maximum of 106.9
  seconds.
- Queue at shutdown: 226 analyzed articles, 6 previously/now failed and 39 waiting with scheduled retry.
  Models remain disabled, so these waits cannot consume calls.
- Public checks after shutdown: `/` 200 and `/hot` 200.

### Evidence-layer interpretation

1. **Owner preference:** 30 convenience labels describe what the owner wants on the homepage; they are
   not security-expert gold.
2. **Independent development validation:** the locked 15-case batch improved balanced accuracy from
   0.714 to 0.857 without losing its 8 owner-labelled positives.
3. **Live operational observation:** this v2 sample again demoted only incomplete Chromium relay notices,
   matching the direction of the owner labels. It also exposed repeated Spark X2.6 no-JSON output and
   stopped before enough balanced live data accumulated.

Therefore the production predicate is not rolled back, but live evidence remains insufficient to claim a
general improvement or close score stability. Prompts and thresholds remain unchanged. A further model
run is not justified until the provider-output reliability question has separate evidence; repeatedly
starting observations against the same failure mode would only spend budget.

## Owner review candidates

Only three new disagreements were produced, fewer than the planned 5–10. They are retained rather than
padding the set with agreements or previously reviewed material:

1. Chromium CVE-2026-118345 use-after-free in PDFium; the MSRC relay identifies the inherited Chromium
   issue but provides no Microsoft-specific affected-version or mitigation detail.
2. Chromium CVE-2026-118342 out-of-bounds write in Editing; the entry points to the Chromium fix but
   provides no independent operational guidance.
3. Chromium CVE-2026-119267 memory corruption; the relay confirms Edge inherits the Chromium issue but
   lacks concrete Microsoft-specific remediation detail in the captured material.

The owner may label these A/B/C/D later. No label is inferred from the production or shadow scores.
