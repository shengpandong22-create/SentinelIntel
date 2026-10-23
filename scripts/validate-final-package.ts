// Phase 8 final-package validator. Offline and read-only by construction: it reads files, computes
// hashes and asks Git for blob ids. It never opens a database, calls a model or touches the network.
//
//   node scripts/validate-final-package.ts            validate (exit 1 on any error)
//   node scripts/validate-final-package.ts --write    regenerate docs/evaluation/evidence-registry.md
//
// The registry JSON is the single source of truth for every final number; its Markdown rendering is
// generated here and compared, so the two can never drift silently.
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { z } from "zod";

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const BASE_COMMIT = "6cdac54";
const REGISTRY_JSON = "docs/evaluation/evidence-registry.json";
const REGISTRY_MD = "docs/evaluation/evidence-registry.md";

export const STATUSES = [
  "REPRODUCIBLE_FINAL",
  "REPRODUCIBLE_PARTIAL",
  "HISTORICAL_ONLY",
  "NOT_COMPARABLE",
  "NOT_RECORDED",
  "REQUIRES_NEW_RUN",
] as const;

/** The nine paths the migration specification requires before Phase 8 may close. */
export const REQUIRED_FILES = [
  "docs/evaluation/selection.md",
  "docs/evaluation/event-grouping.md",
  "docs/evaluation/research-agent.md",
  "docs/evaluation/tracking-agent.md",
  "docs/evaluation/product-impact.md",
  "docs/evaluation/ablations.md",
  "docs/failure-cases.md",
  "docs/architecture.md",
  "README.md",
] as const;

/** Frozen evaluation artifacts: their Git blobs must be identical to the Phase 8 base commit. */
export const FROZEN_ARTIFACTS = [
  "datasets/selection/candidates.jsonl",
  "datasets/selection/tier-calibration.jsonl",
  "datasets/event-relations/dev.jsonl",
  "datasets/event-relations/holdout.jsonl",
  "datasets/security-research/holdout-v4.jsonl",
  "datasets/security-research/thresholds-v4.json",
  "datasets/event-tracking/holdout.jsonl",
  "datasets/event-tracking/thresholds.json",
  "datasets/impact/holdout.jsonl",
  "datasets/impact/thresholds.json",
  "datasets/impact/e2e-holdout-v16.jsonl",
  "datasets/impact/e2e-holdout-v16-candidate.jsonl",
  "datasets/impact/e2e-holdout-v16-evidence.jsonl",
  "datasets/impact/thresholds-v2.json",
] as const;

const EntrySchema = z.object({
  id: z.string().regex(/^[A-Z0-9-]+$/),
  capability: z.enum(["selection", "event-grouping", "research-agent", "tracking-agent", "product-impact", "agent-system"]),
  metric: z.string().min(3),
  value: z.union([z.number(), z.string(), z.null()]),
  numerator: z.number().nullable(),
  denominator: z.number().nullable(),
  denominator_note: z.string().optional(),
  dataset: z.string().nullable(),
  split: z.string().nullable(),
  dataset_sha256: z.string().regex(/^[0-9a-f]{64}$/).nullable(),
  scorer: z.string().nullable(),
  thresholds: z.string().nullable(),
  label_method: z.enum(["MODEL_REVIEWED", "MODEL_SINGLE_FAMILY", "SYNTHETIC_FIXTURE", "NONE"]),
  human_gold: z.boolean(),
  reviewers: z.array(z.string()),
  source_report: z.string().min(3),
  reproduction: z.string().min(3),
  system_boundary: z.string().min(3),
  limitations: z.array(z.string()).min(1),
  status: z.enum(STATUSES),
}).strict();

