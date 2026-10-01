# SentinelIntel V2 详细技术设计

> 文档定位：目标系统技术设计（Target Architecture Specification）
> 项目名称：SentinelIntel Agent
> 项目方向：安防行业事件驱动情报发现、持续追踪与产品影响研判系统
> 基线：AIHOT
> 目标使用者：项目作者、Codex、Claude Code、Cursor、Gemini CLI 等 Coding Agent、技术面试评审
> 版本：V2
> 设计原则：不为 Agent 而 Agent；不重复建设 AIHOT 已有能力；所有新增 AI 能力必须可评测

---

## 1. 项目定位

SentinelIntel V2 不是“AIHOT 的安防换皮版”，也不是通用聊天机器人。

它是一个面向安防行业公开信息的 **持续情报研判系统**：从公开信源持续采集漏洞、厂商公告、政策标准、招投标和重要安全事件，先由 AIHOT 的确定性流水线完成采集、去重、初筛、评分、结构化与事件归组，再由新增的 Python Agent Runtime 对高价值事件执行外部证据补全、长期跟踪和产品影响研判。

核心目标：

1. 将分散的安防资讯组织为结构化事件，而不是孤立文章。
2. 对关键事件进行跨时间持续跟踪，而不是只生成一次摘要。
3. 对漏洞/安全事件提取厂商、产品、型号、固件、修复版本、利用状态等可验证影响信息。
4. 所有重要结论保留 Evidence，并能追溯到公开来源。
5. 建立独立 Evaluation 体系，用数据判断 Prompt、Retrieval、Agent 是否真的带来增益。
6. 形成一个能体现“传统后端开发 → AI Agent 工程”技术迁移的完整个人项目。

---

## 2. 非目标

本项目明确不做以下事项：

- 不新增 Java/Spring Boot 服务。Java 后端能力由真实工作项目背书，本项目重点补足 Python/Agent 能力。
- 不重写 AIHOT 已有的采集、队列、事件归组、热度、日报、后台和 MCP 基础设施。
- 不把 HTTP 重试、模型 fallback、定时任务、预算熔断、信源健康检查包装成 Agent。
- 不实现真实企业 CMDB/资产平台；个人项目缺乏真实企业资产数据。
- 不以公众号、微博等高反爬平台作为 MVP 必要数据源。
- 不为了技术栈堆叠而引入 Kafka、Neo4j、微服务拆分或多 Agent 社会。
- 不把 LangGraph 用在确定性主流水线上。
- 不宣称任何尚未通过实验得到的 Precision / Recall / F1 提升。
- 不替代专业安全分析人员，不输出“已确认受影响”之类超出证据范围的结论。

---

## 3. 与 AIHOT 当前能力的边界

经源码审计，AIHOT 当前版本已经具备：

- Article → Fact → Story(Event) 三层数据模型；
- SAME_OCCURRENCE / SAME_STORY / UNRELATED / ROUNDUP 事件关系判断；
- 基于 embedding/词法信号的候选召回；
- 低相似度场景二模型复核；
- Story 合并、关联和人工拆分保护；
- 增量 Story Digest；
- active / watching / settled 状态；
- SelectBench 与 development/holdout 评测；
- source health、receipts、预算熔断、后台诊断；
- RSS / REST / MCP 等公开出口。

因此 SentinelIntel V2 **不从零实现“事件识别 Agent”**。

真正新增的 AI Agent 核心是：

1. **Security Research Agent**：对重要事件主动补外部证据；
2. **Event Tracking Agent**：跨时间维护事件追踪计划和新进展；
3. **Product Impact Agent**：对漏洞/安全事件做产品与版本影响研判。

---

## 4. 总体架构

