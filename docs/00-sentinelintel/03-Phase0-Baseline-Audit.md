# Phase 0 基线审计报告（Baseline Audit & Freeze）

> 文档定位：Phase 0 审计与冻结记录
> 审计对象：AIHOT 基线 commit `f6c2952a9984d4840442558be114ac959b512b0c`（tag `aihot-baseline-f6c2952`）
> 审计分支：`phase/0-baseline-audit`
> 审计日期：2026-10-01
> 原则：本文所有结论都可追溯到源码、命令或测试输出；未执行的项目明确标注 NOT RUN。

---

## 1. Git baseline

实际执行的核对（2026-10-01）。同一份工作区在两个时点各核对一次：审计开始时一次，人工验收补充阶段一次。

**人工验收补充阶段的实际输出**（原样粘贴，命令：`git remote -v`、`git status`、`git log --oneline --decorate -n 5`）：

```text
$ git remote -v
origin	https://github.com/shengpandong22-create/SentinelIntel.git (fetch)
origin	https://github.com/shengpandong22-create/SentinelIntel.git (push)
upstream	https://github.com/KKKKhazix/AIHOT.git (fetch)
upstream	https://github.com/KKKKhazix/AIHOT.git (push)

$ git status
On branch phase/0-baseline-audit
Your branch is up to date with 'origin/phase/0-baseline-audit'.

nothing to commit, working tree clean

$ git log --oneline --decorate -n 5
5b916b0 (HEAD -> phase/0-baseline-audit, origin/phase/0-baseline-audit) chore: audit and freeze AIHOT baseline
659d6ff (origin/main, main) docs: establish SentinelIntel V2 design and audited AIHOT baseline
f6c2952 (tag: aihot-baseline-f6c2952) chore: clarify PR review rules and limit checkout credentials (#9)
e9d40e2 Leaderboard: close the evidence tooltip on scroll (#6)
1db4b16 fix(sources): preserve Atom XHTML text constructs (#7)
```

两次核对之间唯一的差别：`phase/0-baseline-audit` 从 `659d6ff`（未提交）前进到 `5b916b0`（Phase 0 文档提交），并已在 origin 上跟踪。

**审计开始时的实际输出**：

```text
git status          → On branch phase/0-baseline-audit / nothing to commit, working tree clean
git branch -vv      → main 659d6ff [origin/main] docs: establish SentinelIntel V2 design and audited AIHOT baseline
                      * phase/0-baseline-audit 659d6ff docs: establish ...
git log --oneline   → 659d6ff (HEAD -> phase/0-baseline-audit, origin/main, main) docs: establish SentinelIntel V2 design and audited AIHOT baseline
                      f6c2952 (tag: aihot-baseline-f6c2952) chore: clarify PR review rules and limit checkout credentials (#9)
                      e9d40e2 Leaderboard: close the evidence tooltip on scroll (#6)
                      ...
```

远端实测（`git remote -v`，未做任何修改）：

| remote | URL | 用途 |
|---|---|---|
| `origin` | `https://github.com/shengpandong22-create/SentinelIntel.git` | SentinelIntel 本仓库；phase 分支与 PR 的唯一推送目标 |
| `upstream` | `https://github.com/KKKKhazix/AIHOT.git` | AIHOT 上游，仅用于追溯基线来源；**不向其推送** |

本 Phase 未执行 `git remote add` / `git remote set-url` / `git remote remove` 等任何远端变更。`upstream` 保持只读追溯用途，`origin` 只接收 `phase/0-baseline-audit`（及后续 Phase 分支），`main` 未被推送新提交。

结论：

| 项目 | 实际情况 | 与任务描述是否一致 |
|---|---|---|
| 基线 commit | `f6c2952a9984d4840442558be114ac959b512b0c` | 一致 |
| 基线 tag | `aihot-baseline-f6c2952` 存在，指向 `f6c2952` | 一致 |
| 设计基线提交 | `659d6fff70804f465b04aea50f796e87983f6450`（`659d6ff`） | 一致 |
| 当前分支 | `phase/0-baseline-audit`；审计开始时与 `main` 同为 `659d6ff`，Phase 0 文档提交后为 `5b916b0` | 一致 |
| 工作区 | 审计开始时 clean，人工验收补充阶段复核仍 clean | 一致 |
| remote | `origin` = SentinelIntel 本仓库；`upstream` = AIHOT，见 §1 实测表 | 一致 |

Git 历史未做任何修改，未 rebase，未改动 baseline tag，未在最终自检之外执行任何写操作。`git remote -v` 已于人工验收补充阶段实际执行并记录于本节；`origin` 与 `upstream` 均未做新增/改址/删除。`main` 在 `origin` 上仍为 `659d6ff`，未被推送新提交；`phase/0-baseline-audit` 的提交与远端一一对应。

---

## 2. Environment

| 项目 | 实测值 | 来源 |
|---|---|---|
| OS | Windows（win32），`10.0.26200` | `npm debug log` 中 `Windows_NT 10.0.26200` |
| Node.js | `v24.16.0` | `node --version`；满足 `package.json` 的 `engines.node >=24.11` |
| npm | `11.13.0` | `npm --version` |
| package manager | npm（`package-lock.json` 存在，workspaces 由 npm 管理） | 根 `package.json` |
| Docker | `29.6.1` | `docker --version` |
| Docker Compose | `v5.3.0` | `docker compose version` |
| PostgreSQL（本次审计使用） | `postgres:17-alpine`（按 CI 一致版本起的一次性容器，端口 55432） | `docker run`；CI 使用同镜像 |
| 本机 psql 客户端 | 不存在（`psql` 不在 PATH） | `psql --version` 报 CommandNotFound |
| Caddy | 未拉取、未运行 | — |

