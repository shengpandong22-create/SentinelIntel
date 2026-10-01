# SentinelIntel 安防 Selection Gold Dataset — 标注协议与状态

> **状态：`LABELING_REQUIRED`。本目录目前没有任何人工标签，也没有可用于评测的样本。**
> Phase 1 验收要求至少 150–250 条人工标注样本（含 development / holdout），这一部分必须由项目
> owner 本人（或与其口味一致的人）完成。Coding Agent **不得**生成标签，也不得把模型输出当作 gold。

---

## 1. 为什么不能由 Agent 代做

按 Migration Spec 与 `AGENTS.md`：

- 不得伪造 Evaluation 增益、人工标签或测试结果。
- 门槛与提示词的校准必须基于**使用者本人标注**的样本（`docs/selection.md`）。
- 拿 LLM 打的标签冒充人工 gold，会让后续所有 Eval 结论失去意义。

因此 Agent 只负责：确认 schema、给出标注协议、提供候选样本的取得方式与模板、校验标注格式。
**标注本身停在需要 owner 的位置。**

## 2. 真实 evaluator 的输入契约（已核对源码）

评测脚本是既有的 `scripts/eval-selection.ts`，**不重新实现评测框架**。它读取 JSONL，每行一个对象：

```ts
{
  caseId: string,
  material: { title, originalTitle: string|null, publishedAt: string|null, sourceName,
              bodyZh: string|null, bodyOriginal: string|null },   // 有一个 body 即可
  sourceFacts: { sourceKind, sourceTier?, firstParty?, language? }, // tier 决定用哪个门槛
  samplingContext?: { benchmarkSplit?: "development"|"holdout", samplingStratum?: string },
  gold: { decision: "select" | "reject" | "either" }               // either 不计入准确率
}
```

用法（见 `docs/selection.md`）：

```bash
node --env-file=.env scripts/eval-selection.ts --gold .data/gold.jsonl --split development --label "phase1-security-v1"
```

**注意路径差异**：`scripts/eval-selection.ts` 的默认输入是 `.data/gold.jsonl`（`.data/` 不进 Git），
而 Migration Spec 建议把可审计的记录放在 `datasets/selection/`。Phase 1 的处理方式是：

- `datasets/selection/` 保存**可审计的**、不含第三方长正文的标注记录；
- 本地跑 Eval 时用最小确定性转换，把 `datasets/` 的记录写进 `.data/gold.jsonl`；
- 不修改 evaluator，不另建评测体系。

## 3. 标注协议

### 3.1 样本来源

只从 Phase 1 已接入的信源取（`industry/sources.json`），即 CISA、CERT-EU、UK NCSC、JPCERT、
Cisco PSIRT、Fortinet PSIRT、Microsoft MSRC、Zero Day Initiative、FreeBuf。

### 3.2 必填 strata（Migration Spec Phase 1）

| stratum | 含义 |
|---|---|
| `vulnerability` | 漏洞／CVE 正式披露与更新 |
| `vendor-advisory` | 厂商 PSIRT 与官方安全公告 |
| `policy` | 法规、政策、标准的立项／征求意见／发布／修订／实施 |
| `procurement` | 招标、中标与采购公告 |
| `marketing-noise` | 营销稿、活动、课程、招聘、白皮书下载引导 |
| `generic-cybersecurity` | 泛安全科普、安全意识、无具体事实的趋势稿 |
| `irrelevant-it` | 与安防／安全无明确关联的通用 IT 新闻 |

`procurement` 目前**没有可用信源**（见 `docs/IMPLEMENTATION_STATUS.md` 的信源验证结果），
因此这一 stratum 的样本需要 owner 自行提供来源，否则该类别无法标注。

### 3.3 判定口径

`select` = 一个持续关注安防与安全的从业者，今天值得看到它（有可核对的实质信息：编号、受影响
范围、修复版本、利用状态、金额、标准状态、主体变化）。

`reject` = 噪声（见上表 4 类，以及 `industry/prompts/selection-score.md` 的“必须压住的噪声”）。

`either` = 两可，不计入准确率，但保留在数据集里。

**明确不允许的判据**：厂商知名、正文长、术语多、出现 CVE 字样、"高危/严重"字样。这些只影响
证据强度，不构成价值。

### 3.4 数量与划分

