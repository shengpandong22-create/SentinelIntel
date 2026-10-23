// Phase 7 unified agent-intelligence read model. One function assembles every Phase 4/5/6 agent
// signal for a Story into a single public-safe DTO; the website story page, the public v1 API and
// the MCP get_story tool all read through here, so no surface runs its own agent queries.
//
// Safety contract (docs/00-sentinelintel/08-Phase7-UI-Admin-MCP-Plan.md §A): only public-safe
// fields leave this module. Internal run state (tool traces, usage, input snapshots, capabilities,
// trace ids, receipts, prompt versions, failure details), evidence internals (normalized,
// provenance, content hashes), tracking diff snapshots and human-review payloads never appear in
// the DTO. Unknowns stay verbatim and are never reworded into safety conclusions.
//
// Read-only by construction: every statement is a SELECT, so rendering a page cannot write, call a
// model, or reach the network.
import type {
  StoryAgentEvidenceView,
  StoryAgentIntelligence,
  StoryProductImpactRowView,
  StoryProductImpactView,
  StoryResearchClaimView,
  StoryResearchView,
  StoryTimelineChangeView,
  StoryTrackingQuestionView,
  StoryTrackingView,
  StoryUnknownView,
} from "@aihot/contracts/site";
import { sql } from "../db.ts";
import { ResearchProposalSchema } from "../agents/research-contract.ts";

const EVIDENCE_LIMIT = 50;
const CHANGES_LIMIT = 20;

interface EvidenceRow {
  public_id: string;
  source_type: string;
  source_name: string;
  canonical_url: string;
  title: string;
  excerpt: string | null;
  authority_level: "authoritative" | "primary" | "secondary";
  published_at: Date | null;
  retrieved_at: Date;
}

interface RunRow {
  status: "running" | "completed" | "failed";
  completed_at: Date | null;
  output_proposal: unknown;
}

interface PlanRow {
  status: "active" | "paused" | "stopped";
  why_track: string;
  questions: Array<{ question_id: string; question: string; status: "open" | "resolved" }>;
  last_checked_at: Date | null;
  updated_at: Date;
}

interface ChangeRow {
  public_id: string;
  change_type: "vendor_confirmation" | "patch" | "procurement_award" | "material_update";
  summary: string;
  evidence_ids: string[];
  created_at: Date;
}

interface ImpactRow {
  public_id: string;
  vendor: string;
  product: string;
  models: string[];
  cve_id: string | null;
  affected_range: { raw: string; supported: boolean } | null;
  fixed_range: { raw: string; supported: boolean } | null;
  mitigations: string[];
  persisted_kind: "claims" | "unknown_only";
  confidence: "high" | "medium" | "low";
  routing: "auto" | "human_review" | "unknown";
  exploit_status: { poc: "unknown"; known_exploited: "unknown" | "yes" | "no" } | null;
  unknowns: string[];
  evidence_ids: string[];
  created_at: Date;
}

/** Only {raw, supported} is public; the matcher's internal range object stays backend-side. */
function rangeView(range: { raw: string; supported: boolean } | null): { raw: string; supported: boolean } | null {
  if (!range || typeof range.raw !== "string" || typeof range.supported !== "boolean") return null;
  return { raw: range.raw, supported: range.supported };
}

function researchView(run: RunRow | null): StoryResearchView | null {
  if (!run) return null;
  if (run.status === "running") return { status: "running", completedAt: null, summary: null, claims: [], conflictCount: 0 };
  if (run.status === "failed") return { status: "failed", completedAt: run.completed_at?.toISOString() ?? null, summary: null, claims: [], conflictCount: 0 };
  // Completed: the proposal was schema-validated on write; parse defensively so a corrupted row
  // degrades to "no claims" instead of breaking the page.
  const proposal = ResearchProposalSchema.safeParse(run.output_proposal);
  const claims: StoryResearchClaimView[] = proposal.success
    ? proposal.data.claims.map((claim) => ({
        claimId: claim.claim_id,
        text: claim.text,
        criticality: claim.criticality,
        status: claim.status,
        evidenceIds: claim.evidence_ids,
      }))
    : [];
  return {
    status: proposal.success ? proposal.data.terminal_status : "completed",
    completedAt: run.completed_at?.toISOString() ?? null,
    summary: proposal.success ? proposal.data.summary : null,
    claims,
    conflictCount: proposal.success ? proposal.data.conflicts.length : 0,
  };
}