const RegistrySchema = z.object({
  schema_version: z.literal(1),
  base_commit: z.string(),
  base_commit_subject: z.string(),
  audited_at: z.string(),
  scope: z.string(),
  status_definitions: z.record(z.string(), z.string()),
  label_methods: z.record(z.string(), z.string()),
  entries: z.array(EntrySchema).min(20),
  gate3_proposals: z.array(z.object({
    id: z.string(), target_entries: z.array(z.string()), status: z.literal("NOT_AUTHORIZED"),
    dataset: z.string(), split: z.string(), scorer: z.string(), model_provider: z.string(),
    expected_calls: z.string(), budget_ceiling: z.string(), success_criterion: z.string(),
    stop_rule: z.string(), blocking_note: z.string(), recommended: z.boolean(),
  }).strict()),
}).strict();

export type Registry = z.infer<typeof RegistrySchema>;
export type RegistryEntry = z.infer<typeof EntrySchema>;

export function loadRegistry(root = REPO_ROOT): Registry {
  return RegistrySchema.parse(JSON.parse(readFileSync(path.join(root, REGISTRY_JSON), "utf8")));
}

const statusLabel: Record<(typeof STATUSES)[number], string> = {
  REPRODUCIBLE_FINAL: "可离线复现（最终）",
  REPRODUCIBLE_PARTIAL: "可复现（部分：需付费重跑）",
  HISTORICAL_ONLY: "仅历史证据",
  NOT_COMPARABLE: "不可比较",
  NOT_RECORDED: "未记录",
  REQUIRES_NEW_RUN: "需新运行",
};

/** Deterministic Markdown rendering of the registry. */
export function renderRegistryMarkdown(registry: Registry): string {
  const lines: string[] = [
    "# Evidence registry — every final number and its provenance",
    "",
    "<!-- GENERATED FILE. Edit docs/evaluation/evidence-registry.json and run `node scripts/validate-final-package.ts --write`. -->",
    "",
    `Base: \`${registry.base_commit}\` — ${registry.base_commit_subject}. Audited ${registry.audited_at}.`,
    "",
    registry.scope,
    "",
    "## Status vocabulary",
    "",
    "| Status | Meaning |",
    "|---|---|",
    ...STATUSES.map((status) => `| \`${status}\` | ${statusLabel[status]} — ${registry.status_definitions[status] ?? ""} |`),
    "",
    `## Entries (${registry.entries.length})`,
    "",
    "| ID | Capability | Metric | Value | n / d | Dataset (split) | Label | Status |",
    "|---|---|---|---|---|---|---|---|",
    ...registry.entries.map((entry) => {
      const ratio = entry.numerator === null && entry.denominator === null
        ? (entry.denominator_note ? "见脚注" : "—")
        : `${entry.numerator ?? "—"} / ${entry.denominator ?? "—"}`;
      const dataset = entry.dataset ? `\`${entry.dataset}\` (${entry.split ?? "—"})` : "—";
      return `| \`${entry.id}\` | ${entry.capability} | ${entry.metric} | ${entry.value === null ? "—" : String(entry.value)} | ${ratio} | ${dataset} | ${entry.label_method} | ${entry.status} |`;
    }),
    "",
    "## Entry detail",
    "",
  ];
  for (const entry of registry.entries) {
    lines.push(
      `### \`${entry.id}\` — ${entry.metric}`,
      "",
      `- **Status**: \`${entry.status}\` (${statusLabel[entry.status]})`,
      `- **Value**: ${entry.value === null ? "not recorded" : String(entry.value)}`,
      `- **Numerator / denominator**: ${entry.numerator ?? "—"} / ${entry.denominator ?? "—"}${entry.denominator_note ? ` — ${entry.denominator_note}` : ""}`,
      `- **Dataset**: ${entry.dataset ? `\`${entry.dataset}\`` : "—"}${entry.split ? ` (${entry.split})` : ""}${entry.dataset_sha256 ? `, sha256 \`${entry.dataset_sha256}\`` : ""}`,
      `- **Scorer**: ${entry.scorer ?? "—"}`,
      `- **Thresholds**: ${entry.thresholds ?? "—"}`,
      `- **Labels**: ${entry.label_method}, humanGold=${entry.human_gold}${entry.reviewers.length ? `, reviewers: ${entry.reviewers.join(", ")}` : ""}`,
      `- **Source report**: \`${entry.source_report}\``,
      `- **Reproduction**: ${entry.reproduction}`,
      `- **System boundary**: ${entry.system_boundary}`,
      `- **Limitations**: ${entry.limitations.join(" ")}`,
      "",
    );
  }
  lines.push("## Gate 3 proposals (not authorized, not results)", "");
  if (registry.gate3_proposals.length === 0) lines.push("None.");
  for (const proposal of registry.gate3_proposals) {
    lines.push(
      `### \`${proposal.id}\` — ${proposal.status}`,
      "",
      `- **Target entries**: ${proposal.target_entries.map((id) => `\`${id}\``).join(", ")}`,
      `- **Dataset / split**: \`${proposal.dataset}\` (${proposal.split})`,
      `- **Scorer**: ${proposal.scorer}`,
      `- **Model / provider**: ${proposal.model_provider}`,
      `- **Expected calls**: ${proposal.expected_calls}`,
      `- **Budget ceiling**: ${proposal.budget_ceiling}`,
      `- **Success criterion**: ${proposal.success_criterion}`,
      `- **Stop rule**: ${proposal.stop_rule}`,
      `- **Blocking note**: ${proposal.blocking_note}`,
      `- **Recommended now**: ${proposal.recommended}`,
      "",
    );
  }
  return `${lines.join("\n").trimEnd()}\n`;
}

