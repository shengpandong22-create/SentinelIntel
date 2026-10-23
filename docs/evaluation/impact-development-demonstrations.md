# Phase 6 development demonstrations — required demonstrations 1-3 (development E2E evidence)

Date: 2026-10-14 (owner ruling). Status: **the three required demonstrations are established by frozen,
reproducible development end-to-end evidence and re-verified offline with the revision-6 assertion
logic.** These are development evidence, **not holdout metrics**; they satisfy the "required
demonstrations" clause of the Phase 6 contract and never gate the phase alone. The closing gate is the
revision-7 holdout (v11) on unseen sources.

All three demonstrations ran the complete TypeScript → Python → TypeScript → scratch-database pipeline
against the scratch database `sentinel_phase6_v7_ci` (port 55455), one paid extraction receipt each,
with `AGENT_RUNTIME_TIMEOUT_MS=300000` and `EGRESS_PROXY_URL` routing (the direct NVD path was blocked
during this window). Run command shape (identical for all three):

```powershell
$env:DATABASE_URL='postgres://postgres:postgres@127.0.0.1:55455/sentinel_phase6_v7_ci'
$env:AGENT_INTERNAL_TOKEN=[System.IO.File]::ReadAllText("$PWD/.data/impact/e2e-token.txt").Trim()
$env:AGENT_RUNTIME_TIMEOUT_MS='300000'
node --env-file-if-exists=.env scripts/run-impact-e2e.ts --cases <case file> --out <results file>
```

Offline re-verification (no model call, no pipeline run): `scripts/verify-impact-development-evidence.ts`
re-reads the persisted state from the scratch database and re-applies the revision-6 safety detectors
and demonstration assertions. Result: `verification/development-demonstration-verification.json`
(`verified: true`; every safety counter zero; every demonstration satisfied).

## Demonstration 1 — contract-complete record (CVE-2017-7921, Hikvision IP camera backdoor)

- Case: `cases/probe-demo1-7921.jsonl` (SHA256 `9924054ca8876535d1a0660c0859e62fc826135788c659dd01dec98b698255cb`),
  story id 40 in the scratch database, extraction receipt 47 (status `received`).
- Result: `results/probe-demo1-7921-results.json` (SHA256
  `e05f58717c5338916466a178ff2df3ef211849397646c1f82cff2c90f9bbb3db`).
- Evidence: the official Hikvision advisory (server-rendered, allowlisted path) listing seven affected
  camera model series with per-model affected firmware ranges and per-model resolved firmware
  versions, plus the NVD record and the CISA KEV catalog entry (KEV membership verified against the
  official feed, catalogVersion 2026.10.08, added 2026-03-05).
- Persisted claims (all `confidence=high`, `routing=auto`, `persisted_kind=claims`; every boundary
  grounded in the cited evidence; zero safety-counter violations):

| Product | Models | Affected (supported) | Fixed (supported) |
|---|---|---|---|
| DS-2CD2xx2F-I Series IP Camera | DS-2CD2xx2F-I Series | `>=5.2.0,<=5.4.0` | `>=5.4.41` |
| DS-2CD2xx0 Series IP Camera | DS-2CD2xx0 Series | `>=5.2.0,<=5.4.4` | `>=5.4.41` |
| DS-2CD4x2xFWD Series IP Camera | DS-2CD4x2xFWD Series | `>=5.2.0,<=5.4.0` | `>=5.4.41` |
| DS-2CD4xx5 Series IP Camera | DS-2CD4xx5 Series | `>=5.2.0,<=5.4.0` | `>=5.4.41` |
| DS-2CD2xx2FWD Series IP Camera | DS-2CD2xx2FWD Series | `>=5.3.1,<=5.4.4` | `>=5.4.41` |
| DS-2DEx Series IP Camera | DS-2DEx Series | `>=5.2.0,<=5.3.9` | `>=5.4.71` |
| DS-2DFx Series IP Camera | DS-2DFx Series | `>=5.2.0,<=5.4.5` | `>=5.4.71` |

- This establishes required demonstration 1 (vendor + product + model + affected version + fixed
  version + Evidence ids) end to end on real public evidence, including the revision-6 union matcher
  path (numeric bounds from vendor build-qualified prose) and evidence-backed models.

## Demonstration 2 — unsupported version format routes to human review (CVE-2023-36563, WordPad)

- Case: `cases/probe-demo2-36563.jsonl` (SHA256
  `038a3f613c3c61d692f798801df238d1f577569ac56598951df2b733c963bc8b`), story id 41, extraction
  receipt 48 (`received`).
- Result: `results/probe-demo2-36563-results.json` (SHA256
  `adfc5267c8aaee7c5c68db47f1f52d845c060488e29b3151c09a22b86807b69f`).
- The NVD configurations carry four-part build versions (for example `10.0.10240.20232`) that the
  closed grammar cannot express, and the MSRC advisory states products and KB numbers only.
- Observed: ten version-bearing products (including the named targets Windows 10 1507, Windows 10
  21H2, Windows Server 2022) routed to `impact_human_reviews`, each payload carrying a
  matcher-unsupported range (`supported=false`); four products without any version statement
  (Windows Server 2008 / 2008 R2 / 2012 / 2012 R2) persisted as legal versionless claims rows; no
  unsupported expression entered any claims row; the matcher refusal was surfaced in the review
  reasons. Zero safety-counter violations.
- This establishes required demonstration 2 (matcher-unsupported version formats become unknowns plus
  human review, never auto claims) end to end, with the product-level semantics of contract revision 6.

## Demonstration 3 — stale version rejection (CVE-2023-36802, Streaming Service Proxy)

- Case: `cases/probe-demo3-36802.jsonl` (SHA256
  `1e1b291d77b2ad2d7a2fb92d7499919cdc80ad6ab5dbab9f00a5f55595a3c4a1`), story id 43, extraction
  receipt 54 (`received`).
- Result: `results/probe-demo3-36802-results.json` (SHA256
  `8b514a4abf55a76dfcf389f7ea0338f76a83d4cf2cf281f03373f90fe8d667c4`).
- The Story title deliberately carries a stale, evidence-free version sentence ("builds 22621.1344
  and earlier were fixed"). Observed: the decoy string surfaced nowhere in the persisted rows or
  review payloads; seven human-review rows (four-part build bounds) provided the product signal; no
  claims row was persisted; zero safety-counter violations.
- This establishes required demonstration 3 (a stale version from untrusted Story text never enters
  the record) end to end.

## Provenance notes

- The demonstration probes were run before the v10 candidate was reviewed; the same CVEs were later
  reused in the v10 candidate, which the owner ruled destroyed that candidate's holdout independence
  (v10 = `DEVELOPMENT_PROBED_NOT_RUN_NOT_FREEZABLE`). These three CVEs are therefore development
  evidence and may not be reused in any holdout.
- Receipt ids 42/43 (failed schema-limit attempts) and 49-53 (v10 review receipts) remain in the
  scratch database as audit trail; the v10 reviewer verdicts are retained unmodified.
- Kimi review batches 52/53 were not completed (provider window timeouts, resolved as failed under
  the receipt protocol) and are not part of any evidence.