### 环境冲突与网络限制（均为环境事实，非代码缺陷）

1. **端口 3000 被无关项目占用**：`personal-rag-bot-frontend-1` 已监听 `0.0.0.0:3000`。因此 Docker 验证时把站点发布端口改为 `PORT=3010`。
2. **端口 5432 被无关项目占用**：`personal-rag-bot-db-1`（`pgvector/pgvector:pg16`）监听 `0.0.0.0:5432`。为避免碰其它项目的数据，本次审计另起一次性 `postgres:17-alpine` 容器映射到 `55432`，数据库名 `aihot_test` / `aihot_ci` / `translate_ci` / `cascade_ci`。
3. **npm 官方源 TLS 被中间人干扰**：`npm ci` 对 `registry.npmjs.org` 大量出现
   `ERR_TLS_CERT_ALTNAME_INVALID` / `DEPTH_ZERO_SELF_SIGNED_CERT`，npm 最终以内部错误 `Exit handler never called!` 退出（exit 1）。
   改用 `--registry=https://registry.npmmirror.com`（`Dockerfile` 注释中官方给出的海外/大陆镜像切换方式）后成功。
4. **命令沙箱限制**：`npm ci` 会先整体删除 `node_modules`（507 个条目），被命令沙箱以 `SAFE_DELETE_BULK_CONFIRM_REQUIRED` 拦下。
   改为 `npm install`（不整目录删除）后成功。**因此本次依赖安装不是干净的 `npm ci`**，而是在一次失败 `npm ci` 留下的部分目录上由 `npm install` 收敛得到，见第 11 节。

---

## 3. Architecture verification（源码事实）

### 3.1 Workspace 与运行时

根 `package.json` 实测：

- `name`: `aihot`（尚未改名，属 Phase 1 范围）
- `workspaces`: `packages/*`、`apps/*`、`industry`
- `engines.node`: `>=24.11`
- 根 scripts：`db:migrate`、`dev:api`、`dev:worker`、`dev:web`、`typecheck`、`test`
  - `typecheck` = `tsc -p packages/contracts && tsc -p packages/backend && tsc -p apps/api && tsc -p apps/worker && tsc -p tests && npm run typecheck -w @aihot/web`
  - `test` = `node --test --test-concurrency=1 --test-timeout=120000 "tests/*.test.ts"`

三个进程入口（源码与 `docker-compose.yml` 互证）：

| 进程 | 启动命令 | 源码位置 |
|---|---|---|
| api | `node apps/api/src/main.ts` | `apps/api/src/main.ts` |
| worker | `node apps/worker/src/main.ts` | `apps/worker/src/main.ts` |
| web | `node apps/web/server.ts` | `apps/web/server.ts` |

`docker-compose.yml` 服务：`db`、`setup`（`node scripts/migrate.ts && node scripts/seed.ts` 后退出）、`api`、`worker`、`web`（默认发布 `${PORT:-3000}:3000`）、`caddy`（`profiles: ["https"]`）。
PostgreSQL 版本：`postgres:17-alpine`（`docker-compose.yml:24`）。
migration 执行方式：`scripts/migrate.ts` 按文件名排序逐个 SQL 文件、每个文件一个事务，以 `schema_migrations` 表记录已应用项，可重复执行。
seed 执行方式：`scripts/seed.ts`（topics 来自 `industry/topics.json`；sources 来自 `industry/sources.json`，`ON CONFLICT (id) DO NOTHING`；`leaderboard` 开启时额外导入模型目录）。支持 `--topics-only`。

### 3.2 核心目录核对

| 目录 | 真实职责（来自源码/README/architecture.md） |
|---|---|
| `apps/api` | Fastify：站点自用接口 `/api/site/`、公开 API `/api/v1/`、RSS、MCP、后台接口、图片代理、分享图。17 个源文件。 |
| `apps/worker` | pg-boss 队列与定时任务。**仅 2 个源文件**：`main.ts`、`schedules.ts`（定时表全部集中在 `schedules.ts`）。 |
| `apps/web` | React Router SSR 网页，只通过 HTTP 读 api。含 `app/routes/`、`app/features/`、`tests/`、`server.ts`。 |
| `packages/backend` | 业务代码：`sources/`、`content/`、`editorial/`、`events/`、`publication/`、`reports/`、`providers/`、`jobs/`、`admin/`、`operations/`、`notify/`、`leaderboard/`、`monitor/`、`media/`、`site/`、`ingest/`、`lib/`、`config.ts`、`db.ts`。 |
| `packages/contracts` | 前后端共用类型与常量（含 `mcp.ts`、`taxonomy.ts`、`http-policy`、`time`）。 |
| `industry` | 行业包：`site.ts`、`taxonomy.ts`、`topics.json`、`sources.json`、`selection.ts`、`features.ts`、`prompts/`（27 个 md）、`brand/`、`pages/`、`gold.example.jsonl`、`changelog.json`。 |
| `database/migrations` | 35 个 `.sql`，编号顺序执行。 |
| `scripts` | 14 个脚本：`migrate.ts`、`seed.ts`、`smoke.ts`、`eval-selection.ts`、`collect.ts`、`mcp-check.ts`、`regroup-events.ts`、`init-env.ts`、`enqueue-analysis.ts`、`delete-sources.ts`、`import-leaderboard-prices.ts`、`lb-round.ts`、`lb-fetch-check.ts`、`nameplates.ts`。 |
| `tests` | 33 个 `.ts`（32 个 `*.test.ts` + `setup.ts`）+ `tsconfig.json`。 |
| `docs` | AIHOT 原有文档：`architecture.md`、`customize.md`、`selection.md`、`sources.md`、`deploy.md`、`leaderboard.md`；新增 `00-sentinelintel/`。 |
| `reference/` | 仅 `public-v1.openapi.json`。 |
| `assets/` | 站点素材（svg/png/ttf）。 |
| `deploy/` | 仅 `Caddyfile`。 |