function gitBlobId(root: string, rev: string): string {
  return execFileSync("git", ["rev-parse", `${rev}`], { cwd: root, encoding: "utf8" }).trim();
}

/** Git blob id of the working-tree file (CRLF-safe: applies the same filters `git add` would). */
function worktreeBlobId(root: string, file: string): string {
  return execFileSync("git", ["hash-object", file], { cwd: root, encoding: "utf8" }).trim();
}

function baseBlobId(root: string, file: string): string {
  return gitBlobId(root, `${BASE_COMMIT}:${file}`);
}

// A paragraph may mention human labelling only while negating it ("not human gold", "never
// presented as human-labelled", "humanGold is false", "human gold remains deferred"). The scan is
// per paragraph, not per line, because these documents wrap sentences across lines.
const NEGATION = /(?:\bnot\b|\bnever\b|\bno\b|\bfalse\b|\bwithout\b|\bdeferred\b|\bremain(?:s|ing)?\b|不是|不代表|无法|没有任何|非\s*human)/i;

/** Phrases that must never appear as an affirmative claim (MODEL_REVIEWED is not human gold). */
const FORBIDDEN_PARAGRAPH: Array<{ pattern: RegExp; message: string }> = [
  { pattern: /human[\s-]?(?:labell?ed|annotated|adjudicated)/i, message: "claims human labelling; the labels are MODEL_REVIEWED" },
  { pattern: /人工标注金标准|人工金标准|human[\s-]?gold/i, message: "claims human gold" },
  { pattern: /(?:提升|improv\w*)\s*(?:到|至|from)[^\n]{0,80}?\d+(?:\.\d+)?\s*[%％]/i, message: "unqualified improvement percentage" },
  { pattern: /\d+(?:\.\d+)?\s*[%％]\s*(?:提升|improv\w*)/i, message: "unqualified improvement percentage" },
];