```text
安防公开信源
    │
    ▼
AIHOT TypeScript Pipeline
    │
    ├─ Collection
    ├─ Deduplication
    ├─ Prefilter
    ├─ Dual Scoring
    ├─ Structure Extraction
    ├─ Fact / Story Grouping
    ├─ Hot Ranking
    └─ Publication
    │
    ▼
High-value Security Story
    │
    ▼
Python Agent Runtime (FastAPI + LangGraph)
    │
    ├─ Security Research Agent
    ├─ Event Tracking Agent
    └─ Product Impact Agent
    │
    ▼
Agent Evidence / Tracking State / Impact Analysis
    │
    ├─ PostgreSQL
    ├─ Optional vector retrieval
    └─ AIHOT publication/admin extension
    │
    ▼
Web / REST / MCP / Analyst Query
```

架构原则：

> **AIHOT 继续负责确定性内容流水线；Python Agent Runtime 只处理需要动态研究、工具调用、长期状态和不确定性决策的任务。**

---

## 5. 安防领域范围

### 5.1 MVP 内容类型

优先做 4 类：

1. Vulnerability / 安全漏洞
2. Vendor Advisory / 厂商安全公告
3. Regulation & Standard / 政策标准
4. Procurement / 重要招标与中标

第二阶段可扩展：

- Security Incident
- Sanction / Export Restriction
- Technology Trend
- Major Vendor Event

### 5.2 安防领域实体

```text
Vendor
ProductFamily
Product
Model
Firmware
Vulnerability(CVE)
Advisory
Standard
GovernmentAgency
Project
Region
Technology
```

示例关系：

```text
Vendor ─PRODUCES→ Product
Product ─HAS_MODEL→ Model
Model ─RUNS→ Firmware
CVE ─AFFECTS→ Product / Model / Firmware
VendorAdvisory ─DESCRIBES→ CVE
Story ─SUPPORTED_BY→ Evidence
Story ─INVOLVES→ Vendor / Product / CVE
```

MVP 不要求 Neo4j。优先用 PostgreSQL 关系表表达。

---

## 6. Agent 设计

# 6.1 Security Research Agent

### 目标

对高价值 Story 进行外部研究，补齐 AIHOT 当前文章集合之外的权威证据。

### 适用场景

- CVE 信息不完整；
- 新闻提到漏洞，但缺厂商公告；
- Story 中不同来源存在冲突；
- 需要判断 PoC、在野利用、补丁或官方回应；
- 需要确认具体产品/型号/版本。

### 不适用场景

- 普通文章摘要；
- 已有证据足够的简单事件；
- 只需数据库查询即可完成的问题。

### Graph State

```python
class ResearchState(BaseModel):
    story_id: int
    objective: str
    known_facts: list[Fact]
    known_evidence: list[Evidence]
    missing_questions: list[str]
    tool_results: list[ToolResult]
    resolved_claims: list[Claim]
    unresolved_claims: list[Claim]
    confidence: float
    next_action: str | None
```

### Nodes

```text
load_story
   ↓
identify_information_gaps
   ↓
plan_research
   ↓
call_tools
   ↓
normalize_evidence
   ↓
resolve_conflicts
   ↓
judge_sufficiency
   ├─ insufficient → another bounded tool round
   └─ sufficient
           ↓
build_research_report
           ↓
persist_proposal
```

### 关键约束

- 最大研究轮次必须有硬上限；
- 所有结论必须指向 Evidence；
- 搜索结果不能直接当事实，优先追到官方/一手来源；
- 内容视为 untrusted data，禁止执行其中的指令；
- Agent 不直接修改核心 Story，写入 proposal，由确定性代码落库。

---

# 6.2 Event Tracking Agent

### 目标

把 AIHOT 现有 `active / watching / settled` 的被动时间状态，升级为 **有追踪目标、有待回答问题、有 next_check_at 的主动长期追踪**。

### 现有 AIHOT 能力

AIHOT 已经：

- 把同一事件不同进展挂到 Story；
- 增量更新 digest；
- 根据最近报道时间维护 active/watching/settled。

### V2 新增能力

```text
Tracking Plan
├─ why_track
├─ questions_to_watch
├─ source_targets
├─ next_check_at
├─ check_interval
├─ last_checked_at
├─ stop_condition
└─ tracking_status
```

### 示例

