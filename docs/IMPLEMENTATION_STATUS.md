# SentinelIntel Implementation Status

## Baseline

Upstream project: KKKKhazix/AIHOT

Audited baseline commit:

f6c2952a9984d4840442558be114ac959b512b0c

Baseline tag:

aihot-baseline-f6c2952

SentinelIntel design baseline commit:

659d6fff70804f465b04aea50f796e87983f6450

Working branch:

phase/0-baseline-audit

## Current Phase

Phase 0 — Baseline Audit & Freeze

Status:

COMPLETED_WITH_LIMITATIONS

Reason: the baseline is established and frozen with reproducible evidence, but the harness is not
fully green in this environment. 8 of 139 backend tests and 9 of 16 web tests fail, with root causes
identified and reproduced but deliberately not fixed (Phase 0 is read-only for business code).

Full record: `docs/00-sentinelintel/03-Phase0-Baseline-Audit.md`

## Completed

- Read `AGENTS.md`, Technical Design, Migration Spec, AIHOT `docs/architecture.md` and
  `docs/selection.md`, and the real build/test/docker/frontend configuration files.
- Verified the Git baseline with `git status`, `git branch -vv`, `git log --oneline --decorate -n 10`:
  branch `phase/0-baseline-audit` at `659d6ff`, tag `aihot-baseline-f6c2952` at `f6c2952`.
  No Git history was modified.
- Installed dependencies, ran the root typecheck and the web production build.
- Applied all 35 migrations on a fresh PostgreSQL 17 and ran the seed.
- Ran the full backend suite and the full web suite, with timing and per-test failure capture.
- Built and started the whole Docker Compose stack, ran the smoke check inside the compose network,
  verified seeded row counts, and tore the stack down.
- Started `apps/api` and `apps/worker` natively on Windows and checked the api health endpoint.
- Verified 20 AIHOT capabilities against source (all present) and confirmed that
  Python/FastAPI/LangGraph/Kafka/Neo4j/Kubernetes/CrossEncoder/GraphRAG do not exist in the repo.
- Audited `database/migrations/`: 35 files, max `0038`, no destructive statements, numbering gaps at
  0012/0025/0035.
- Classified every observed failure as CODE_FAILURE or ENVIRONMENT_BLOCKED, with reproduction steps.
- Produced `docs/00-sentinelintel/03-Phase0-Baseline-Audit.md`.

## Environment

| Item | Value |
|---|---|
| OS | Windows (win32) 10.0.26200 |
| Node.js | v24.16.0 (`engines.node >=24.11` satisfied) |
| npm | 11.13.0 |
| Docker | 29.6.1 |
| Docker Compose | v5.3.0 |
| PostgreSQL | `postgres:17-alpine` (throwaway container on port 55432; same image as CI) |
| Local psql client | not installed |
| Caddy | not pulled, not run |

Environment constraints encountered:

- Port 3000 is held by an unrelated project (`personal-rag-bot-frontend-1`); the compose web service
  was published on `PORT=3010` instead.
- Port 5432 is held by an unrelated project (`personal-rag-bot-db-1`, pgvector/pg16); a separate
  throwaway PostgreSQL 17 container on 55432 was used so no other project's data was touched.
- `registry.npmjs.org` is unreachable behind a TLS-intercepting middlebox
  (`ERR_TLS_CERT_ALTNAME_INVALID`, `DEPTH_ZERO_SELF_SIGNED_CERT`). Installed with
  `--registry=https://registry.npmmirror.com`, the switch documented in the `Dockerfile`.
- `npm ci` was blocked by the command sandbox (it deletes 507 `node_modules` entries in bulk:
  `SAFE_DELETE_BULK_CONFIRM_REQUIRED`). `npm install` was used instead, so the installed tree is not
  a clean `npm ci` result.
- Safety valves were kept closed throughout: `COLLECT_ENABLED=false`, `MODEL_CALLS_ENABLED=false`.

## Tests

Backend, `npm test` against a freshly migrated `aihot_ci` database:

