# AIHOT → SentinelIntel V2 改造对照与实施说明

> 文档定位：Migration / Implementation Specification
> 目标：让任何接手项目的 Coding Agent 明确知道“当前 AIHOT 已有什么、哪些保留、哪些修改、哪些新增、哪些不要做”
> 源码审计基线：`KKKKhazix/AIHOT`
> 审计 commit：`f6c2952a9984d4840442558be114ac959b512b0c`
> 审计日期：2026-09-30

---

## 1. 最高优先级原则

### 1.1 不重复建设

经源码审计，AIHOT 当前已经拥有相当完整的事件系统、评测、队列、后台和 Agent 对外接口。

因此禁止把已有能力重新包装成新增 Agent。

### 1.2 不为 Agent 而 Agent

以下属于 deterministic engineering，不单独做 Agent：

- HTTP health check；
- 连续失败统计；
- retry；
- exponential backoff；
- model fallback；
- budget circuit breaker；
- cron；
- queue；
- source interval adjustment；
- 普通 threshold；
- admin review queue。

### 1.3 不为简历堆技术

禁止无依据新增：

- Java/Spring Boot；
- Kafka；
- Neo4j；
- Kubernetes；
- 多 Agent 群聊；
- CrossEncoder；
- Query Router；
- GraphRAG；
- 独立 MCP Server。

只有 Eval 或明确业务需求支持时才允许增加。

---

# 2. AIHOT 当前真实能力审计

## 2.1 工程结构

源码已有 npm workspaces：

```text
apps/*
packages/*
industry
```

三个运行进程：

```text
apps/api
apps/worker
apps/web
```

核心后端：

```text
packages/backend
packages/contracts
industry
```

部署：

```text
PostgreSQL
api
worker
web
Caddy(optional)
```

技术栈：

- Node.js 24
- TypeScript
- Fastify
- React Router
- pg-boss
- PostgreSQL
- Zod
- Docker Compose

结论：

**KEEP。不要重构成另一套后端。**

---

# 2.2 Industry Pack

当前行业定制入口：

```text
industry/site.ts
industry/taxonomy.ts
industry/topics.json
industry/sources.json
industry/selection.ts
industry/features.ts
industry/prompts/*
industry/brand/*
industry/pages/*
```

AIHOT 官方文档已经明确绝大多数行业切换优先改这里。

结论：

**MODIFY。安防垂直化第一阶段主要修改 industry/。**

---

# 2.3 Selection Pipeline

当前真实流程：

```text
dedupe
↓
prefilter
↓
dual scoring
↓
writing
↓
structure
↓
grouping
↓
publication
```

关键源码：

```text
packages/backend/src/editorial/analyze.ts
packages/backend/src/editorial/prompts.ts
industry/prompts/prefilter.md
industry/prompts/selection-score.md
industry/prompts/content-understanding.md
industry/prompts/structure.md
industry/selection.ts
```

已有能力：

- 两次独立评分；
- tier-specific threshold；
- structure 与 score 并发执行；
- prompt content hash 版本；
- receipts；
- stale revision protection。

结论：

**KEEP + DOMAIN MODIFY。**

不要新做“自适应评分 Agent”。

---

# 2.4 Selection Evaluation

已有：

```text
scripts/eval-selection.ts
docs/selection.md
packages/backend/src/admin/selectbench.ts
apps/web/app/routes/admin/selectbench.tsx
database/migrations/0009_selectbench.sql
```

已有能力：

- gold JSONL；
- development / holdout；
- sampling stratum；
- Accuracy；
- Precision；
- Recall；
- F1；
- threshold sweep；
- token；
- latency；
- model comparison；
- SelectBench UI。

结论：

**KEEP。**

V2 只需要：

- 创建安防领域 gold set；
- 增加真实 strata；
- 跑 baseline；
- 保存报告。

不要重新实现 Selection Eval。

---

# 2.5 Event Model

数据库已经有：

```text
stories
facts
fact_articles
story_links
story_digests
story_signals
hot_rankings
story_heat_hourly
```

核心 migration：

```text
database/migrations/0002_events_reports.sql
```

Story 已包含：

```text
status
action
frame
first_report_at
latest_at
digest
latest
merged_into
version
origin
```

Fact 已包含：

```text
subject
action
object
conditions
occurred_at
```

