# Spark X2.6 soak hardening

## Scope

This maintenance follows the bounded 72-hour local soak ending 2026-10-28. It does not alter frozen
evaluation datasets, prompts, selection thresholds or recorded Phase 1–8 metrics. Real collection and
model calls stayed off during implementation.

## Observed evidence

| Signal | Observed |
|---|---:|
| Articles | 179 |
| Analyzed article states | 137 |
| Failed article states | 5 |
| Waiting article states | 37 |
| Analyses | 162 |
| Selected analyses | 101 |
| Stories | 22 |
| LLM receipts: completed / failed / received | 850 / 12 / 30 |
| LLM attempts | 900 |
| Provider-reported tokens | 2,541,442 |

Thirty-six of the 37 waiting articles carried `Budget for llm exhausted (day)`; one was observed after
the closeout valve was disabled. `received` receipts are raw responses available for exact logical-key
reuse, not automatically a provider failure. Some belong to the pre-fix request configuration and are
superseded by later completed analyses; they remain audit evidence rather than being relabelled.

MSRC produced 77 articles with no confirmed body and about 140 characters of feed excerpt on average.
Cisco produced confirmed bodies for 49/51 articles and Fortinet for 51/51. The MSRC adapter therefore
addresses a measured source-specific deficiency, not a speculative generic scraper rewrite.

The two independent scores differed by 13.69 points on average across 162 pairs (median 12.5, p95 33.9,
maximum 51); 44 pairs put one score below and one score at or above its tier threshold. These diagnostics
are now visible but do not change the decision rule. A scoring policy change requires development replay
and threshold review.

## Safe backlog continuation plan

The 37 waiting production articles were deliberately not processed during code hardening.

1. Merge and deploy the hardening with `COLLECT_ENABLED=false` and `MODEL_CALLS_ENABLED=false`.
2. Run the provider stub regressions and canonical Linux CI.
3. If explicitly authorized, enable model calls only, retain a capped budget, and leave collection off.
   The existing sweep will resume due `new` rows; settled receipts are reused by exact logical key.
4. Monitor malformed-output classes, receipt unknowns, score-gap diagnostics and queue progress. Stop on
   a repeated post-fix malformed class or unknown-receipt recurrence.
5. Requeue the five terminal failed articles separately through the audited admin action only after
   reviewing their failure group. Do not bulk-requeue them together with budget-waiting rows.
6. Disable model calls again when the backlog reaches zero or the budget cap is reached.

## Verification

- `node --test tests/llm-structured-output.test.ts tests/content-extract.test.ts`: 10/10 pass.
- Fresh Compose-network PostgreSQL 17 (44 migrations), focused receipt/output/extraction tests: 16/16 pass.
- `npm run typecheck`: pass.
- `npm run build -w @aihot/web`: pass.
- `node --test apps/web/tests/*.test.ts`: 25/25 pass.
- `git diff --check`: pass.
- Score-stability aggregation executed against the soak database and returned the figures above.

The Windows host could not open another local PostgreSQL socket after one corrected credential retry
(`EADDRNOTAVAIL`), so the same suite was run against a fresh database from the newly built application
image inside the Compose network. Canonical Linux CI remains the final cross-environment gate.
