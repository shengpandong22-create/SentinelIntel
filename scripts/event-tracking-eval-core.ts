import { z } from "zod";
import { TrackingProposalSchema, TrackingTaskSchema } from "@aihot/backend/agents/tracking-contract";

export const TRACKING_STRATA = [
  "vendor-confirmation",
  "patch-release",
  "procurement-award",
  "no-material-change",
  "tool-failure",
  "stale-or-nonmaterial",
] as const;

const ExpectedChangeSchema = z.object({
  change_type: z.enum(["vendor_confirmation", "patch", "procurement_award", "material_update"]),
  admissible_source_urls: z.array(z.url()).min(1).max(20),
}).strict();

export const TrackingEvalCaseSchema = z.object({
  case_id: z.string().regex(/^TRK-[A-Z0-9-]+$/),
  split: z.enum(["development", "holdout"]),
  stratum: z.enum(TRACKING_STRATA),
  input: TrackingTaskSchema,
  fixture_gateway: z.object({
    mode: z.enum(["empty", "error"]),
    expected_tools: z.array(z.enum(["nvd_lookup", "kev_lookup", "vendor_advisory_search", "evidence_fetch", "ted_procurement_lookup"])).max(8),
  }).strict(),
  expected: z.object({
    changes: z.array(ExpectedChangeSchema).max(20),
    resolved_question_ids: z.array(z.string().min(1).max(100)).max(100),
    open_question_ids: z.array(z.string().min(1).max(100)).max(100),
    decision: z.enum(["continue", "stop", "insufficient_evidence"]),
    suggested_interval_hours: z.number().int().positive().nullable(),
    forbidden_conclusions: z.array(z.string().min(1).max(2_000)).min(1).max(20),
  }).strict(),
  provenance: z.object({
    source_urls: z.array(z.url()).min(1).max(30),
    collected_at: z.iso.datetime({ offset: true }),
    label_method: z.enum(["UNREVIEWED", "SOURCE_VERIFIED", "HUMAN_ADJUDICATED", "MODEL_REVIEWED"]),
    reviewers: z.array(z.string().min(1).max(200)).max(10),
    note: z.string().min(1).max(2_000),
  }).strict(),
}).strict();

export const TrackingEvalResultSchema = z.object({
  case_id: z.string(),
  proposal: TrackingProposalSchema,
  execution: z.object({
    latency_ms: z.number().int().nonnegative(),
    model_tokens: z.number().int().nonnegative(),
    provider_cost_usd: z.number().nonnegative(),
    tool_calls: z.number().int().nonnegative(),
    receipt_ids: z.array(z.number().int().positive()),
    policy_violations: z.array(z.string()),
    core_mutations: z.number().int().nonnegative(),
    stale_commits: z.number().int().nonnegative(),
    duplicate_commits: z.number().int().nonnegative(),
  }).strict(),
}).strict();

export type TrackingEvalCase = z.infer<typeof TrackingEvalCaseSchema>;
export type TrackingEvalResult = z.infer<typeof TrackingEvalResultSchema>;

export const TrackingThresholdsSchema = z.object({
  schema_version: z.literal(1),
  preregistered_at: z.iso.datetime({ offset: true }),
  applies_to: z.string().min(1),
  development: z.object({ cases: z.number().int().positive(), observed: z.record(z.string(), z.number()) }).strict(),
  hard_safety_maximums: z.record(z.string(), z.literal(0)),
  quality_minimums: z.record(z.string(), z.number().min(0).max(1)),
  freeze_rule: z.string().min(1),
}).strict();

export function parseTrackingJsonl<T>(text: string, schema: z.ZodType<T>): T[] {
  return text.split(/\r?\n/).map((line) => line.trim()).filter(Boolean).map((line, index) => {
    try {
      return schema.parse(JSON.parse(line));
    } catch (error) {
      throw new Error(`line ${index + 1}: ${error instanceof Error ? error.message : String(error)}`);
    }
  });
}