结论：

**KEEP。**

禁止再新建另一套 generic Event/Article/Fact 核心模型。

SentinelIntel 只应新增安防实体、外部证据、追踪计划和产品影响表。

---

# 2.6 Event Grouping

关键源码：

```text
packages/backend/src/events/group.ts
packages/backend/src/events/relate.ts
industry/prompts/group-*.md
tests/events.test.ts
tests/signals.test.ts
```

当前已实现关系：

```text
SAME_OCCURRENCE
SAME_STORY
UNRELATED
ROUNDUP
```

当前已实现：

- 14 天 recent recall；
- embedding candidate recall；
- embedding unavailable 时 lexical fallback；
- same URL；
- reply/quote signal；
- top candidate；
- relation LLM judge；
- 低相似度二模型确认；
- direct development → SAME_STORY；
- 防止 development chaining；
- story consolidation；
- related story linking；
- serial grouping；
- regroup；
- manual correction protection。

源码注释还记录了已有 labelled pair 测量。

结论：

**KEEP AS BASELINE。**

原先计划中的“Event Intelligence Agent 从零实现”取消。

后续只做：

1. 安防 group prompt 适配；
2. 安防 event relation benchmark；
3. 如果 baseline 在安防数据上暴露明确缺陷，再增量优化。

---

# 2.7 Manual Grouping / Human Override

已有：

```text
packages/backend/src/admin/content.ts
database/migrations/0024_grouping_overrides_digest_inputs.sql
```

能力：

- detach article from fact；
- standalone override；
- regroup；
- merge stories；
- manual decision 不被自动 grouping 覆盖；
- audit。

结论：

**KEEP。**

未来 Human-in-the-loop 应尽量复用 admin/audit 思路，而不是另起一套完全不兼容机制。

---

# 2.8 Story Digest / Story Status

已有：

```text
packages/backend/src/events/digest.ts
```

能力：

- 新报道到来后增量重写 Story digest；
- correction 后重写；
- contradiction 可进入 digest；
- version；
- status：

```text
active   <24h
watching <72h
settled  >=72h
```

定时任务：

```text
stories.status
```

结论：

**KEEP。**

新增 Event Tracking Agent 不得重复实现 digest/status。

真正新增：

```text
tracking objective
open questions
last checked
next check
stop condition
material change detection
```

---

# 2.9 Source Health

已有：

```text
packages/backend/src/operations/reports.ts
packages/backend/src/sources/collect.ts
apps/worker/src/schedules.ts
```

已有：

- weekly source health；
- failing/silent source reporting；
- adaptive collection interval；
- source admin；
- preview/manual collect。

结论：

**KEEP。**

取消“Source Health Agent”独立建设。

如果未来新增 LLM semantic drift detection，必须先证明规则统计无法覆盖需求。

---

# 2.10 Reliability / Cost Control

已有：

```text
providers/receipts
budget circuit breakers
worker queues
admin diagnostics
alerts
backup
retention
```

数据库还已有 budget migration。

结论：

**KEEP。**

取消“异常自处理 Agent”概念。

新增 Python Agent Runtime 要遵守相同工程原则，但不要重新包装已有错误恢复机制。

---

# 2.11 MCP

已有：

```text
apps/api/src/routes/mcp.ts
packages/contracts/src/mcp.ts
scripts/mcp-check.ts
apps/web/app/routes/agent.tsx
```

已有 5 类 read-only tool，并且 MCP 与 public read layer 共用数据。

结论：

**KEEP。**

后期如需增加 security-specific tool，应扩展现有 MCP，而不是创建第二个 MCP Server。

---

# 3. 总体 KEEP / MODIFY / ADD / DEFER / DO NOT IMPLEMENT

