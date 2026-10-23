# Phase 7 — UI / Admin / MCP Extension 实施合同

> 文档定位：Phase 7 设计合同与验收清单（先于任何功能实现提交）。
> 正式依据：`01-SentinelIntel-V2-Technical-Design.md` §19 / M7；`02-AIHOT-to-SentinelIntel-Migration-Spec.md` §16。
> 分支：`phase/7-ui-admin-mcp`（base `main` = `63428dc`，Phase 6 合并提交）。
> 日期：2026-10-23。

---

## 1. 范围与硬边界

Phase 7 只做**读取层与界面扩展**：把 Phase 4/5/6 已落库的 Agent 数据，通过统一只读 DTO 暴露给
Story 页面、公开 API、MCP 和 Admin 后台。不重做 UI，不新建第二套 API / MCP Server / 前端框架 /
数据库 / 消息队列 / Agent。

硬边界（违反即验收失败）：

1. Web 只经 HTTP 读 API，不直连数据库（沿用 `apps/web/app/lib/api.server.ts` 既有模式）。
2. 所有公开输出（Web 页面数据、`/api/v1/*`、MCP）必须来自
   `packages/backend/src/publication/` 的统一读取层。
3. 页面读取不得触发模型调用、Agent 执行、外部网络请求、研究任务或任何写操作。
4. 后台只允许管理员访问（沿用 `adminHandler` 会话 + CSRF 模式）。
5. 公开输出不得泄露 prompt、receipt 内部信息、API key、内部 trace、管理员备注、
   human review 私有内容。
6. 公开 Evidence 只展示：来源名称、官方 URL、标题/摘要摘录、时间、authority/source type。
   遵守版权边界，不展示未授权全文（即不落 `normalized` 全文字段）。
7. Unknown 必须诚实显示为 unknown，不得转述为 unaffected / safe / no impact / fixed。
8. 不改变 Phase 4/5/6 Agent 的 prompt、模型、阈值、路由、receipt、budget、holdout。
9. 不引入新的前端框架、数据库、消息队列、MCP Server 或 Agent。
10. 不重做现有页面，不做无关视觉改版；保持现有公开 API、RSS、MCP 与浏览器本地数据兼容。
11. **本阶段不新增迁移**（纯读取层 + UI；当前最大迁移为 `0046`）。

## 2. 现状审计结论（2026-10-23，只读）

### 2.1 表（Phase 4/5/6）

| 表 | 迁移 | Story 关联 | 关键列 |
|---|---|---|---|
| `agent_research_runs` | 0040 | `story_id` FK | `status` running/completed/failed、`output_proposal` jsonb（claims/unknowns/evidence/conflicts/tool_trace/summary/terminal_status）、`error_code`、`started_at/completed_at`、`graph_version`（phase4-stub-v1 / phase5-tracking-v1 / phase6-impact-v1）、`trace_id`、`receipt_ids` |
| `external_evidence` | 0040 | `story_id` FK | `source_type`、`source_name`、`canonical_url`、`title`、`excerpt`、`authority_level`、`published_at`、`retrieved_at`、`normalized`（**内部**）、`provenance`（**内部**） |
| `tracking_plans` | 0042/0043 | `story_id` UNIQUE FK | `status` active/paused/stopped、`why_track`、`questions` jsonb（open/resolved）、`next_check_at`、`last_checked_at` |
| `tracking_changes` | 0042 | `story_id` FK | `change_type`（vendor_confirmation/patch/procurement_award/material_update）、`summary`、`before/after_snapshot`（**内部**）、`evidence_ids uuid[]`、`created_at` |
| `product_impacts` | 0044 | `story_id` FK | `status` current/superseded、`persisted_kind` claims/unknown_only、`confidence`、`routing` auto/human_review/unknown、`models`、`affected_range/fixed_range` jsonb `{raw,supported}`、`exploit_status`、`unknowns`、`evidence_ids`、`cve_id` |
| `impact_human_reviews` | 0044 | `story_id` FK | `status` open/resolved/dismissed、`reason`、`payload`、`resolved_at` |
| `security_entities` / `story_entities` | 0044 | `story_entities.story_id` | vendor/product_family 规范化名 |

