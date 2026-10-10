import { randomUUID } from "node:crypto";
import { sql } from "../db.ts";
import {
  TrackingIntervalPolicySchema,
  TrackingPlanSnapshotSchema,
  TrackingStopConditionSchema,
  TrackingTaskSchema,
  validateTrackingProposal,
  type TrackingPlanSnapshot,
  type TrackingProposal,
  type TrackingTask,
} from "./tracking-contract.ts";
import type { StoryResearchSnapshot } from "./research-contract.ts";

export interface CreateTrackingPlanInput {
  storyId: number;
  whyTrack: string;
  questions: TrackingPlanSnapshot["questions"];
  sourceTargets: TrackingPlanSnapshot["source_targets"];
  intervalPolicy: TrackingPlanSnapshot["interval_policy"];
  stopCondition: TrackingPlanSnapshot["stop_condition"];
  initialIntervalHours: number;
  nextCheckAt: Date;
}

export async function createTrackingPlan(input: CreateTrackingPlanInput): Promise<TrackingPlanSnapshot> {
  const publicId = randomUUID();
  const candidate = TrackingPlanSnapshotSchema.parse({
    schema_version: 1,
    plan_id: publicId,
    story_id: input.storyId,
    version: 1,
    status: "active",
    why_track: input.whyTrack,
    questions: input.questions,
    source_targets: input.sourceTargets,
    interval_policy: input.intervalPolicy,
    stop_condition: input.stopCondition,
    current_interval_hours: input.initialIntervalHours,
    consecutive_no_change_checks: 0,
    next_check_at: input.nextCheckAt.toISOString(),
    last_checked_at: null,
  });
  await sql`
    INSERT INTO tracking_plans
      (public_id, story_id, status, why_track, questions, source_targets, next_check_at,
       current_interval_hours, interval_policy, stop_condition)
    VALUES
      (${candidate.plan_id}, ${candidate.story_id}, ${candidate.status}, ${candidate.why_track},
       ${sql.json(candidate.questions as never)}, ${candidate.source_targets}, ${candidate.next_check_at},
       ${candidate.current_interval_hours}, ${sql.json(candidate.interval_policy as never)},
       ${sql.json(candidate.stop_condition as never)})`;
  return candidate;
}

interface TrackingPlanRow {
  id: number;
  public_id: string;
  story_id: number;
  status: "active" | "paused" | "stopped";
  why_track: string;
  questions: TrackingPlanSnapshot["questions"];
  source_targets: TrackingPlanSnapshot["source_targets"];
  next_check_at: Date | null;
  last_checked_at: Date | null;
  current_interval_hours: number;
  consecutive_no_change_checks: number;
  interval_policy: TrackingPlanSnapshot["interval_policy"];
  stop_condition: TrackingPlanSnapshot["stop_condition"];
  version: number;
}

function snapshotOf(row: TrackingPlanRow): TrackingPlanSnapshot {
  return TrackingPlanSnapshotSchema.parse({
    schema_version: 1,
    plan_id: row.public_id,
    story_id: row.story_id,
    version: row.version,
    status: row.status,
    why_track: row.why_track,
    questions: row.questions,
    source_targets: row.source_targets,
    interval_policy: row.interval_policy,
    stop_condition: row.stop_condition,
    current_interval_hours: row.current_interval_hours,
    consecutive_no_change_checks: row.consecutive_no_change_checks,
    next_check_at: row.next_check_at?.toISOString() ?? null,
    last_checked_at: row.last_checked_at?.toISOString() ?? null,
  });
}

export async function listDueTrackingPlans(now = new Date(), limit = 50): Promise<TrackingPlanSnapshot[]> {
  if (!Number.isInteger(limit) || limit < 1 || limit > 200) throw new Error("invalid tracking due-plan limit");
  const rows = await sql<TrackingPlanRow[]>`
    SELECT id, public_id, story_id, status, why_track, questions, source_targets, next_check_at,
           last_checked_at, current_interval_hours, consecutive_no_change_checks, interval_policy,
           stop_condition, version
    FROM tracking_plans
    WHERE status = 'active' AND next_check_at <= ${now}
    ORDER BY next_check_at, id
    LIMIT ${limit}`;
  return rows.map(snapshotOf);
}

