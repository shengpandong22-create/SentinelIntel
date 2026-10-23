<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="docs/assets/banner-dark.png">
    <img src="docs/assets/banner-light.png" alt="AIHOT：每个行业，都可以有自己的 AIHOT。很多条信源流进中间的精选，再分给法律、人力资源、金融等各个行业" width="100%">
  </picture>
</p>

<p align="center">
  <a href="LICENSE"><img src="https://img.shields.io/badge/license-MIT-176b75?style=flat-square" alt="MIT License"></a>
  <img src="https://img.shields.io/badge/Node.js-24-176b75?style=flat-square&logo=nodedotjs&logoColor=white" alt="Node.js 24">
  <img src="https://img.shields.io/badge/PostgreSQL-17-176b75?style=flat-square&logo=postgresql&logoColor=white" alt="PostgreSQL 17">
  <img src="https://img.shields.io/badge/Docker-Compose-176b75?style=flat-square&logo=docker&logoColor=white" alt="Docker Compose">
  <a href="https://aihot.news"><img src="https://img.shields.io/badge/demo-aihot.news-202a30?style=flat-square" alt="aihot.news"></a>
</p>

<p align="center">
  <b>一个自己找热点、自己写日报的网站框架。</b><br>
  把信源换成你的，把精选标准换成你的 KnowHow，它就是你的行业热点站。
</p>

<p align="center">
  <a href="#跑起来">跑起来</a> ·
  <a href="docs/customize.md">改成你的行业</a> ·
  <a href="#它是怎么工作的">它是怎么工作的</a> ·
  <a href="#文档">文档</a>
</p>

<br>