三个 Agent（research/tracking/impact）共用 `agent_research_runs`，以 `graph_version` 区分阶段。
仓库中**不存在** `human_reviews` 表；实际表为 `impact_human_reviews`。

### 2.2 既有读取路径

- `publication/stories.ts`：`loadStoryDetail(storyId)`（网页 `/api/site/stories/:publicId`）、
  `v1Story(storyId)`（公开 `/api/v1/stories/:publicId` 与 MCP `get_story`）、`resolveStory(publicId)`。
- `agents/impact-store.ts`：`listCurrentImpacts(storyId)`（唯一现成的按 Story 读函数）。
- **缺口**：`tracking_plans`、`tracking_changes`、`agent_research_runs`、`impact_human_reviews`、
  `external_evidence` 均无按 Story 的读取路径；这正是 Phase 7 要补齐的部分。
- Web Story 页（`apps/web/app/routes/story.tsx`）经 loader fetch `/api/site/stories/:publicId`，
  不直连后端；Admin 页经 `adminGet` fetch `/api/admin/*`，401 跳登录。
- Admin 组件库：`apps/web/app/features/admin/ui.tsx`（`AdminPage/Card/Stat/Badge/DataTable/Empty/
  Time/Json/KV/Pager`）；后台导航常量 `NAV` 在 `admin/layout.tsx`。
- MCP：5 个只读工具，`get_story` = `sentinelintel_get_story`（`apps/api/src/routes/mcp.ts`），
  取数即 `resolveStory` + `v1Story`；无 outputSchema，`structuredContent` 带 `_trust` 元数据。
- 契约风格：公开 DTO 为 `packages/contracts/src/site.ts` 纯 interface（camelCase、ISO 时间）；
  Agent 契约为 zod（`packages/backend/src/agents/*-contract.ts`）。v1 另有权威文档
  `reference/public-v1.openapi.json`（schema `Story`）。

## 3. 设计合同

### A. 统一只读 DTO（先决条件）

新增 `packages/backend/src/publication/agent-intelligence.ts`，导出唯一入口：

```ts
loadStoryAgentIntelligence(storyId: number): Promise<StoryAgentIntelligence>
```

DTO 类型新增在 `packages/contracts/src/site.ts`（与 `StoryDetail` 同文件、同风格）：

```ts
interface StoryAgentEvidenceView { id; sourceType; sourceName; url; title; excerpt;
  authorityLevel: "authoritative"|"primary"|"secondary"; publishedAt: string|null; retrievedAt: string }
interface StoryResearchClaimView { claimId; text; criticality: "critical"|"noncritical";
  status: "confirmed"|"conflicted"; evidenceIds: string[] }
interface StoryResearchView { status: "completed"|"insufficient_evidence"|"failed"|"running";
  completedAt: string|null; summary: string|null; claims: StoryResearchClaimView[]; conflictCount: number }
interface StoryTrackingQuestionView { questionId; question; status: "open"|"resolved" }
interface StoryTrackingView { status: "active"|"paused"|"stopped"; whyTrack; questions;
  lastCheckedAt: string|null }
interface StoryTimelineChangeView { id; changeType; summary; evidenceIds; createdAt }
interface StoryProductImpactRowView { id; vendor; product; models;
  affectedRange: { raw: string; supported: boolean }|null; fixedRange: 同上;
  mitigations; confidence: "high"|"medium"|"low"; routing: "auto"|"human_review"|"unknown";
  reviewRequired: boolean; exploitStatus: { poc; knownExploited }; cveId; evidenceIds; unknowns }
interface StoryProductImpactView { rows; reviewRequiredCount }
interface StoryUnknownView { source: "research"|"product_impact"; text; reason: string|null }
interface StoryAgentIntelligence {
  present: boolean;            // 是否存在任何 Agent 数据
  dataUpdatedAt: string|null;  // Agent 侧最新时间戳
  reviewRequiredCount: number; // 待人工复核结论数（公开为计数，不含私有 payload）
  research: StoryResearchView|null;
  tracking: StoryTrackingView|null;
  timelineChanges: StoryTimelineChangeView[];
  productImpact: StoryProductImpactView;
  evidence: StoryAgentEvidenceView[];
  unknowns: StoryUnknownView[];
}
```