const OBSERVATIONS = new Set(["vendor_confirmation", "patch", "procurement_award", "material_update"] as const);

export function trackingObservationsForEvidence(sourceType: string, authority: "authoritative" | "primary" | "secondary", normalized: Record<string, unknown>) {
  if (!Array.isArray(normalized.tracking_observations) || authority === "secondary") return [];
  return [...new Set(normalized.tracking_observations.filter((value): value is "vendor_confirmation" | "patch" | "procurement_award" | "material_update" => {
    if (typeof value !== "string" || !OBSERVATIONS.has(value as never)) return false;
    if ((value === "vendor_confirmation" || value === "patch") && sourceType !== "vendor_advisory") return false;
    if (value === "procurement_award" && sourceType !== "official_procurement") return false;
    return true;
  }))];
}

export async function loadTrackingTask(input: {
  planPublicId: string;
  traceId: string;
  runId: string;
  toolCapability: string;
}): Promise<TrackingTask> {
  const [plan] = await sql<TrackingPlanRow[]>`
    SELECT id, public_id, story_id, status, why_track, questions, source_targets, next_check_at,
           last_checked_at, current_interval_hours, consecutive_no_change_checks, interval_policy,
           stop_condition, version
    FROM tracking_plans WHERE public_id = ${input.planPublicId}`;
  if (!plan) throw new Error("tracking plan not found");
  const [story] = await sql<{ id: number; title: string; digest: string | null; status: "active" | "watching" | "settled"; version: number }[]>`
    SELECT id, title, digest, status, version FROM stories WHERE id = ${plan.story_id} AND merged_into IS NULL`;
  if (!story) throw new Error("tracked Story is missing or merged");
  const facts = await sql<{ fact_id: number; public_id: string; title: string }[]>`
    SELECT id AS fact_id, public_id, title FROM facts WHERE story_id = ${story.id} ORDER BY id LIMIT 500`;
  const storySnapshot: StoryResearchSnapshot = {
    schema_version: 1,
    story_id: story.id,
    story_version: story.version,
    title: story.title,
    digest: story.digest,
    status: story.status,
    facts,
    missing_questions: plan.questions.filter((question) => question.status === "open").map((question) => question.question),
    captured_at: new Date().toISOString(),
  };
  const evidenceRows = await sql<{
    evidence_id: string;
    source_type: string;
    authority_level: "authoritative" | "primary" | "secondary";
    canonical_url: string;
    content_hash: string;
    retrieved_at: Date;
    normalized: Record<string, unknown>;
  }[]>`
    SELECT public_id AS evidence_id, source_type, authority_level, canonical_url, content_hash,
           retrieved_at, normalized
    FROM external_evidence WHERE story_id = ${story.id}
    ORDER BY retrieved_at DESC, id DESC LIMIT 100`;
  const evidence = evidenceRows.map((row) => ({
    evidence_id: row.evidence_id,
    source_type: row.source_type,
    authority_level: row.authority_level,
    canonical_url: row.canonical_url,
    content_hash: row.content_hash,
    retrieved_at: row.retrieved_at.toISOString(),
    observations: trackingObservationsForEvidence(row.source_type, row.authority_level, row.normalized),
  }));
  return TrackingTaskSchema.parse({
    trace_id: input.traceId,
    run_id: input.runId,
    tool_capability: input.toolCapability,
    story: storySnapshot,
    plan: snapshotOf(plan),
    evidence,
  });
}

function stopAllowed(plan: TrackingPlanSnapshot, questions: TrackingPlanSnapshot["questions"], noChangeChecks: number, checkedAt: Date) {
  const condition = TrackingStopConditionSchema.parse(plan.stop_condition);
  if (condition.all_questions_resolved && questions.every((question) => question.status === "resolved")) return true;
  if (condition.stop_after_no_change_checks !== null && noChangeChecks >= condition.stop_after_no_change_checks) return true;
  if (condition.deadline_at !== null && checkedAt.getTime() >= Date.parse(condition.deadline_at)) return true;
  return false;
}