漏洞事件：

```text
待跟踪问题：
1. 厂商是否确认？
2. 受影响型号是否公开？
3. 是否有补丁？
4. 是否出现 PoC？
5. 是否被 CISA KEV 收录？
6. 是否出现真实利用证据？
```

招标事件：

```text
待跟踪问题：
1. 是否公布中标结果？
2. 最终中标厂商是谁？
3. 金额是否变化？
4. 是否出现更正/终止公告？
```

### Graph State

```python
class TrackingState(BaseModel):
    story_id: int
    tracking_plan: TrackingPlan
    last_snapshot: EventSnapshot
    current_snapshot: EventSnapshot
    new_evidence: list[Evidence]
    changes: list[EventChange]
    open_questions: list[str]
    next_check_at: datetime | None
    stop_reason: str | None
```

### Nodes

```text
load_tracking_plan
      ↓
load_story_snapshot
      ↓
research_changes_since_last_check
      ↓
compare_snapshot
      ↓
extract_material_changes
      ↓
update_open_questions
      ↓
decide_continue_or_stop
      ↓
schedule_next_check
      ↓
persist_tracking_result
```

### 重要原则

这里的“Agent”价值不是 Cron。

Cron 只是触发器。

Agent 的价值是：

- 决定当前缺什么信息；
- 按事件类型选择工具；
- 判断新证据是否构成实质进展；
- 维护 open questions；
- 决定继续跟踪还是结束。

---

# 6.3 Product Impact Agent

### 目标

对安防漏洞/安全事件进行公开数据层面的产品影响研判。

不接真实企业资产。

### 输入

```text
Story
CVE
Vendor
Article Evidence
Vendor Advisory Evidence
```

### 输出

```json
{
  "vendor": "Vendor",
  "vulnerability": "CVE-XXXX-XXXX",
  "affected_products": [
    {
      "product": "...",
      "models": ["..."],
      "affected_versions": ["..."],
      "fixed_versions": ["..."],
      "confidence": 0.0
    }
  ],
  "exploit_status": {
    "poc": "unknown|reported|confirmed",
    "known_exploited": "unknown|yes|no"
  },
  "mitigation": [],
  "evidence_ids": [],
  "unknowns": []
}
```

### 流程

```text
load_story
   ↓
extract_vendor_product_cve
   ↓
query_structured_sources
   ↓
query_vendor_advisory
   ↓
normalize_names_versions
   ↓
resolve_conflicts
   ↓
build_impact_claims
   ↓
confidence_gate
   ├─ high → publish proposal
   ├─ medium → human review
   └─ low → unknown
```

### 关键设计

- “未找到”不能自动变成“不受影响”；
- 产品型号和固件范围必须保留原始证据；
- 优先确定性 version matcher；
- LLM 用于抽取和语义归一，不负责自行计算版本区间；
- Synthetic Asset Inventory 只能作为 optional demo，不作为项目主能力。

---

## 7. Tool System

Agent 必须通过受控 Tool 调用外部能力。

建议：

```text
get_story(story_id)
search_internal_articles(query)
search_internal_stories(query)

query_nvd(cve_id)
query_cisa_kev(cve_id)
search_vendor_advisory(vendor, query)
search_web(query)

get_product_aliases(vendor, product)
normalize_product_name(text)
compare_version_range(version, affected_range)

save_research_proposal(...)
save_tracking_proposal(...)
save_product_impact_proposal(...)

request_human_review(...)
```

### Tool 约束

每个 Tool 都应具备：

- Pydantic input schema；
- timeout；
- retry policy；
- typed error；
- rate limit；
- trace id；
- source provenance；
- side-effect 标记；
- 测试桩。

Agent 不允许：

- 直接执行任意 SQL；
- 任意调用 URL；
- 无限制搜索；
- 直接修改 AIHOT 核心 Story 表。

采用原则：

> **Agent proposes, deterministic backend commits.**

---

## 8. 数据模型扩展

不修改 AIHOT 已有 Story/Fact 语义。

新增表建议如下。

