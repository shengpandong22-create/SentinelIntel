import { z } from "zod";
import { ResearchEvidenceSchema, ResearchLimitsSchema, ResearchToolTraceSchema, StoryResearchSnapshotSchema } from "./research-contract.ts";

export const TrackingQuestionSchema = z.object({
  question_id: z.string().min(1).max(100),
  question: z.string().min(1).max(2_000),
  resolve_on: z.array(z.enum(["vendor_confirmation", "patch", "procurement_award", "material_update"])).min(1).max(4),
  status: z.enum(["open", "resolved"]),
  resolved_evidence_ids: z.array(z.uuid()).max(20).default([]),
}).strict().superRefine((question, ctx) => {
  if (question.status === "open" && question.resolved_evidence_ids.length > 0) {
    ctx.addIssue({ code: "custom", message: `open question has resolution evidence: ${question.question_id}` });
  }
  if (question.status === "resolved" && question.resolved_evidence_ids.length === 0) {
    ctx.addIssue({ code: "custom", message: `resolved question lacks evidence: ${question.question_id}` });
  }
});

export const TrackingIntervalPolicySchema = z.object({
  min_hours: z.number().int().min(1).max(24 * 30),
  max_hours: z.number().int().min(1).max(24 * 365),
  no_change_multiplier: z.number().min(1).max(10),
  max_no_change_checks: z.number().int().min(1).max(100),
}).strict().refine((policy) => policy.min_hours <= policy.max_hours, "tracking interval min exceeds max");

export const TrackingStopConditionSchema = z.object({
  all_questions_resolved: z.boolean(),
  stop_after_no_change_checks: z.number().int().min(1).max(100).nullable(),
  deadline_at: z.iso.datetime({ offset: true }).nullable(),
}).strict();

export const TrackingPlanSnapshotSchema = z.object({
  schema_version: z.literal(1),
  plan_id: z.uuid(),
  story_id: z.number().int().positive(),
  version: z.number().int().positive(),
  status: z.enum(["active", "paused", "stopped"]),
  why_track: z.string().min(1).max(4_000),
  questions: z.array(TrackingQuestionSchema).min(1).max(100),
  source_targets: z.array(z.enum(["nvd", "cisa_kev", "vendor_advisory", "official_procurement"])).min(1).max(20),
  source_parameters: z.object({
    cve_id: z.string().regex(/^CVE-\d{4}-\d{4,}$/).nullable(),
    vendor: z.enum(["cisco", "fortinet", "hikvision", "microsoft"]).nullable(),
    ted_procedure_id: z.string().min(1).max(200).regex(/^[A-Za-z0-9][A-Za-z0-9._:/-]*$/).nullable(),
  }).strict().default({ cve_id: null, vendor: null, ted_procedure_id: null }),
  interval_policy: TrackingIntervalPolicySchema,
  stop_condition: TrackingStopConditionSchema,
  current_interval_hours: z.number().int().min(1).max(24 * 365),
  consecutive_no_change_checks: z.number().int().nonnegative().max(100),
  next_check_at: z.iso.datetime({ offset: true }).nullable(),
  last_checked_at: z.iso.datetime({ offset: true }).nullable(),
}).strict().superRefine((plan, ctx) => {
  if (new Set(plan.questions.map((question) => question.question_id)).size !== plan.questions.length) {
    ctx.addIssue({ code: "custom", message: "duplicate tracking question id" });
  }
  if (plan.current_interval_hours < plan.interval_policy.min_hours || plan.current_interval_hours > plan.interval_policy.max_hours) {
    ctx.addIssue({ code: "custom", message: "current tracking interval is outside policy" });
  }
  if (plan.status === "active" && plan.next_check_at === null) {
    ctx.addIssue({ code: "custom", message: "active tracking plan requires next_check_at" });
  }
  if (plan.status === "stopped" && plan.next_check_at !== null) {
    ctx.addIssue({ code: "custom", message: "stopped tracking plan cannot have next_check_at" });
  }
});

export const TrackingEvidenceRefSchema = z.object({
  evidence_id: z.uuid(),
  source_type: z.string().min(1).max(64),
  authority_level: z.enum(["authoritative", "primary", "secondary"]),
  canonical_url: z.url(),
  content_hash: z.string().regex(/^[0-9a-f]{64}$/),
  retrieved_at: z.iso.datetime({ offset: true }),
  observations: z.array(z.enum(["vendor_confirmation", "patch", "procurement_award", "material_update"])).max(4),
  // Frozen evidence content (official title and the load-bearing excerpt) so independent reviewers
  // can verify impact claims without network access. Absent for pure routing refs.
  title: z.string().max(1_000).nullish(),
  excerpt: z.string().max(5_000).nullish(),
}).strict();

export const TrackingChangeSchema = z.object({
  change_key: z.string().min(1).max(160),
  change_type: z.enum(["vendor_confirmation", "patch", "procurement_award", "material_update"]),
  summary: z.string().min(1).max(4_000),
  before: z.record(z.string(), z.unknown()),
  after: z.record(z.string(), z.unknown()),
  evidence_ids: z.array(z.uuid()).min(1).max(20),
}).strict();

export const TrackingQuestionUpdateSchema = z.object({
  question_id: z.string().min(1).max(100),
  status: z.enum(["open", "resolved"]),
  reason: z.string().min(1).max(2_000),
  evidence_ids: z.array(z.uuid()).max(20),
}).strict().superRefine((update, ctx) => {
  if (update.status === "resolved" && update.evidence_ids.length === 0) {
    ctx.addIssue({ code: "custom", message: `resolved question lacks evidence: ${update.question_id}` });
  }
});

