# Product Impact Agent — canonical evaluation summary

**Final gate:** the single authorized Phase 6 closing run of
`datasets/impact/e2e-holdout-v16.jsonl` (4 cases) under the revision-12 runner against
`datasets/impact/thresholds-v2.json` — `PASSED`: all thirteen hard safety counters zero, all five
pre-registered quality metrics 1.00, every per-case constraint satisfied.

The closing gate is **v16 only**. v8 is a consumed successful end-to-end *safety* run; v9 is
`REVIEWED_NOT_RUN_INCOMPLETE_FREEZE`; v10 is `DEVELOPMENT_PROBED_NOT_RUN_NOT_FREEZABLE`; v1–v7 were
consumed and failed or were superseded. None of them may be rerun or reused.

Full detail: [`impact-e2e-baseline.md`](impact-e2e-baseline.md) (gate and generation history),
[`impact-development-demonstrations.md`](impact-development-demonstrations.md) (required
demonstrations 1–3, development evidence) and [`impact-baseline.md`](impact-baseline.md) (the
synthetic normalization fixture holdout, retained as history). Numbers below come from
`docs/evaluation/evidence-registry.json` (`IMP-*`).

## 1. Task and user value

For a vulnerability Story, the agent extracts vendor, product, model, affected version, fixed version,
exploit status and the mitigating advice — grounded in official evidence — and refuses to guess. Value:
a reader can answer "does this affect me, and what is the fixed version?" without reading the advisory,
and anything uncertain is explicitly marked as unknown or sent to human review instead of being asserted.

## 2. Evaluated system boundary

The complete pipeline: TypeScript orchestrator → Python/LangGraph impact graph (normalization,
extraction round trip) → TypeScript model/tool gateway (capabilities, receipts, budgets) →
TypeScript persistence with confidence routing → scratch PostgreSQL. The extraction half uses the live
model through the receipted gateway; the normalization half is deterministic. The web/API/MCP
presentation built in Phase 7 is not part of the measured boundary.

## 3. Dataset and split

| Item | Value |
|---|---|
| Dataset | `datasets/impact/e2e-holdout-v16.jsonl` |
| Evidence pack | `datasets/impact/e2e-holdout-v16-evidence.jsonl` (10 usable official items, 0 unfetchable) |
| Split | `holdout`, 4 cases |
| Cases | CVE-2025-64446 (affected/fixed version generalization), CVE-2025-24983 (matcher-unsupported four-component Windows builds), CVE-2025-30400 (stale decoy rejection), no-CVE negative |
| Disjointness | automated gate inspected 30 prior JSONL files; disjoint from development and v1–v15 |

## 4. Label provenance

`MODEL_REVIEWED` — **not human gold**. Twelve independent semantic verdicts (4 cases × 3 reviewers)
were all high-accept: `deepseek-v4.1-flash` receipts 32–35, `glm-5.3-flash` 28–31,
`kimi-k2.8-preview` 36–39. No cases were excluded.

## 5. Frozen hashes

| Artifact | SHA-256 |
|---|---|
| Holdout | `a679b11e04a9135a5f69b5eede5a592f96f9efe30f63fddca947db232234a4c5` |
| Evidence pack | `6f4c000b8a00d47cc2652e5d96e7554b0de69487f017b6f7257345ef33acaf55` |
| Thresholds (`thresholds-v2.json`) | `5073d0291ed9dba3661d7961990b3498fbe24e3b4797671cf321aec7d1a3c448` |
| Manifest | `datasets/impact/e2e-holdout-v16-manifest.json` (reviewers and receipt ids) |
| Evidence manifest | `datasets/impact/e2e-holdout-v16-evidence-manifest.json` (KEV catalog version 2026.10.21) |

## 6. Scorer and thresholds

`scripts/run-impact-e2e.ts` (revision 12): it runs the pipeline over a scratch database, then
adjudicates thirteen hard safety maximums and five quality minimums from
`datasets/impact/thresholds-v2.json`, fails closed on any per-case assertion error, and exits non-zero
on any failure. Receipts are linked exactly by `run_id + trace_id + receipt_id`; Story, Fact and
Fact-Article state is snapshotted before and after.

