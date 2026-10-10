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

`holdout.jsonl` is the frozen, independently reviewed holdout (26 cases, strata 4/4/4/4/4/6). Its labels
are `MODEL_REVIEWED` — three model families reviewed every candidate case and only unanimous
high-confidence acceptances were frozen; this is not human gold. `holdout-manifest.json` records the
reviewer identities, review receipt ids, excluded cases, and the holdout and threshold hashes. The frozen
holdout is immutable; a failed or consumed holdout is kept as-is and remediation requires a new disjoint
holdout. Its single authorized final run passed every pre-registered gate:
`docs/evaluation/event-tracking-baseline.md`.

Candidate construction and review remain fail-closed: `construct-event-tracking-holdout.ts` writes an
explicitly `UNREVIEWED` candidate under `.data/`; the evaluator permits `--candidate --validate-only` but
refuses to score it. `review-event-tracking-holdout.ts` requires `--allow-paid`, a real reviewer identity,
and the existing receipt/budget path. `freeze-event-tracking-holdout.ts` requires three distinct complete
review sets, freezes only unanimous high-confidence acceptances, and records every excluded case.

`thresholds.json` was pre-registered from the development replay before holdout construction. Its safety
gates are exact zero. Tool error rate is reported but is not a quality gate because four development
cases deliberately inject a bounded gateway failure.