| 模块 | 决策 | 说明 |
|---|---|---|
| AIHOT API/Worker/Web 三进程 | KEEP | 架构成熟，不重写 |
| pg-boss | KEEP | 足够支撑确定性任务 |
| PostgreSQL | KEEP | 不引入新数据库 |
| Industry Pack | MODIFY | 全面安防化 |
| Sources | MODIFY | 换公开安防源 |
| Selection | MODIFY | 安防 prompt + threshold |
| SelectBench | KEEP | 直接复用 |
| Article/Fact/Story | KEEP | 已满足事件基线 |
| Event grouping | KEEP + EVAL | 先测安防数据 |
| Story digest | KEEP | 不重复 |
| Hot ranking | KEEP | 降低项目核心定位 |
| Reports | KEEP | 输出能力 |
| Source health | KEEP | 不 Agent 化 |
| Retry/fallback/budget | KEEP | 不 Agent 化 |
| MCP | KEEP / LATER EXTEND | 不另建 |
| AI-only leaderboard | DISABLE | 安防无意义 |
| Codex reset monitor | DISABLE | 安防无意义 |
| Python Agent Runtime | ADD | 核心新增 |
| Security Research Agent | ADD | 核心新增 |
| Event Tracking Agent | ADD | 核心新增 |
| Product Impact Agent | ADD | 核心新增 |
| Security Entity Model | ADD | 安防领域增量 |
| External Evidence | ADD | Agent 证据层 |
| Agent Eval | ADD | 核心新增 |
| Analyst Copilot | DEFER | 非核心 |
| Demo Asset CSV | DEFER | 只做扩展示范 |
| Real Enterprise CMDB | DO NOT IMPLEMENT | 个人项目不现实 |
| Java service | DO NOT IMPLEMENT | 重复简历能力 |
| Neo4j | DO NOT IMPLEMENT NOW | 无证据 |
| Multi-Agent society | DO NOT IMPLEMENT | 无必要 |

---

# 4. 文件级改造清单

## 4.1 KEEP

尽量不做结构性修改：

```text
apps/api/
apps/worker/
apps/web/

packages/backend/src/content/
packages/backend/src/jobs/
packages/backend/src/providers/
packages/backend/src/publication/
packages/backend/src/reports/

packages/backend/src/events/group.ts
packages/backend/src/events/relate.ts
packages/backend/src/events/digest.ts
packages/backend/src/events/hot.ts
packages/backend/src/events/hot-read.ts

scripts/eval-selection.ts
scripts/mcp-check.ts

database/migrations/0001_core.sql
database/migrations/0002_events_reports.sql
...
```

允许必要的兼容扩展，但禁止推倒重写。

---

## 4.2 MODIFY — Phase 1 安防垂直化

### `industry/site.ts`

改：

```text
name
subject
homeTitle
description
tagline
mcpPrefix
crawlerName
ABOUT
```

建议品牌：

```text
SentinelIntel
```

不要沿用 AIHOT 名称/Logo。

---

### `industry/features.ts`

改：

```ts
leaderboard: false
codexResetMonitor: false
```

如果源码对 false 已完整兼容，不删除代码。

---

### `industry/taxonomy.ts`

重写：

```text
CATEGORIES
ITEM_TYPES
CATEGORY_TAGS
TOPIC_TAGS
ENTITY_TAGS
TAG_SYNONYMS
CATEGORY_BY_ITEM_TYPE
ENTITIES
IDENTITY_LEXICON
PUBLISHER_DOMAINS
```

建议 categories：

```text
vulnerability
vendor
policy-standard
procurement
incident
technology
```

MVP 可先 4 个核心类别。

---

### `industry/topics.json`

改成安防：

```text
company
technology
content genre
```

不要一次添加几十个无数据主题。

---

### `industry/sources.json`

先只接 6–10 个稳定公开源。

优先：

```text
结构化漏洞源
厂商官方安全公告
官方政策/标准
少量公开招投标平台
```

不把高反爬平台设为 MVP blocking dependency。

---

### `industry/prompts/*`

必须修改：

```text
prefilter.md
selection-score.md
content-understanding.md
structure.md
rules-domain.md
group-definitions.md
group-method.md
group-batch.md
group-pair.md
group-signal.md
story-digest.md
report-*.md
```

重点不是只换关键词。

需要编码：

- 什么对安防从业者重要；
- 什么是营销噪声；
- 漏洞 vs 普通安全新闻；
- 厂商公告优先级；
- 型号/固件/CVE 的保留规则；
- 招标金额/范围；
- 政策级别；
- SAME_STORY 在漏洞补丁/PoC/厂商回应场景如何判断。

---

### `industry/selection.ts`

禁止凭感觉直接确定最终 threshold。

流程：

```text
先保留默认值
→ 建 security gold
→ development eval
→ 调 prompt
→ threshold sweep
→ holdout
→ 再冻结
```

