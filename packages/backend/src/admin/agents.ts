// Phase 7 admin read views over the Phase 4/5/6 agent tables: agent runs, tracking plans, human
// reviews, and product-impact rows awaiting review. Read-only by design — this phase adds no
// approval workflow; every deterministic state change stays with the existing stores.
import { sql } from "../db.ts";

const PAGE_SIZE = 100;

function agentType(graphVersion: string): string {
  if (graphVersion.startsWith("phase4")) return "security-research";
  if (graphVersion.startsWith("phase5")) return "event-tracking";
  if (graphVersion.startsWith("phase6")) return "product-impact";
  return "other";
}

/** Agent runs across the three agents (they share agent_research_runs, split by graph_version). */
export async function agentRuns(filters: { phase?: string; status?: string; page: number }) {
  const rows = await sql<{
    id: number; public_id: string; story_id: number; story_title: string; graph_version: string;
    objective: string; status: "running" | "completed" | "failed"; model: string | null; provider: string | null;
    prompt_version: string | null; error_code: string | null; error_detail: string | null;
    started_at: Date; completed_at: Date | null; trace_id: string; receipt_ids: number[];
  }[]>`
    SELECT r.id, r.public_id::text, r.story_id, st.title AS story_title, r.graph_version,
           left(r.objective, 200) AS objective, r.status, r.model, r.provider, r.prompt_version,
           r.error_code, left(r.error_detail, 300) AS error_detail,
           r.started_at, r.completed_at, r.trace_id::text, r.receipt_ids
    FROM agent_research_runs r JOIN stories st ON st.id = r.story_id
    WHERE (${filters.phase ?? null}::text IS NULL OR split_part(r.graph_version, '-', 1) = ${filters.phase ?? null})
      AND (${filters.status ?? null}::text IS NULL OR r.status = ${filters.status ?? null})
    ORDER BY r.started_at DESC, r.id DESC
    LIMIT ${PAGE_SIZE} OFFSET ${(filters.page - 1) * PAGE_SIZE}`;
  return {
    page: filters.page,
    rows: rows.map((row) => ({
      id: row.id,
      publicId: row.public_id,
      storyId: row.story_id,
      storyTitle: row.story_title,
      agentType: agentType(row.graph_version),
      graphVersion: row.graph_version,
      objective: row.objective,
      status: row.status,
      model: row.model,
      provider: row.provider,
      promptVersion: row.prompt_version,
      errorCode: row.error_code,
      errorDetail: row.error_detail,
      startedAt: row.started_at.toISOString(),
      completedAt: row.completed_at?.toISOString() ?? null,
      traceId: row.trace_id,
      receiptIds: row.receipt_ids ?? [],
    })),
  };
}

export async function trackingPlans(filters: { status?: string }) {
  const rows = await sql<{
    public_id: string; story_id: number; story_title: string; status: "active" | "paused" | "stopped";
    why_track: string; question_count: number; open_questions: number;
    next_check_at: Date | null; last_checked_at: Date | null; current_interval_hours: number;
    version: number; last_change_type: string | null; last_change_at: Date | null;
  }[]>`
    SELECT p.public_id::text, p.story_id, st.title AS story_title, p.status, p.why_track,
           jsonb_array_length(p.questions)::int AS question_count,
           (SELECT count(*)::int FROM jsonb_array_elements(p.questions) q WHERE q->>'status' = 'open') AS open_questions,
           p.next_check_at, p.last_checked_at, p.current_interval_hours, p.version,
           (SELECT c.change_type FROM tracking_changes c WHERE c.story_id = p.story_id ORDER BY c.created_at DESC, c.id DESC LIMIT 1) AS last_change_type,
           (SELECT c.created_at FROM tracking_changes c WHERE c.story_id = p.story_id ORDER BY c.created_at DESC, c.id DESC LIMIT 1) AS last_change_at
    FROM tracking_plans p JOIN stories st ON st.id = p.story_id
    WHERE (${filters.status ?? null}::text IS NULL OR p.status = ${filters.status ?? null})
    ORDER BY p.next_check_at NULLS LAST, p.id`;
  return rows.map((row) => ({
    publicId: row.public_id,
    storyId: row.story_id,
    storyTitle: row.story_title,
    status: row.status,
    whyTrack: row.why_track,
    questionCount: row.question_count,
    openQuestions: row.open_questions,
    nextCheckAt: row.next_check_at?.toISOString() ?? null,
    lastCheckedAt: row.last_checked_at?.toISOString() ?? null,
    currentIntervalHours: row.current_interval_hours,
    planVersion: row.version,
    lastChangeType: row.last_change_type,
    lastChangeAt: row.last_change_at?.toISOString() ?? null,
  }));
}