### 3.3 AIHOT 已存在能力逐项验证

**全部 20 项在源码中均存在，未发现设计中声称存在而源码缺失的能力。**（证据 = 文件 + 导出符号/表名/任务名）

| # | 能力 | 结论 | 主要证据 |
|---|---|---|---|
| 1 | collection / dedup | EXISTS | `packages/backend/src/sources/collect.ts`；去重实现为 `content/materials.ts` 的 `identityKeyFor` + `articles.identity_key` 唯一键 + `upsertMaterial` 的 `ON CONFLICT (identity_key) DO NOTHING`，加单轮抓取的 `seen` 集合。**没有独立的 `dedupe.ts` 模块。** |
| 2 | prefilter | EXISTS | `editorial/analyze.ts` 的 `runPrefilter`；`PrefilterSchema`（PASS/BLOCK/UNKNOWN）；结论：UNKNOWN 与 PASS 一样放行，只有 BLOCK 阻断。 |
| 3 | selection 双评分 + 分层门槛 | EXISTS | `editorial/analyze.ts` 的 `SCORE_CALLS = 2`、`tierThreshold()`、`UNDERSTAND_FLOOR`；`industry/selection.ts` 的 `thresholds {T1:60, T1_5:65, T2:76}`、`understandFloor: 50`。 |
| 4 | writing | EXISTS | `editorial/writing.ts`；prompt `content-understanding` / `summarize-*`。 |
| 5 | structure | EXISTS | `editorial/analyze.ts` 的 `runStructure`；`StructureSchema = {category, tags, subjects, fact}`。 |
| 6 | Article / Fact / Story 模型 | EXISTS | `database/migrations/0001_core.sql`（articles、article_revisions、article_discoveries）、`0002_events_reports.sql`（facts、fact_articles、stories、story_digests、story_links、story_signals）。 |
| 7 | event grouping | EXISTS | `events/relate.ts` 的 `RELATIONS = ["SAME_OCCURRENCE","SAME_STORY","UNRELATED","ROUNDUP"]`；`events/group.ts` 的 14 天 recent recall、`RECALL_MIN_COSINE = 0.6`、二次模型确认 `confirmMerge`、人工保护 `manualDecision` + `grouping_overrides`。 |
| 8 | story digest | EXISTS | `events/digest.ts` 的 `composeStoryDigest`，按 `inputs_hash` 增量重写，表 `story_digests`。 |
| 9 | story status | EXISTS | `events/digest.ts` 的 `storyStatusFor`（24h / 72h）与 `refreshStoryStatuses`；定时任务 `stories.status`（cron `7 * * * *`）。 |
| 10 | story links | EXISTS | `events/group.ts` 的 `linkRelatedStories()`，写 `story_links`；定时任务 `stories.links`（`12 * * * *`）。 |
| 11 | hot ranking | EXISTS | `events/hot.ts`（`computeHotRanking`、写 `hot_rankings`、`story_heat_hourly`）、`events/hot-read.ts`（`latestHotRanking`、`loadHotStrip`）；任务 `hot.rank`（`*/5 * * * *`）、`hot.snapshot`（`2 * * * *`）。 |
| 12 | reports | EXISTS | `reports/compose.ts` 的 `composeDaily` / `composeWeekly` / `composeMonthly` / `catchUpReports`；任务 `reports.daily`（`0 8 * * *`）、`reports.weekly`（`0 10 * * 1`）、`reports.monthly`（`30 10 1 * *`）、`reports.catch-up`（`15 * * * *`）。 |
| 13 | source health + 自适应间隔 | EXISTS | `operations/reports.ts` 的 `sourceHealthWeekly()`；`sources/collect.ts` 的 `adaptIntervals()`（按 7 天产出在 15–120 分钟间调整）；任务 `reports.source-health`（`0 9 * * 1`）、`sources.adapt-intervals`（`20 4 * * *`）。 |
| 14 | receipts + 预算熔断 | EXISTS | `providers/receipts.ts` 的 `checkBudget`（按分/时/天，pg advisory 锁串行）、`BudgetExceededError`；表 `receipts`、`budgets`、`receipt_attempts`（migration `0022`）。 |
| 15 | retry / failure handling | EXISTS | `jobs/queue.ts` 的 `QUEUE_OPTIONS`（每队列 retryLimit/retryDelay/retryBackoff）；`jobs/content.ts` 的 `RETRY_MINUTES = [5,10,20,40,60,120,240,360]`；列 `processing_attempts` / `processing_retry_at`（migration `0023`）。 |
| 16 | SelectBench | EXISTS | `scripts/eval-selection.ts`、`packages/backend/src/admin/selectbench.ts`、migration `0009`/`0028`、Web 路由 `apps/web/app/routes/admin/selectbench.tsx` 与 `selectbench-run.tsx`；阈值扫描 `for t in 40..90 step 2`；`--split` + `samplingContext.benchmarkSplit` 支持 development/holdout。 |
| 17 | admin / 人工修正 | EXISTS | `admin/content.ts` 的 `contentChain`、`detachFromFact`、`mergeStories`、`overrideFields`、`setVisibility`、`rerun`；migration `0024`。 |
| 18 | MCP | EXISTS | `apps/api/src/routes/mcp.ts`、`packages/contracts/src/mcp.ts`、`scripts/mcp-check.ts`、`apps/web/app/routes/agent.tsx`。**5 个只读工具**，名字由 `SITE.mcpPrefix` 生成：`get_latest`、`search`、`get_hot_topics`、`get_story`、`get_daily`。 |
| 19 | publication 读取层 | EXISTS | `packages/backend/src/publication/`（19 个文件），导出入口包括 `v1.ts` 的 `rowToV1`/`v1Items`/`selectedSnapshot`、`stories.ts`、`reports.ts` 的 `v1Daily`、`feeds.ts`、`items.ts`、`detail.ts`、`groups.ts`、`topics.ts`、`llms.ts`、`links.ts` 等。 |
| 20 | 其他 benchmark / eval | 部分存在 | 仓库内可运行的只有 `scripts/eval-selection.ts`（选择评测，会真实调用模型）与 `scripts/regroup-events.ts`（归组重算）。`events/relate.ts:10` 与 `:153-158` 记录了历史标注测量（"measured 2026-09-28 on 370 labelled pairs"、story-level precision 0.944 / recall 0.962 @0.75），**但这些标注数据不在仓库里**，无法在 Phase 0 复现。 |

