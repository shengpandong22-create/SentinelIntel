# Phase 4 — Security Research Agent implementation contract

Status: `READY_FOR_IMPLEMENTATION_REVIEW`

## 1. Objective

Phase 4 proves that one bounded Security Research Agent can identify missing questions in an existing
security Story, collect authoritative external evidence, resolve or preserve conflicts, and return an
auditable research proposal.

The phase is successful only when every asserted claim points to stored Evidence, unknowns remain
explicit, and no unsupported critical claim appears in the frozen evaluation. The Agent proposes;
deterministic TypeScript code validates and commits.

## 2. Scope

Phase 4 adds:

- one Security Research Agent graph built on the Phase 3 Python runtime;
- a versioned Story research snapshot supplied by the TypeScript backend;
- typed, allowlisted research tools for NVD, CISA KEV, vendor advisories, and optional generic search;
- a TypeScript internal gateway that owns external network access, credentials, receipts, budgets,
  URL validation, and persistence;
- append-only `agent_research_runs` and `external_evidence` records;
- an offline/stubbed evaluation harness and a 20–50 case security research benchmark;
- an explicitly authorized final model/tool evaluation and a durable result report.

The first implementation slice is a manually invoked internal research run. Automatic scheduling and
product-facing publication are not required to prove this phase.

## 3. Non-goals

Phase 4 does not add:

- Event Tracking Agent, Product Impact Agent, multi-agent coordination, or autonomous delegation;
- a public, MCP, RSS, or web UI research endpoint;
- automatic research for every Story or a new scheduler;
- direct Python database access or provider credentials;
- arbitrary SQL, shell, filesystem, or unrestricted URL tools;
- vector databases, CrossEncoder, GraphRAG, Neo4j, Kafka, or Kubernetes;
- changes to grouping, Story membership, Fact semantics, digest generation, or publication behavior;
- promotion of external evidence into core Story/Fact records without a later deterministic workflow;
- a claim that model-reviewed labels are human gold.

## 4. Trust and ownership boundary

The runtime flow is:

```text
worker/admin command
  -> TypeScript loads immutable Story snapshot
  -> POST /v1/research/story/{story_id} to Python
  -> Python plans bounded research and requests logical tools
  -> authenticated TypeScript gateway executes allowlisted tools
  -> Python returns a research proposal
  -> TypeScript validates references and limits
  -> TypeScript writes research run + external evidence
```

Ownership rules:

- Python owns semantic reasoning, gap identification, tool choice, conflict analysis, and proposal
  construction.
- TypeScript owns database reads/writes, authentication, provider secrets, outbound HTTP policy,
  receipts, budget enforcement, normalization, deduplication, and final validation.
- Python receives neither `DATABASE_URL` nor external provider keys.
- The Agent cannot update Story, Fact, article, grouping, or publication tables.
- External pages and search responses are untrusted data. Their instructions are never executed or
  treated as system guidance.
- One caller-generated `trace_id` follows the snapshot, model calls, tool calls, receipts, proposal,
  and persisted run.

Internal endpoints use a dedicated secret such as `AGENT_INTERNAL_TOKEN`, constant-time comparison,
private Docker networking, sanitized logs, and fail-closed authentication. The token is never returned
in a trace, receipt, persisted input, or error.

## 5. Research contract

### 5.1 Input snapshot

The backend supplies a versioned, immutable snapshot containing only the fields needed for research:

- Story id, title, digest, status, timestamps, and current version marker;
- relevant Facts and their Evidence references;
- normalized entities such as CVEs, vendors, products, and versions when already known;
- the research objective and currently missing questions;
- caller-selected execution limits and `trace_id`.

The snapshot is persisted with the run so a result remains reproducible after the Story changes.

### 5.2 Output proposal

The Python service returns a typed proposal containing:

- `claims`: stable id, text, criticality, status, confidence, and evidence ids;
- `unknowns`: unanswered question, attempted sources, and why it remains unresolved;
- normalized evidence candidates with provenance and immutable retrieval metadata;
- conflicts that preserve all material competing evidence rather than silently choosing one;
- a sanitized tool trace and associated receipt ids;
- run summary, limits consumed, and terminal status.

Allowed claim statuses are `confirmed`, `conflicted`, and `unknown`. A confirmed or conflicted claim
must reference evidence. An unknown must not be disguised as a positive or negative factual claim.