export const TrackingProposalSchema = z.object({
  new_evidence: z.array(ResearchEvidenceSchema).max(12),
  material_changes: z.array(TrackingChangeSchema).max(50),
  question_updates: z.array(TrackingQuestionUpdateSchema).max(100),
  decision: z.enum(["continue", "stop", "insufficient_evidence"]),
  suggested_interval_hours: z.number().int().min(1).max(24 * 365).nullable(),
  decision_reason: z.string().min(1).max(4_000),
  tool_trace: z.array(ResearchToolTraceSchema).max(8),
}).strict().superRefine((proposal, ctx) => {
  if (new Set(proposal.material_changes.map((change) => change.change_key)).size !== proposal.material_changes.length) {
    ctx.addIssue({ code: "custom", message: "duplicate tracking change key" });
  }
  if (new Set(proposal.question_updates.map((update) => update.question_id)).size !== proposal.question_updates.length) {
    ctx.addIssue({ code: "custom", message: "duplicate tracking question update" });
  }
  if (proposal.decision === "stop" && proposal.suggested_interval_hours !== null) {
    ctx.addIssue({ code: "custom", message: "stopped tracking proposal cannot suggest an interval" });
  }
  if (proposal.decision !== "stop" && proposal.suggested_interval_hours === null) {
    ctx.addIssue({ code: "custom", message: "continuing tracking proposal requires an interval" });
  }
});

export const TrackingTaskSchema = z.object({
  trace_id: z.uuid(),
  run_id: z.uuid(),
  tool_capability: z.string().min(32),
  story: StoryResearchSnapshotSchema,
  plan: TrackingPlanSnapshotSchema,
  evidence: z.array(TrackingEvidenceRefSchema).max(100),
  limits: ResearchLimitsSchema,
}).strict().superRefine((task, ctx) => {
  if (task.story.story_id !== task.plan.story_id) ctx.addIssue({ code: "custom", message: "tracking story and plan mismatch" });
});

export const TrackingTaskResponseSchema = z.object({
  trace_id: z.uuid(),
  run_id: z.uuid(),
  proposal: TrackingProposalSchema,
}).strict();

const TRACKING_OBSERVATIONS = new Set(["vendor_confirmation", "patch", "procurement_award", "material_update"] as const);

export function trackingObservationsForSource(
  sourceType: string,
  authority: "authoritative" | "primary" | "secondary",
  normalized: Record<string, unknown>,
) {
  if (!Array.isArray(normalized.tracking_observations) || authority === "secondary") return [];
  return [...new Set(normalized.tracking_observations.filter((value): value is "vendor_confirmation" | "patch" | "procurement_award" | "material_update" => {
    if (typeof value !== "string" || !TRACKING_OBSERVATIONS.has(value as never)) return false;
    if ((value === "vendor_confirmation" || value === "patch") && sourceType !== "vendor_advisory") return false;
    if (value === "procurement_award" && sourceType !== "official_procurement") return false;
    return true;
  }))];
}

export function validateTrackingProposal(task: z.infer<typeof TrackingTaskSchema>, raw: unknown) {
  const proposal = TrackingProposalSchema.parse(raw);
  const evidenceIds = new Set([
    ...task.evidence.map((item) => item.evidence_id),
    ...proposal.new_evidence.map((item) => item.evidence_id),
  ]);
  const observations = new Map(task.evidence.map((item) => [item.evidence_id, new Set(item.observations)]));
  for (const item of proposal.new_evidence) {
    observations.set(item.evidence_id, new Set(trackingObservationsForSource(item.source_type, item.authority_level, item.normalized)));
  }
  const questionIds = new Set(task.plan.questions.map((item) => item.question_id));
  const referenced = [
    ...proposal.material_changes.flatMap((change) => change.evidence_ids),
    ...proposal.question_updates.flatMap((update) => update.evidence_ids),
    ...proposal.tool_trace.flatMap((trace) => trace.evidence_ids),
  ];
  for (const id of referenced) if (!evidenceIds.has(id)) throw new Error(`dangling tracking evidence id: ${id}`);
  for (const update of proposal.question_updates) {
    if (!questionIds.has(update.question_id)) throw new Error(`unknown tracking question id: ${update.question_id}`);
    const question = task.plan.questions.find((item) => item.question_id === update.question_id)!;
    if (update.status === "resolved" && !update.evidence_ids.some((id) => question.resolve_on.some((kind) => observations.get(id)?.has(kind)))) {
      throw new Error(`tracking question resolution lacks source-appropriate evidence: ${update.question_id}`);
    }
  }
  for (const change of proposal.material_changes) {
    if (!change.evidence_ids.some((id) => observations.get(id)?.has(change.change_type))) {
      throw new Error(`tracking change lacks source-appropriate evidence: ${change.change_key}`);
    }
  }
  const policy = task.plan.interval_policy;
  if (proposal.suggested_interval_hours !== null
    && (proposal.suggested_interval_hours < policy.min_hours || proposal.suggested_interval_hours > policy.max_hours)) {
    throw new Error("suggested tracking interval is outside policy");
  }
  return proposal;
}

export type TrackingTask = z.infer<typeof TrackingTaskSchema>;
export type TrackingProposal = z.infer<typeof TrackingProposalSchema>;
export type TrackingPlanSnapshot = z.infer<typeof TrackingPlanSnapshotSchema>;
export type TrackingTaskResponse = z.infer<typeof TrackingTaskResponseSchema>;