状态语义（必须在 UI 与测试中分别验证）：

- **空状态**：`present=false`，所有分区 null/空；页面不渲染 Agent 区块。
- **部分状态**：某分区无数据时为 null/空数组；只降级该区块，其余正常。
- **失败状态**：研究 run `failed` → `research.status="failed"`，不带 claims，不暴露 `error_detail`
  （仅 Admin 可见失败原因）。
- **unknown 状态**：`exploit_status` 保持 `unknown`；`unknowns` 原文呈现，禁止改写措辞。

安全投影（公开 DTO 禁止出现，测试逐字段断言）：
`tool_trace`、`usage`、`input_snapshot`、`capability*`、`trace_id`、`receipt_ids`、`prompt_version`、
`error_detail`、evidence 的 `normalized`/`provenance`/`content_hash`、tracking 的
`before/after_snapshot`、human review 的 `payload`/`reason`、Story 内部字段。

取值规则：研究取该 Story **最新一条 `graph_version LIKE 'phase4-%'` 的 run**（任何状态）
——`agent_research_runs` 由三个 Agent 共用，晚于 Phase 4 的 tracking/impact run 绝不能被研究
schema 解析后公开为“研究完成但无结论”；completed 时 `output_proposal` 经
`ResearchProposalSchema.safeParse` 解析（写入时已校验，读取侧防御）。Evidence 限 50 条、
timeline changes 限 20 条、claims/unknowns 沿用契约上限。六组查询 `Promise.all` 并行。

`reviewRequiredCount` 语义：顶层为 **open 人工复核数**（story 级信号）；
`productImpact.reviewRequiredCount` 为 **open 人工复核数 + 持久化行中路由到复核的行数**——
确定性 store 把 medium 行路由进 `impact_human_reviews` 且从不持久化，因此“只有人工复核、
没有 impact 行”的真实状态下必须由 open 复核数提供待复核信号（`present` 与 `dataUpdatedAt`
同样把 open 复核计入）；复核 payload 本身永不进入公开投影。

### B. Story Detail 六个区块

`StoryDetail` **加性扩展**一个可选字段 `agentIntelligence?: StoryAgentIntelligence`；
`loadStoryDetail` 组装时调用统一读模型。既有字段、ETag、缓存头、308/404 语义不变。

`apps/web/app/routes/story.tsx` 主列依次新增六个 `Panel`（仅该区块有数据时渲染）：

1. **安全研究**（`research`）：状态徽标 + 摘要 + claims（含 evidence 链接）+ 冲突计数。
2. **追踪状态**（`tracking`）：状态 + 为什么追踪 + 待解决问题列表（open/resolved）。
3. **时间线变更**（`timelineChanges`）：变更类型中文标签 + 摘要 + 时间 + evidence 链接。
4. **产品影响**（`productImpact.rows`）：vendor / product / model / affected range /
   fixed range / exploit status / confidence / 待复核徽标；unknown 原文列出。
5. **证据**（`evidence`）：来源名称 + 标题 + 摘录 + 时间 + authority 徽标 + 官方 URL 外链
   （`rel="noopener noreferrer"`，可追溯到原始官方来源）。
6. **未知项**（`unknowns`）：原文 + 研究原因；标题明示"未知/未确认"，禁止安全化措辞。

区块有数据时导航 `PillTabs` 增加一个"安全研判"入口（滚动到该区块容器）。
页面无 Agent 数据时与现状完全一致。

### C. Admin 五个只读视图

