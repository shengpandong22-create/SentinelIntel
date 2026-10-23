// Phase 7 Eval Results admin view: a read-only record of the evaluation conclusions already
// committed under docs/evaluation/. It computes nothing and runs nothing — no metric is generated
// here, and MODEL_REVIEWED labels are never described as human gold. When a new evaluation record
// lands in the repository, add it here so the admin page stays the index of reproducible results.
export interface EvalRecord {
  phase: string;
  title: string;
  status: string;
  doc: string;
  recorded: string[];
  limitations: string[];
}

const RECORDS: EvalRecord[] = [
  {
    phase: "Phase 1",
    title: "安全精选评测（SelectBench）",
    status: "ACCEPTED_WITH_LIMITATIONS（非 human gold）",
    doc: "docs/evaluation/selection.md",
    recorded: ["冻结门槛：T1 = 32 / T1_5 = 55 / T2 = 60", "开发集与门槛扫描结论以本地运行报告为准"],
    limitations: ["标签为模型复核/作者裁定，不是人工标注 gold", "50 条外部 web 样本无 URL 可追溯"],
  },
  {
    phase: "Phase 2",
    title: "安全事件归组基准",
    status: "MODEL_REVIEWED holdout baseline（非 human gold）",
    doc: "docs/evaluation/event-grouping-baseline.md",
    recorded: ["冻结数据集 240 例：development 180 / holdout 60", "holdout 标签为至少三个独立模型的一致 high-confidence 复核"],
    limitations: ["humanGold = false", "recall 分支仅测量词法召回（环境限制）"],
  },
  {
    phase: "Phase 4",
    title: "Security Research Agent 最终基线",
    status: "PASSED — 冻结 MODEL_REVIEWED holdout（非 human gold）",
    doc: "docs/evaluation/security-research-baseline-v4.md",
    recorded: ["holdout：datasets/security-research/holdout-v4.jsonl，20 例，覆盖全部六个 stratum", "SHA-256：ffb0ebafbb3185ec88c661c53c2275c4889476d6ee56a1f4fa3ebbe9d66a8df2"],
    limitations: ["标签为 MODEL_REVIEWED", "更早版本（v1-v3）基线保留为历史记录"],
  },
  {
    phase: "Phase 5",
    title: "Event Tracking Agent holdout 基线",
    status: "PASSED — 单次授权最终运行（MODEL_REVIEWED）",
    doc: "docs/evaluation/event-tracking-baseline.md",
    recorded: ["datasets/event-tracking/holdout.jsonl，26 例", "SHA-256：a5c6be8218d7af23ffe5b210fd1dddf5162cced8ad24cd4e1d20b0289a78ccea"],
    limitations: ["标签为 MODEL_REVIEWED", "数据集自此不可变"],
  },
  {
    phase: "Phase 6",
    title: "Product Impact Agent 端到端闸门（v16）",
    status: "PASSED — 关闭闸门（MODEL_REVIEWED）",
    doc: "docs/evaluation/impact-e2e-baseline.md",
    recorded: ["v16 单次授权运行：13 项安全计数为 0，5 项质量指标 1.0，row recall 分母非零", "holdout 冻结 SHA-256：a679b11e04a9135a5f69b5eede5a592f96f9efe30f63fddca947db232234a4c5"],
    limitations: ["标签为 MODEL_REVIEWED，不是 human gold", "v8 为已消费的 E2E 安全运行，不是关闭闸门", "v9/v10 按所有者裁定不是闸门，案例不得复用", "合成归一化夹具（23 例）只覆盖冻结草稿→归一化→路由半段"],
  },
];

/** The recorded evaluation conclusions. Static: no query, no metric computation. */
export function evalResults(): { records: EvalRecord[]; note: string } {
  return {
    records: RECORDS,
    note: "以上均为仓库已提交、可复现的评测结论；MODEL_REVIEWED 表示标签由多个独立模型复核一致，不代表人工标注金标准。本页面不生成新指标。",
  };
}