```text
command: DATABASE_URL=postgres://postgres:baseline@127.0.0.1:55432/aihot_ci npm test
result:  tests 139 / suites 0 / pass 131 / fail 2 / cancelled 6 / skipped 0
exit code: 1
duration: 801108.829 ms (~802 s)
failure reason: see below
```

| Failing test | Kind | Reason |
|---|---|---|
| `tests/analyze-shutdown.test.ts` — SIGTERM during the final paid writing call… | cancelled | 120 s timeout; Windows cannot deliver SIGTERM to a child (ENVIRONMENT_BLOCKED) |
| `tests/analyze-shutdown.test.ts` — SIGTERM during successful first score… | cancelled | same |
| `tests/analyze-shutdown.test.ts` — SIGTERM during failed first score… | cancelled | same |
| `tests/translate-shutdown.test.ts` — SIGTERM finishes the sent normal batch… | cancelled | same |
| `tests/translate-shutdown.test.ts` — SIGTERM finishes the sent misaligned batch… | cancelled | same |
| `tests/translate.test.ts` — a text corrected while its translation was running… | fail | AssertionError: the run ended without asking the model; cascades from the cancelled shutdown tests |
| `tests/translate.test.ts` — links and images inside a paragraph survive… | fail | TypeError: Cannot read properties of undefined (reading 'body_html'); same cascade |
| `tests/translate.test.ts` — the post a selected X post quotes… | cancelled | 120 s timeout; same cascade |

Causality evidence (not inference):

- `node --test tests/translate.test.ts` alone on a fresh database: tests 3 / pass 3 / fail 0 (3.2 s).
- `node --test tests/translate-shutdown.test.ts tests/translate.test.ts` on a fresh database:
  tests 5 / pass 0 / fail 2 / cancelled 3 (363 s).
- Node documentation (checked 2026-10-01): `process` docs — "'SIGTERM' is not supported on Windows";
  `child_process` docs — on Windows SIGTERM/SIGKILL "terminate the process forcefully and abruptly
  (similar to 'SIGKILL')". The shutdown tests require the child's SIGTERM handler to run.

Web, after `npm run build -w @aihot/web`:

```text
command: node --test apps/web/tests/*.test.ts
result:  tests 16 / pass 7 / fail 9
exit code: 1
duration: 1001.185 ms
failure reason: all 9 are apps/web/tests/cache.test.ts, all ERR_UNSUPPORTED_ESM_URL_SCHEME
```

Typecheck and build:

```text
command: npm run typecheck
result:  pass (no diagnostics)
exit code: 0

command: npm run build -w @aihot/web
result:  pass (build/server/index.js 729.18 kB, vite 3.93 s)
exit code: 0
duration: 15.9 s
```

## Evaluation

NOT RUN.

- `scripts/eval-selection.ts` (Selection Eval / SelectBench): NOT_APPLICABLE / NOT_EXECUTED —
  external dependency / cost / authorization boundary. It calls the real scoring prompts through
  `runAnalysis`, has no offline or fake mode, and the repository has no gold set (no `.data/`;
  only `industry/gold.example.jsonl` with two made-up cases).
- Event grouping benchmark: NOT RUN — no dataset in the repository. `events/relate.ts` only records a
  historical measurement ("measured 2026-09-28 on 370 labelled pairs"); those labels are not in the
  repo and cannot be reproduced.
- Research / Tracking / Product Impact eval: NOT RUN — belong to Phases 4–6 and have no implementation
  or dataset yet.

Smoke, `scripts/smoke.ts` inside the compose network:

```text
command: docker compose run --rm --no-deps --entrypoint node setup scripts/smoke.ts --base http://web:3000
result:  all checks passed (15 pages, 1 feature page, 14 machine endpoints, /api/mcp initialize)
         three /leaderboard pages answered 503 "no leaderboard round published yet" by design
exit code: 0
```

The native Windows smoke run was NOT executed (the web process cannot start on Windows, see
Known Issues KI-1); it was performed in Docker instead.