function trackingView(plan: PlanRow | null): StoryTrackingView | null {
  if (!plan) return null;
  const questions: StoryTrackingQuestionView[] = (Array.isArray(plan.questions) ? plan.questions : [])
    .filter((q) => q && typeof q.question_id === "string" && typeof q.question === "string")
    .map((q) => ({ questionId: q.question_id, question: q.question, status: q.status === "resolved" ? "resolved" : "open" }));
  return {
    status: plan.status,
    whyTrack: plan.why_track,
    questions,
    lastCheckedAt: plan.last_checked_at?.toISOString() ?? null,
  };
}

function impactRows(rows: ImpactRow[], openReviewCount: number): StoryProductImpactView {
  const views: StoryProductImpactRowView[] = rows.map((row) => {
    const exploit = row.exploit_status;
    return {
      id: row.public_id,
      vendor: row.vendor,
      product: row.product,
      models: Array.isArray(row.models) ? row.models : [],
      affectedRange: rangeView(row.affected_range),
      fixedRange: rangeView(row.fixed_range),
      mitigations: Array.isArray(row.mitigations) ? row.mitigations : [],
      persistedKind: row.persisted_kind === "unknown_only" ? "unknown_only" : "claims",
      confidence: row.confidence,
      routing: row.routing,
      // Store-written rows persist as auto (claims) or unknown (unknown-only); a human_review
      // routing is schema-honest but never written by the deterministic store.
      reviewRequired: row.routing === "human_review",
      exploitStatus: {
        poc: "unknown",
        knownExploited: exploit?.known_exploited === "yes" || exploit?.known_exploited === "no" ? exploit.known_exploited : "unknown",
      },
      cveId: row.cve_id,
      evidenceIds: Array.isArray(row.evidence_ids) ? row.evidence_ids : [],
      unknowns: Array.isArray(row.unknowns) ? row.unknowns : [],
    };
  });
  // The review signal is the open human reviews: the deterministic store routes a medium row to
  // impact_human_reviews and never persists it, so a story with pending reviews can have zero rows
  // here. Persisted rows routed to review are counted defensively (schema-honest, never written by
  // the store today). The payload itself never crosses into the public projection.
  return { rows: views, reviewRequiredCount: views.filter((row) => row.reviewRequired).length + openReviewCount };
}

/**
 * The one read model behind the Story page, the public v1 API and MCP get_story. Pure SELECTs over
 * the Phase 4/5/6 tables; empty stories return present=false and every caller renders its empty
 * state. Never throws on missing agent data — absence is a normal state, not an error.
 */
