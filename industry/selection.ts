// 精选的门槛。评分标准本身写在 prompts/selection-score.md；这里只决定“多少分算入选”。
// 每篇资料由评分模型独立打两次分（0–100），两次之和 ≥ 2 × 门槛才进精选，卡片上显示两次的平均分。
// 门槛按信源分级区分：官方一手信源的门槛低一些，媒体和个人的高一些。改了门槛或评分提示词，
// 用 scripts/eval-selection.ts 在你自己标注的样本上重跑一遍，再决定上线（见 docs/selection.md）。
//
// ⚠ UNVALIDATED FOR SECURITY DOMAIN
// 下面这组数字是 AIHOT 在 AI 领域校准出来的，Phase 1 只做了提示词与分类的安防化，**没有**改门槛：
// 目前既没有安防领域的 gold 数据集，也没有获得真实模型调用的成本授权，因此无法运行 SelectBench
// 来校准。在拿到 development 评测与 holdout 结果之前，不得修改这里的数值，也不得对外宣称任何
// 准确率/查准率/查全率结论。见 docs/IMPLEMENTATION_STATUS.md 的 Phase 1 章节。

export const SELECTION = {
  /**
   * 信源分级 → 入选门槛（平均分）。分级在后台“信源”里给每个源设置：
   *   T1 官方一手（官网、官方博客、机构）· T1_5 官方账号、准官方创作者 · T2 媒体与个人
   * 分级 EXCLUDE_MP 以及这里没有列出的分级，不参与精选评分（只进“全部动态”）。
   */
  thresholds: { T1: 60, T1_5: 65, T2: 76 } as Record<string, number>,
  /**
   * 没入选、但平均分高于这个数的资料，也用精选的写法（内容理解：标题、摘要、推荐理由、标签）来写，
   * 其余用更便宜的“标题摘要翻译”。
   */
  understandFloor: 50,
} as const;