---

## 4.3 ADD — 安防数据集

新增建议：

```text
datasets/
├── selection/
│   ├── development.jsonl
│   └── holdout.jsonl
├── event-relations/
│   ├── development.jsonl
│   └── holdout.jsonl
├── research/
├── tracking/
└── product-impact/
```

是否提交真实正文要注意版权。

可只保存必要字段、URL 和人工标签。

---

# 5. Python Agent Runtime 新增

新增顶层：

```text
agent-runtime/
```

建议：

```text
agent-runtime/
├── pyproject.toml
├── app/
│   ├── main.py
│   ├── config.py
│   ├── api/
│   ├── schemas/
│   ├── agents/
│   ├── tools/
│   ├── services/
│   ├── retrieval/
│   └── observability/
├── evals/
└── tests/
```

### `agents/security_research/`

负责：

```text
gap analysis
research planning
tool selection
evidence normalization
conflict resolution
sufficiency judgement
```

### `agents/event_tracking/`

负责：

```text
tracking plan
open questions
changes since last check
continue/stop decision
next check
```

### `agents/product_impact/`

负责：

```text
CVE
vendor
product
model
firmware
patch
exploit status
evidence
```

---

# 6. Database ADD

新增 migration 必须继续 AIHOT 编号，不改历史 migration。

Coding Agent 在实施时先读取当前最大 migration 编号，再生成后续编号。

建议新增：

```text
security_entities
story_entities
external_evidence
agent_research_runs
tracking_plans
tracking_changes
product_impacts
human_reviews
```

原则：

- 只增量；
- 不修改 `stories/facts` 原本含义；
- 不复制 Article/Story；
- FK 指向现有 Story；
- Agent 原始输出保留 jsonb；
- 可审计。

---

# 7. AIHOT ↔ Python Agent Runtime 接口

MVP 使用内部 HTTP。

不要引入 Kafka。

建议 TypeScript 增加：

```text
packages/backend/src/agents/
├── client.ts
├── triggers.ts
├── proposals.ts
└── read.ts
```

### `client.ts`

职责：

```text
HTTP client
timeout
retry
trace id
schema validation
```

### `triggers.ts`

职责：

决定哪些 Story：

```text
research
tracking
product impact
```

不要让所有 Story 调 Agent。

### `proposals.ts`

职责：

```text
validate Agent output
persist proposal/results
audit
```

遵守：

> Agent proposes, backend commits.

---

# 8. Worker 扩展

在现有 pg-boss 上新增轻量 job：

```text
agent.research
agent.tracking
agent.product-impact
```

定时 tracking 仍然由 pg-boss / cron 触发。

LangGraph 不负责 Cron。

现有 worker 不需要替换。

---

# 9. Phase 0 — Baseline Audit & Freeze

## Goal

建立可回归 baseline。

## 必做

```text
git rev-parse HEAD
npm install
npm run typecheck
创建 *_test 数据库
migrate
npm test
web build/test
docker compose up
smoke
```

记录：

```text
commit
test count
failures
baseline screenshots
baseline config
```

## Acceptance

- 所有原项目测试结果有记录；
- 无业务改动；
- 生成 `docs/IMPLEMENTATION_STATUS.md`；
- 后续所有改造基于固定 baseline。

---

# 10. Phase 1 — Security Verticalization

## Goal

得到真正可运行的安防热点站 baseline。

## Modify

```text
industry/*
```

## 不动

```text
events grouping core
queue
publication
MCP core
```

## Eval

Selection gold：

建议至少 150–250 条。

strata：

```text
vulnerability
vendor advisory
policy
procurement
marketing noise
generic cybersecurity
irrelevant IT
```

必须有 development/holdout。

## Acceptance

- 安防 taxonomy；
- 6–10 个稳定源；
- AI-only feature disabled；
- SelectBench baseline；
- holdout 结果记录；
- 不填写虚构提升。

---

# 11. Phase 2 — Security Event Grouping Benchmark

## Goal

先判断 AIHOT grouping 在安防场景到底哪里不够。

## 禁止

这一阶段不得直接写新的 Event Agent。

## Dataset

人工标 pair：

```text
SAME_OCCURRENCE
SAME_STORY
UNRELATED
ROUNDUP
```

重点 hard cases：

