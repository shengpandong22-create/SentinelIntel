import { z } from "zod";
import { ResearchEvidenceSchema, ResearchLimitsSchema, ResearchToolTraceSchema, StoryResearchSnapshotSchema } from "./research-contract.ts";
import { TrackingEvidenceRefSchema } from "./tracking-contract.ts";
import { parseVersionRange } from "./version-matcher.ts";

// Phase 6 Product Impact Agent contract (docs/00-sentinelintel/07-Phase6-Product-Impact-Plan.md).
//
// Ownership: Python proposes extraction-grounded impact rows; TypeScript owns entity identity, the
// deterministic version matcher, evidence linkage checks, confidence routing, and persistence. The LLM
// is only reachable through the TypeScript model gateway; it never computes version ranges and never
// concludes "unaffected" from absence. PoC status is unknown-only in Phase 6: no PoC source is
// allowlisted, so other values are unreachable.

export const IMPACT_CONFIDENCE = ["high", "medium", "low"] as const;

export const ImpactRangeSchema = z.object({
  raw: z.string().min(1).max(200),
  supported: z.boolean(),
}).strict();

export const ImpactExploitStatusSchema = z.object({
  poc: z.literal("unknown"),
  known_exploited: z.enum(["unknown", "yes", "no"]),
}).strict();

export const ImpactRowSchema = z.object({
  vendor: z.string().min(1).max(200),
  product: z.string().min(1).max(200),
  models: z.array(z.string().min(1).max(200)).max(50),
  cve_id: z.string().regex(/^CVE-\d{4}-\d{4,}$/).nullable(),
  affected_range: ImpactRangeSchema,
  fixed_range: ImpactRangeSchema.nullable(),
  mitigations: z.array(z.string().min(1).max(500)).max(20),
  confidence: z.enum(IMPACT_CONFIDENCE),
  evidence_ids: z.array(z.uuid()).min(1).max(20),
}).strict();

export const ImpactExtractionRequestSchema = z.object({
  request_id: z.uuid(),
  evidence_ids: z.array(z.uuid()).min(1).max(12),
  focus: z.enum(["product_versions", "mitigation", "exploit_status"]),
  instructions: z.string().min(1).max(2_000),
}).strict();

// The Python graph emits extraction requests; the TypeScript model gateway executes them under
// receipts and budgets; the drafts flow back to Python for normalization. Range expressions stay raw
// text and the gateway attaches the deterministic matcher's support flags — the model never decides
// support, and unsupported expressions must surface as unknown, never as a claim.
export const ImpactExtractionRowDraftSchema = z.object({
  vendor: z.string().min(1).max(200),
  product: z.string().min(1).max(200),
  models: z.array(z.string().min(1).max(200)).max(50),
  cve_id: z.string().regex(/^CVE-\d{4}-\d{4,}$/).nullable(),
  affected_range_raw: z.string().max(200).nullable(),
  affected_range_supported: z.boolean(),
  fixed_range_raw: z.string().max(200).nullable(),
  fixed_range_supported: z.boolean(),
  mitigations: z.array(z.string().min(1).max(500)).max(20),
  confidence: z.enum(IMPACT_CONFIDENCE),
  evidence_ids: z.array(z.uuid()).min(1).max(20),
}).strict();

export const ImpactExtractionSchema = z.object({
  drafts: z.array(ImpactExtractionRowDraftSchema).max(20),
  unknowns: z.array(z.string().min(1).max(500)).max(50),
  prompt_version: z.string().min(1).max(100),
}).strict();

export const ImpactProposalSchema = z.object({
  new_evidence: z.array(ResearchEvidenceSchema).max(12),
  impact_rows: z.array(ImpactRowSchema).max(20),
  exploit_status: ImpactExploitStatusSchema,
  known_exploited_evidence_ids: z.array(z.uuid()).max(20),
  unknowns: z.array(z.string().min(1).max(500)).max(50),
  decision: z.enum(["propose", "insufficient_evidence"]),
  decision_reason: z.string().min(1).max(4_000),
  tool_trace: z.array(ResearchToolTraceSchema).max(8),
  extraction_requests: z.array(ImpactExtractionRequestSchema).max(12).default([]),
}).strict().superRefine((proposal, ctx) => {
  const rowKeys = proposal.impact_rows.map((row) => `${row.vendor}::${row.product}`.toLowerCase());
  if (new Set(rowKeys).size !== rowKeys.length) {
    ctx.addIssue({ code: "custom", message: "duplicate impact row for vendor and product" });
  }
  if (proposal.exploit_status.known_exploited === "yes" && proposal.known_exploited_evidence_ids.length === 0) {
    ctx.addIssue({ code: "custom", message: "known_exploited yes lacks KEV evidence" });
  }
  if (proposal.exploit_status.known_exploited !== "yes" && proposal.known_exploited_evidence_ids.length > 0) {
    ctx.addIssue({ code: "custom", message: "known_exploited evidence present without yes" });
  }
  if (proposal.decision === "propose" && proposal.impact_rows.length === 0 && proposal.unknowns.length === 0) {
    ctx.addIssue({ code: "custom", message: "proposing without impact rows or unknowns" });
  }
});