| 项 | 要求 |
|---|---|
| 总量 | 150–250 条（Migration Spec Phase 1 下限） |
| development | 约 70–80%，用于看错例、改提示词 |
| holdout | 约 20–30%，**只在最后看一次**，不得用来调提示词 |
| 难例占比 | 尽量多放“差一点该选／差一点不该选”的条目 |

### 3.5 版权约束

不要把第三方文章正文大段提交进仓库。每行优先保存：`caseId`、来源名与 URL（放在 `title`/`sourceName`
或另加字段）、标题、**必要的短 excerpt**（足以判断即可）、`sourceFacts`、`samplingContext`、`gold`。

已知取舍：`eval-selection.ts` 会把 `bodyZh`/`bodyOriginal` 交给模型，正文越短，评测与线上条件的
差距越大。是否为了评测保真度而违反“不提交长正文”的原则，**需要 owner 决定**；默认按版权优先，
只放短 excerpt，并在报告里注明这一偏差。

## 4. 候选样本已就绪：`candidates.jsonl`（150 条）

Agent 已经完成它这一半——**候选抽取与结构化**。`candidates.jsonl` 用仓库真实的 RSS 读取器
（`packages/backend/src/sources/rss.ts` 的 `fetchRss`）从 10 个已实测信源抓取，因此内容与线上真正
会入库的一致，不是另写解析器的产物。

采样规则（确定性，可复现）：

- 每个信源设上限，避免 MSRC（4616 条 CVE）淹没作业表；
- 按 stratum 配额取样，并在列表上按步长均匀抽取，而不是只取开头几条；
- split 按 `i % 4 === 3` 划分，因此 development / holdout 都覆盖到每个 stratum；
- **`gold.decision` 一律写 `"either"`（不计入准确率），并带 `"$label": "TODO"` 标记**，
  所以这份文件在任何情况下都不会被误当成已标注的 gold。

实际分布：

```text
vulnerability/development      42
vulnerability/holdout          13
vendor-advisory/development    42
vendor-advisory/holdout        13
policy/development             23
policy/holdout                  7
generic-cybersecurity/dev       8
generic-cybersecurity/holdout   2
total                         150
```

### 采样暴露出的 stratum 缺口（重要）

以下三个 spec 要求的 stratum **在当前 10 个信源里候选数为 0**：

| stratum | 为 0 的原因 |
|---|---|
| `procurement` | 没有任何招投标信源可用（ccgp 等只有 HTML，无 feed） |
| `marketing-noise` | 现有信源全是一手政府／厂商／CERT feed，不产生营销稿 |
| `irrelevant-it` | 同上，一手源不会出现无关的通用 IT 新闻 |

这不是采样参数问题，而是**信源覆盖面问题**：要覆盖这三个 stratum，必须先补信源（媒体/聚合源用于
噪声类，招投标平台用于 procurement），也就是需要 owner 对 `web_list` 选择器方案拍板。
在此之前，gold 数据集只能覆盖 4 个 stratum，这一点必须写进验收结论，不能假装完整。

## 5. 待 owner 执行的动作（只剩判断本身）

1. 打开 `datasets/selection/candidates.jsonl`，逐行看 `material.title` 与 `material.bodyOriginal`／`bodyZh`
   （各约 240 字摘要）。
2. 把 `"gold":{"decision":"either"}` 里的 `either` 改成 **`select`**（值得看）或 **`reject`**（噪声）。
   拿不准就用 `either`（不计入准确率）。
3. 填完后删掉每行的 `"$label":"TODO"`。
4. 在取得成本授权后运行 SelectBench baseline 与 holdout（当前 `MODEL_CALLS_ENABLED=false`，
   且未获授权，见 `docs/IMPLEMENTATION_STATUS.md`）。
5. 把结果写回 `docs/IMPLEMENTATION_STATUS.md`；在此之前 Phase 1 不能标记为 accepted。

数量取舍：spec 建议 150–250 条。当前 150 条已可作为第一批 baseline；是否先跑 150 条、
再按错例补到 250 条，由 owner 决定。`split` 与 `stratum` 已填好，不需要你维护。

## 5. Agent 不做什么

- 不生成任何 `gold.decision`。
- 不把模型判断写入 `gold`。
- 不为了让 Phase 1 “看起来完成”而缩小样本量或简化 strata。