### 3.4 被禁止技术栈的存在性核查

| 技术 | 结果 |
|---|---|
| Python / FastAPI / LangGraph | NOT FOUND（全库 0 个 `.py`，0 个 `pyproject.toml`；相关词只出现在设计文档与 `industry/prompts/rules-domain.md` 的词表里） |
| Kafka | NOT FOUND |
| Neo4j | NOT FOUND |
| Kubernetes | NOT FOUND |
| CrossEncoder / GraphRAG | NOT FOUND |

---

## 4. Build verification

| 项目 | 命令 | 结果 | 退出码 | 耗时 |
|---|---|---|---|---|
| 依赖安装 | `npm ci --no-audit --no-fund` | FAIL（TLS 中间人 + npm 内部错误） | 1 | — |
| 依赖安装（镜像） | `npm ci --registry=https://registry.npmmirror.com` | FAIL（沙箱拦截整目录删除） | 1 | — |
| 依赖安装（替代） | `npm install --registry=https://registry.npmmirror.com` | OK（added 275 packages, changed 6） | 0 | 14s |
| 类型检查 | `npm run typecheck` | OK（无输出即通过） | 0 | — |
| Web 构建 | `npm run build -w @aihot/web` | OK（`build/server/index.js` 729.18 kB / gzip 179.04 kB；vite 3.93s） | 0 | 15.9s |
| Docker 镜像构建 | `docker compose build --build-arg NPM_REGISTRY=https://registry.npmmirror.com` | OK（`Image aihot-app Built`） | 0 | 120.6s |
| Compose 配置校验 | `docker compose config --quiet` | OK | 0 | — |

构建阶段的中间失败（均为瞬态外部网络，重试后成功，不计为代码问题）：

- 第 1 次 `docker compose build`：`auth.docker.io/.../token` 连接超时 → `docker pull node:24-trixie-slim` 成功后再构建即通过。
- 第 2 次 `docker compose build`：`apt-get install postgresql-client` 时 `deb.debian.org` 对 2 个包返回 `502 Bad Gateway`，退出码 100 → 重试后通过。

---

## 5. Test verification

### 5.1 后端测试（`npm test`，干净库 `aihot_ci`，35 个 migration 已应用）

```text
ℹ tests 139
ℹ suites 0
ℹ pass 131
ℹ fail 2
ℹ cancelled 6
ℹ skipped 0
ℹ duration_ms 801108.829
```

退出码 1，耗时约 802s（13.4 分钟）。**8 个失败**（6 cancelled + 2 fail）：

| 文件 | 测试 | 表现 |
|---|---|---|
| `tests/analyze-shutdown.test.ts` | SIGTERM during the final paid writing call still commits the complete analysis and publication | cancelled（120s timeout） |
| `tests/analyze-shutdown.test.ts` | SIGTERM during successful first score drains slower structure and leaves a retryable job | cancelled（120s timeout） |
| `tests/analyze-shutdown.test.ts` | SIGTERM during failed first score drains slower structure and leaves a retryable job | cancelled（120s timeout） |
| `tests/translate-shutdown.test.ts` | SIGTERM finishes the sent normal batch and resumes from its receipt | cancelled（120s timeout） |
| `tests/translate-shutdown.test.ts` | SIGTERM finishes the sent misaligned batch and resumes from its receipt | cancelled（120s timeout） |
| `tests/translate.test.ts` | a text corrected while its translation was running… | fail（AssertionError: the run ended without asking the model，300ms） |
| `tests/translate.test.ts` | links and images inside a paragraph survive the translation… | fail（TypeError: Cannot read properties of undefined (reading 'body_html')，72ms） |
| `tests/translate.test.ts` | the post a selected X post quotes is translated once and shown with the item | cancelled（120s timeout） |

### 5.2 失败归因（有实验证据，非推断）

