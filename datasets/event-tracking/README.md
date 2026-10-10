# Event tracking evaluation

`development.jsonl` is the Phase 5 source-verified development set. Regenerate it with:

```bash
node scripts/construct-event-tracking-development.ts
node scripts/eval-event-tracking.ts --validate-only
python scripts/run-event-tracking-development.py
node scripts/eval-event-tracking.ts --results .data/event-tracking/development-results.jsonl --thresholds datasets/event-tracking/thresholds.json
```

Each row freezes the tracking task, a deterministic fixture-gateway mode, complete expected question
state, expected decision and interval, admissible official source URLs, and provenance. The fixture mode
exists only for offline replay; it does not grant network access or fabricate Evidence.

No holdout is present yet. A later independently reviewed holdout must use disjoint source identities,
be frozen before the final run, and must never be edited after results are observed.

`thresholds.json` was pre-registered from the development replay before holdout construction. Its safety
gates are exact zero. Tool error rate is reported but is not a quality gate because four development
cases deliberately inject a bounded gateway failure.
