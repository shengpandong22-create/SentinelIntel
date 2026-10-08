import { RELATIONS, type CandidateView, type Relation, type ReportView } from "@aihot/backend/events/relate";

export const EVENT_RELATION_SPLITS = ["development", "holdout"] as const;
export type EventRelationSplit = (typeof EVENT_RELATION_SPLITS)[number];
export const ANNOTATION_STATUSES = ["decisive", "disputed", "insufficient"] as const;
export const LABEL_SOURCES = ["human", "model-proposed", "model-reviewed"] as const;
export const ANNOTATION_CONFIDENCES = ["high", "medium", "low"] as const;
export const RECALL_DAYS = 14;

export interface EventIdentity { eventKey: string; storyKey: string }
export interface EventFrame { subject: string | null; action: string | null; object: string | null; occurredAt: string | null }
export interface BenchmarkReport {
  reportId: string;
  title: string;
  summary: string | null;
  sourceName: string;
  firstParty: boolean;
  publishedAt: string | null;
  ingestedAt: string;
  frame: EventFrame | null;
  splitGroupId: string;
  identity: EventIdentity;
}
export interface BenchmarkCandidate extends BenchmarkReport {
  factTitle: string;
  members: number;
  isDistractor: boolean;
  expectedInRecall: boolean;
  gold: { relation: Relation };
  annotation: {
    status: (typeof ANNOTATION_STATUSES)[number];
    labelSource: (typeof LABEL_SOURCES)[number];
    humanAdjudicated: boolean;
    labeller: string;
    confidence: (typeof ANNOTATION_CONFIDENCES)[number];
    adjudicator: string | null;
    reviewers: string[];
    sourceUrls: string[];
    note: string;
  };
}
export interface EventRelationCase {
  caseId: string;
  split: EventRelationSplit;
  samplingStratum: string;
  query: BenchmarkReport;
  candidates: BenchmarkCandidate[];
  construction?: { assembledAt?: string; assembledBy?: string; distractorSeed?: number; note?: string };
}

export const FROZEN_ALLOCATION = {
  "disclosure-vs-vendor-confirmation": { relation: "SAME_OCCURRENCE", development: 13, holdout: 3 },
  "disclosure-vs-patch": { relation: "SAME_STORY", development: 11, holdout: 3 },
  "poc-vs-disclosure": { relation: "SAME_STORY", development: 7, holdout: 3 },
  "same-cve-multi-vendor-product": { relation: "SAME_OCCURRENCE", development: 11, holdout: 3 },
  "same-vendor-different-cve": { relation: "UNRELATED", development: 19, holdout: 3 },
  "same-model-different-vulnerability": { relation: "UNRELATED", development: 11, holdout: 3 },
  "procurement-notice-vs-award": { relation: "SAME_STORY", development: 7, holdout: 3 },
  "policy-draft-vs-final": { relation: "SAME_STORY", development: 5, holdout: 3 },
  "same-cve-cross-source-different-url": { relation: "SAME_OCCURRENCE", development: 21, holdout: 9 },
  "advisory-republished-by-cert": { relation: "SAME_OCCURRENCE", development: 13, holdout: 3 },
  "advisory-revision-vs-republication": { relation: "SAME_STORY", development: 3, holdout: 3 },
  "roundup-containing-one-event": { relation: "ROUNDUP", development: 25, holdout: 9 },
  "multiple-cves-in-one-advisory": { relation: "UNRELATED", development: 11, holdout: 3 },
  "same-product-family-different-cve": { relation: "UNRELATED", development: 11, holdout: 3 },
  "procurement-correction-or-cancellation": { relation: "SAME_STORY", development: 5, holdout: 3 },
  "policy-amendment-or-implementation-date": { relation: "SAME_STORY", development: 7, holdout: 3 },
} as const satisfies Record<string, { relation: Relation; development: number; holdout: number }>;