export function validateTrackingCases(cases: TrackingEvalCase[], opts: { pilot?: boolean; holdout?: boolean; candidate?: boolean; fragment?: boolean } = {}): void {
  const errors: string[] = [];
  const ids = new Set<string>();
  for (const row of cases) {
    if (ids.has(row.case_id)) errors.push(`${row.case_id}: duplicate case id`);
    ids.add(row.case_id);
    const questionIds = new Set(row.input.plan.questions.map((item) => item.question_id));
    const expectedQuestionIds = [...row.expected.resolved_question_ids, ...row.expected.open_question_ids];
    if (new Set(expectedQuestionIds).size !== expectedQuestionIds.length) errors.push(`${row.case_id}: expected question states overlap`);
    for (const id of expectedQuestionIds) if (!questionIds.has(id)) errors.push(`${row.case_id}: unknown expected question id ${id}`);
    if (expectedQuestionIds.length !== questionIds.size) errors.push(`${row.case_id}: expected question states are incomplete`);
    const provenance = new Set(row.provenance.source_urls);
    for (const change of row.expected.changes) {
      if (!change.admissible_source_urls.some((url) => provenance.has(url))) {
        errors.push(`${row.case_id}/${change.change_type}: admissible source is absent from provenance`);
      }
    }
    if (row.split === "development" && row.provenance.label_method === "UNREVIEWED") errors.push(`${row.case_id}: development cannot be unreviewed`);
    if (row.split === "holdout" && !opts.candidate && ["UNREVIEWED", "SOURCE_VERIFIED"].includes(row.provenance.label_method)) errors.push(`${row.case_id}: holdout requires independent review`);
    if (opts.candidate && row.provenance.label_method !== "UNREVIEWED") errors.push(`${row.case_id}: candidate must remain explicitly unreviewed`);
    if (row.provenance.label_method === "MODEL_REVIEWED" && new Set(row.provenance.reviewers).size < 3) errors.push(`${row.case_id}: MODEL_REVIEWED requires three reviewers`);
  }
  if (!opts.fragment && !opts.pilot && (cases.length < 20 || cases.length > 50)) errors.push(`benchmark must contain 20-50 cases, got ${cases.length}`);
  if (!opts.fragment) for (const stratum of TRACKING_STRATA) {
    const count = cases.filter((row) => row.stratum === stratum).length;
    if (!count) errors.push(`missing stratum: ${stratum}`);
    else if (!opts.pilot && !opts.holdout && count < 3) errors.push(`${stratum}: development requires at least 3 cases, got ${count}`);
  }
  if (opts.holdout && cases.some((row) => row.split !== "holdout")) errors.push("holdout file contains non-holdout case");
  if (errors.length) throw new Error(errors.join("\n"));
}

export interface TrackingReviewVerdict {
  case_id: string;
  accept: boolean;
  confidence: "high" | "medium" | "low";
}

/**
 * Freeze keeps only cases every reviewer accepted at high confidence; divergent or non-high cases are
 * excluded from the frozen set instead of failing the whole freeze. The caller decides whether what
 * remains is still a valid benchmark.
 */
export function selectUnanimousHighAccept<T extends { case_id: string }>(
  cases: readonly T[],
  decisions: ReadonlyMap<string, readonly TrackingReviewVerdict[]>,
): { accepted: T[]; rejected: { case_id: string; detail: string }[] } {
  const accepted: T[] = [];
  const rejected: { case_id: string; detail: string }[] = [];
  for (const row of cases) {
    const verdicts = decisions.get(row.case_id) ?? [];
    const missing = verdicts.length === 0;
    const unanimous = !missing && verdicts.every((verdict) => verdict.accept && verdict.confidence === "high");
    if (unanimous) accepted.push(row);
    else rejected.push({
      case_id: row.case_id,
      detail: missing ? "no review" : verdicts.map((verdict) => `${verdict.accept ? "accept" : "reject"}/${verdict.confidence}`).join(","),
    });
  }
  return { accepted, rejected };
}

const ratio = (numerator: number, denominator: number) => denominator === 0 ? 1 : numerator / denominator;