export async function applyTrackingProposal(input: {
  task: TrackingTask;
  proposal: TrackingProposal;
  checkedAt?: Date;
}): Promise<{ version: number; status: "active" | "stopped"; idempotent: boolean }> {
  const task = TrackingTaskSchema.parse(input.task);
  const proposal = validateTrackingProposal(task, input.proposal);
  const checkedAt = input.checkedAt ?? new Date();
  return sql.begin(async (tx) => {
    const [row] = await tx<(TrackingPlanRow & { last_run_id: string | null })[]>`
      SELECT id, public_id, story_id, status, why_track, questions, source_targets, next_check_at,
             last_checked_at, current_interval_hours, consecutive_no_change_checks, interval_policy,
             stop_condition, version, last_run_id
      FROM tracking_plans WHERE public_id = ${task.plan.plan_id} FOR UPDATE`;
    if (!row || row.story_id !== task.story.story_id) throw new Error("tracking plan is missing or belongs to another story");
    if (row.last_run_id === task.run_id) return { version: row.version, status: row.status === "stopped" ? "stopped" : "active", idempotent: true };
    if (row.status !== "active") throw new Error("tracking plan is not active");
    if (row.version !== task.plan.version) throw new Error("stale tracking plan version");

    const evidenceIds = [...new Set([
      ...proposal.material_changes.flatMap((change) => change.evidence_ids),
      ...proposal.question_updates.flatMap((update) => update.evidence_ids),
    ])];
    if (evidenceIds.length > 0) {
      const evidence = await tx<{ public_id: string }[]>`
        SELECT public_id FROM external_evidence
        WHERE story_id = ${row.story_id} AND public_id = ANY(${evidenceIds})`;
      if (evidence.length !== evidenceIds.length) throw new Error("tracking proposal references unstored or cross-story evidence");
    }

    const updateById = new Map(proposal.question_updates.map((update) => [update.question_id, update]));
    const questions = row.questions.map((question) => {
      const update = updateById.get(question.question_id);
      if (!update) return question;
      return {
        ...question,
        status: update.status,
        resolved_evidence_ids: update.status === "resolved" ? [...new Set(update.evidence_ids)] : [],
      };
    });
    const noChangeChecks = proposal.material_changes.length === 0 ? row.consecutive_no_change_checks + 1 : 0;
    if (proposal.decision === "stop" && !stopAllowed(task.plan, questions, noChangeChecks, checkedAt)) {
      throw new Error("tracking stop condition is not satisfied");
    }
    const status = proposal.decision === "stop" ? "stopped" : "active";
    const policy = TrackingIntervalPolicySchema.parse(row.interval_policy);
    const suggested = proposal.suggested_interval_hours ?? row.current_interval_hours;
    const interval = Math.max(policy.min_hours, Math.min(policy.max_hours, suggested));
    const nextCheckAt = status === "active" ? new Date(checkedAt.getTime() + interval * 3_600_000) : null;

    for (const change of proposal.material_changes) {
      await tx`
        INSERT INTO tracking_changes
          (public_id, plan_id, story_id, run_id, plan_version, change_key, change_type, summary,
           before_snapshot, after_snapshot, evidence_ids)
        VALUES
          (${randomUUID()}, ${row.id}, ${row.story_id}, ${task.run_id}, ${row.version}, ${change.change_key},
           ${change.change_type}, ${change.summary}, ${tx.json(change.before as never)},
           ${tx.json(change.after as never)}, ${change.evidence_ids})`;
    }
    const nextVersion = row.version + 1;
    await tx`
      UPDATE tracking_plans SET
        status = ${status}, questions = ${tx.json(questions as never)}, next_check_at = ${nextCheckAt},
        last_checked_at = ${checkedAt}, current_interval_hours = ${interval},
        consecutive_no_change_checks = ${noChangeChecks}, last_snapshot = ${tx.json(task.story as never)},
        last_run_id = ${task.run_id}, version = ${nextVersion}, updated_at = now()
      WHERE id = ${row.id}`;
    return { version: nextVersion, status, idempotent: false };
  });
}