/** Scan prose for prohibited claim wording, allowing explicit negations in the same paragraph. */
export function scanProhibitedWording(file: string, text: string): string[] {
  const problems: string[] = [];
  const lines = text.split(/\r?\n/);
  let start = 0;
  const check = (from: number, to: number) => {
    const paragraph = lines.slice(from, to).join("\n");
    if (!paragraph.trim()) return;
    for (const rule of FORBIDDEN_PARAGRAPH) {
      if (rule.pattern.test(paragraph) && !NEGATION.test(paragraph)) {
        const lineIndex = lines.slice(from, to).findIndex((line) => rule.pattern.test(line));
        problems.push(`${file}:${from + (lineIndex < 0 ? 0 : lineIndex) + 1}: ${rule.message}: ${paragraph.replace(/\s+/g, " ").trim().slice(0, 140)}`);
      }
    }
  };
  lines.forEach((line, index) => {
    if (line.trim() === "") {
      if (index > start) check(start, index);
      start = index + 1;
    }
  });
  if (start < lines.length) check(start, lines.length);
  return problems;
}

/** Relative Markdown links must resolve to a file in the repository. */
export function checkMarkdownLinks(root: string, file: string, text: string): string[] {
  const problems: string[] = [];
  for (const match of text.matchAll(/\]\(([^)\s]+)\)/g)) {
    const target = match[1]!;
    if (/^(https?:|mailto:|#)/.test(target)) continue;
    const clean = target.split("#")[0]!;
    if (!clean) continue;
    const resolved = path.resolve(path.dirname(path.join(root, file)), clean);
    if (!existsSync(resolved)) problems.push(`${file}: broken internal link -> ${target}`);
  }
  return problems;
}

/** Numbers quoted in the README must be traceable to a registry entry. */
export function checkReadmeNumbers(registryText: string, readme: string): string[] {
  const problems: string[] = [];
  // HTML attributes (width="100%") are markup, not claims.
  const prose = readme.replace(/<[^>]+>/g, " ");
  const numeric = /(?<![\w.])(\d{1,3}(?:\.\d+)?)\s*(?:%|％|×)/g;
  for (const match of prose.matchAll(numeric)) {
    const token = match[1]!;
    if (!registryText.includes(token)) problems.push(`README quotes "${token}" (with a percent/ratio unit) but the registry never mentions it`);
  }
  return problems;
}

export interface ValidationResult {
  errors: string[];
  warnings: string[];
  summary: { entries: number; byStatus: Record<string, number>; requiredFiles: number; frozenArtifacts: number };
}

export function validateRepository(root = REPO_ROOT): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  // 1. Required outputs.
  for (const file of REQUIRED_FILES) {
    if (!existsSync(path.join(root, file))) errors.push(`required file missing: ${file}`);
  }

  // 2. Registry schema + Markdown consistency.
  let registry: Registry;
  try {
    registry = loadRegistry(root);
  } catch (error) {
    return { errors: [...errors, `evidence registry does not parse: ${(error as Error).message}`], warnings, summary: { entries: 0, byStatus: {}, requiredFiles: REQUIRED_FILES.length, frozenArtifacts: FROZEN_ARTIFACTS.length } };
  }
  const expectedMarkdown = renderRegistryMarkdown(registry);
  const committedMarkdownPath = path.join(root, REGISTRY_MD);
  if (!existsSync(committedMarkdownPath)) errors.push(`registry Markdown missing: ${REGISTRY_MD} (run --write)`);
  else if (readFileSync(committedMarkdownPath, "utf8") !== expectedMarkdown) errors.push(`${REGISTRY_MD} is out of sync with the JSON registry (run --write)`);
  if (registry.base_commit !== BASE_COMMIT) errors.push(`registry base_commit ${registry.base_commit} != ${BASE_COMMIT}`);

  const ids = new Set<string>();
  for (const entry of registry.entries) {
    if (ids.has(entry.id)) errors.push(`duplicate registry id: ${entry.id}`);
    ids.add(entry.id);
    if (entry.human_gold) errors.push(`${entry.id}: human_gold must be false (no human adjudication exists)`);
    if (entry.value !== null && entry.denominator === null && !entry.denominator_note) {
      errors.push(`${entry.id}: a recorded value needs a denominator or a denominator_note`);
    }
    if (entry.dataset && !entry.dataset.startsWith(".data/") && !existsSync(path.join(root, entry.dataset))) {
      errors.push(`${entry.id}: dataset path does not exist: ${entry.dataset}`);
    }
    if (entry.dataset?.startsWith(".data/")) {
      warnings.push(`${entry.id}: dataset lives outside Git (${entry.dataset}); treated as development evidence only`);
    }
  }
  for (const proposal of registry.gate3_proposals) {
    for (const target of proposal.target_entries) {
      if (!ids.has(target)) errors.push(`${proposal.id}: unknown target entry ${target}`);
    }
  }

  // 3. Reports referenced by the registry exist.
  for (const entry of registry.entries) {
    const file = entry.source_report.split("#")[0]!;
    if (!existsSync(path.join(root, file))) errors.push(`${entry.id}: source report missing: ${file}`);
  }

  // 4. Frozen artifacts unchanged vs the base commit.
  for (const artifact of FROZEN_ARTIFACTS) {
    if (!existsSync(path.join(root, artifact))) {
      errors.push(`frozen artifact missing: ${artifact}`);
      continue;
    }
    let base: string;
    try {
      base = baseBlobId(root, artifact);
    } catch {
      errors.push(`frozen artifact absent from ${BASE_COMMIT}: ${artifact}`);
      continue;
    }
    const current = worktreeBlobId(root, artifact);
    if (base !== current) errors.push(`frozen artifact changed since ${BASE_COMMIT}: ${artifact} (${base} != ${current})`);
  }

  // 5. Canonical summaries: one final gate per capability, and honest wording.
  const CAPABILITY_SUMMARIES = new Set([
    "docs/evaluation/selection.md",
    "docs/evaluation/event-grouping.md",
    "docs/evaluation/research-agent.md",
    "docs/evaluation/tracking-agent.md",
    "docs/evaluation/product-impact.md",
  ]);
  for (const file of REQUIRED_FILES) {
    const full = path.join(root, file);
    if (!existsSync(full)) continue;
    const text = readFileSync(full, "utf8");
    errors.push(...checkMarkdownLinks(root, file, text));
    if (CAPABILITY_SUMMARIES.has(file)) {
      const gates = [...text.matchAll(/^\*\*Final gate:\*\*/gm)].length;
      if (gates !== 1) errors.push(`${file}: expected exactly one "**Final gate:**" line, found ${gates}`);
    }
    if (/evaluation|README|architecture|failure/.test(file) || file === "README.md") {
      errors.push(...scanProhibitedWording(file, text));
    }
  }
  errors.push(...scanProhibitedWording("README.md", existsSync(path.join(root, "README.md")) ? readFileSync(path.join(root, "README.md"), "utf8") : ""));

  // 6. README numbers map to the registry.
  if (existsSync(path.join(root, "README.md"))) {
    errors.push(...checkReadmeNumbers(JSON.stringify(registry), readFileSync(path.join(root, "README.md"), "utf8")));
  }

  const byStatus: Record<string, number> = {};
  for (const entry of registry.entries) byStatus[entry.status] = (byStatus[entry.status] ?? 0) + 1;
  return {
    errors: [...new Set(errors)],
    warnings: [...new Set(warnings)],
    summary: { entries: registry.entries.length, byStatus, requiredFiles: REQUIRED_FILES.length, frozenArtifacts: FROZEN_ARTIFACTS.length },
  };
}

async function main(argv: string[]): Promise<void> {
  if (argv.includes("--write")) {
    const registry = loadRegistry(REPO_ROOT);
    writeFileSync(path.join(REPO_ROOT, REGISTRY_MD), renderRegistryMarkdown(registry));
    process.stdout.write(`${JSON.stringify({ ok: true, wrote: REGISTRY_MD, entries: registry.entries.length })}\n`);
    return;
  }
  const result = validateRepository();
  process.stdout.write(`${JSON.stringify({ ok: result.errors.length === 0, ...result }, null, 2)}\n`);
  if (result.errors.length > 0) process.exitCode = 1;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main(process.argv.slice(2));
}