新增 `packages/backend/src/admin/agents.ts`（SQL，沿用 `admin/runs.ts` 风格）与
`packages/backend/src/admin/eval.ts`（静态记录，不查库、不生成新指标）。路由全部
`adminHandler` 包裹、只读 GET：

| 端点 | 视图 | 数据 |
|---|---|---|
| `GET /api/admin/agent-runs` | Agent Runs | `agent_research_runs` join stories；阶段由 `graph_version` 推导；状态、起止时间、model/provider/prompt_version/graph_version、失败原因（error_code + 截断 error_detail）、trace_id、receipt 计数 |
| `GET /api/admin/tracking-plans` | Tracking Plans | `tracking_plans` + 未解决问题数 + 最近变更 |
| `GET /api/admin/human-reviews` | Human Reviews | `impact_human_reviews`（open/resolved/dismissed）+ Story + payload（ImpactRow，无敏感字段） |
| `GET /api/admin/product-impact-review` | Product Impact Review | 待复核 current 行（routing=human_review 或 confidence≠high 或区间 unsupported）+ 原因 + evidence 引用（标题+URL） |
| `GET /api/admin/eval-results` | Eval Results | 仓库已提交的评测结论与限制（链接 docs；MODEL_REVIEWED 如实标注，不称 human gold） |

前端：`apps/web/app/routes/admin/{agent-runs,tracking-plans,human-reviews,impact-review,
eval-results}.tsx`，复用 `AdminPage/Card/DataTable/Badge/Time/Json`；`NAV` 新增"Agent"分组。
**默认只读**：除非现有 store 已提供安全确定性状态变更方法，否则不新增审批工作流
（当前没有 → 全部只读）。

### D. API

- Story detail：`loadStoryDetail` 返回体加性扩展；`/api/site/stories/:publicId` 无需改路由。
- 公开 v1：`v1Story` 返回体加性扩展 `agentIntelligence`；同步
  `reference/public-v1.openapi.json`（`Story` schema 增加 optional 属性，`required` 不变）。
- 权限分离：public 路由无会话返回公开 DTO；admin 路由无会话 401（既有 `adminHandler`）。
- 空/不存在：story 不存在 404、合并 308、无公开报道 404——语义不变。
- 不返回数据库内部字段；错误经既有 `sendProblem`，不透出 SQL/内部错误。

### E. MCP

- **扩展 `get_story`**（`apps/api/src/routes/mcp.ts`）：`structuredContent.story` 加性增加
  `agentIntelligence`；文本输出增加一行安全研判摘要（研究状态/追踪状态/产品影响 N 条、
  待复核 M 条、证据 K 条）。旧字段与旧调用方式不变；不声明 outputSchema（与现有一致）。
- `search` / `hot` / `daily` **不变**：无明确调用场景需要 Agent 明细；轻量状态摘要的用户价值
  不成立（get_story 已承载）。记录为设计决定。
- **不新增** `get_security_impact` / `get_story_tracking`：五条件中第 1 条不满足——
  `get_story` 经同一 read model 可合理承载详细数据；新建工具会复制权限与查询逻辑。
- 不新建第二个 MCP Server。

## 4. 验收清单（实现前固定）

1. Story 页面能从真实 scratch DB 展示 Phase 4/5/6 数据。
2. 六个区块均有 populated / empty / partial-unknown 三类 fixture 测试。
3. 页面读取不写库、不建 receipt、不调模型、不访问外网、不建 Agent run
   （测试：读取前后 receipts/agent_research_runs/product_impacts/external_evidence/
   tracking_plans/impact_human_reviews 行数不变）。
4. Web 只通过 API 获取数据（无 `@aihot/backend` import，既有约束保持）。
5. 公开 DTO 只来自 publication read layer；MCP/API/Web 同一函数。
6. Admin 页面未登录不可访问；公开接口不返回 admin-only 字段。
7. unknown / unsupported / conflict / review-required 不被误写为安全或不受影响
   （`exploit_status` unknown 保持 unknown；unknowns 原文断言）。