function object(value: unknown, path: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error(`${path} must be an object`);
  return value as Record<string, unknown>;
}
function text(value: unknown, path: string, nullable = false): string | null {
  if (nullable && (value === null || value === undefined)) return null;
  if (typeof value !== "string" || !value.trim()) throw new Error(`${path} must be a non-empty string${nullable ? " or null" : ""}`);
  return value;
}
function bool(value: unknown, path: string, fallback?: boolean): boolean {
  if (value === undefined && fallback !== undefined) return fallback;
  if (typeof value !== "boolean") throw new Error(`${path} must be a boolean`);
  return value;
}
function date(value: unknown, path: string, nullable = false): string | null {
  const out = text(value, path, nullable);
  if (out !== null && Number.isNaN(Date.parse(out))) throw new Error(`${path} must be an ISO date`);
  return out;
}
function member<T extends readonly string[]>(value: unknown, allowed: T, path: string): T[number] {
  if (typeof value !== "string" || !allowed.includes(value)) throw new Error(`${path} must be one of ${allowed.join(", ")}`);
  return value as T[number];
}

function parseFrame(value: unknown, path: string): EventFrame | null {
  if (value === null || value === undefined) return null;
  const row = object(value, path);
  return {
    subject: text(row.subject, `${path}.subject`, true), action: text(row.action, `${path}.action`, true),
    object: text(row.object, `${path}.object`, true), occurredAt: text(row.occurredAt, `${path}.occurredAt`, true),
  };
}

function parseReport(value: unknown, path: string): BenchmarkReport {
  const row = object(value, path);
  const identity = object(row.identity, `${path}.identity`);
  return {
    reportId: text(row.reportId, `${path}.reportId`)!,
    title: text(row.title, `${path}.title`)!, summary: text(row.summary, `${path}.summary`, true),
    sourceName: text(row.sourceName, `${path}.sourceName`)!, firstParty: bool(row.firstParty, `${path}.firstParty`),
    publishedAt: date(row.publishedAt, `${path}.publishedAt`, true), ingestedAt: date(row.ingestedAt, `${path}.ingestedAt`)! as string,
    frame: parseFrame(row.frame, `${path}.frame`), splitGroupId: text(row.splitGroupId, `${path}.splitGroupId`)! as string,
    identity: { eventKey: text(identity.eventKey, `${path}.identity.eventKey`)! as string, storyKey: text(identity.storyKey, `${path}.identity.storyKey`)! as string },
  };
}