export const ImpactSourceParametersSchema = z.object({
  cve_id: z.string().regex(/^CVE-\d{4}-\d{4,}$/).nullable(),
  vendor: z.string().min(1).max(200).regex(/^[A-Za-z0-9][A-Za-z0-9 ._-]*$/).nullable(),
}).strict().default({ cve_id: null, vendor: null });

export const ImpactTaskSchema = z.object({
  trace_id: z.uuid(),
  run_id: z.uuid(),
  tool_capability: z.string().min(32),
  story: StoryResearchSnapshotSchema,
  source_parameters: ImpactSourceParametersSchema,
  // Evidence refs reuse the tracking shape; observations drive tracking routing only and are ignored
  // by impact validation, which checks evidence existence and story locality instead.
  evidence: z.array(TrackingEvidenceRefSchema).max(100),
  limits: ResearchLimitsSchema,
  // Present only in the normalization call: gateway-executed extraction drafts to turn into rows.
  extraction: ImpactExtractionSchema.nullable().default(null),
}).strict();

export const ImpactTaskResponseSchema = z.object({
  trace_id: z.uuid(),
  run_id: z.uuid(),
  proposal: ImpactProposalSchema,
}).strict();

/** The proposal may only claim matcher support the deterministic matcher actually grants. */
function rangeIsSupported(range: z.infer<typeof ImpactRangeSchema>): boolean {
  return range.supported && parseVersionRange(range.raw) !== null;
}

export function validateImpactProposal(task: z.infer<typeof ImpactTaskSchema>, raw: unknown) {
  const proposal = ImpactProposalSchema.parse(raw);
  const evidenceIds = new Set([
    ...task.evidence.map((item) => item.evidence_id),
    ...proposal.new_evidence.map((item) => item.evidence_id),
    ...(task.extraction?.drafts.flatMap((draft) => draft.evidence_ids) ?? []),
  ]);
  for (const request of proposal.extraction_requests) {
    for (const id of request.evidence_ids) {
      if (!evidenceIds.has(id)) throw new Error(`extraction request cites unknown evidence: ${id}`);
    }
  }
  const kevEvidence = new Set(
    [
      ...task.evidence,
      ...proposal.new_evidence.map((item) => ({ source_type: item.source_type, evidence_id: item.evidence_id })),
    ]
      .filter((item) => item.source_type === "cisa_kev")
      .map((item) => item.evidence_id),
  );
  const referenced = [
    ...proposal.impact_rows.flatMap((row) => row.evidence_ids),
    proposal.known_exploited_evidence_ids,
  ].flat();
  for (const id of referenced) if (!evidenceIds.has(id)) throw new Error(`dangling impact evidence id: ${id}`);
  for (const id of proposal.known_exploited_evidence_ids) {
    if (!kevEvidence.has(id)) throw new Error(`known_exploited evidence is not from the KEV catalog: ${id}`);
  }
  for (const row of proposal.impact_rows) {
    if (!rangeIsSupported(row.affected_range) && row.affected_range.supported) {
      throw new Error(`affected range is not matcher-supported: ${row.product}`);
    }
    if (row.fixed_range && !rangeIsSupported(row.fixed_range) && row.fixed_range.supported) {
      throw new Error(`fixed range is not matcher-supported: ${row.product}`);
    }
  }
  if (task.source_parameters.cve_id) {
    for (const row of proposal.impact_rows) {
      if (row.cve_id && row.cve_id !== task.source_parameters.cve_id) {
        throw new Error(`impact row cites another CVE than the task: ${row.product}`);
      }
    }
  }
  return proposal;
}

export type ImpactTask = z.infer<typeof ImpactTaskSchema>;
export type ImpactProposal = z.infer<typeof ImpactProposalSchema>;
export type ImpactRow = z.infer<typeof ImpactRowSchema>;
export type ImpactTaskResponse = z.infer<typeof ImpactTaskResponseSchema>;
export type ImpactExtractionRequest = z.infer<typeof ImpactExtractionRequestSchema>;
export type ImpactExtraction = z.infer<typeof ImpactExtractionSchema>;