**归因 1：`tests/translate.test.ts` 的 3 个失败不是自身缺陷，而是被前面的 shutdown 测试连累。**

- 干净库单独跑 `tests/translate.test.ts`：`tests 3 / pass 3 / fail 0`，耗时 3.2s。
- 同一干净库把 `tests/translate-shutdown.test.ts` 与 `tests/translate.test.ts` 一起跑：`tests 5 / pass 0 / fail 2 / cancelled 3`，耗时 363s。
- 结论：`translate.test.ts` 在隔离环境全绿；与前一个文件同跑时 0 通过。`npm test` 按文件名字母序执行，`translate-shutdown` 恰在 `translate` 之前，且 shutdown 测试超时被 cancelled 后留下共享库状态，破坏了后续用例的隔离假设。

**归因 2：5 个 shutdown 用例失败是 Windows 平台的信号语义限制。**

- 用例机制：`tests/analyze-shutdown.test.ts:69` / `tests/translate-shutdown.test.ts:30` 用 `spawn` 起子进程，再用 `child.kill("SIGTERM")`（`analyze-shutdown.test.ts:93,109,133`），期望子进程的 `process.on('SIGTERM')` 处理器被调用、`process.send({stopping:true})` 回传后父进程继续等待 drain，最终断言退出码为 `null`。
- 官方文档（Node.js v26 docs，2026-10-01 查阅）：
  - `process` 文档 Signal events：`'SIGTERM' is not supported on Windows, it can be listened on.`；`Windows does not support signals so has no equivalent to termination by signal, but Node.js offers some emulation with process.kill(), and subprocess.kill(): Sending SIGINT, SIGTERM, and SIGKILL will cause the unconditional termination of the target process`。
  - `child_process` 文档 `subprocess.kill()`：`On Windows, where POSIX signals do not exist, signals are handled as follows. 'SIGKILL', 'SIGTERM', 'SIGINT' and 'SIGQUIT' terminate the process forcefully and abruptly (similar to 'SIGKILL')`。
- 因此子进程在 Windows 上被直接强制终止，`stopping` 消息永远不会发出，父进程等待到 120s 超时 → cancelled。**这是平台限制（ENVIRONMENT_BLOCKED），不是被测业务代码的缺陷。**

### 5.3 Web 测试（`node --test apps/web/tests/*.test.ts`，需先构建）

```text
ℹ tests 16
ℹ pass 7
ℹ fail 9
ℹ duration_ms 1001.185
```

退出码 1，耗时 1.2s。9 个失败**全部来自 `apps/web/tests/cache.test.ts`**，报错一致：

```text
Error [ERR_UNSUPPORTED_ESM_URL_SCHEME]: Only URLs with a scheme in: file, data, and node are
supported by the default ESM loader. On Windows, absolute paths must be valid file:// URLs.
Received protocol 'd:'
```

根因已定位并独立复现（见第 11 节 CODE-1）。其余 4 个 web 测试文件（`local-state`、`markdown`、`request-cancellation`、`session-cache`）通过。

### 5.4 测试分类

| 类别 | 内容 |
|---|---|
| unit / 纯函数为主，不触库的少量用例 | `url.test.ts`、`x-shards.test.ts`（部分）、`icons.test.ts`、`rss-xhtml.test.ts` 等 |
| 需要 PostgreSQL 的集成测试 | **23 / 32** 个后端测试文件直接执行 SQL（`sql\`` 出现在 23 个文件）；`tests/setup.ts` 强制要求 `DATABASE_URL` 的库名以 `_test` 或 `_ci` 结尾，否则拒绝运行，并且写明“共享同一个库、串行执行” |
| 需要 spawn 子进程的测试 | `tests/analyze-shutdown.test.ts`、`tests/translate-shutdown.test.ts`（依赖 POSIX 信号） |
| 需要 Web 构建产物的测试 | `apps/web/tests/*`（`npm run build -w @aihot/web` 之后运行） |
| 需要 Docker 的测试 | 无。测试本身不需要 Docker，只有 CI 的第二个 job 用 Docker 验证整栈 |
| 可能访问外部服务的测试 | 未发现。`tests/setup.ts:2-5` 明确“测试不访问任何外部服务：模型和付费接口由本地假服务回答”；测试内出现的 `https://` 均为数据里的 URL 字面量。**本次审计未做网络隔离，因此这是源码+注释证据，不是隔离实验证据。** |
| Eval（非传统 test） | `scripts/eval-selection.ts` 是评测脚本，不是 `npm test` 的一部分 |

---

## 6. Migration verification

| 项目 | 实测 |
|---|---|
| migration 目录 | `database/migrations/` |
| 文件数 | 35 个 `.sql` |
| 当前最大编号 | `0038_quote_translations.sql`（下一个应为 `0039`） |
| 编号空洞 | `0012`、`0025`、`0035` **不存在**（编号不连续） |
| 顺序 | `scripts/migrate.ts` 用 `readdirSync(...).sort()` 按文件名排序执行 |
| 命名方式 | `NNNN_snake_case 描述.sql` |
| 初始化方式 | 每次运行 `CREATE TABLE IF NOT EXISTS schema_migrations (name text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())`，逐文件一个事务，已应用的跳过；可重复执行 |
| 破坏性迁移 | **未发现**。全目录 `\bDROP\b` 只命中 2 处：`0023_processing_retry.sql:9 DROP INDEX IF EXISTS articles_processing_idx`、`0033_receipt_budget_index.sql:4 DROP INDEX IF EXISTS receipt_attempts_service_time_idx`，均为索引重建。无 `TRUNCATE`、无 `DELETE FROM`、无 `DROP TABLE/COLUMN/SCHEMA/DATABASE` |
| seed | 存在：`scripts/seed.ts`。`--topics-only` 只导入 topics（实测 38 条）；完整模式另导入 sources（实测 18 条）与 leaderboard 目录 |
| 测试数据库策略 | 必须是以 `_test` 或 `_ci` 结尾的库；共享一个库、`--test-concurrency=1` 串行 |
| 本次实际执行 | `aihot_test`：35 applied；`aihot_ci`：35 applied；`translate_ci`：35 applied；`cascade_ci`：35 applied |
| Docker 内执行 | `setup` 容器 `node scripts/migrate.ts && node scripts/seed.ts` 退出码 0；容器内 `schema_migrations` = 35，`sources` = 18，`topics` = 38 |

