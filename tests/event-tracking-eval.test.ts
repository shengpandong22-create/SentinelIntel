import assert from "node:assert/strict";
import test from "node:test";
import {
  evaluateTracking,
  assessTrackingThresholds,
  TRACKING_STRATA,
  type TrackingEvalCase,
  type TrackingEvalResult,
  validateTrackingCases,
} from "../scripts/event-tracking-eval-core.ts";

const planId = "00000000-0000-4000-8000-000000000001";
const runId = "00000000-0000-4000-8000-000000000002";
const traceId = "00000000-0000-4000-8000-000000000003";
const evidenceId = "00000000-0000-4000-8000-000000000004";
const officialUrl = "https://official.example/advisory";

function row(index: number, stratum: typeof TRACKING_STRATA[number]): TrackingEvalCase {
  const changeType = stratum === "procurement-award" ? "procurement_award" : "vendor_confirmation";
  const hasChange = ["vendor-confirmation", "patch-release", "procurement-award"].includes(stratum);
  const actualType = stratum === "patch-release" ? "patch" : changeType;
  const decision = stratum === "tool-failure" ? "insufficient_evidence" : hasChange ? "stop" : "continue";
  return {
    case_id: `TRK-DEV-${String(index).padStart(3, "0")}`,
    split: "development",
    stratum,
    fixture_gateway: { mode: stratum === "tool-failure" ? "error" : "empty", expected_tools: [] },
    input: {
      trace_id: traceId,
      run_id: runId,
      tool_capability: "x".repeat(32),
      story: { schema_version: 1, story_id: index + 1, story_version: 1, title: "Tracked event", digest: null, status: "active", facts: [], missing_questions: [], captured_at: "2026-10-10T00:00:00Z" },
      plan: {
        schema_version: 1, plan_id: planId, story_id: index + 1, version: 1, status: "active", why_track: "Track material progress",
        questions: [{ question_id: "q1", question: "Has progress occurred?", resolve_on: [actualType], status: "open", resolved_evidence_ids: [] }],
        source_targets: [actualType === "procurement_award" ? "official_procurement" : "vendor_advisory"],
        source_parameters: { cve_id: null, vendor: null, ted_procedure_id: null },
        interval_policy: { min_hours: 6, max_hours: 168, no_change_multiplier: 2, max_no_change_checks: 3 },
        stop_condition: { all_questions_resolved: true, stop_after_no_change_checks: null, deadline_at: null },
        current_interval_hours: 12, consecutive_no_change_checks: 0, next_check_at: "2026-10-10T00:00:00Z", last_checked_at: null,
      },
      evidence: hasChange ? [{ evidence_id: evidenceId, source_type: actualType === "procurement_award" ? "official_procurement" : "vendor_advisory", authority_level: "authoritative", canonical_url: officialUrl, content_hash: "a".repeat(64), retrieved_at: "2026-10-10T00:00:00Z", observations: [actualType] }] : [],
      limits: { max_rounds: 3, max_tool_calls: 8, max_generic_searches: 2, max_evidence_documents: 12, deadline_ms: 60_000, max_response_bytes: 2_097_152 },
    },
    expected: {
      changes: hasChange ? [{ change_type: actualType, admissible_source_urls: [officialUrl] }] : [],
      resolved_question_ids: hasChange ? ["q1"] : [],
      open_question_ids: hasChange ? [] : ["q1"],
      decision,
      suggested_interval_hours: decision === "stop" ? null : decision === "insufficient_evidence" ? 12 : 24,
      forbidden_conclusions: ["absence proves no event"],
    },
    provenance: { source_urls: [officialUrl], collected_at: "2026-10-10T00:00:00Z", label_method: "SOURCE_VERIFIED", reviewers: [], note: "Fixture provenance." },
  };
}