export async function loadStoryAgentIntelligence(storyId: number): Promise<StoryAgentIntelligence> {
  const [evidence, latestRun, plan, changes, impacts, openReviews] = await Promise.all([
    sql<EvidenceRow[]>`
      SELECT public_id::text, source_type, source_name, canonical_url, title, excerpt, authority_level, published_at, retrieved_at
      FROM external_evidence WHERE story_id = ${storyId}
      ORDER BY retrieved_at DESC, id DESC LIMIT ${EVIDENCE_LIMIT}`,
    // The research view reads the latest PHASE 4 run only: agent_research_runs is shared by all
    // three agents (graph_version phase4-*/phase5-*/phase6-*), and a later tracking or impact run
    // would otherwise be parsed with the research schema and published as "completed, no claims".
    sql<RunRow[]>`
      SELECT status, completed_at, output_proposal FROM agent_research_runs
      WHERE story_id = ${storyId} AND graph_version LIKE 'phase4-%'
      ORDER BY created_at DESC, id DESC LIMIT 1`,
    sql<PlanRow[]>`
      SELECT status, why_track, questions, last_checked_at, updated_at FROM tracking_plans WHERE story_id = ${storyId}`,
    sql<ChangeRow[]>`
      SELECT public_id::text, change_type, summary, evidence_ids, created_at FROM tracking_changes
      WHERE story_id = ${storyId} ORDER BY created_at DESC, id DESC LIMIT ${CHANGES_LIMIT}`,
    sql<ImpactRow[]>`
      SELECT i.public_id::text, sv.canonical_name AS vendor, sp.canonical_name AS product, i.models, i.cve_id,
             i.affected_range, i.fixed_range, i.mitigations, i.persisted_kind, i.confidence, i.routing,
             i.exploit_status, i.unknowns, i.evidence_ids, i.created_at
      FROM product_impacts i
      JOIN security_entities sv ON sv.id = i.vendor_entity_id
      JOIN security_entities sp ON sp.id = i.product_entity_id
      WHERE i.story_id = ${storyId} AND i.status = 'current'
      ORDER BY sp.canonical_name, i.impact_version DESC`,
    sql<{ n: number; latest_at: Date | null }[]>`SELECT count(*)::int AS n, max(created_at) AS latest_at FROM impact_human_reviews WHERE story_id = ${storyId} AND status = 'open'`,
  ]);

  const openReviewCount = openReviews[0]?.n ?? 0;
  const research = researchView(latestRun[0] ?? null);
  const tracking = trackingView(plan[0] ?? null);
  const productImpact = impactRows(impacts, openReviewCount);
  const timelineChanges: StoryTimelineChangeView[] = changes.map((row) => ({
    id: row.public_id,
    changeType: row.change_type,
    summary: row.summary,
    evidenceIds: Array.isArray(row.evidence_ids) ? row.evidence_ids : [],
    createdAt: row.created_at.toISOString(),
  }));
  const evidenceViews: StoryAgentEvidenceView[] = evidence.map((row) => ({
    id: row.public_id,
    sourceType: row.source_type,
    sourceName: row.source_name,
    url: row.canonical_url,
    title: row.title,
    excerpt: row.excerpt,
    authorityLevel: row.authority_level,
    publishedAt: row.published_at?.toISOString() ?? null,
    retrievedAt: row.retrieved_at.toISOString(),
  }));
  const unknowns: StoryUnknownView[] = [
    ...researchUnknowns(latestRun[0] ?? null),
    ...productImpact.rows.flatMap((row) => row.unknowns.map((text) => ({ source: "product_impact" as const, text, reason: null }))),
  ];

  const stamps = [
    evidence[0]?.retrieved_at ?? null,
    latestRun[0]?.completed_at ?? null,
    plan[0]?.updated_at ?? null,
    impacts[0]?.created_at ?? null,
    changes[0]?.created_at ?? null,
    openReviews[0]?.latest_at ?? null,
  ].filter((value): value is Date => !!value);
  // An open human review is agent data on its own: a story whose only signal is a pending review
  // must not render as "no security research".
  const present = !!research || !!tracking || timelineChanges.length > 0 || productImpact.rows.length > 0 || evidenceViews.length > 0 || openReviewCount > 0;

  return {
    present,
    dataUpdatedAt: stamps.length ? new Date(Math.max(...stamps.map((d) => d.getTime()))).toISOString() : null,
    reviewRequiredCount: openReviews[0]?.n ?? 0,
    research,
    tracking,
    timelineChanges,
    productImpact,
    evidence: evidenceViews,
    unknowns,
  };
}

/** Research unknowns (question + reason) from the latest completed run's proposal, verbatim. */
function researchUnknowns(run: RunRow | null): StoryUnknownView[] {
  if (!run || run.status !== "completed") return [];
  const proposal = ResearchProposalSchema.safeParse(run.output_proposal);
  if (!proposal.success) return [];
  return proposal.data.unknowns.map((unknown) => ({ source: "research" as const, text: unknown.question, reason: unknown.reason }));
}