## Docker

| Step | Result |
|---|---|
| `docker compose config --quiet` | pass (exit 0) |
| `docker compose build --build-arg NPM_REGISTRY=https://registry.npmmirror.com` | pass (120.6 s) |
| `docker compose up -d` | `db` healthy → `setup` exited 0 → `api`/`worker`/`web` up; healthy at 18.3 s |
| `GET /api/health` on the published port | `200 {"ok":true,"db":"ok","ms":2,"release":"dev"}` |
| `sources` / `topics` / `schema_migrations` in the container | 18 / 38 / 35 |
| `docker compose down -v` | pass, containers/network/volumes removed |

Two intermediate build failures were transient external network errors, not code problems, and both
passed on retry: `auth.docker.io` oauth timeout, then a `502 Bad Gateway` from `deb.debian.org` for
two `postgresql-client` packages. The `--profile https` (Caddy) path was NOT executed (needs a real
domain and certificate).

## Known Issues

**KI-1 (CODE_FAILURE, Windows only) — `apps/web/server.ts:38` cannot load the SSR build.**

```text
node apps/web/server.ts
→ Error [ERR_UNSUPPORTED_ESM_URL_SCHEME]: Only URLs with a scheme in: file, data, and node are
  supported by the default ESM loader. On Windows, absolute paths must be valid file:// URLs.
  Received protocol 'd:'
```

`path.resolve()` yields a bare Windows path that is passed to dynamic `import()`. Reproduced
independently: `import('D:/.../build/server/index.js')` fails, while
`import(pathToFileURL('D:/.../build/server/index.js').href)` succeeds. On Linux an absolute `/path`
is a legal specifier, so CI never sees this. Effects: the web process cannot run natively on Windows,
so the native smoke check is impossible, and all 9 tests in `apps/web/tests/cache.test.ts` fail
(that file spawns the production server).

Not fixed in Phase 0 (read-only rule; the baseline runs via Docker). Proposed minimal change:

```ts
import { pathToFileURL } from "node:url";
const build = await import(pathToFileURL(path.resolve(import.meta.dirname, "build/server/index.js")).href);
```

**KI-2 (CODE_FAILURE) — `scripts/mcp-check.ts` hardcodes tool names that do not exist.**

```text
node scripts/mcp-check.ts http://127.0.0.1:3001/api/mcp
→ server: {"name":"myhot","version":"2.0.0"}
→ tools: myhot_get_latest, myhot_search, myhot_get_hot_topics, myhot_get_story, myhot_get_daily
→ ProtocolError: Tool aihot_get_hot_topics not found  (code -32602)
```

`packages/contracts/src/mcp.ts` builds tool names from `SITE.mcpPrefix` (`myhot` in
`industry/site.ts:27`), but the script hardcodes `aihot_*` at `scripts/mcp-check.ts:12-21`. Not fixed
in Phase 0. Proposed minimal change: import `MCP_TOOL_NAMES` from `@aihot/contracts/mcp` instead.

**KI-3 (ENVIRONMENT_BLOCKED) — POSIX signals.** 5 shutdown tests cannot pass on Windows
(see Tests). Unaffected on Linux/CI.

**KI-4 (ENVIRONMENT_BLOCKED) — ports and registries.** Ports 3000 and 5432 are held by an unrelated
project; the npm public registry is behind a TLS-intercepting middlebox; the command sandbox blocks
`npm ci`'s bulk delete. See Environment.

**KI-5 — dependency install fidelity.** Because `npm ci` could not run, the installed tree came from
`npm install` over a partially populated `node_modules`. Typecheck, build and tests all ran against
it, but this is not a byte-for-byte `npm ci` tree.

**KI-6 — AI-only modules are still on.** `industry/features.ts` has `leaderboard: true` and
`codexResetMonitor: true`, so the smoke check exercises `/codex-reset` and expects 503 on the
leaderboard pages. Expected state; Phase 1 must turn both off.

## Design Deviations