本 Phase 未新增任何 SentinelIntel migration。

---

## 7. Docker verification

| 步骤 | 命令 | 结果 | 退出码 | 耗时 |
|---|---|---|---|---|
| 配置校验 | `docker compose config --quiet` | OK | 0 | — |
| 构建（含 registry 参数） | `docker compose build --build-arg NPM_REGISTRY=https://registry.npmmirror.com` | OK | 0 | 120.6s |
| 启动 | `docker compose up -d` | OK；`db` healthy → `setup` Exited(0) → `api`/`worker`/`web` Up | 0 | 启动到健康 18.3s |
| 服务状态 | `docker compose ps` | `api Up 3000/tcp`、`db Up (healthy) 5432/tcp`、`web Up 0.0.0.0:3010->3000/tcp`、`worker Up` | 0 | — |
| 健康检查 | `GET http://127.0.0.1:3010/api/health` | `200 {"ok":true,"db":"ok","ms":2,"release":"dev"}` | 0 | — |
| 日志 | `docker compose logs worker --tail 15` | `{"level":"info","msg":"worker started","pid":1}`，无错误 | 0 | — |
| 停机 | `docker compose down -v` | OK（容器、网络、卷均已移除） | 0 | — |

未执行：`--profile https`（Caddy）路径 —— 需要真实域名与证书，属外部依赖边界。

`.env` 由 `scripts/init-env.ts --llm-key baseline-not-a-real-key` 生成，并按 CI 的做法把 `COLLECT_ENABLED=false`、`MODEL_CALLS_ENABLED=false`，另加 `MCP_ALLOWED_HOSTS=web`、`PORT=3010`（端口冲突规避）。`.env` 已被 `.gitignore` 覆盖，未进入 Git。

---

## 8. Smoke-test verification

在 compose 网络内执行（与 CI 相同的调用方式）：

```text
docker compose run --rm --no-deps --entrypoint node setup scripts/smoke.ts --base http://web:3000
```

结果：退出码 0，`all checks passed`。逐项：

- 15 个页面 ✓（`/`、`/all`、`/hot`、`/daily`、`/daily/archive`、`/topics`、`/starred`、`/agent`、`/about`、`/changelog`、`/feedback`、`/terms`、`/privacy`、`/more`、`/admin/login`）
- `/codex-reset` ✓（`FEATURES.codexResetMonitor` 当前为 `true`）
- 3 个 leaderboard 页面：`– no leaderboard round published yet`（`FEATURES.leaderboard` 为 `true`，但首轮尚未计算，脚本按设计容忍 503）
- 机器出口 ✓：`/api/health`、`/api/v1/items`、`/api/v1/hot-topics`、`/api/v1/selected/snapshot`、`/feed.xml`、`/feed/all.xml`、`/llms.txt`、`/robots.txt`、`/sitemap.xml`、`/manifest.webmanifest`、`/openapi-v1.json`、`/og/site.png`、`/icon.png`、`/favicon.ico`
- MCP `initialize` ✓（返回 server name = `SITE.mcpPrefix` = `myhot`）

未执行：Windows 本机（非 Docker）的 `node scripts/smoke.ts --base http://localhost:3000`。原因见第 11 节 CODE-1：Windows 上 web 进程无法启动。

### 8.1 本机进程级手动检查（MANUAL CHECK，Windows）

| 进程 | 命令 | 结果 |
|---|---|---|
| api | `node apps/api/src/main.ts`（`COLLECT_ENABLED=false`、`MODEL_CALLS_ENABLED=false`） | 启动成功；`/api/health` → `200 {"ok":true,"db":"ok","ms":3,"release":"dev"}` |
| worker | `node apps/worker/src/main.ts`（同上安全阀） | 启动成功，`{"level":"info","msg":"worker started","pid":43504}`，进程存活 |
| web | `node apps/web/server.ts` | **失败**，`ERR_UNSUPPORTED_ESM_URL_SCHEME`（见 CODE-1） |
| MCP 客户端 | `node scripts/mcp-check.ts http://127.0.0.1:3001/api/mcp` | 握手与 `listTools` 成功，返回 5 个 `myhot_*` 工具；随后调用失败：`ProtocolError: Tool aihot_get_hot_topics not found`（见 CODE-2） |

---

## 9. Evaluation 基线