## 7. Final metrics with denominators

| Metric | Result | Gate | Denominator |
|---|---:|---:|---|
| Row recall (propose **and** persisted rows only) | 1.00 | ≥ 0.90 | 1 scored case |
| Decision accuracy | 1.00 | ≥ 0.90 | 3 scored cases (the no-CVE negative is a deterministic skip) |
| Exploit-status accuracy | 1.00 | ≥ 0.90 | 3 |
| Routing consistency | 1.00 | = 1.00 | 3 |
| Unknown honesty | 1.00 | ≥ 0.95 | 3 |

Not produced by this scorer: vendor accuracy, product F1, version exact/semantic accuracy and
evidence coverage as **ratios**. The runner asserts per-case contract completeness instead
(`IMP-V16-VENDOR-PRODUCT-VERSION` and `IMP-V16-EVIDENCE-COVERAGE` are `NOT_RECORDED`).

## 8. Safety results

All thirteen counters zero across 4 cases: Story/Fact mutations, duplicate commits, cross-story
evidence, absence→"unaffected", gateway bypass, stale-version commits, PoC not unknown,
receipt/trace incomplete, routing inconsistent, unsupported claim, KEV-yes-without-evidence,
low-confidence claim, forbidden row. Per case:

- **HOLD-001**: one high claims row with supported affected **and** fixed FortiWeb versions.
- **HOLD-002**: unsupported Windows four-component builds routed to human review per product; no
  unsupported expression entered a claims row.
- **HOLD-003**: the stale decoy `10.0.26100.9999` never surfaced; supportable rows persisted normally.
- **HOLD-004**: deterministic pre-model skip, byte-identical Story snapshot, zero receipts.

## 9. Cost and latency evidence

Not recorded for v16: the report records pass/fail counters, not per-case latency or token usage
(`SYS-IMPACT-LATENCY-TOKENS` = `REQUIRES_NEW_RUN`, and the consumed v16 dataset may not be rerun to
obtain it). Earlier development probes recorded one extraction receipt per case; no aggregate cost
figure exists. Do not quote a cost or latency number for this capability.

## 10. Retained failures

The correction history is itself the failure record: v1 (thin MSRC evidence), v2 (swapped CVE ids),
v3 (AND-semantics recall defect), v4 (KEV live-lookup instability → catalog cache migration `0045`),
v5 (row_recall 0.67), v6 (four uninitialized counters, window-based receipt matching, three-field
Story check, N/A-as-1 recall, no threshold adjudication), v7 (per-case label over-specification plus a
scorer that let aggregate green mask per-case red), v9 (incomplete unanimous freeze), v10
(development-probed cases can never be a holdout). Each is documented in
[`impact-e2e-baseline.md`](impact-e2e-baseline.md) and summarised in
[`../failure-cases.md`](../failure-cases.md).

## 11. Reproduction commands

```powershell
$env:DATABASE_URL='postgres://.../<scratch>_ci'   # fresh database, 43 migrations
$env:AGENT_INTERNAL_TOKEN=<token>; $env:AGENT_RUNTIME_TIMEOUT_MS='300000'
node scripts/run-impact-e2e.ts --cases datasets/impact/e2e-holdout-v16.jsonl --out .data/impact/e2e-v16-results.json
```

Requires a running API + agent runtime and one paid extraction receipt per case, so this capability is
`REPRODUCIBLE_PARTIAL`: dataset, evidence pack, thresholds and scorer are committed and reproducible;
the model run is not offline-reproducible, and the consumed holdout must not be rerun.

## 12. Limitations and non-claims

- `MODEL_REVIEWED`, not human gold.
- Four cases: a gate, not a prevalence or recall estimate. A denominator of one is not "100% recall".
- The v16 claims rows demonstrate grounded versions through the development demonstrations rather than
  through a larger holdout.
- No committed latency, token or cost figure exists for the closing gate.
- The synthetic normalization fixture holdout (23 cases, all metrics 1.00) is `HISTORICAL_ONLY`: the
  current scorer no longer reproduces it and its expectations predate normalization revisions 4–6.