```text
漏洞披露 vs 厂商确认
漏洞披露 vs 补丁
PoC vs 漏洞披露
同一 CVE 多厂商产品
同一厂商不同 CVE
同一型号不同漏洞
招标公告 vs 中标公告
政策草案 vs 正式发布
```

## Acceptance

输出：

```text
baseline relation metrics
story merge errors
false merge examples
false split examples
security-specific failure taxonomy
```

只有此报告证明有问题，才允许改 grouping prompt/recall。

---

# 12. Phase 3 — Python Agent Foundation

## Goal

只建立 Agent Runtime 基础，不做复杂业务。

## ADD

```text
agent-runtime/
```

实现：

- FastAPI；
- LangGraph；
- Pydantic；
- model adapter；
- tool interface；
- trace；
- test stub；
- health endpoint。

Docker compose 增加：

```text
agent
```

## Acceptance

- TypeScript 可发一条 test task；
- Python 返回 structured result；
- timeout/retry/error 能正确传播；
- no external network in tests；
- trace_id 可关联。

---

# 13. Phase 4 — Security Research Agent

## Goal

证明 Agent 能主动补齐 Story 缺失证据。

## Tools

第一版限制：

```text
internal story/article
NVD
CISA KEV
vendor advisory/search
generic web search
```

## 数据库

新增：

```text
external_evidence
agent_research_runs
```

## Eval

最少建立：

```text
20–50 个 research cases
```

不要追求样本大，优先 hard cases。

## Acceptance

每条研究结果：

- claims；
- evidence ids；
- unknowns；
- tool trace；
- no unsupported critical claim。

---

# 14. Phase 5 — Event Tracking Agent

## Goal

在现有 Story status 上增加主动长期追踪。

## ADD

```text
tracking_plans
tracking_changes
```

## TypeScript

pg-boss：

```text
agent.tracking
```

按 `next_check_at` 调度。

## Python

Agent 负责：

```text
open questions
research delta
material changes
continue/stop
next interval suggestion
```

## 不做

- 不替换 `active/watching/settled`；
- 不自己实现 scheduler；
- 不重新生成 Story digest。

## Acceptance

至少演示：

1. 漏洞披露 → 厂商确认 → 补丁；
2. 招标 → 中标；
3. 无新进展 → 延长间隔/停止。

---

# 15. Phase 6 — Product Impact Agent

## Goal

形成安防业务差异化。

## ADD

```text
security_entities
story_entities
product_impacts
```

## 能力

```text
Vendor normalization
Product normalization
Model extraction
Firmware extraction
Affected version
Fixed version
PoC
KEV
Mitigation
Evidence
Unknown
```

## 重要限制

个人项目：

**不宣称真实企业资产影响。**

README 描述应为：

```text
Product-level impact analysis based on public evidence
```

而不是：

```text
Enterprise asset risk assessment
```

## Optional demo

允许以后加入：

```text
examples/demo-assets.csv
```

但必须明确 synthetic。

---

# 16. Phase 7 — UI / Admin / MCP

只有核心 Agent 稳定后做。

### Story page

增加：

```text
Research
Tracking
Product Impact
Evidence
Unknowns
```

### Admin

增加：

```text
Agent Runs
Human Review
Tracking
Product Impact Review
Eval
```

### MCP

优先扩展已有：

```text
get_story
search
hot
daily
```

可增加：

```text
get_security_impact
get_story_tracking
```

前提：确有用户价值。

---

# 17. Phase 8 — Final Evaluation & Resume Package

必须输出：

```text
docs/evaluation/
├── selection.md
├── event-grouping.md
├── research-agent.md
├── tracking-agent.md
├── product-impact.md
└── ablations.md

docs/failure-cases.md
docs/architecture.md
README.md
```

真实数据后再写简历数字。

禁止类似：

```text
Recall 72% → 89%
```

除非报告可复现。

---

# 18. Coding Agent 每阶段工作协议

每次只处理一个 Phase。

开始前：

1. 阅读两份设计文档；
2. 阅读 `AGENTS.md`；
3. 阅读该 Phase 涉及源码；
4. 更新 implementation plan；
5. 不改未涉及模块。

完成后必须报告：

```text
Changed files
Why each changed
Tests
Eval
Known limitations
Unexpected codebase facts
Deviations from design
Next recommended phase
```