| 评测 | 状态 | 说明 |
|---|---|---|
| Selection Eval / SelectBench | **NOT RUN** | `scripts/eval-selection.ts` 会经 `runAnalysis` 真实调用评分提示词与模型。仓库无离线/假模型模式，且**不存在 gold 数据集**（无 `.data/`；仅 `industry/gold.example.jsonl` 两条编造样例）。运行会产生真实付费模型调用。 |
| Event grouping benchmark | **NOT RUN / 无数据集** | 只有 `events/relate.ts` 注释里的历史测量记录（370 对标注、precision 0.944 / recall 0.962 @0.75），标注数据不在仓库，无法复现。 |
| Research / Tracking / Product Impact Eval | NOT RUN | 属 Phase 4/5/6 产物，当前仓库没有对应实现与数据集。 |
| CI 中的轻量验证 | 已由本次审计覆盖 | CI 的 `check` job 步骤与本次执行路径一致（install → typecheck → build → web tests → migrate → seed --topics-only → smoke → npm test）。 |

明确区分：

- **TEST** = `npm test`（139 个，后端）、`node --test apps/web/tests/*.test.ts`（16 个，Web）
- **EVAL** = `scripts/eval-selection.ts`（本次 NOT RUN）
- **SMOKE TEST** = `scripts/smoke.ts`（本次已跑，Docker 内全绿）
- **MANUAL CHECK** = api/worker 本机启动与健康检查、`scripts/mcp-check.ts`

---

## 10. 外部依赖边界（NOT EXECUTED）

| 项目 | 原因分类 |
|---|---|
| `scripts/eval-selection.ts` | NOT_EXECUTED — external dependency / cost / authorization boundary（真实 LLM 调用；无 gold 集；无离线模式） |
| `scripts/collect.ts` | NOT_EXECUTED — 会真实抓取外部信源（且可触发付费采集服务） |
| `scripts/lb-fetch-check.ts`、`lb-round.ts`、`import-leaderboard-prices.ts` | NOT_EXECUTED — 需要外部评测源 / `ARTIFICIAL_ANALYSIS_API_KEY` |
| `node scripts/smoke.ts`（Windows 本机） | NOT_EXECUTED — 被 CODE-1 阻塞，改在 Docker 内完成 |
| `docker compose --profile https up` | NOT_EXECUTED — 需要真实域名与证书 |
| 其它 `apps/worker` 真实任务（抓取、模型、日报） | 未以真实外部调用验证；审计期间 `COLLECT_ENABLED=false`、`MODEL_CALLS_ENABLED=false` |

未伪造任何通过结果。

---

## 11. Known failures

### CODE-1 — `apps/web/server.ts` 在 Windows 上无法启动（阻塞本机 Web 与 Web 测试）

```text
Observed failure:
  node apps/web/server.ts
  → Error [ERR_UNSUPPORTED_ESM_URL_SCHEME]: Only URLs with a scheme in: file, data, and node are
    supported by the default ESM loader. On Windows, absolute paths must be valid file:// URLs.
    Received protocol 'd:'
  → apps/web/tests/cache.test.ts 全部 9 个用例失败（该文件 spawn 生产 server）

Affected file:
  apps/web/server.ts:38
    const build = await import(path.resolve(import.meta.dirname, "build/server/index.js"));

Root cause evidence:
  path.resolve() 在 Windows 返回 `D:\AgentStudy\SentinelIntel\apps\web\build\server\index.js`，
  把裸 Windows 路径交给动态 import()。独立复现（2026-10-01）：
    node -e "import('D:/AgentStudy/.../build/server/index.js')"
      → ERR_UNSUPPORTED_ESM_URL_SCHEME
    node -e "import(pathToFileURL('D:/AgentStudy/.../build/server/index.js').href)"
      → OK
  在 Linux 上 `/abs/path` 是合法 specifier，所以 CI（ubuntu-latest）不会暴露该问题。

Why Phase 0 cannot remain read-only:
  Phase 0 只做审计与冻结，改动业务源码超出允许范围；且 baseline 在 Docker（Linux）路径下可正常运行，
  不满足“必须修改代码才能让 baseline 运行”的前提，故不实施。

Proposed minimal change (NOT APPLIED):
  import { pathToFileURL } from "node:url";
  const build = await import(pathToFileURL(path.resolve(import.meta.dirname, "build/server/index.js")).href);
  属明显、局部、无业务语义变化的工程修复，建议单独提交并附测试。
```

### CODE-2 — `scripts/mcp-check.ts` 的工具名与站点前缀不一致（脚本必然失败）

```text
Observed failure:
  node scripts/mcp-check.ts http://127.0.0.1:3001/api/mcp
  → server: {"name":"myhot","version":"2.0.0"}
  → tools: myhot_get_latest, myhot_search, myhot_get_hot_topics, myhot_get_story, myhot_get_daily
  → ProtocolError: Tool aihot_get_hot_topics not found   (code -32602)
  进程最终以 Windows 异常码退出（-1073740791），未打印任何工具调用结果。

Affected file:
  scripts/mcp-check.ts:12-21（硬编码 aihot_get_latest / aihot_search / aihot_get_hot_topics /
  aihot_get_daily / aihot_get_story）

Root cause evidence:
  packages/contracts/src/mcp.ts:5-13 由 SITE.mcpPrefix 生成工具名，当前 industry/site.ts:27
  mcpPrefix = "myhot"；服务器实际暴露 myhot_*，脚本却调用 aihot_*。

Why Phase 0 cannot remain read-only:
  属脚本一致性缺陷，不影响 npm test / typecheck / smoke；Phase 0 不修改现有代码。

Proposed minimal change (NOT APPLIED):
  从 @aihot/contracts/mcp 引入 MCP_TOOL_NAMES 代替硬编码字符串。
```