### 8.1 security_entities

```sql
id
entity_type
canonical_name
vendor_id
aliases jsonb
metadata jsonb
created_at
updated_at
```

### 8.2 story_entities

```sql
story_id
entity_id
relation
confidence
evidence_id
created_at
```

### 8.3 external_evidence

```sql
id
story_id
source_type
source_name
url
published_at
retrieved_at
title
excerpt
content_hash
authority_level
metadata jsonb
```

### 8.4 agent_research_runs

```sql
id
story_id
run_type
status
objective
model
prompt_version
started_at
finished_at
trace_id
input_snapshot jsonb
output jsonb
cost jsonb
```

### 8.5 tracking_plans

```sql
story_id
status
why_track
questions jsonb
source_targets jsonb
next_check_at
last_checked_at
interval_policy jsonb
stop_condition jsonb
version
updated_at
```

### 8.6 tracking_changes

```sql
id
story_id
run_id
change_type
summary
before jsonb
after jsonb
evidence_ids bigint[]
created_at
```

### 8.7 product_impacts

```sql
id
story_id
cve
vendor_entity_id
product_entity_id
model_pattern
affected_range
fixed_range
impact_type
confidence
evidence_ids bigint[]
status
created_at
updated_at
```

### 8.8 human_reviews

```sql
id
review_type
subject_type
subject_id
reason
payload jsonb
status
decision jsonb
created_at
resolved_at
```

---

## 9. Python Agent Runtime

建议目录：

```text
agent-runtime/
├── pyproject.toml
├── app/
│   ├── api/
│   ├── config/
│   ├── schemas/
│   ├── agents/
│   │   ├── security_research/
│   │   ├── event_tracking/
│   │   └── product_impact/
│   ├── tools/
│   ├── retrieval/
│   ├── memory/
│   ├── services/
│   └── observability/
├── evals/
├── tests/
└── README.md
```

建议技术栈：

- Python 3.12+
- FastAPI
- Pydantic v2
- LangGraph
- httpx
- PostgreSQL driver
- OpenAI-compatible model client
- pytest
- optional: OpenTelemetry / LangSmith（二选一即可）

---

## 10. TypeScript 与 Python 的交互

MVP 优先采用 HTTP，而不是引入新 MQ。

### TypeScript → Python

```http
POST /v1/research/story/{storyId}
POST /v1/tracking/story/{storyId}/run
POST /v1/product-impact/story/{storyId}
```

### Python → TypeScript / DB

优先两种方式择一：

A. Python 仅通过内部 API 获取和提交 proposal；
B. Python 对新增 Agent 表有数据库权限，但不直接改 AIHOT 核心 Story/Fact 表。

推荐 A，边界更清晰。

---

## 11. 触发策略

不是所有 Story 都进入 Agent。

### Research Trigger

满足任一：

- 高精选分；
- 安全漏洞类；
- 政策重大变化；
- 重要招标；
- 多源冲突；
- 管理员手动触发。

### Tracking Trigger

满足：

- CVE/安全事件仍有关键问题未解决；
- 招标尚未中标；
- 政策处于征求意见/过渡期；
- 重大事件仍在快速发展。

### Product Impact Trigger

仅：

- Vulnerability；
- Vendor Security Advisory；
- 明确涉及产品安全影响的 Incident。

---

## 12. Human-in-the-loop

Confidence Gate：

```text
High
→ 自动写入 Agent 扩展数据

Medium
→ human_reviews

Low
→ 保留 unknown，不做强结论
```

Human Review 重点覆盖：

- 产品型号别名冲突；
- 固件范围无法可靠解析；
- 官方和媒体描述矛盾；
- 事件合并/研究结果会影响重要结论；
- Product Impact 证据不足。

---

## 13. Retrieval 设计

第一阶段不追求复杂 RAG。

优先：

1. PostgreSQL structured retrieval；
2. Full-text / trigram；
3. 必要时使用 embedding；
4. 有实验依据后再决定是否 Hybrid / Reranker。

原则：