8. Evidence URL、Story 归属、引用关系正确；禁止跨 Story Evidence（测试构造跨 Story 证据）。
9. MCP 旧 schema/旧字段兼容；新增字段加性。
10. MCP/API/Web 同一 publication read model。
11. 不改变生产写入语义（无写入代码改动；store/契约零 diff 或仅加性读函数）。
12. 测试通过：publication/read-model、API contract、auth、Story UI、Admin UI、MCP compatibility。
13. 完整验证：`npm run typecheck`；空 `*_ci` 库执行全部 migration（43 个，至 `0046`）；
    Phase 7 相关 backend tests；`npm run build -w @aihot/web`；
    `node --test apps/web/tests/*.test.ts`；`docker compose config`。
14. 推送后 canonical Linux CI `check` 与 `docker` 通过后才可标记 Phase 7 complete。
15. 更新 `docs/IMPLEMENTATION_STATUS.md`、本文档、必要 README 说明。
16. 报告区分：已验证 / 静态判断 / deferred / canonical CI pending。

## 5. 提交纪律（合同先行）

1. `docs: define Phase 7 UI/Admin/MCP contract`（本文档 + IMPLEMENTATION_STATUS 更新）
2. `feat: add unified agent publication read model`
3. `feat: expose Phase 7 API contracts`
4. `feat: add Story agent intelligence panels`
5. `feat: add Phase 7 admin views`
6. `feat: extend MCP story intelligence`
7. `test/docs: close Phase 7 acceptance`

不提交 `.env`、密钥、`.data/`；不运行付费模型；不构造新 benchmark；不进入 Phase 8。

## 6. Deferred / 待用户事项

- 人类标注的 human gold 标签（全项目 deferred，不阻塞本阶段）。
- Admin 的人类复核操作（resolve/dismiss）需新的审批工作流设计与审计语义 → 本阶段只读，
  操作流 deferred。
- MCP `get_security_impact` / `get_story_tracking` 新工具 → 条件不满足，不做（见 §E）。
- Eval Results 页为静态记录；若未来要可复现的评测报告渲染，需 Phase 8 统一处理。
- 搜索/热榜的 Agent 轻量摘要 → 无明确场景，不做（见 §E）。

## 7. 验收结果（2026-10-23 本地验收，分支 `phase/7-ui-admin-mcp`）

提交链（合同先行）：`7f7036f` 合同 → 读模型 → API → Story 区块 → Admin 视图 → MCP → 收尾。

