import { z } from "zod";

export const ResearchLimitsSchema = z.object({
  max_rounds: z.number().int().min(1).max(3),
  max_tool_calls: z.number().int().min(0).max(8),
  max_generic_searches: z.number().int().min(0).max(2),
  max_evidence_documents: z.number().int().min(0).max(12),
  deadline_ms: z.number().int().min(100).max(300_000),
  max_response_bytes: z.number().int().min(1_024).max(8 * 1024 * 1024),
}).strict();

export const DEFAULT_RESEARCH_LIMITS = {
  max_rounds: 3,
  max_tool_calls: 8,
  max_generic_searches: 2,
  max_evidence_documents: 12,
  deadline_ms: 60_000,
  max_response_bytes: 2 * 1024 * 1024,
} as const;

export const ResearchEvidenceSchema = z.object({
  evidence_id: z.uuid(),
  source_type: z.string().min(1).max(64),
  source_name: z.string().min(1).max(200),
  canonical_url: z.url().refine((url) => url.startsWith("https://") || url.startsWith("http://"), "HTTP(S) URL required"),
  title: z.string().min(1).max(1_000),
  excerpt: z.string().max(20_000).nullable().default(null),
  normalized: z.record(z.string(), z.unknown()).default({}),
  content_hash: z.string().regex(/^[0-9a-f]{64}$/),
  authority_level: z.enum(["authoritative", "primary", "secondary"]),
  published_at: z.iso.datetime({ offset: true }).nullable().default(null),
  source_updated_at: z.iso.datetime({ offset: true }).nullable().default(null),
  retrieved_at: z.iso.datetime({ offset: true }),
  provenance: z.record(z.string(), z.unknown()).default({}),
}).strict();

export const ResearchClaimSchema = z.object({
  claim_id: z.string().min(1).max(100),
  text: z.string().min(1).max(4_000),
  criticality: z.enum(["critical", "noncritical"]),
  status: z.enum(["confirmed", "conflicted"]),
  confidence: z.number().min(0).max(1),
  evidence_ids: z.array(z.uuid()).min(1),
}).strict();

export const ResearchUnknownSchema = z.object({
  question: z.string().min(1).max(2_000),
  attempted_sources: z.array(z.string().min(1).max(500)).max(20),
  reason: z.string().min(1).max(2_000),
}).strict();

export const ResearchToolTraceSchema = z.object({
  sequence: z.number().int().min(1),
  tool: z.enum(["nvd_lookup", "kev_lookup", "vendor_advisory_search", "evidence_fetch", "web_search", "stub"]),
  status: z.enum(["ok", "error", "blocked"]),
  input_summary: z.record(z.string(), z.unknown()),
  evidence_ids: z.array(z.uuid()).default([]),
  receipt_ids: z.array(z.number().int().positive()).default([]),
  latency_ms: z.number().int().nonnegative(),
  error_code: z.string().max(100).nullable().default(null),
}).strict();

export const ResearchProposalSchema = z.object({
  claims: z.array(ResearchClaimSchema).max(100),
  unknowns: z.array(ResearchUnknownSchema).max(100),
  evidence: z.array(ResearchEvidenceSchema).max(12),
  conflicts: z.array(z.object({
    description: z.string().min(1).max(4_000),
    evidence_ids: z.array(z.uuid()).min(2),
  }).strict()).max(50),
  tool_trace: z.array(ResearchToolTraceSchema).max(8),
  summary: z.string().min(1).max(10_000),
  terminal_status: z.enum(["completed", "insufficient_evidence"]),
}).strict().superRefine((proposal, ctx) => {
  const evidenceById = new Map(proposal.evidence.map((item) => [item.evidence_id, item]));
  const evidenceIds = new Set(evidenceById.keys());
  const referenced = [
    ...proposal.claims.flatMap((claim) => claim.evidence_ids),
    ...proposal.conflicts.flatMap((conflict) => conflict.evidence_ids),
    ...proposal.tool_trace.flatMap((entry) => entry.evidence_ids),
  ];
  for (const id of referenced) {
    if (!evidenceIds.has(id)) ctx.addIssue({ code: "custom", message: `dangling evidence id: ${id}` });
  }
  for (const claim of proposal.claims) {
    if (claim.criticality === "critical" && claim.status === "confirmed"
      && !claim.evidence_ids.some((id) => evidenceById.get(id)?.authority_level !== "secondary")) {
      ctx.addIssue({ code: "custom", message: `critical claim lacks authoritative or primary evidence: ${claim.claim_id}` });
    }
  }
  const sequences = proposal.tool_trace.map((entry) => entry.sequence);
  if (new Set(sequences).size !== sequences.length) ctx.addIssue({ code: "custom", message: "duplicate tool trace sequence" });
});

export const StoryResearchSnapshotSchema = z.object({
  schema_version: z.literal(1),
  story_id: z.number().int().positive(),
  story_version: z.number().int().positive(),
  title: z.string().min(1).max(2_000),
  digest: z.string().max(20_000).nullable(),
  status: z.enum(["active", "watching", "settled"]),
  facts: z.array(z.object({
    fact_id: z.number().int().positive(),
    public_id: z.string().min(1).max(200),
    title: z.string().min(1).max(2_000),
  }).strict()).max(500),
  missing_questions: z.array(z.string().min(1).max(2_000)).max(100),
  captured_at: z.iso.datetime({ offset: true }),
}).strict();

export const ResearchTaskResponseSchema = z.object({
  trace_id: z.uuid(),
  run_id: z.uuid(),
  status: z.literal("ok"),
  proposal: ResearchProposalSchema,
}).strict();

export type ResearchLimits = z.infer<typeof ResearchLimitsSchema>;
export type ResearchEvidence = z.infer<typeof ResearchEvidenceSchema>;
export type ResearchProposal = z.infer<typeof ResearchProposalSchema>;
export type StoryResearchSnapshot = z.infer<typeof StoryResearchSnapshotSchema>;
export type ResearchTaskResponse = z.infer<typeof ResearchTaskResponseSchema>;