> **这个仓库有两种身份，请分开看。**
> ① 通用框架：[AIHOT](https://aihot.news) 的开源框架（MIT，作者数字生命卡兹克）——下面“这是什么”到“把它改成你的行业”讲的是它。
> ② 行业扩展：**SentinelIntel V2** 在同一个框架上增量实现的安防持续研判能力——见
> [SentinelIntel V2 安防持续研判扩展](#sentinelintel-v2-安防持续研判扩展)。
> 两者共用代码，但只有 ② 是本仓库的扩展部分；AIHOT 的名称与 Logo 不属于 SentinelIntel。

## 这是什么

[AIHOT](https://aihot.news) 是我做的一个 AI 热点网站。它每天从一批信源里收资料，用大模型先筛一遍、再独立打两次分，挑出真正值得看的，写成中文标题和摘要；把不同来源说的同一件事聚成一个事件，按有多少人在说排出热点；每天早上出一份日报。

这个仓库是它的完整框架：网站、后台、精选流程、聚簇和热度算法，**所有提示词的原文和入选门槛**，都在这里。

## 为什么开源

这半年，很多做法律、做 HR、做金融、做贵金属的朋友问我，能不能也给他们的行业做一个。

我做不了。我不懂你们的行业，不知道哪些信源有用，也不知道什么样的消息，对你们来说才叫热点。

但你们懂。

既然我没办法满足所有人，那就把火种交到大家自己手上。

## 说在前面

- **我不是专业的开发者。** 我是设计师出身，半年前还看不太懂代码。这套代码是我和 AI 一起重写的，比以前干净了很多，但一定还有写得不好的地方。发现问题欢迎提 Issue，我不一定能很快回复，先说声抱歉。
- **这是一份快照。** 它来自 AIHOT 正在线上跑的代码，不是精心打磨的通用框架。以后 AIHOT 的更新，我会尽量同步过来，但没法保证每一次都同步。
- **里面没有 AIHOT 的信源名单和运营数据。** 仓库带了 18 个公开的海外 AI 资讯源做示范，够你跑起来看效果；真正的信源，要换成你自己行业的。
- **请不要用 AIHOT 的名字和 Logo。** 换上你自己的名字，它就是你的站。

## 它是怎么工作的

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="docs/assets/how-dark.png">
  <img src="docs/assets/how-light.png" alt="六步：采集、预筛、两次评分、写作、聚簇、热点与成刊" width="100%">
</picture>

一条资料从信源进来，先判重，再预筛；可能重要的独立打两次分，过了门槛才进精选；然后写中文标题和摘要，和别的报道聚成事件，算进热度，最后进日报。每一步的提示词都在 [`industry/prompts/`](industry/prompts/)，改标准不用改代码。详见 [精选与校准](docs/selection.md)。

### 聚簇与热点

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="docs/assets/cluster-dark.png">
  <img src="docs/assets/cluster-light.png" alt="五个来源的报道聚成一个事件，事件进入当前热点榜" width="100%">
</picture>

同一件事，官网发一篇、媒体转十篇、X 上吵一天，读者只需要看到一次。AIHOT 把它们聚成一个**事件**：先用标题摘要的向量在最近两周里找候选，再让模型判断是同一件事、后续进展，还是两件事；拿不准的合并，换一家模型再确认一遍。

**热度**按事件算，不按文章算：48 小时内，每个独立来源只算一次，24 小时减半。重复抓取不会多算，一家媒体发十篇也只算一次，所以排在前面的，是真正有很多人在说的事。

### 速度

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="docs/assets/perf-dark.png">
  <img src="docs/assets/perf-light.png" alt="AIHOT 线上实测：页面中位数 10 毫秒，95% 在 50 毫秒内；接口中位数 6 毫秒，95% 在 12 毫秒内；文章页 95% 在 14 毫秒内" width="100%">
</picture>

## 你会得到什么

| | |
|---|---|
| **六种信源** | RSS、网页列表、JSON 接口、X 账号、微信公众号，以及你自己脚本推送进来的内容。信源分级（官方一手 / 媒体个人），抓取频率按产出自动调整 |
| **精选** | 预筛，同一份评分标准独立打两次分，再按信源分级的门槛决定入选。提示词和门槛全部公开，全部可以改；用你自己标注的样本在 SelectBench 里校准 |
| **写作** | 中文标题、答案先行的摘要、推荐理由、标签，外文全文翻译；防止模型把原文没提到的公司写进标题 |
| **聚簇** | 不同来源报道的同一件事聚成一个事件，后续进展挂在同一个事件下，事件页有综述；人工改过的归属不会被覆盖 |
| **热点** | 按事件算热度：独立来源越多越靠前，X 上的讨论也算进来；和 6 小时前比，涨得快的标上升，新出现的标“新” |
| **日报、周报、月报** | 每天 08:00 出日报，每周一出周报，每月 1 日出月报，按分类分节，带导语 |
| **主题与搜索** | 公司、方向、内容形态三类主题页；标题摘要搜索和全文相关搜索 |
| **给 Agent 用** | RSS（精选、全部、全文、日报）、公开 API、MCP、`llms.txt`，同一份内容给人看也给 Agent 用 |
| **后台** | 信源管理与试抓、内容诊断、精选评测、每一步单独换模型、付费服务的预算熔断、运行记录与告警 |
| **AI 专属模块** | 模型榜（汇总多家公开评测，方法公开）和 Codex 重置监控。别的行业一个开关关掉 |

## 看一眼

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="docs/assets/shots-dark.png">
  <img src="docs/assets/shots-light.png" alt="首页的当前热点与精选，关于页的信源河" width="100%">
</picture>

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="docs/assets/board-dark.png">
  <img src="docs/assets/board-light.png" alt="模型榜" width="100%">
</picture>

<p align="center"><sub>截图来自用示范信源跑起来的本地站，站名是默认的 MyHOT。</sub></p>

## 跑起来

需要 [Docker](https://docs.docker.com/get-docker/)，和一个 OpenAI 兼容的模型 API Key（DeepSeek、千问、智谱都可以）。

```bash
git clone https://github.com/KKKKhazix/AIHOT.git myhot
cd myhot
node scripts/init-env.ts --llm-key <你的模型 API Key>
docker compose up -d --build
```

打开 <http://localhost:3000>。后台在 `/admin`，管理员密码在 `.env` 的 `ADMIN_PASSWORD` 里。一两分钟后开始有内容，第一次导入的资料大约半小时处理完。

机器上没有 Node、服务器在中国大陆、要配域名和 HTTPS，见 [部署](docs/deploy.md)。

## 把它改成你的行业

最省事的办法：打开你的 Agent（Claude Code、Codex 都可以），把这个仓库交给它，然后说：

```text
请读 AGENTS.md 和 docs/customize.md，把这个站改成「法律」行业的热点站。
我关心的是：……（你想盯哪些信源，你觉得什么消息重要、什么不重要，越具体越好）。
```

要改的东西几乎都在 [`industry/`](industry/) 这一个文件夹里，代码基本不用动：

| 文件 | 改什么 |
|---|---|
| `site.ts` | 站名、行业词、首页文案、关于页 |
| `taxonomy.ts`、`topics.json` | 分类、标签、主题 |
| `sources.json` | 首次启动时导入的信源 |
| `prompts/` | 精选标准和写作要求。**你的行业 KnowHow，就写在这里** |
| `selection.ts` | 入选门槛 |
| `features.ts` | 模型榜、Codex 重置监控的开关 |
| `brand/`、`pages/` | 图标、使用规则和隐私说明 |

最值得花时间的是评分标准（`prompts/selection-score.md`）和门槛：拿一两百条你自己标注过的资料，用 `scripts/eval-selection.ts` 跑一遍，看它选得准不准，再回去改。怎么做写在 [精选与校准](docs/selection.md) 里。

## SentinelIntel V2 安防持续研判扩展

在 AIHOT 的采集/精选/归组/出刊流水线之上，SentinelIntel V2 增加了三个**有边界**的 Agent 和一个
统一的公开读取层。确定性工作流仍然是确定性代码；只有语义推理、证据获取与不确定性处理交给 Agent。

| 能力 | 做什么 | 边界 |
|---|---|---|
| Security Research Agent | 抓官方证据（NVD、CISA KEV、厂商公告），给出可追溯结论，把不能确认的留作 unknown | 只能访问 allowlist 来源；工具调用经 capability 与回执 |
| Event Tracking Agent | 长期跟踪一个事件的待解问题，发现厂商确认/补丁/招标等实质变化，决定下次检查时间 | 只写自己的计划与变更，不改 Story/Fact |
| Product Impact Agent | 从官方公告提取厂商、产品、型号、受影响与修复版本、利用状态 | 中等置信度或不支持的版本表达式一律转人工复核，不落自动结论 |
| 公开读取层 | Story 页、API v1、MCP 共用同一份装配结果 | 页面只读数据库；打开页面不触发模型、不回执、不访问外网 |

每个 Agent 的输出都带 Evidence 引用；读者打开一个事件页可以看到研究结论、追踪状态、产品影响与
未知项，而不是一段无法核对的摘要。

### 已复现的能力（不是性能数字）

以下结论来自仓库内冻结数据集与脚本，可离线检查；具体数值请查
**[Evidence registry](docs/evaluation/evidence-registry.md)**（每个数字都标注数据/切分/评分器/限制）：

- **事件追踪**：真实 Python 图的确定性回放（26 例冻结 holdout，fixture 网关，零模型、零网络），
  Phase 8 重新执行后与记录一致 → `REPRODUCIBLE_FINAL`。
- **安全研究**：20 例 holdout 上七项安全闸门全为 0，质量闸门全部达标；重跑需要付费模型调用，因此
  记录为 `REPRODUCIBLE_PARTIAL`。
- **产品影响**：4 例端到端 holdout（v16 关闭闸门）上 13 项安全计数全为 0、5 项质量闸门全部达标；
  重跑需要付费抽取与运行环境，因此记录为 `REPRODUCIBLE_PARTIAL`。
- **精选**：45 例 holdout 的准确率/精确率/召回率/F1 已记录，但其标注由同一模型族完成，重跑需要
  付费调用 → `REPRODUCIBLE_PARTIAL`。
- **事件归组**：240 例基准记录了候选召回、关系分类与 Story 回放结果；模型判定未提交，因此
  记录为 `REPRODUCIBLE_PARTIAL`。

### 标签与限制（请务必读）

- **没有任何 human gold。** 所有冻结标签都是 `MODEL_REVIEWED`：由独立模型复核一致，而不是人工标注。
- 除事件追踪回放外，多数指标的重跑需要付费模型调用；仓库只提交冻结输入、评分器与报告，不提交
  付费运行的结果文件。
- 评测集规模都很小（20–240 例），报告中的比例是点估计，不是生产保证。
- 合成 fixture holdout（产品影响 23 例）已由所有者重新归类为**历史证据**，不是关闭闸门。

### 完整评测与失败案例

| 文档 | 内容 |
|---|---|
| [评测索引](docs/evaluation/evidence-registry.md) | 每个最终数字的来源、分母、评分器、限制与状态 |
| [精选](docs/evaluation/selection.md) · [事件归组](docs/evaluation/event-grouping.md) · [研究](docs/evaluation/research-agent.md) · [追踪](docs/evaluation/tracking-agent.md) · [产品影响](docs/evaluation/product-impact.md) | 五个能力的 canonical 摘要 |
| [Ablations](docs/evaluation/ablations.md) | 哪些比较成立、哪些明确不可比、哪些没有运行 |
| [失败案例](docs/failure-cases.md) | 每个失败的现象、根因、处置与回归验证 |
| [架构](docs/architecture.md) | 两个运行时的边界、Agent、网关、读取层与安全规则 |

## 文档

| 文档 | 内容 |
|---|---|
| [把它改成你的行业](docs/customize.md) | 站名、分类、信源、提示词、门槛、品牌，一步一步来 |
| [信源](docs/sources.md) | 六种信源怎么配，分级和全文，外部推送接口 |
| [精选与校准](docs/selection.md) | 一条资料怎么变成精选，怎么用自己的样本校准 |
| [部署](docs/deploy.md) | Docker、域名和 HTTPS、中国大陆、更新、备份、花多少钱 |
| [架构](docs/architecture.md) | 三个进程、几条不变的规则、目录、对外出口 |
| [模型榜与 Codex 重置监控](docs/leaderboard.md) | 两个 AI 专属模块 |

技术栈：Node.js 24 · TypeScript · React Router（服务端渲染）· Fastify · PostgreSQL · pg-boss · Tailwind CSS · Docker Compose。

## 最后

AIHOT 曾经只是我无数个深夜里，一个很小、很小的念头。

我不知道它会被改成什么样子，会走到多远的地方。但这可能就是开源最浪漫的地方。

剩下的路，就交给你们了。

<p align="right">—— 数字生命卡兹克</p>

## 许可

代码使用 [MIT 许可证](LICENSE)。AIHOT 的名字和 Logo 不在许可范围内。字体、模型厂商和评测来源的标志各有自己的许可和商标归属，见 [NOTICE](NOTICE)。

---

<sub>**In English:** AIHOT ([aihot.news](https://aihot.news)) is an AI news site that collects from many sources, lets a language model filter and score every item twice, writes Chinese headlines and summaries, clusters reports of the same story into one event, ranks events by how many independent sources discuss them, and publishes a daily briefing. This repository is its complete framework, including every prompt and threshold. Hand it to your coding agent with `AGENTS.md` and `docs/customize.md` to turn it into a news site for your own field. The documentation is in Chinese.</sub>