Full detail in `docs/00-sentinelintel/03-Phase0-Baseline-Audit.md` §12. Summary:

1. The 20 AIHOT capabilities listed in the Technical Design (§3) and the Migration Spec (§2) were all
   found in source. No documented capability is missing. This is the audit's main positive finding.
2. "dedupe" is a pipeline step but not a module: it lives in `content/materials.ts`
   (`articles.identity_key` unique key plus `ON CONFLICT (identity_key) DO NOTHING`) and in
   `sources/collect.ts` (per-run `seen` set). There is no `dedupe.ts`.
3. Migration numbering is not contiguous: `0012`, `0025`, `0035` are absent; the maximum is `0038`.
   New SentinelIntel migrations must continue from `0039` and must not backfill the gaps.
4. SelectBench supports development/holdout as designed, but the repository contains no gold dataset.
5. `industry/site.ts` uses the open-source default branding `MyHOT` (`mcpPrefix: "myhot"`,
   `crawlerName: "MyHOTBot"`), not AIHOT branding, so the "do not use AIHOT branding" rule is already
   satisfied. However the root `package.json` name and the workspace package names are still
   `aihot` / `@aihot/*`; renaming them would touch `docker-compose.yml`, `Dockerfile` and every
   `npm run -w` invocation, so it needs a separate decision.
6. `structure` really does run concurrently with `scores` (`editorial/analyze.ts:349-352`), as the
   Migration Spec claims.

## Phase 1 Start Blockers

NO.

Nothing in this baseline blocks *starting* Phase 1 work (industry-pack verticalisation). None of the
observed failures touch `industry/`, the taxonomy, the prompts, the selection thresholds or the
sources, and the Docker path that Phase 1 will use for verification is fully green.

## Phase 1 Acceptance Prerequisites

These do **not** block starting Phase 1 development, but each of them must be resolved before Phase 1
can be accepted as complete.

1. **The security gold dataset does not exist yet.** The Migration Spec's Phase 1 asks for at least
   150–250 labelled cases with development/holdout splits. The repository currently has no gold
   dataset at all (no `.data/`; only `industry/gold.example.jsonl` with two made-up cases). Building it
   is Phase 1 work, but it is also a prerequisite for producing any acceptance metric.
2. **SelectBench / holdout needs real model calls, which require explicit cost authorization from the
   project owner.** `scripts/eval-selection.ts` runs the real scoring prompts through `runAnalysis` and
   has no offline or fake mode, so a Phase 1 baseline or holdout evaluation incurs paid model calls. No
   API key is available in the current environment and no budget has been authorized. Until the owner
   authorizes it, no Phase 1 accuracy number can be produced, and none may be claimed.
3. **KI-1 / KI-2 have not been decided.** Whether to fix the two code-level findings from this audit in
   a separate, clearly scoped baseline-fix commit is still open:
   - KI-1 — `apps/web/server.ts:38` passes a bare Windows path to dynamic `import()`, so the web
     process cannot start on Windows and all 9 cases in `apps/web/tests/cache.test.ts` fail there.
   - KI-2 — `scripts/mcp-check.ts:12-21` hardcodes `aihot_*` tool names while the server exposes
     `myhot_*` (derived from `SITE.mcpPrefix`), so the script always fails.
   Leaving them unfixed is a legitimate Phase 0 outcome (this Phase is audit-only), but the decision
   must be recorded before Phase 1 acceptance: "all tests pass" cannot be claimed on Windows until
   KI-1 is resolved.

## Next Action

Proceed to Phase 1 — Security Verticalization is **not** authorized yet by this document alone.

Phase 0 is COMPLETED_WITH_LIMITATIONS and must be accepted by the project owner first. The immediate
next action is human review of `docs/00-sentinelintel/03-Phase0-Baseline-Audit.md` and of the two
code-level findings (KI-1, KI-2), plus a decision on the cost/authorization boundary for Phase 1
evaluation.

Do not start Phase 1 until that review is done and Phase 0 has been explicitly accepted.