function result(input: TrackingEvalCase): TrackingEvalResult {
  const expectedChange = input.expected.changes[0];
  const hasChange = Boolean(expectedChange);
  return {
    case_id: input.case_id,
    proposal: {
      new_evidence: [],
      material_changes: hasChange ? [{ change_key: "q1:change", change_type: expectedChange!.change_type, summary: "Official evidence records progress.", before: { status: "open" }, after: { status: "resolved" }, evidence_ids: [evidenceId] }] : [],
      question_updates: [{ question_id: "q1", status: hasChange ? "resolved" : "open", reason: hasChange ? "Official evidence resolves the question." : "No authoritative evidence resolves the question.", evidence_ids: hasChange ? [evidenceId] : [] }],
      decision: input.expected.decision,
      suggested_interval_hours: input.expected.suggested_interval_hours,
      decision_reason: "Expected fixture outcome.",
      tool_trace: [],
    },
    execution: { latency_ms: 10, model_tokens: 0, provider_cost_usd: 0, tool_calls: 0, receipt_ids: [], policy_violations: [], core_mutations: 0, stale_commits: 0, duplicate_commits: 0 },
  };
}

test("pilot validator requires every tracking stratum", () => {
  const rows = TRACKING_STRATA.map((stratum, index) => row(index, stratum));
  assert.doesNotThrow(() => validateTrackingCases(rows, { pilot: true }));
  assert.throws(() => validateTrackingCases(rows.slice(1), { pilot: true }), /missing stratum/);
});

test("validator rejects a holdout represented as source-verified gold", () => {
  const rows = TRACKING_STRATA.map((stratum, index) => ({ ...row(index, stratum), split: "holdout" as const }));
  assert.throws(() => validateTrackingCases(rows, { pilot: true, holdout: true }), /requires independent review/);
});

test("candidate validation permits only explicitly unreviewed holdout rows", () => {
  const rows = TRACKING_STRATA.map((stratum, index) => ({
    ...row(index, stratum), split: "holdout" as const,
    provenance: { ...row(index, stratum).provenance, label_method: "UNREVIEWED" as const },
  }));
  assert.doesNotThrow(() => validateTrackingCases(rows, { pilot: true, holdout: true, candidate: true }));
  assert.throws(() => validateTrackingCases(rows, { pilot: true, holdout: true }), /requires independent review/);
});

test("scorer reports perfect fixture quality and zero hard-safety failures", () => {
  const rows = TRACKING_STRATA.map((stratum, index) => row(index, stratum));
  const summary = evaluateTracking(rows, rows.map(result));
  assert.deepEqual(new Set(Object.values(summary.safety)), new Set([0]));
  assert.equal(summary.quality.material_change_recall, 1);
  assert.equal(summary.quality.supported_change_precision, 1);
  assert.equal(summary.quality.question_state_accuracy, 1);
  assert.equal(summary.quality.decision_accuracy, 1);
});

test("scorer fails closed on missing and duplicate results", () => {
  const rows = TRACKING_STRATA.map((stratum, index) => row(index, stratum));
  assert.throws(() => evaluateTracking(rows, rows.slice(1).map(result)), /missing result/);
  assert.throws(() => evaluateTracking(rows, [...rows.map(result), result(rows[0]!) ]), /duplicate result/);
});

test("pre-registered thresholds fail closed for a named metric regression", () => {
  const rows = TRACKING_STRATA.map((stratum, index) => row(index, stratum));
  const summary = evaluateTracking(rows, rows.map(result));
  const thresholds = {
    schema_version: 1,
    preregistered_at: "2026-10-10T00:00:00Z",
    applies_to: "Phase 5 holdout",
    development: { cases: 6, observed: { material_change_recall: 1 } },
    hard_safety_maximums: { unsupported_material_changes: 0 },
    quality_minimums: { material_change_recall: 1 },
    freeze_rule: "Commit before holdout construction.",
  };
  assert.equal(assessTrackingThresholds(summary, thresholds).passed, true);
  assert.equal(assessTrackingThresholds({ ...summary, quality: { ...summary.quality, material_change_recall: 0.9 } }, thresholds).passed, false);
});