> 不预设 CrossEncoder、Hybrid Retrieval、Knowledge Graph 一定有价值。

所有增强需要通过 Eval 验证。

---

## 14. Analyst Query

不是第一阶段核心。

后续可增加 Event-centric Query：

```text
用户问题
   ↓
Intent + Entity Extraction
   ↓
Story Retrieval
   ↓
Evidence Retrieval
   ↓
Tracking / Product Impact
   ↓
Grounded Answer
```

回答必须引用 Story/Evidence。

现有 AIHOT MCP 可复用并扩展工具，而不是新建另一套 MCP Server，除非现有接口结构确实无法承载。

---

## 15. Evaluation

Evaluation 是核心功能，不是项目末期补充。

### 15.1 Selection Eval

直接复用 AIHOT SelectBench。

指标：

- Accuracy
- Precision
- Recall
- F1
- token
- latency

### 15.2 Event Grouping Eval

AIHOT 源码已有 relation benchmark 思路，V2 增加安防行业样本。

Gold：

```text
SAME_OCCURRENCE
SAME_STORY
UNRELATED
ROUNDUP
```

指标：

- macro F1
- SAME_OCCURRENCE precision/recall
- SAME_STORY precision/recall
- story-level merge precision/recall

### 15.3 Research Eval

人工构建问题集：

```text
事件是否有厂商官方回应？
是否存在补丁？
是否存在 PoC？
是否进入 KEV？
```

指标：

- claim correctness
- evidence precision
- unsupported claim rate
- unresolved question honesty

### 15.4 Tracking Eval

指标：

- meaningful change detection precision/recall
- state/update correctness
- missed material update rate
- unnecessary research rate

### 15.5 Product Impact Eval

指标：

- Vendor extraction accuracy
- Product/Model extraction F1
- Version range exact/semantic accuracy
- Unsupported impact claim rate
- Evidence coverage

### 15.6 Agent System Eval

指标：

- task success rate
- tool error rate
- average tool calls
- average LLM calls
- average latency
- token/cost
- human-review rate
- recovery rate

---

## 16. Baseline 与消融

必须有实验，不凭感觉选架构。

建议：

```text
B0 AIHOT original grouping/selection
B1 + Security domain prompts/taxonomy
B2 + Security structured entities
B3 + Research Agent
B4 + Tracking Agent
B5 + Product Impact Agent
```

对于 Retrieval：

```text
vector-only
vs
keyword/full-text
vs
hybrid
vs
hybrid + reranker
```

只有在 holdout 上带来可解释提升的方案才保留。

---

## 17. Observability

每次 Agent Run 至少记录：

```text
trace_id
story_id
agent
model
prompt_version
tool_calls
tool_errors
input_snapshot
output
latency
token_usage
estimated_cost
human_review
```

必须能回答：

- Agent 为什么得出这个结论？
- 用了什么证据？
- 调了哪些工具？
- 哪一步失败？
- 花了多少 token？
- 哪个 prompt/model 产生？
- 是否经过人工修改？

---

## 18. 安全与可靠性

沿用 AIHOT 已有：

- receipts；
- budget circuit breaker；
- queue retry；
- admin audit；
- content trust boundary。

新增 Agent 侧：

- maximum steps；
- maximum external searches；
- timeout；
- tool allowlist；
- prompt injection defense；
- structured output；
- confidence gate；
- human review；
- no arbitrary shell / SQL / HTTP。

---

## 19. 前端改造范围

不要重做 UI。

优先增加：

### Story Detail

新增区块：

```text
Security Research
Tracking Status
Timeline Changes
Product Impact
Evidence
Unknowns
```

### Admin

新增：

```text
Agent Runs
Tracking Plans
Human Reviews
Product Impact Review
Eval Results
```

---

## 20. 项目实施里程碑

### M0 — Baseline Freeze

- 锁定 AIHOT commit；
- 跑通 typecheck/test/smoke；
- 保存 baseline；
- 不改业务。

### M1 — Security Verticalization