### ENV-1 — 5 个 shutdown 用例在 Windows 上必然超时

见 5.2 归因 2。平台不支持 POSIX 信号的协作式投递，属 ENVIRONMENT_BLOCKED；在 Linux/CI 上不受影响。

### ENV-2 — `translate.test.ts` 的 3 个失败由 ENV-1 的级联引起

见 5.2 归因 1。隔离运行 3/3 通过。

### ENV-3 / ENV-4 / ENV-5 — 见第 2 节（端口 3000/5432 被占、npm 官方源 TLS 被干扰、命令沙箱拦截整目录删除）

---

## 12. Design-vs-source discrepancies

| # | 设计文档的说法 | 源码事实 | 影响 |
|---|---|---|---|
| 1 | Design §3 / Migration Spec §2 共列出 20 项 AIHOT 已有能力 | **20 项全部在源码中落实，未发现“文档声称有、源码没有”的项** | 无。这是本次审计最重要的正面结论：迁移设计的能力基线与真实源码一致。 |
| 2 | Migration Spec §2.3 流程图把 `dedupe` 列为一个流水线步骤 | 存在该步骤语义，但实现分散在 `content/materials.ts`（`identity_key` 唯一键 + `ON CONFLICT DO NOTHING`）与 `sources/collect.ts`（单轮 `seen` 集合），**没有独立去重模块** | 无。Phase 1/2 不应去“找那个 dedupe 文件”。 |
| 3 | Migration Spec §2.3 说 `structure` 与 `score` 并发执行 | 源码确认：`editorial/analyze.ts:349-352`，`runStructure(...)` 先启动、再 `await runScores(...)`，注释“The structure step needs nothing from the scores: it runs beside them.” | 无，说法准确。 |
| 4 | Migration Spec §6 “新增 migration 必须继续 AIHOT 编号，先读取当前最大编号” | 当前最大为 `0038`；编号存在空洞 `0012`、`0025`、`0035`（文件不存在） | Phase 1 起新增 migration 应从 `0039` 开始，**不要**去补空洞（补洞会改变既有环境的 schema_migrations 语义）。 |
| 5 | Tech Design §3 说 AIHOT 已具备 SelectBench 的 development/holdout | 确认：`eval-selection.ts` 的 `--split` 与 `samplingContext.benchmarkSplit`；但**仓库内没有 gold 数据** | Phase 1 需自建安防 gold（100–250 条）。 |
| 6 | Tech Design / Migration Spec 要求不使用 AIHOT 品牌 | `industry/site.ts` 当前为开源默认 `MyHOT`（`name`、`mcpPrefix: "myhot"`、`crawlerName: "MyHOTBot"`），**并未使用 AIHOT 品牌**；但 `package.json` 名与 workspace 包名仍为 `aihot` / `@aihot/*` | Phase 1 需把 `site.ts` 改为 SentinelIntel；npm 包名是否一并改需另行决定（改包名会牵动 `docker-compose.yml`、`Dockerfile`、`npm run -w` 等，属兼容性风险）。 |
| 7 | Migration Spec 表格要求 Phase 1 关闭 AI-only 模块 | `industry/features.ts` 当前 `leaderboard: true`、`codexResetMonitor: true` | 预期状态，非偏差；Phase 1 必须改为 `false`（smoke 的 `/codex-reset` 与 leaderboard 分支会随之变化）。 |

---

## 13. Phase 0 conclusion

### 已验证为真的事实

1. Git 基线、tag、分支与任务描述完全一致；工作区在审计前后均 clean。
2. 本机工具链满足项目要求（Node v24.16.0 ≥ 24.11、npm 11.13.0、Docker 29.6.1、Compose v5.3.0）。
3. `npm run typecheck` 通过；`npm run build -w @aihot/web` 通过。
4. 35 个 migration 可在全新 PostgreSQL 17 上完整应用；无破坏性迁移。
5. Docker 全栈可构建、可启动、可健康、可 smoke（`all checks passed`，18 个 source、38 个 topic、35 个 migration）。
6. `apps/api` 与 `apps/worker` 在 Windows 上本机可启动；api `/api/health` 返回 200 且 db 正常。
7. AIHOT 的 20 项既有能力全部在源码中落实；被禁止的技术栈（Python/FastAPI/LangGraph/Kafka/Neo4j/K8s/CrossEncoder/GraphRAG）在仓库中不存在。

### 未达到的状态

8. 后端测试并非全绿：139 个用例中 131 通过、2 断言失败、6 超时取消；全部 8 个失败已归因（5 个平台信号限制 + 3 个由此级联）。
9. Web 测试并非全绿：16 个用例中 7 通过、9 失败，全部由 CODE-1 引起。
10. Windows 本机无法启动 web 进程（CODE-1），因此本机 smoke 未执行，改由 Docker 完成。
11. `scripts/mcp-check.ts` 当前必然失败（CODE-2）。
12. Eval 全部 NOT RUN（成本/授权/无数据边界）。

### 结论

Phase 0 的**工程基线已建立并冻结**：命令、环境、migration、Docker、smoke、能力清单都有可复现的证据。同时确认本机（Windows）不是该 baseline 的一等验证环境，8+9 个测试失败有明确且可复现的根因，且其中 CODE-1/CODE-2 是仓库自身的可移植性/一致性问题，Phase 0 按规则未做修改。

因此状态为 **COMPLETED_WITH_LIMITATIONS**，而不是 COMPLETED。