export async function humanReviews(filters: { status?: string }) {
  const rows = await sql<{
    id: number; public_id: string; story_id: number; story_title: string; run_id: string;
    reason: string; status: "open" | "resolved" | "dismissed"; payload: Record<string, unknown>;
    created_at: Date; resolved_at: Date | null;
  }[]>`
    SELECT h.id, h.public_id::text, h.story_id, st.title AS story_title, h.run_id::text,
           h.reason, h.status, h.payload, h.created_at, h.resolved_at
    FROM impact_human_reviews h JOIN stories st ON st.id = h.story_id
    WHERE (${filters.status ?? null}::text IS NULL OR h.status = ${filters.status ?? null})
    ORDER BY h.created_at DESC, h.id DESC LIMIT ${PAGE_SIZE}`;
  return rows.map((row) => ({
    id: row.id,
    publicId: row.public_id,
    storyId: row.story_id,
    storyTitle: row.story_title,
    runId: row.run_id,
    reason: row.reason,
    status: row.status,
    payload: row.payload ?? {},
    createdAt: row.created_at.toISOString(),
    resolvedAt: row.resolved_at?.toISOString() ?? null,
  }));
}

/**
 * Current product-impact rows that are not clean auto-claims: routed to review, below high
 * confidence, or carrying a version expression the matcher could not support. Each row's evidence
 * is resolved to title + official URL so a reviewer can open the source.
 */
export async function impactReviewRows() {
  const rows = await sql<{
    public_id: string; story_id: number; story_title: string; vendor: string; product: string;
    confidence: "high" | "medium" | "low"; routing: "auto" | "human_review" | "unknown";
    persisted_kind: "claims" | "unknown_only";
    affected_range: { raw: string; supported: boolean } | null;
    fixed_range: { raw: string; supported: boolean } | null;
    unknowns: string[]; evidence_ids: string[]; created_at: Date;
  }[]>`
    SELECT i.public_id::text, i.story_id, st.title AS story_title, sv.canonical_name AS vendor, sp.canonical_name AS product,
           i.confidence, i.routing, i.persisted_kind, i.affected_range, i.fixed_range, i.unknowns,
           i.evidence_ids, i.created_at
    FROM product_impacts i
    JOIN security_entities sv ON sv.id = i.vendor_entity_id
    JOIN security_entities sp ON sp.id = i.product_entity_id
    JOIN stories st ON st.id = i.story_id
    WHERE i.status = 'current'
      AND (i.routing = 'human_review' OR i.confidence <> 'high'
           OR i.affected_range->>'supported' = 'false' OR i.fixed_range->>'supported' = 'false')
    ORDER BY i.created_at DESC, i.id DESC LIMIT ${PAGE_SIZE}`;
  const evidenceIds = [...new Set(rows.flatMap((row) => row.evidence_ids ?? []))];
  const evidence = evidenceIds.length
    ? await sql<{ public_id: string; title: string; canonical_url: string }[]>`
        SELECT public_id::text, title, canonical_url FROM external_evidence WHERE public_id = ANY(${evidenceIds}::uuid[])`
    : [];
  const evidenceById = new Map(evidence.map((item) => [item.public_id, item]));
  return rows.map((row) => ({
    publicId: row.public_id,
    storyId: row.story_id,
    storyTitle: row.story_title,
    vendor: row.vendor,
    product: row.product,
    confidence: row.confidence,
    routing: row.routing,
    persistedKind: row.persisted_kind,
    affectedRange: row.affected_range ? { raw: row.affected_range.raw, supported: row.affected_range.supported } : null,
    fixedRange: row.fixed_range ? { raw: row.fixed_range.raw, supported: row.fixed_range.supported } : null,
    unknowns: row.unknowns ?? [],
    evidence: (row.evidence_ids ?? []).map((id) => evidenceById.get(id)).filter((item): item is { public_id: string; title: string; canonical_url: string } => !!item)
      .map((item) => ({ id: item.public_id, title: item.title, url: item.canonical_url })),
    createdAt: row.created_at.toISOString(),
  }));
}