function parseCandidate(value: unknown, path: string): BenchmarkCandidate {
  const row = object(value, path);
  const base = parseReport(row, path);
  const gold = object(row.gold, `${path}.gold`);
  const annotation = object(row.annotation, `${path}.annotation`);
  if (!Array.isArray(annotation.sourceUrls) || annotation.sourceUrls.length < 2 || annotation.sourceUrls.some((url) => typeof url !== "string" || !/^https?:\/\//.test(url))) {
    throw new Error(`${path}.annotation.sourceUrls must contain both source URLs`);
  }
  if (annotation.reviewers !== undefined && (!Array.isArray(annotation.reviewers) || annotation.reviewers.some((reviewer) => typeof reviewer !== "string" || !reviewer.trim()))) {
    throw new Error(`${path}.annotation.reviewers must be an array of non-empty model identifiers`);
  }
  const members = Number(row.members);
  if (!Number.isInteger(members) || members < 1) throw new Error(`${path}.members must be a positive integer`);
  return {
    ...base, factTitle: text(row.factTitle, `${path}.factTitle`)! as string, members,
    isDistractor: bool(row.isDistractor, `${path}.isDistractor`, false),
    expectedInRecall: bool(row.expectedInRecall, `${path}.expectedInRecall`),
    gold: { relation: member(gold.relation, RELATIONS, `${path}.gold.relation`) },
    annotation: {
      status: member(annotation.status, ANNOTATION_STATUSES, `${path}.annotation.status`),
      labelSource: member(annotation.labelSource, LABEL_SOURCES, `${path}.annotation.labelSource`),
      humanAdjudicated: bool(annotation.humanAdjudicated, `${path}.annotation.humanAdjudicated`),
      labeller: text(annotation.labeller, `${path}.annotation.labeller`)! as string,
      confidence: member(annotation.confidence, ANNOTATION_CONFIDENCES, `${path}.annotation.confidence`),
      adjudicator: text(annotation.adjudicator, `${path}.annotation.adjudicator`, true),
      reviewers: annotation.reviewers === undefined ? [] : annotation.reviewers as string[],
      sourceUrls: annotation.sourceUrls as string[], note: text(annotation.note, `${path}.annotation.note`)! as string,
    },
  };
}

export function parseEventRelationJsonl(input: string): EventRelationCase[] {
  const out: EventRelationCase[] = [];
  for (const [index, raw] of input.split(/\r?\n/).entries()) {
    if (!raw.trim() || raw.trim().startsWith("//")) continue;
    let value: unknown;
    try { value = JSON.parse(raw); } catch (error) { throw new Error(`line ${index + 1}: invalid JSON: ${String(error)}`); }
    const path = `line ${index + 1}`;
    const row = object(value, path);
    if (!Array.isArray(row.candidates) || !row.candidates.length) throw new Error(`${path}.candidates must be a non-empty array`);
    const construction = row.construction === undefined ? undefined : object(row.construction, `${path}.construction`);
    out.push({
      caseId: text(row.caseId, `${path}.caseId`)! as string,
      split: member(row.split, EVENT_RELATION_SPLITS, `${path}.split`),
      samplingStratum: text(row.samplingStratum, `${path}.samplingStratum`)! as string,
      query: parseReport(row.query, `${path}.query`),
      candidates: row.candidates.map((candidate, i) => parseCandidate(candidate, `${path}.candidates[${i}]`)),
      ...(construction ? { construction: construction as EventRelationCase["construction"] } : {}),
    });
  }
  return out;
}

export function validateEventRelationDataset(cases: EventRelationCase[], opts: { frozen?: boolean; development?: boolean; holdout?: boolean } = {}): void {
  const errors: string[] = [];
  const caseIds = new Set<string>();
  const reportSplits = new Map<string, EventRelationSplit>();
  const reportFingerprints = new Map<string, string>();
  const groupSplits = new Map<string, EventRelationSplit>();
  const counts = new Map<string, number>();
  for (const row of cases) {
    if (caseIds.has(row.caseId)) errors.push(`${row.caseId}: duplicate caseId`);
    caseIds.add(row.caseId);
    if (!(row.samplingStratum in FROZEN_ALLOCATION)) errors.push(`${row.caseId}: unknown samplingStratum ${row.samplingStratum}`);
    counts.set(`${row.samplingStratum}:${row.split}`, (counts.get(`${row.samplingStratum}:${row.split}`) ?? 0) + 1);
    const reports: BenchmarkReport[] = [row.query, ...row.candidates];
    for (const report of reports) {
      const priorSplit = reportSplits.get(report.reportId);
      if (priorSplit && priorSplit !== row.split) errors.push(`${row.caseId}: report ${report.reportId} crosses splits`);
      reportSplits.set(report.reportId, row.split);
      // A candidate carries evaluation-only fields in addition to BenchmarkReport. Those fields may
      // legitimately differ when the same report appears as a query elsewhere, so fingerprint only
      // the report projection whose stability this check is intended to enforce.
      const fingerprint = JSON.stringify({
        reportId: report.reportId, title: report.title, summary: report.summary,
        sourceName: report.sourceName, firstParty: report.firstParty,
        publishedAt: report.publishedAt, ingestedAt: report.ingestedAt, frame: report.frame,
        splitGroupId: report.splitGroupId, identity: report.identity,
      });
      const priorFingerprint = reportFingerprints.get(report.reportId);
      if (priorFingerprint && priorFingerprint !== fingerprint) errors.push(`${row.caseId}: report ${report.reportId} is not stable across cases`);
      reportFingerprints.set(report.reportId, fingerprint);
      const groupSplit = groupSplits.get(report.splitGroupId);
      if (groupSplit && groupSplit !== row.split) errors.push(`${row.caseId}: splitGroupId ${report.splitGroupId} crosses splits`);
      groupSplits.set(report.splitGroupId, row.split);
    }
    const queryTime = Date.parse(row.query.ingestedAt);
    for (const candidate of row.candidates) {
      const candidateTime = Date.parse(candidate.ingestedAt);
      if (candidateTime > queryTime) errors.push(`${row.caseId}/${candidate.reportId}: candidate arrives after query`);
      if (queryTime - candidateTime >= RECALL_DAYS * 86_400_000) errors.push(`${row.caseId}/${candidate.reportId}: candidate is outside the ${RECALL_DAYS}-day recall window`);
      if (candidate.annotation.status !== "decisive") errors.push(`${row.caseId}/${candidate.reportId}: frozen benchmark must be decisive-only`);
      if (row.split === "holdout") {
        const humanReviewed = candidate.annotation.labelSource === "human"
          && candidate.annotation.humanAdjudicated && Boolean(candidate.annotation.adjudicator);
        const modelReviewers = [...new Set(candidate.annotation.reviewers)];
        const modelReviewed = candidate.annotation.labelSource === "model-reviewed"
          && !candidate.annotation.humanAdjudicated && !candidate.annotation.adjudicator
          && candidate.annotation.confidence === "high" && modelReviewers.length >= 3;
        if (!humanReviewed && !modelReviewed) {
          errors.push(`${row.caseId}/${candidate.reportId}: holdout labels require either a named human adjudicator or three independent high-confidence model reviewers`);
        }
      }
      const q = row.query.identity, c = candidate.identity;
      if (candidate.gold.relation === "SAME_OCCURRENCE" && (q.eventKey !== c.eventKey || q.storyKey !== c.storyKey)) errors.push(`${row.caseId}/${candidate.reportId}: SAME_OCCURRENCE identity mismatch`);
      if (candidate.gold.relation === "SAME_STORY" && (q.eventKey === c.eventKey || q.storyKey !== c.storyKey)) errors.push(`${row.caseId}/${candidate.reportId}: SAME_STORY identity mismatch`);
      if (candidate.gold.relation === "UNRELATED" && q.storyKey === c.storyKey) errors.push(`${row.caseId}/${candidate.reportId}: UNRELATED must have a different storyKey`);
      const intended = FROZEN_ALLOCATION[row.samplingStratum as keyof typeof FROZEN_ALLOCATION]?.relation;
      if (!candidate.isDistractor && intended && candidate.gold.relation !== intended) errors.push(`${row.caseId}/${candidate.reportId}: stratum expects ${intended}`);
    }
  }
  if (opts.frozen) {
    if (cases.length !== 240) errors.push(`frozen dataset must contain 240 cases, got ${cases.length}`);
    for (const [stratum, allocation] of Object.entries(FROZEN_ALLOCATION)) {
      for (const split of EVENT_RELATION_SPLITS) {
        const actual = counts.get(`${stratum}:${split}`) ?? 0;
        if (actual !== allocation[split]) errors.push(`${stratum}/${split}: expected ${allocation[split]} cases, got ${actual}`);
      }
    }
  }
  if (opts.development) {
    if (cases.length !== 180 || cases.some((row) => row.split !== "development")) errors.push(`frozen development dataset must contain 180 development cases, got ${cases.length}`);
    for (const [stratum, allocation] of Object.entries(FROZEN_ALLOCATION)) {
      const actual = counts.get(`${stratum}:development`) ?? 0;
      if (actual !== allocation.development) errors.push(`${stratum}/development: expected ${allocation.development} cases, got ${actual}`);
    }
  }
  if (opts.holdout) {
    if (cases.length !== 60 || cases.some((row) => row.split !== "holdout")) errors.push(`frozen holdout dataset must contain 60 holdout cases, got ${cases.length}`);
    for (const [stratum, allocation] of Object.entries(FROZEN_ALLOCATION)) {
      const actual = counts.get(`${stratum}:holdout`) ?? 0;
      if (actual !== allocation.holdout) errors.push(`${stratum}/holdout: expected ${allocation.holdout} cases, got ${actual}`);
    }
  }
  if (errors.length) throw new Error(`event-relation dataset validation failed:\n- ${errors.join("\n- ")}`);
}

export function toReportView(report: BenchmarkReport): ReportView {
  return { title: report.title, source: report.sourceName, firstParty: report.firstParty, at: report.publishedAt ? new Date(report.publishedAt) : null, summary: report.summary, frame: report.frame };
}
export function toCandidateView(candidate: BenchmarkCandidate, index: number): CandidateView {
  return { factId: index + 1, storyId: index + 1, factTitle: candidate.factTitle, members: candidate.members, storyRoot: true, score: 1, report: toReportView(candidate) };
}

export interface RelationPrediction { gold: Relation; predicted: Relation; isDistractor: boolean }
export interface RecallObservation {
  caseId: string; stratum: string; branch: string; expected: string[]; recalled: string[];
  scores?: Record<string, number>;
}
export interface StoryAssignment { reportId: string; goldStoryKey: string; predictedStoryId: string; constrained: boolean }
type Matrix = Record<Relation, Record<Relation, number>>;
const round = (n: number) => +n.toFixed(3);
export function relationMetrics(rows: RelationPrediction[]) {
  const matrix = Object.fromEntries(RELATIONS.map((g) => [g, Object.fromEntries(RELATIONS.map((p) => [p, 0]))])) as Matrix;
  for (const row of rows) matrix[row.gold][row.predicted]++;
  const perClass = Object.fromEntries(RELATIONS.map((relation) => {
    const tp = matrix[relation][relation];
    const fp = RELATIONS.filter((g) => g !== relation).reduce((n, g) => n + matrix[g][relation], 0);
    const support = RELATIONS.reduce((n, p) => n + matrix[relation][p], 0), fn = support - tp;
    const precision = tp / Math.max(1, tp + fp), recall = tp / Math.max(1, tp + fn);
    return [relation, { precision: round(precision), recall: round(recall), f1: round(2 * precision * recall / Math.max(1e-9, precision + recall)), support }];
  })) as Record<Relation, { precision: number; recall: number; f1: number; support: number }>;
  const correct = RELATIONS.reduce((n, relation) => n + matrix[relation][relation], 0);
  return { n: rows.length, accuracy: round(correct / Math.max(1, rows.length)), macroF1: round(RELATIONS.reduce((n, r) => n + perClass[r].f1, 0) / RELATIONS.length), confusionMatrix: matrix, perClass };
}
export function relationMetricViews(rows: RelationPrediction[]) {
  return { relatedOnly: relationMetrics(rows.filter((row) => !row.isDistractor)), withDistractors: relationMetrics(rows) };
}

export function recallMetrics(rows: RecallObservation[]) {
  let expected = 0, found = 0;
  const byStratum: Record<string, { expected: number; found: number; missed: string[] }> = {};
  const branches: Record<string, number> = {};
  for (const row of rows) {
    branches[row.branch] = (branches[row.branch] ?? 0) + 1;
    const recalled = new Set(row.recalled);
    const stratum = byStratum[row.stratum] ??= { expected: 0, found: 0, missed: [] };
    for (const reportId of row.expected) {
      expected++;
      stratum.expected++;
      if (recalled.has(reportId)) { found++; stratum.found++; }
      else stratum.missed.push(`${row.caseId}:${reportId}`);
    }
  }
  const summarize = (value: { expected: number; found: number; missed: string[] }) => ({
    ...value,
    recallAtK: round(value.found / Math.max(1, value.expected)),
    missedCandidateRate: round(1 - value.found / Math.max(1, value.expected)),
  });
  return {
    ...summarize({ expected, found, missed: Object.values(byStratum).flatMap((value) => value.missed) }),
    branches,
    byStratum: Object.fromEntries(Object.entries(byStratum).map(([key, value]) => [key, summarize(value)])),
  };
}

export const storyPairKey = (left: string, right: string) => [left, right].sort().join("\u0000");

export function storyPairMetrics(assignments: StoryAssignment[], excludedPairs: ReadonlySet<string> = new Set()) {
  let tp = 0, fp = 0, fn = 0;
  const falseMerges: Array<{ left: string; right: string }> = [];
  const falseSplits: Array<{ left: string; right: string }> = [];
  const rows = assignments.filter((assignment) => assignment.constrained);
  for (let i = 0; i < rows.length; i++) {
    for (let j = i + 1; j < rows.length; j++) {
      const left = rows[i]!, right = rows[j]!;
      if (excludedPairs.has(storyPairKey(left.reportId, right.reportId))) continue;
      const goldSame = left.goldStoryKey === right.goldStoryKey;
      const predictedSame = left.predictedStoryId === right.predictedStoryId;
      if (goldSame && predictedSame) tp++;
      else if (!goldSame && predictedSame) { fp++; falseMerges.push({ left: left.reportId, right: right.reportId }); }
      else if (goldSame) { fn++; falseSplits.push({ left: left.reportId, right: right.reportId }); }
    }
  }
  const precision = tp / Math.max(1, tp + fp), recall = tp / Math.max(1, tp + fn);
  return { tp, fp, fn, precision: round(precision), recall: round(recall),
    f1: round(2 * precision * recall / Math.max(1e-9, precision + recall)), falseMerges, falseSplits };
}

export function partitionDevelopmentCases(cases: EventRelationCase[]) {
  if (cases.some((row) => row.split !== "development")) throw new Error("development construction input may not contain holdout cases");
  return {
    decisive: cases.filter((row) => row.candidates.every((candidate) => candidate.annotation.status === "decisive")),
    review: cases.filter((row) => row.candidates.some((candidate) => candidate.annotation.status !== "decisive")),
  };
}

export interface RebasedReport { reportId: string; publishedAt: Date | null; discoveredAt: Date; backfill: false }
export function rebaseFixtureTimes(cases: EventRelationCase[], runStart = new Date(), epsilonMs = 1_000) {
  const reports = new Map<string, BenchmarkReport>();
  for (const row of cases) for (const report of [row.query, ...row.candidates]) reports.set(report.reportId, report);
  if (!reports.size) throw new Error("cannot rebase an empty dataset");
  const datasetReferenceTime = Math.max(...[...reports.values()].map((report) => Date.parse(report.ingestedAt)));
  const evaluationTimeAnchor = new Date(runStart.getTime() - epsilonMs);
  const discoveryTimeShiftMs = evaluationTimeAnchor.getTime() - datasetReferenceTime;
  const rebased = new Map<string, RebasedReport>();
  for (const report of reports.values()) {
    const discoveredAt = new Date(Date.parse(report.ingestedAt) + discoveryTimeShiftMs);
    const publishedAt = report.publishedAt ? new Date(Date.parse(report.publishedAt) + discoveryTimeShiftMs) : null;
    if (publishedAt && discoveredAt.getTime() - publishedAt.getTime() !== Date.parse(report.ingestedAt) - Date.parse(report.publishedAt!)) throw new Error(`${report.reportId}: time interval changed during rebasing`);
    if (publishedAt && publishedAt.getTime() > runStart.getTime() + 3_600_000) throw new Error(`${report.reportId}: rebased publishedAt is in the future`);
    rebased.set(report.reportId, { reportId: report.reportId, publishedAt, discoveredAt, backfill: false });
  }
  return { evaluationTimeAnchor, discoveryTimeShiftMs, reports: rebased };
}