Critical claims include at least: affected product/version, exploitation-in-the-wild, PoC availability,
patch/remediation availability, vendor acknowledgement, CVE identity, and severity statements used to
change operational priority.

### 5.3 Evidence admissibility

- A search result or generated summary is discovery material, not Evidence.
- A factual claim must point to a fetched source document with retrieval time, canonical URL, source
  type, title, excerpt or normalized fields, and content hash.
- A critical confirmed claim requires at least one authoritative source appropriate to that claim,
  such as NVD/CVE data, CISA KEV, a vendor advisory, a government CERT, or an official patch/release
  record.
- Secondary reporting may corroborate or expose a conflict but cannot be the sole support for a
  critical confirmed claim when a primary source is expected.
- Tool failures, missing pages, ambiguity, and source disagreement remain visible in the proposal.

## 6. Bounded tools

The first version exposes logical tools, not raw HTTP:

1. `nvd_lookup` — lookup by validated CVE id through the NVD adapter.
2. `kev_lookup` — lookup against a cached/versioned CISA KEV catalog.
3. `vendor_advisory_search` — search only configured vendor domains or feeds.
4. `evidence_fetch` — fetch a URL emitted by an allowlisted adapter after redirect and destination
   revalidation.
5. `web_search` — optional discovery-only provider; disabled when not configured and never itself
   accepted as evidence.

Each tool has a typed input/output schema, explicit timeout, bounded retry, rate limit, byte/document
limit, provenance fields, receipt linkage where paid, and a deterministic test stub. URL validation
rejects non-HTTP(S), credentials in URLs, localhost, private/link-local/reserved addresses, DNS rebinding,
unapproved redirects, and unsupported content types.

Default run bounds, configurable only toward stricter values in ordinary calls:

- at most 3 research rounds;
- at most 8 total tool calls;
- at most 2 generic searches;
- at most 12 fetched evidence documents;
- per-call timeout and one overall run deadline;
- bounded response bytes and model tokens;
- existing receipt and budget circuit breakers remain authoritative.

Any relaxation of these limits is a reviewed configuration change, not an Agent decision.

## 7. Persistence

Phase 4 reserves migration `0040_agent_research.sql` for two append-oriented tables.

### `agent_research_runs`

Minimum fields:

- id, Story id, trace id, objective, status;
- model/provider and prompt/graph version;
- immutable input snapshot and validated output proposal;
- sanitized tool trace, receipt ids, token/cost/latency totals;
- limits requested/consumed, error code/detail, start/completion timestamps.

### `external_evidence`

Minimum fields:

- id, Story id, research run id, stable evidence id;
- source type/name, canonical URL, title;
- published/updated/retrieved timestamps when known;
- excerpt or normalized structured fields, content hash, authority level;
- provenance/adapter metadata and creation timestamp.

The migration is additive and backward compatible. Evidence deduplication uses validated canonical
identity plus content hash; it must not collapse materially different revisions of the same advisory.
Rows remain auditable even when later evidence supersedes them.

The proposal stored on `agent_research_runs` is the review boundary. Phase 4 does not automatically
promote it into core Story or Fact state.

## 8. Evaluation design

### 8.1 Dataset

Create 20–50 evidence-backed research cases. The target is 30 cases unless source availability or
adjudication quality justifies a documented adjustment within that range.

Required strata:

1. incomplete CVE/CVSS/CWE details;
2. KEV or exploitation-in-the-wild status;
3. vendor confirmation, affected versions, and remediation;
4. conflicting or revised official sources;
5. PoC claims with primary/secondary-source quality differences;
6. insufficient evidence where one or more unknowns are the correct result.

Each case freezes:

- the input Story snapshot and research objective;
- expected questions and critical claims;
- admissible authoritative source identities or evidence requirements;
- forbidden unsupported conclusions;
- expected unknowns where applicable;
- collection time, provenance, adjudication method, and dataset split.

Development cases may be used to repair schemas, prompts, and adapters. Holdout cases are frozen before
the final run and never changed after results are observed. If the holdout is reviewed only by models,
its provenance is `MODEL_REVIEWED` and the phase report must state the limitation; it is never called
human gold.

### 8.2 Baselines

Run the same frozen cases through:

- B0: snapshot-only research with external tools disabled;
- B1: the bounded Security Research Agent with the permitted tools.

This comparison proves whether external research adds evidence coverage without trading away safety.
Do not claim improvement unless the harness reproduces it.

### 8.3 Metrics and hard gates

Safety gates:

- unsupported critical claims: exactly 0;
- claims without valid Evidence references: exactly 0;
- search snippets used as Evidence: exactly 0;
- tool trace and provenance completeness: 100%;
- budget, step, timeout, and tool allowlist violations: exactly 0;
- core Story/Fact mutations caused by the Agent: exactly 0.

Quality metrics reported by stratum and overall:

- expected-question resolution recall;
- authoritative-evidence retrieval recall and precision;
- supported-claim precision;
- expected-unknown preservation;
- conflict detection/preservation;
- tool error rate and terminal status;
- latency, model tokens, provider cost, tool-call count, and receipt coverage.

Numeric quality thresholds other than the safety gates are pre-registered after a small development
pilot and before holdout freeze. This avoids inventing targets without a measured baseline while still
preventing threshold tuning after holdout observation.

## 9. Implementation sequence

Implementation is split into reviewable, increasingly expensive gates:

1. schemas, migration, validators, internal authentication, and deterministic persistence tests;
2. typed stub tools and a deterministic end-to-end research graph;
3. TypeScript gateway adapters, outbound-network defenses, receipts, and budget integration;
4. real NVD/KEV/vendor development fixtures and scratch-database replay;
5. development benchmark construction and adjudication;
6. explicitly approved real-model development pilot, then pre-register thresholds;
7. holdout construction, independent review, validation, and freeze;
8. separately approved final paid B0/B1 run and result report.

Failure at a gate stops later paid or holdout work. It does not justify expanding the architecture.

## 10. Acceptance checklist

Phase 4 may be called complete only when all applicable items below are recorded in
`docs/IMPLEMENTATION_STATUS.md` with commands and artifacts:

1. The implementation matches this contract or every deviation is explicitly reviewed and documented.
2. Migration `0040` applies to an empty test database and an existing schema; both new tables and their
   constraints are covered by tests.
3. Python and TypeScript schemas reject invalid claims, dangling evidence ids, unsupported statuses,
   malformed traces, and limit overflows.
4. Internal authentication fails closed; secrets are absent from logs, errors, traces, fixtures, and
   committed files.
5. URL/redirect/DNS/content controls block SSRF and arbitrary fetches; prompt-injection fixtures cannot
   alter system rules or invoke unapproved tools.
6. Ordinary unit, integration, and CI tests make no external calls and require no real credentials.
7. Stubbed end-to-end tests prove success, conflict, unknown, retryable failure, permanent failure,
   timeout, budget exhaustion, and trace/receipt correlation.
8. A scratch-database replay proves that a validated proposal persists evidence and run records but
   does not modify core Story, Fact, grouping, or publication state.
9. Real development adapters demonstrate NVD, KEV, and vendor evidence with recorded provenance;
   generic search remains optional and discovery-only.
10. The validated benchmark contains 20–50 evidence-backed cases, reports all required strata and
    label provenance, and freezes its holdout before the final run.
11. The final authorized B0/B1 evaluation reproduces all safety gates and reports every quality, cost,
    latency, receipt, false-support, missed-evidence, unresolved, and conflict case.
12. Existing TypeScript checks, web build/tests, Phase 3 runtime checks, Docker health/network checks,
    and canonical Linux CI remain green.

If any safety gate fails, Phase 4 is not complete even if average quality metrics improve.

## 11. Authorization gates and expected owner involvement

Planning approval does not authorize real provider calls or final acceptance. Implementation can proceed
through deterministic stubs, schema work, local fixtures, and public no-cost adapters without further
product decisions, provided all safety valves remain off by default.

The following require explicit later authorization or a recorded owner decision:

1. enabling paid model or paid search calls for the development pilot;
2. choosing human-adjudicated holdout labels or accepting the explicit `MODEL_REVIEWED` limitation;
3. freezing the holdout and its pre-registered numeric quality thresholds;
4. executing the final paid B0/B1 evaluation;
5. accepting a phase result that carries any documented benchmark limitation.

These gates are deliberately late. The implementation must not consume paid quota while an earlier
deterministic or no-cost gate is failing.