- site/taxonomy/topics/sources/prompts；
- 关闭 AI-only features；
- 建立安防 selection gold；
- 跑 SelectBench。

### M2 — Security Event Benchmark

- 建安防 event relation gold；
- 测现有 AIHOT grouping；
- 明确现有能力瓶颈。

### M3 — Agent Runtime Foundation

- Python/FastAPI/LangGraph；
- tool abstraction；
- trace；
- proposal model；
- Docker 集成。

### M4 — Security Research Agent

- 外部研究；
- evidence；
- conflict handling；
- research eval。

### M5 — Event Tracking Agent

- tracking_plan；
- next_check；
- change detection；
- tracking eval。

### M6 — Product Impact Agent

- CVE/vendor/product/model/version；
- impact evidence；
- impact eval。

### M7 — UI / API / MCP Extension

- Story page；
- admin review；
- public/API/MCP optional exposure。

### M8 — Final Evaluation

- holdout；
- ablation；
- failure cases；
- cost/latency；
- README/resume metrics。

---

## 21. Coding Agent 实施规则

任何负责本项目开发的 Coding Agent 均必须遵守：

1. 先读本设计文档和 Migration Spec。
2. 必须从当前阶段开始，不跨阶段“大重构”。
3. 不得未经实验引入新组件。
4. 不得重写已经存在且满足需求的 AIHOT 能力。
5. 所有数据库变化只能增量 migration。
6. 保持 AIHOT 原有公开接口兼容，除非设计明确要求变化。
7. 每阶段必须有测试和验收结果。
8. 任何性能/准确率提升都必须来自真实 eval。
9. 不允许在 README/简历中填写虚构指标。
10. 遇到设计冲突时，优先保守、最小改动，并在 implementation status 中记录。


### 21.1 模型切换与上下文交接

本项目允许因模型额度、服务可用性或执行能力差异切换 Coding Agent，不要求等待当前模型额度重置。

但切换不得依赖聊天上下文作为唯一状态来源。任何模型接手前，仓库必须能够仅凭版本库内容恢复当前开发状态。

如果在一个 Phase 中途需要切换模型，当前模型在停止前应尽可能完成以下交接：

1. 更新 `docs/IMPLEMENTATION_STATUS.md`：
   - 当前 Phase；
   - 已完成事项；
   - 正在进行的事项；
   - 未完成步骤；
   - 已执行测试及结果；
   - 已执行 Eval 及结果；
   - 已知问题；
   - 设计偏差；
   - 建议下一步。
2. 保证工作区状态可解释：
   - 最优情况：完成一个逻辑最小提交；
   - 若无法提交：在状态文档中列明未提交文件、修改目的和剩余工作。
3. 不允许仅在聊天中留下关键设计决定。
4. 新 Coding Agent 接手后必须重新阅读：
   - 根目录 `AGENTS.md`；
   - 本技术设计；
   - Migration Spec；
   - `docs/IMPLEMENTATION_STATUS.md`；
   - 当前 Phase 涉及源码和测试。
5. 新模型应先执行 `git status`、查看最近提交和当前测试状态，再继续编码，不应凭自己的偏好重新设计已确定方案。

原则：

> **模型可以替换，仓库状态必须连续。**


---

## 22. 简历价值

项目最终重点证明：

- Python AI Agent 工程能力；
- LangGraph stateful workflow；
- Tool Calling；
- Long-running Agent；
- Evidence-grounded reasoning；
- Event Memory；
- Evaluation-driven iteration；
- LLM observability；
- Human-in-the-loop；
- 传统软件工程可靠性意识。

而 Java/Spring 后端能力由真实工作经历证明，不在本项目重复建设。

---

## 23. 项目一句话

> SentinelIntel 是一个基于 AIHOT 确定性情报流水线扩展的安防行业持续研判系统：利用 Python/LangGraph Agent 对高价值安全事件主动补充外部证据、跨时间跟踪关键进展，并生成可追溯的产品影响分析，以 Evaluation 驱动每项 AI 增强是否保留。
