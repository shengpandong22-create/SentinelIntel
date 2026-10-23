# Research Agent — canonical evaluation summary

**Final gate:** the single authorized Phase 4 run of `datasets/security-research/holdout-v4.jsonl`
(20 cases), scored against `datasets/security-research/thresholds-v4.json` — `PASSED`, every safety
counter zero. No later run supersedes it; the v1–v3 holdouts are retained history, not gates.

Full detail: [`security-research-baseline-v4.md`](security-research-baseline-v4.md) (final), and
[`security-research-baseline.md`](security-research-baseline.md),
[`security-research-baseline-v2.md`](security-research-baseline-v2.md),
[`security-research-baseline-v3.md`](security-research-baseline-v3.md),
[`security-research-development-full.md`](security-research-development-full.md) (history).
Numbers below come from `docs/evaluation/evidence-registry.json` (`RSR-*`, `SYS-*`).

## 1. Task and user value

For one security Story, the agent gathers external evidence from allowlisted official sources
(NVD, CISA KEV, vendor advisories), states what it can support with citations, and keeps what it
cannot resolve as an explicit unknown. Value: readers get claims traceable to official documents
instead of a paraphrase, and an honest "unanswered" list instead of invented certainty.

## 2. Evaluated system boundary

Bounded research agent: Python/LangGraph graph behind the TypeScript tool gateway, with a
capability-scoped tool allowlist, per-run budgets, receipted provider calls and a Story snapshot
input. The benchmark exercises the agent over frozen Story snapshots with live NVD/KEV/advisory
access. It does **not** measure the editorial pipeline, grouping, tracking, product impact, or the
web/API/MCP presentation layer.

## 3. Dataset and split

| Item | Value |
|---|---|
| Dataset | `datasets/security-research/holdout-v4.jsonl` |
| Split | `holdout` (development and v1–v3 holdouts are separate files) |
| Cases | 20, across all six strata |
| Excluded upstream | 84 source rows and 92 CVEs previously used by development or v1–v3 |
| KEV coverage | three new KEV cases collected from official CISA/NVD records, because earlier corpora had no unused KEV case |

## 4. Label provenance

`MODEL_REVIEWED` — **not human gold**. Reviewers `deepseek-flash`, `deepseek-v4-pro` and
`glm-5.3-flash` each accepted 20/20; three GLM decisions were medium confidence, the rest high.
There is no human adjudication anywhere in this dataset.

## 5. Frozen hashes

| Artifact | SHA-256 |
|---|---|
| Holdout | `ffb0ebafbb3185ec88c661c53c2275c4889476d6ee56a1f4fa3ebbe9d66a8df2` |
| Thresholds | `875a943dbe53bcc42a96259f92fb8dc26425ad066cceae619174960864e6642c` |
| Manifest | `datasets/security-research/holdout-v4-manifest.json` |

## 6. Scorer and thresholds

`scripts/eval-security-research.ts` against `datasets/security-research/thresholds-v4.json`.
Seven exact-zero safety gates and six quality gates (recall ≥ 0.80, evidence recall ≥ 0.75,
claim precision ≥ 0.90, unknown preservation = 1.00, conflict preservation = 1.00, tool error
rate ≤ 0.20). The thresholds were frozen before the final run.

## 7. Final metrics with denominators

| Metric | Result | Gate | Denominator |
|---|---:|---:|---|
| Unsupported critical claims | 0 | 0 | 20 cases |
| Claims without Evidence | 0 | 0 | 20 cases |
| Search snippets used as Evidence | 0 | 0 | 20 cases |
| Policy violations | 0 | 0 | 20 cases |
| Core Story/Fact mutations | 0 | 0 | 20 cases |
| Forbidden conclusions | 0 | 0 | 20 cases |
| Incomplete traces | 0 | 0 | 20 cases |
| Expected-claim recall | 1.00 | ≥ 0.80 | expected-claim instances (count not restated in the report) |
| Authoritative-evidence recall | 1.00 | ≥ 0.75 | expected evidence instances (count not restated) |
| Supported-claim precision | 1.00 | ≥ 0.90 | claim instances (count not restated) |
| Expected-unknown preservation | 1.00 | = 1.00 | 20 cases |
| Conflict preservation | 1.00 | = 1.00 | 20 cases |
| Tool error rate | 0.00 | ≤ 0.20 | 36 tool calls |

Run shape: 36 tool calls, 8 cases completed, 12 returned `insufficient_evidence` — the honest
outcome where official sources stated nothing the pipeline could ground.

## 8. Safety results

All seven exact-zero gates held: no unsupported critical claim, no Evidence-less claim, no search
snippet promoted to Evidence, no allowlist/budget/trace violation, no core Story/Fact mutation and
no forbidden conclusion.

## 9. Cost and latency evidence

Receipts `1`–`4` cover 58,790 model tokens. The provider returned no monetary cost field, so
**cost is unknown, not zero**. No latency figure is recorded for this run (`SYS-RESEARCH-LATENCY`
is `NOT_RECORDED`).

## 10. Retained failures

The four earlier holdouts and their consumed reports stay frozen; see
[`../failure-cases.md`](../failure-cases.md) for the NVD cache warm-up dependency, the
insufficient-evidence outcomes and the tool-failure taxonomy this phase established.

## 11. Reproduction commands

```bash
# scoring half (committed scorer + committed dataset + a results file)
node scripts/eval-security-research.ts --cases datasets/security-research/holdout-v4.jsonl \
  --results <results.jsonl> --thresholds datasets/security-research/thresholds-v4.json
```

A results file is **not** committed: the final numbers came from a live agent run. Regenerating them
requires a paid run against NVD/KEV/vendor sources, so this capability is
`REPRODUCIBLE_PARTIAL` — the scorer, dataset and thresholds are reproducible; the model decisions are not.

## 12. Limitations and non-claims

- `MODEL_REVIEWED`, not human gold; three-model consensus is weaker than human adjudication.
- 20 cases: a bounded benchmark, not every vendor or vulnerability ecosystem.
- NVD reliability depends on a deliberately warmed durable cache; cache provenance is explicit.
- Monetary cost was unavailable even though tokens and receipts were recorded.
- Do not read these numbers as production accuracy, as live-source coverage, or as a claim that the
  agent will find evidence for every advisory.