| # | 验收项 | 结果 |
|---|---|---|
| 1 | Story 页面从真实 scratch DB 展示 Phase 4/5/6 数据 | **已验证**：`tests/phase7-api.test.ts` 对 `sentinel_phase7_ci` 真实库经 `/api/site/stories/:publicId` 取回 research/tracking/impact/evidence/unknowns |
| 2 | 六区块 populated / empty / partial-unknown 三类 fixture | **已验证**：读模型测试 8/8（populated/empty/partial/failed/cross-story/只读不变式 + 2 项审计回归：仅 Phase 4 研究、仅人工复核）；Story UI 测试 4/4（populated/empty/partial/review-only 四态） |
| 3 | 页面读取不写库/不回执/不调模型/不外网/不建 run | **已验证**：读模型测试对 receipts/agent_research_runs/external_evidence/tracking_plans/tracking_changes/product_impacts/impact_human_reviews 读取前后计数不变；Story UI 测试断言页面只请求 `/api/site/` |
| 4 | Web 只通过 API 获取数据 | **已验证**：`apps/web` 无 `@aihot/backend` import；UI 测试记录请求路径 |
| 5 | 公开 DTO 只来自 publication read layer | **已验证**：`loadStoryAgentIntelligence` 是唯一装配处；MCP/API/Web 三方测试断言同一函数输出 |
| 6 | Admin 未登录不可访问；公开接口无 admin-only 字段 | **已验证**：`tests/phase7-admin-auth.test.ts` 3/3（五端点 401、伪造 cookie 401、公开错误体无内部字段）；Admin UI 测试断言未登录 302 跳登录 |
| 7 | unknown/unsupported/conflict/review-required 不被误写 | **已验证**：`exploit_status` unknown 保持 unknown；unknowns 原文断言；unknown_only 行渲染为“未知记录”而非结论；failed 研究不暴露 error_detail |
| 8 | Evidence URL/归属/引用正确，禁止跨 Story | **已验证**：跨 Story 证据不出现在对方 DTO（读模型测试）；Evidence 面板外链 canonical_url |
| 9 | MCP 旧 schema/旧字段兼容，新增字段加性 | **已验证**：`tests/mcp-story-intelligence.test.ts` 3/3（工具清单 5 个不变、旧字段齐全、`agentIntelligence` 加性、not_found 语义不变） |
| 10 | MCP/API/Web 同一 read model | **已验证**：`v1Story` 与 `loadStoryDetail` 均调 `loadStoryAgentIntelligence` |
| 11 | 不改变生产写入语义 | **已验证（静态）**：diff 无 store/契约/migration 变更；无新迁移 |
| 12 | 六类测试通过 | **已验证**：read-model 8/8、API 5/5、auth 3/3、Story UI 4/4、Admin UI 5/5、MCP 3/3；web 全量 25/25 |
| 13 | 完整验证 | typecheck ✓；空库 `sentinel_phase7_ci` 应用全部 43 个迁移 ✓；Phase 7 backend 24/24 ✓；web build ✓；web tests 24/24 ✓；`docker compose config` ✓ |
| 14 | canonical Linux CI | **已验证**：PR #9（run `39966961001`）`check` 1m49s 通过、`docker` 1m27s 通过 |
| 15 | 文档更新 | 本文档 + `IMPLEMENTATION_STATUS.md` 已更新；README 无需改动（无面向使用者的配置或使用变化，Admin 页面与 Story 区块自解释）——记录为设计决定 |
| 16 | 报告分层 | 见最终交付报告 |

已知既有环境问题（非本阶段引入，main 上同样存在，canonical Linux CI 覆盖）：完整后端套件
303 通过 / 9 未通过 / 6 取消——7 项为冻结数据集哈希校验（本机 `core.autocrlf=true` 使工作区
JSONL 变为 CRLF，而 manifest 哈希按 LF 计算；数据集与 main 逐字节相同），其余为 KI-3
Windows POSIX SIGTERM 级联（Phase 0 已记录）。

### 7.1 审核整改（2026-10-23，推送前）

推送前审核发现两个会误导真实用户展示的 P1，均为读模型缺陷，已修复并补回归：

1. **Research 读到其他 Agent 的运行**：`agent_research_runs` 由三个 Agent 共用，原查询取 Story
   最新 run 而未限定 `graph_version`。Phase 6 impact run 以生产形状完成（`claims: []`、
   `summary = decision_reason`）后会被研究 schema 成功解析，公开呈现为“研究完成但无结论”，
   并抹掉真实 Phase 4 结论。修复：`WHERE ... AND graph_version LIKE 'phase4-%'`；回归测试
   用“Phase 4 完成 → Phase 6 完成（生产 proposal 形状）”断言研究内容不变、Phase 6 摘要不外泄。
2. **待人工复核数量未进入产品影响视图**：真实 medium 行只写 `impact_human_reviews`、不写
   `product_impacts`，而 `productImpact.reviewRequiredCount` 只数持久化行（恒为 0），Story UI
   与 MCP 的待复核提示因此永不出现。修复：`productImpact.reviewRequiredCount` = open 复核数 +
   持久化复核行数，`present` 与 `dataUpdatedAt` 同样计入 open 复核；回归测试构造“只有复核、
   没有 impact 行”的真实状态（经 `applyImpactProposal` 走 medium 路由），并补 Story UI 的
   review-only 用例（“正在人工复核”而非“还没有结论”）。

两项修复均已用“回退修复 → 回归测试失败”验证测试有效，并在恢复后复跑：读模型 8/8、Phase 7
后端 26/26、web 25/25、typecheck 通过。
