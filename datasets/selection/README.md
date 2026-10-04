# SentinelIntel 安防 Selection Benchmark — 数据说明与标注协议

> **状态：已交付 `MODEL_REVIEWED` 基准，不是人工标注 gold。**
> Phase 1 原始验收措辞要求「150–250 条**人工标注** gold 样本（含 development / holdout）」。
> 实际交付的是：**200 条 `MODEL_REVIEWED` 基准**（`candidates.jsonl`）+ **24 条 `MODEL_REVIEWED` 分层
> 校准补充**（`tier-calibration.jsonl`），两轮标注由**同一模型家族**完成，**没有独立人工裁决**。
> 这是一处**明确的验收标准偏差**，不是已满足的要求。任何指标都不得表述为「人工标注准确率」或
> 「线上准确率」。完整评测记录见 `docs/evaluation/selection.md`。

---

## 1. 标注 provenance（不得当成人工 gold）

- 第一轮：模型提出（model-proposed）。
- 第二轮：模型复核（model-reviewed）。
- 两轮由**同一模型家族**完成，因此**不构成独立裁决**。
- 文件内的 `"$label": "MODEL_REVIEWED"`、`"$labeller"`、`"$confidence"` 三个字段保留了这条 provenance。
  任何情况下都不要把它们改写成人工标注。
- 这些标签是**项目内部、可复现的模型复核基准标签**；用于横向比较同一个站点的不同配置是合适的，
  用于对外声称准确率是不合适的。

## 2. 真实 evaluator 的输入契约（已核对源码）

评测脚本是既有的 `scripts/eval-selection.ts`，**不重新实现评测框架**。它读取 JSONL，每行一个对象：

```ts
{
  caseId: string,
  material: { title, originalTitle: string|null, publishedAt: string|null, sourceName,
              bodyZh: string|null, bodyOriginal: string|null },   // 有一个 body 即可
  sourceFacts: { sourceKind, sourceTier?, firstParty?, language? }, // tier 决定用哪个门槛
  samplingContext?: { benchmarkSplit?: string, samplingStratum?: string },
  gold: { decision: "select" | "reject" | "either" }               // either 不计入准确率
}
```

用法：

```bash
node --env-file=.env scripts/eval-selection.ts \
  --gold datasets/selection/candidates.jsonl \
  --split development --n 155 --seed 7 --label "reproduce"
```

**路径差异**：`scripts/eval-selection.ts` 的默认输入是 `.data/gold.jsonl`（`.data/` 不进 Git），而
Migration Spec 建议把可审计的记录放在 `datasets/selection/`。Phase 1 的处理方式是：

- `datasets/selection/` 保存**可审计的**、不含第三方长正文的标注记录；
- 本地跑 Eval 时直接以 `--gold datasets/selection/...` 指向本目录的文件，或用最小确定性转换写进
  `.data/gold.jsonl`；
- 不修改 evaluator，不另建评测体系。

每次运行都会自动导入后台 SelectBench（`importSelectBenchRun`，actor `script:eval-selection`），并在
控制台打印 `SelectBench run: sb-YYYYMMDD-<6 hex>`。

## 3. 样本来源

### 3.1 来源构成（已核实）

| 来源类型 | 行数 | 说明 |
|---|---|---|
| `sourceKind: "rss"` | 150 | 全部来自 `industry/sources.json` 里登记的 10 个信源（CISA ×2、CERT-EU、UK NCSC、JPCERT、Cisco PSIRT、Fortinet PSIRT、Microsoft MSRC、Zero Day Initiative、FreeBuf） |
| `sourceKind: "web"` | 50 | 来自**未登记在 `industry/sources.json`** 的 web 信源：EU Public Procurement Portal、SAM.gov、厂商 newsroom（CrowdStrike / Check Point / Fortinet / SentinelOne / KDDI / VulnCheck）、GlobeNewswire、Google Cloud / AWS / Apple 博客 |

两点必须知道：

1. `industry/sources.json` **仍然只有 10 个源**，Phase 1 没有扩源。基准里的 `procurement`、
   `marketing-noise`、`irrelevant-IT` 三个 stratum 能存在，是因为采样用了 pack 之外的 web 来源；
   **线上按当前 pack 配置不会以同样比例遇到这些类型的资料。**
2. **两个数据集文件都不含 `url` 字段。** 因此这 50 条 `web` 行**无法仅凭仓库追溯到 URL**，产生它们的
   本地采样脚本是 gitignored 且未保留。后续要做人工复核时，只能依据 `sourceName` + `title` + 正文摘要。

### 3.2 必填 strata（Migration Spec Phase 1）

