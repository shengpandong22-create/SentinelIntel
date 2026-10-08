// Phase 2 security event-grouping benchmark. The frozen dataset is always validated before a stage
// runs. Relation evaluation calls the unchanged production batch judge and therefore requires both
// MODEL_CALLS_ENABLED=true and --allow-paid. Recall and end-to-end stages are intentionally gated
// until their scratch-database fixtures are implemented.
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { parseArgs } from "node:util";
import { config, REPO_ROOT } from "@aihot/backend/config";
import { closeDb, sql } from "@aihot/backend/db";
import {
  CONFIRM_BELOW_COSINE, GROUP_PROMPT_VERSION, RECALL_DAYS, RECALL_MIN_COSINE, RECALL_TOP_FACTS, confirmMerge, judgeBatch,
} from "@aihot/backend/events/group";
import { RELATE_PROMPT_VERSION } from "@aihot/backend/events/relate";
import { completeReceipt } from "@aihot/backend/providers/receipts";
import {
  parseEventRelationJsonl, recallMetrics, relationMetricViews, storyPairMetrics, toCandidateView, toReportView, validateEventRelationDataset,
  type EventRelationCase, type RelationPrediction,
} from "./event-grouping-eval-core.ts";
import { endToEndDatasetFixture, recallFixture, sameUrlDiagnostic } from "./event-grouping-eval-fixture.ts";
import { receiptUsage } from "./event-grouping-eval-receipts.ts";

const { values } = parseArgs({ options: {
  gold: { type: "string", multiple: true }, split: { type: "string", default: "development" },
  n: { type: "string" }, seed: { type: "string", default: "7" },
  stage: { type: "string", default: "relation" }, label: { type: "string" }, models: { type: "string" },
  "no-import": { type: "boolean", default: false }, out: { type: "string" },
  "allow-paid": { type: "boolean", default: false },
} });

function positiveInt(value: string | undefined, name: string): number | undefined {
  if (value === undefined) return undefined;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) throw new Error(`--${name} must be a positive integer`);
  return parsed;
}
function rng(seed: number) {
  let state = seed >>> 0;
  return () => ((state = (state * 1664525 + 1013904223) >>> 0) / 2 ** 32);
}
function sample(rows: EventRelationCase[], n: number | undefined, seed: number): EventRelationCase[] {
  if (n === undefined || n >= rows.length) return rows;
  const random = rng(seed);
  return rows.map((row) => ({ row, key: random() })).sort((a, b) => a.key - b.key).slice(0, n).map(({ row }) => row);
}
function safeName(value: string): string {
  return value.trim().replace(/[^A-Za-z0-9_-]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 80) || "all";
}

const goldPaths = values.gold?.length
  ? values.gold
  : ["datasets/event-relations/dev.jsonl", "datasets/event-relations/holdout.jsonl"];
const rows = goldPaths.flatMap((file) => parseEventRelationJsonl(readFileSync(path.resolve(REPO_ROOT, file), "utf8")));
const canonicalFiles = !values.gold?.length;
validateEventRelationDataset(rows, { frozen: canonicalFiles });

if (!["development", "holdout", "all"].includes(values.split!)) throw new Error("--split must be development, holdout, or all");
const splitRows = values.split === "all" ? rows : rows.filter((row) => row.split === values.split);
const seed = Number(values.seed);
if (!Number.isInteger(seed)) throw new Error("--seed must be an integer");
const selected = sample(splitRows, positiveInt(values.n, "n"), seed);
if (!selected.length) throw new Error(`no cases for split ${values.split}`);

