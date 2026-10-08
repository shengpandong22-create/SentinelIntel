# Security Research Agent evaluation data

`development-pilot.jsonl` is a six-case, source-verified harness pilot. It covers every Phase 4 stratum
once, but it is **not** the 20–50 case benchmark, is not frozen, and must not be reported as a model
baseline. Its purpose is to stabilize the schema, validator, B0/B1 result contract, and safety metrics
before broader collection or any paid model run.

The canonical development benchmark will be `development.jsonl`. A later holdout must be stored
separately, frozen before final evaluation, and labelled `HUMAN_ADJUDICATED` or explicitly
`MODEL_REVIEWED`; source verification alone is insufficient for holdout labels.

Validate and score a pilot result file with:

```text
node scripts/eval-security-research.ts --pilot --validate-only \
  --cases datasets/security-research/development-pilot.jsonl

node scripts/eval-security-research.ts --pilot \
  --cases datasets/security-research/development-pilot.jsonl \
  --results <B0-and-B1-results.jsonl>
```

The harness never synthesizes missing run output. Every case must have exactly one B0 and one B1 result.