| stratum | 含义 |
|---|---|
| `vulnerability` | 漏洞／CVE 正式披露与更新 |
| `vendor-advisory` | 厂商 PSIRT 与官方安全公告 |
| `policy` | 法规、政策、标准的立项／征求意见／发布／修订／实施 |
| `procurement` | 招标、中标与采购公告 |
| `marketing-noise` | 营销稿、活动、课程、招聘、白皮书下载引导 |
| `generic-cybersecurity` | 泛安全科普、安全意识、无具体事实的趋势稿 |
| `irrelevant-IT` | 与安防／安全无明确关联的通用 IT 新闻 |

七个 stratum 在基准中都已覆盖（分布见 §4）。

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
差距越大。实际交付以版权优先，每条约 240 字摘要，并在 `docs/evaluation/selection.md` §L 里注明了
这一偏差。**实际交付也未保存 URL**，见 §3.1。

## 4. 数据集现状

### 4.1 主基准：`candidates.jsonl`

| 项 | 值 |
|---|---|
| 行数 | 200 |
| development / holdout | 155 / 45 |
| select / reject / either | 110 / 80 / 10 |
| 唯一 `caseId` | 200 |
| `$label` | 全部 `MODEL_REVIEWED` |

stratum × split：

```text
vulnerability/development           42      vulnerability/holdout           13
vendor-advisory/development         42      vendor-advisory/holdout         13
policy/development                  23      policy/holdout                   7
procurement/development             16      procurement/holdout              4
marketing-noise/development         12      marketing-noise/holdout          3
irrelevant-IT/development           12      irrelevant-IT/holdout            3
generic-cybersecurity/development    8      generic-cybersecurity/holdout    2
total                              155      total                           45
```

### 4.2 分层校准补充：`tier-calibration.jsonl`

| 项 | 值 |
|---|---|
| 行数 | 24（`benchmarkSplit` 全部为 `calibration`） |
| 12 × `T1_5` | 全部 `gold.decision = reject`（`tier-gap-t1_5-negative`） |
| 12 × `T2` | 全部 `gold.decision = select`（`tier-gap-t2-positive`） |
| 与主基准的 `caseId` 重叠 | 0 |
| `$label` | 全部 `MODEL_REVIEWED` |

这份补充是**刻意构造的平衡集**，不是自然分布采样：它用来补足自然分布中样本过少的「T1_5 假阳性」
与「T2 假阴性」两类证据。因此它**不是**最终留出集的一部分，其汇总 accuracy/F1 **不得**当作自然分布
性能对外表述。来源逐条列在 `tier-calibration-provenance.md`（含 URL）。

## 5. 历史：早期 checkpoint（已被取代）

Phase 1 早期 checkpoint 交付的是 `candidates.jsonl` 的**前身**：**150 条完全未标注**的候选
（`gold.decision` 一律 `"either"`、`"$label": "TODO"`），只覆盖 4 个 stratum，且 `procurement`、
`marketing-noise`、`irrelevant-it` 在当时 10 个一手 rss 信源里候选数为 **0**。当时的采样脚本
（`.data/fetch-candidates.mjs`，gitignored）就是按那份 150 条的口径写的，它硬编码
`sourceKind: "rss"`，**因此它无法解释现在的 200 条基准**——后 50 条 `web` 行来自另一套未保留的采样。

这条历史记录保留在此，是因为它解释了 §3.1 里那个来源构成的由来，而不是当前状态。

## 6. 待 owner 执行的动作

1. **决定验收标准偏差如何处置**：要么明确接受这 200 + 24 条 `MODEL_REVIEWED` 基准作为 Phase 1 的
   替代交付，要么另行安排人工标注。
2. **如果决定补人工标注**：优先抽检 §4.2 之外的 `$confidence` 为 `low` 的行，以及均匀随机的约 20%
   （建议 40 条左右）。同意就把 `$label` 改成 `"HUMAN_CONFIRMED"`；不同意就直接改 `gold.decision`。
   同时算一下人工与模型标签的一致率——这个数字本身比标签更重要：一致率高说明口径清晰，一致率低说明
   判定口径本身有歧义，应当先改口径再标。
3. 不要重新跑留出集，不要用留出集错例继续调门槛或提示词（见 `docs/evaluation/selection.md` §I、§K）。

## 7. Agent 不做什么

- 不改写 `gold.decision` 的既有取值。
- 不把模型判断标注成人工 gold。
- 不做人工复核、也不声称做过。
- 不为了让 Phase 1 “看起来完成”而缩小样本量、简化 strata，或调整留出集。