if (values.stage === "validate") {
  console.log(JSON.stringify({ valid: true, files: goldPaths, cases: rows.length, selected: selected.length, split: values.split }));
  process.exitCode = 0;
} else if (values.stage === "relation") {
  if (!values["allow-paid"] || !config.modelCallsEnabled) {
    throw new Error("relation evaluation can spend model budget; set MODEL_CALLS_ENABLED=true and pass --allow-paid explicitly");
  }
  if (values.models) throw new Error("--models is reserved for a later comparison mode; the Phase 2 baseline must use production modelFor('group')");
  const predictions: RelationPrediction[] = [];
  const cases: Array<Record<string, unknown>> = [];
  const receiptIds: number[] = [];
  const labelSources: Record<string, number> = {};
  const labelReviewers: Record<string, number> = {};
  const started = Date.now();
  try {
    for (const row of selected) {
      const candidates = row.candidates.map(toCandidateView);
      const result = await judgeBatch(`eval:${row.caseId}`, toReportView(row.query), candidates);
      receiptIds.push(result.receiptId);
      await completeReceipt(sql, result.receiptId);
      const decisions = new Map([...result.verdicts.entries()]);
      for (const [index, candidate] of row.candidates.entries()) {
        const predicted = decisions.get(index + 1)!;
        predictions.push({ gold: candidate.gold.relation, predicted: predicted.relation, isDistractor: candidate.isDistractor });
        labelSources[candidate.annotation.labelSource] = (labelSources[candidate.annotation.labelSource] ?? 0) + 1;
        for (const reviewer of candidate.annotation.reviewers) labelReviewers[reviewer] = (labelReviewers[reviewer] ?? 0) + 1;
        cases.push({ caseId: row.caseId, reportId: candidate.reportId, stratum: row.samplingStratum, gold: candidate.gold.relation,
          predicted: predicted.relation, confidence: predicted.confidence, note: predicted.note, isDistractor: candidate.isDistractor,
          labelSource: candidate.annotation.labelSource, humanAdjudicated: candidate.annotation.humanAdjudicated,
          reviewers: candidate.annotation.reviewers, receiptId: result.receiptId });
      }
    }
    const report = {
      meta: { split: values.split, n: selected.length, seed, label: values.label ?? null, createdAt: new Date().toISOString(),
        promptVersion: RELATE_PROMPT_VERSION, groupPromptVersion: GROUP_PROMPT_VERSION,
        recall: { days: RECALL_DAYS, minCosine: RECALL_MIN_COSINE, topFacts: RECALL_TOP_FACTS, confirmBelowCosine: CONFIRM_BELOW_COSINE },
        labelSources, labelReviewers, humanGold: selected.every((row) => row.candidates.every((candidate) => candidate.annotation.humanAdjudicated)),
        receiptIds, usage: await receiptUsage(receiptIds), wallSeconds: Math.round((Date.now() - started) / 1000) },
      relation: relationMetricViews(predictions), cases,
    };
    const outDir = path.resolve(REPO_ROOT, values.out ? path.dirname(values.out) : ".data/eval");
    mkdirSync(outDir, { recursive: true });
    const file = values.out
      ? path.resolve(REPO_ROOT, values.out)
      : path.join(outDir, `event-grouping-${safeName(values.split!)}-${selected.length}-${Date.now()}.json`);
    writeFileSync(file, JSON.stringify(report, null, 2));
    console.log(JSON.stringify(report.relation));
    console.log(`report: ${file}`);
  } finally {
    await closeDb();
  }
} else if (values.stage === "recall") {
  const started = Date.now();
  try {
    const observations = [];
    for (const row of selected) observations.push(await recallFixture(row));
    const report = {
      meta: { split: values.split, n: selected.length, seed, createdAt: new Date().toISOString(),
        recall: { days: RECALL_DAYS, minCosine: RECALL_MIN_COSINE, topFacts: RECALL_TOP_FACTS },
        wallSeconds: Math.round((Date.now() - started) / 1000) },
      recall: recallMetrics(observations), sameUrlDiagnostic: await sameUrlDiagnostic(), cases: observations,
    };
    const outDir = path.resolve(REPO_ROOT, values.out ? path.dirname(values.out) : ".data/eval");
    mkdirSync(outDir, { recursive: true });
    const file = values.out ? path.resolve(REPO_ROOT, values.out)
      : path.join(outDir, `event-grouping-recall-${safeName(values.split!)}-${selected.length}-${Date.now()}.json`);
    writeFileSync(file, JSON.stringify(report, null, 2));
    console.log(JSON.stringify(report.recall));
    console.log(`report: ${file}`);
  } finally {
    await closeDb();
  }
} else if (values.stage === "pair-diagnostic") {
  if (!values["allow-paid"] || !config.modelCallsEnabled) {
    throw new Error("pair diagnostics can spend model budget; set MODEL_CALLS_ENABLED=true and pass --allow-paid explicitly");
  }
  const receiptIds: number[] = [];
  const cases: Array<Record<string, unknown>> = [];
  try {
    for (const row of selected) {
      const recall = await recallFixture(row);
      const candidates = row.candidates.map((candidate, index) => ({
        ...toCandidateView(candidate, index), score: recall.scores?.[candidate.reportId] ?? 0,
      }));
      const batch = await judgeBatch(`eval:${row.caseId}`, toReportView(row.query), candidates);
      receiptIds.push(batch.receiptId);
      await completeReceipt(sql, batch.receiptId);
      for (const [index, candidate] of candidates.entries()) {
        const verdict = batch.verdicts.get(candidate.factId)!;
        if (verdict.relation !== "SAME_OCCURRENCE" || candidate.score >= CONFIRM_BELOW_COSINE) continue;
        const pair = await confirmMerge(`eval:${row.caseId}`, toReportView(row.query), candidate);
        receiptIds.push(pair.receiptId);
        await completeReceipt(sql, pair.receiptId);
        cases.push({ caseId: row.caseId, reportId: row.candidates[index]!.reportId, recallScore: candidate.score,
          batchRelation: verdict.relation, batchConfidence: verdict.confidence, confirmation: pair.relation, receiptId: pair.receiptId });
      }
    }
    const report = { meta: { split: values.split, n: selected.length, seed, threshold: CONFIRM_BELOW_COSINE,
      promptVersion: RELATE_PROMPT_VERSION, receiptIds, usage: await receiptUsage(receiptIds), createdAt: new Date().toISOString() }, cases };
    const outDir = path.resolve(REPO_ROOT, values.out ? path.dirname(values.out) : ".data/eval");
    mkdirSync(outDir, { recursive: true });
    const file = values.out ? path.resolve(REPO_ROOT, values.out)
      : path.join(outDir, `event-grouping-pair-diagnostic-${safeName(values.split!)}-${selected.length}-${Date.now()}.json`);
    writeFileSync(file, JSON.stringify(report, null, 2));
    console.log(`report: ${file}`);
  } finally { await closeDb(); }
} else if (values.stage === "end-to-end") {
  if (!values["allow-paid"] || !config.modelCallsEnabled) {
    throw new Error("end-to-end evaluation can spend model budget; set MODEL_CALLS_ENABLED=true and pass --allow-paid explicitly");
  }
  try {
    const replay = await endToEndDatasetFixture(selected);
    const metrics = storyPairMetrics(replay.assignments, new Set(replay.excludedPairs));
    const { tp, fp, fn } = metrics;
    const precision = tp / Math.max(1, tp + fp), recall = tp / Math.max(1, tp + fn);
    const report = { meta: { split: values.split, n: selected.length, seed, promptVersion: RELATE_PROMPT_VERSION,
      receiptIds: [...new Set(replay.receiptIds)], usage: await receiptUsage(replay.receiptIds), createdAt: new Date().toISOString() },
      story: { tp, fp, fn, precision: +precision.toFixed(3), recall: +recall.toFixed(3),
        f1: +((2 * precision * recall) / Math.max(1e-9, precision + recall)).toFixed(3),
        falseMerges: metrics.falseMerges, falseSplits: metrics.falseSplits },
      verdictDistribution: Object.fromEntries([...new Set(replay.verdicts.map((row) => row.verdict))].map((verdict) => [verdict, replay.verdicts.filter((row) => row.verdict === verdict).length])),
      assignments: replay.assignments, excludedPairs: replay.excludedPairs, verdicts: replay.verdicts };
    const outDir = path.resolve(REPO_ROOT, values.out ? path.dirname(values.out) : ".data/eval");
    mkdirSync(outDir, { recursive: true });
    const file = values.out ? path.resolve(REPO_ROOT, values.out)
      : path.join(outDir, `event-grouping-end-to-end-${safeName(values.split!)}-${selected.length}-${Date.now()}.json`);
    writeFileSync(file, JSON.stringify(report, null, 2));
    console.log(JSON.stringify(report.story));
    console.log(`report: ${file}`);
  } finally { await closeDb(); }
} else if (values.stage === "all") {
  throw new Error(`${values.stage} stage is not implemented yet; no model call or grouping write was made`);
} else {
  throw new Error("--stage must be validate, relation, recall, pair-diagnostic, end-to-end, or all");
}