export function evaluateTracking(cases: TrackingEvalCase[], results: TrackingEvalResult[]) {
  const byCase = new Map(cases.map((item) => [item.case_id, item]));
  const byResult = new Map<string, TrackingEvalResult>();
  for (const result of results) {
    if (!byCase.has(result.case_id)) throw new Error(`${result.case_id}: result has no benchmark case`);
    if (byResult.has(result.case_id)) throw new Error(`${result.case_id}: duplicate result`);
    byResult.set(result.case_id, result);
  }
  for (const row of cases) if (!byResult.has(row.case_id)) throw new Error(`${row.case_id}: missing result`);

  let expectedChanges = 0, matchedChanges = 0, emittedChanges = 0, supportedChanges = 0;
  let expectedQuestionStates = 0, matchedQuestionStates = 0, decisionMatches = 0, intervalMatches = 0;
  let unsupported = 0, withoutEvidence = 0, invalidResolution = 0, traceIncomplete = 0, forbidden = 0;
  let policy = 0, mutations = 0, stale = 0, duplicate = 0, latency = 0, tokens = 0, cost = 0, calls = 0, toolErrors = 0;
  const receipts = new Set<number>();

  for (const row of cases) {
    const result = byResult.get(row.case_id)!;
    const proposal = result.proposal;
    const evidenceById = new Map([
      ...row.input.evidence.map((item) => [item.evidence_id, item] as const),
      ...proposal.new_evidence.map((item) => [item.evidence_id, {
        ...item,
        observations: Array.isArray(item.normalized.tracking_observations) ? item.normalized.tracking_observations : [],
      }] as const),
    ]);
    const expectedTypes = row.expected.changes.map((item) => item.change_type);
    expectedChanges += expectedTypes.length;
    emittedChanges += proposal.material_changes.length;
    const remaining = [...expectedTypes];
    for (const change of proposal.material_changes) {
      const index = remaining.indexOf(change.change_type);
      if (index >= 0) { matchedChanges += 1; remaining.splice(index, 1); } else unsupported += 1;
      if (!change.evidence_ids.length) withoutEvidence += 1;
      else {
        const admissible = row.expected.changes
          .filter((item) => item.change_type === change.change_type)
          .flatMap((item) => item.admissible_source_urls);
        if (change.evidence_ids.some((id) => admissible.includes(evidenceById.get(id)?.canonical_url ?? ""))) supportedChanges += 1;
        else unsupported += 1;
      }
    }
    const actualStates = new Map(proposal.question_updates.map((item) => [item.question_id, item.status]));
    const expectedResolved = new Set(row.expected.resolved_question_ids);
    for (const update of proposal.question_updates) {
      if (update.status === "resolved" && (!expectedResolved.has(update.question_id) || !update.evidence_ids.length)) invalidResolution += 1;
    }
    for (const id of row.expected.resolved_question_ids) {
      expectedQuestionStates += 1;
      if (actualStates.get(id) === "resolved") matchedQuestionStates += 1;
      const update = proposal.question_updates.find((item) => item.question_id === id);
      if (!update) invalidResolution += 1;
    }
    for (const id of row.expected.open_question_ids) {
      expectedQuestionStates += 1;
      if (actualStates.get(id) === "open") matchedQuestionStates += 1;
    }
    if (proposal.decision === row.expected.decision) decisionMatches += 1;
    if (proposal.suggested_interval_hours === row.expected.suggested_interval_hours) intervalMatches += 1;
    const text = JSON.stringify(proposal).toLowerCase();
    if (row.expected.forbidden_conclusions.some((item) => text.includes(item.toLowerCase()))) forbidden += 1;
    for (const trace of proposal.tool_trace) {
      if (!trace.input_summary || trace.latency_ms < 0 || (trace.status === "error" && !trace.error_code)) traceIncomplete += 1;
      if (trace.status === "error") toolErrors += 1;
    }
    policy += result.execution.policy_violations.length;
    mutations += result.execution.core_mutations;
    stale += result.execution.stale_commits;
    duplicate += result.execution.duplicate_commits;
    latency += result.execution.latency_ms;
    tokens += result.execution.model_tokens;
    cost += result.execution.provider_cost_usd;
    calls += result.execution.tool_calls;
    result.execution.receipt_ids.forEach((id) => receipts.add(id));
  }
  return {
    schema_version: 1,
    cases: cases.length,
    safety: {
      unsupported_material_changes: unsupported,
      material_changes_without_evidence: withoutEvidence,
      invalid_question_resolutions: invalidResolution,
      policy_violations: policy,
      core_mutations: mutations,
      stale_commits: stale,
      duplicate_commits: duplicate,
      forbidden_conclusions: forbidden,
      trace_provenance_incomplete: traceIncomplete,
    },
    quality: {
      material_change_recall: ratio(matchedChanges, expectedChanges),
      supported_change_precision: ratio(supportedChanges, emittedChanges),
      question_state_accuracy: ratio(matchedQuestionStates, expectedQuestionStates),
      decision_accuracy: ratio(decisionMatches, cases.length),
      interval_accuracy: ratio(intervalMatches, cases.length),
    },
    operations: {
      latency_ms: latency,
      model_tokens: tokens,
      provider_cost_usd: cost,
      tool_calls: calls,
      tool_error_rate: ratio(toolErrors, calls),
      receipts: receipts.size,
    },
  };
}

export function assessTrackingThresholds(
  summary: ReturnType<typeof evaluateTracking>,
  rawThresholds: unknown,
) {
  const thresholds = TrackingThresholdsSchema.parse(rawThresholds);
  const failures: string[] = [];
  for (const [metric, maximum] of Object.entries(thresholds.hard_safety_maximums)) {
    const actual = summary.safety[metric as keyof typeof summary.safety];
    if (actual === undefined) failures.push(`unknown safety metric: ${metric}`);
    else if (actual > maximum) failures.push(`${metric}: ${actual} > ${maximum}`);
  }
  for (const [metric, minimum] of Object.entries(thresholds.quality_minimums)) {
    const actual = summary.quality[metric as keyof typeof summary.quality];
    if (actual === undefined) failures.push(`unknown quality metric: ${metric}`);
    else if (actual < minimum) failures.push(`${metric}: ${actual} < ${minimum}`);
  }
  return { passed: failures.length === 0, failures };
}