并更新：

```text
docs/IMPLEMENTATION_STATUS.md
```


# 18.1 模型额度耗尽时的交接协议

本项目允许在同一 Phase 中因 Coding Agent 的额度耗尽、服务暂不可用或执行能力差异切换模型。无需为了等待额度重置而暂停开发，但必须通过仓库文件完成显式交接。

## 切换前

当前 Coding Agent 应尽可能：

1. 运行 `git status`，确认当前修改范围；
2. 完成当前逻辑最小单元并提交；若确实无法提交，不强行提交半成品；
3. 更新 `docs/IMPLEMENTATION_STATUS.md`，至少记录：
   - Current phase
   - Last completed task
   - Work in progress
   - Modified but uncommitted files
   - Tests already run
   - Eval already run
   - Known failures
   - Design decisions made during implementation
   - Exact next action
4. 将重要命令、错误信息和关键结论写入仓库文档，而不是只保留在聊天记录中；
5. 不在切换前开启大规模重构。

## 新模型接手后

新的 Coding Agent 必须按顺序：

```text
1. Read AGENTS.md
2. Read 01-SentinelIntel-V2-Technical-Design.md
3. Read 02-AIHOT-to-SentinelIntel-Migration-Spec.md
4. Read IMPLEMENTATION_STATUS.md
5. git status
6. git log --oneline -n 10
7. inspect current Phase files
8. run or verify the smallest relevant test
9. continue the existing plan
```

新模型不得：

- 因为模型不同而重新规划整个项目；
- 自动撤销前一模型的未提交改动；
- 在未理解当前状态前执行全局重构；
- 跳过当前 Phase；
- 用新的技术偏好覆盖已经经过 Eval 或设计确认的决定。

如果新模型认为现有实现与设计冲突，应先记录：

```text
Observed fact
Design expectation
Impact
Proposed minimal correction
```

再实施最小修正。

核心原则：

> **聊天上下文是临时的，Git + 设计文档 + IMPLEMENTATION_STATUS 才是持久项目记忆。**


---

# 19. `IMPLEMENTATION_STATUS.md` 模板

```markdown
# Implementation Status

Baseline commit:
Current branch:
Current phase:

## Completed
- ...

## In Progress
- ...

## Tests
- command:
- result:

## Eval
- dataset:
- metrics:

## Known Issues
- ...

## Design Deviations
- ...

## Next
- ...
```

---

# 20. Coding Agent 首次启动 Prompt

```text
你是当前负责 SentinelIntel V2 实施的 Coding Agent。你的具体模型/产品身份不影响下面的工程约束。

你现在负责将当前 AIHOT 仓库增量改造成 SentinelIntel V2。

开始编码前必须按顺序阅读：

1. AGENTS.md
2. docs/00-sentinelintel/01-SentinelIntel-V2-Technical-Design.md
3. docs/00-sentinelintel/02-AIHOT-to-SentinelIntel-Migration-Spec.md
4. docs/IMPLEMENTATION_STATUS.md
5. AIHOT 自带 docs/architecture.md
6. AIHOT 自带 docs/selection.md

当前只执行 Phase 0：Baseline Audit & Freeze。

重要约束：

- 不跨 Phase。
- 不新增 Java 服务。
- 不重写 AIHOT 已有 Article/Fact/Story、grouping、digest、SelectBench、MCP、source-health、budget/retry。
- 不为了 Agent 而 Agent。
- 不未经 Eval 引入新检索/重排/图数据库/多 Agent。
- 不填写任何虚构指标。
- 所有发现与设计文档不一致的真实源码事实，记录到 IMPLEMENTATION_STATUS.md，不自行扩大 scope。
- Phase 0 完成后停止，给出测试结果、源码事实和 Phase 1 风险，不直接开始 Phase 1。
```

---

# 21. 最终迁移原则总结

当前项目不应该被理解为：

```text
AIHOT
+ 安防 prompt
+ 五个 Agent
```

而应该是：

```text
AIHOT 成熟确定性情报流水线
        +
安防行业化
        +
安防 Event Benchmark
        +
Python Stateful Agent Runtime
        +
Security Research
        +
Long-running Tracking
        +
Product Impact
        +
Evaluation
```

这才是 SentinelIntel V2 的实施边界。
