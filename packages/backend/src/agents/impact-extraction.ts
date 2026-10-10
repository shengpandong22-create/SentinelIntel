import { z } from "zod";
import { config } from "../config.ts";
import { chatJson } from "../providers/llm.ts";
import {
  ImpactExtractionRequestSchema,
  ImpactExtractionSchema,
  type ImpactExtraction,
  type ImpactExtractionRequest,
  type ImpactTask,
} from "./impact-contract.ts";
import { parseVersionRange } from "./version-matcher.ts";

// The Phase 6 model-gateway half of the extraction round trip: Python asks which evidence needs
// extraction, this module executes the request through the existing paid model path (receipts,
// budgets, prompt version), and hands normalized drafts back to Python. Range expressions stay raw;
// the deterministic matcher — never the model — decides support.

export const IMPACT_EXTRACTION_PROMPT_VERSION = "phase6-impact-extraction-v1";

const RawDraftsSchema = z.object({
  drafts: z.array(z.object({
    vendor: z.string().min(1).max(200),
    product: z.string().min(1).max(200),
    models: z.array(z.string().min(1).max(200)).max(50),
    cve_id: z.string().regex(/^CVE-\d{4}-\d{4,}$/).nullable(),
    affected_range_raw: z.string().max(200).nullable(),
    fixed_range_raw: z.string().max(200).nullable(),
    mitigations: z.array(z.string().min(1).max(500)).max(20),
    confidence: z.enum(["high", "medium", "low"]),
    evidence_ids: z.array(z.uuid()).min(1).max(20),
  }).strict()).max(20),
  unknowns: z.array(z.string().min(1).max(500)).max(50),
}).strict();

const ExtractionSystemPrompt = [
  "You extract product impact facts for security advisories from the supplied official evidence only.",
  "Quote version expressions exactly as the evidence states them; never invent, order, or repair them.",
  "A missing fact stays absent; absence of evidence never means a product is unaffected.",
  "Confidence is high only when an authoritative source states the claim verbatim.",
  "Return strict JSON only.",
].join(" ");

export function impactExtractionPrompt(task: ImpactTask, requests: ImpactExtractionRequest[]): string {
  return JSON.stringify({
    task: "Extract every requested impact fact. Do not invent ranges, models, or products.",
    cve_id: task.source_parameters.cve_id,
    output: { drafts: [{ vendor: "vendor name", product: "product family", models: ["model"], cve_id: "CVE-...",
      affected_range_raw: "exact quoted expression or null", fixed_range_raw: "exact quoted expression or null",
      mitigations: ["action"], confidence: "high|medium|low", evidence_ids: ["cited evidence id"] }],
      unknowns: ["what the evidence does not answer"] },
    requests: requests.map((request) => ({
      request_id: request.request_id, focus: request.focus, instructions: request.instructions,
      evidence: task.evidence
        .filter((item) => request.evidence_ids.includes(item.evidence_id))
        .map((item) => ({ evidence_id: item.evidence_id, source_type: item.source_type, title: task.story.title, url: item.canonical_url })),
    })),
  });
}

/** Normalizes raw model output into contract drafts: matcher-checked range flags, no dangling citations. */
export function normalizeExtraction(
  raw: unknown,
  allowedEvidence: ReadonlySet<string>,
  promptVersion: string = IMPACT_EXTRACTION_PROMPT_VERSION,
): ImpactExtraction {
  const parsed = RawDraftsSchema.parse(raw);
  const supportedOf = (rawRange: string | null) => rawRange !== null && parseVersionRange(rawRange) !== null;
  const drafts = parsed.drafts
    .map((draft) => {
      const evidence_ids = [...new Set(draft.evidence_ids)].filter((id) => allowedEvidence.has(id));
      return {
        vendor: draft.vendor,
        product: draft.product,
        models: draft.models,
        cve_id: draft.cve_id,
        affected_range_raw: draft.affected_range_raw,
        affected_range_supported: supportedOf(draft.affected_range_raw),
        fixed_range_raw: draft.fixed_range_raw,
        fixed_range_supported: supportedOf(draft.fixed_range_raw),
        mitigations: draft.mitigations,
        confidence: draft.confidence,
        evidence_ids,
      };
    })
    .filter((draft) => draft.evidence_ids.length > 0);
  return ImpactExtractionSchema.parse({ drafts, unknowns: parsed.unknowns, prompt_version: promptVersion });
}

export interface ExtractionGatewayOptions {
  modelCallsEnabled?: boolean;
  subject?: string;
}

/**
 * Executes one structured extraction request through the paid model path. Fails closed unless model
 * calls are explicitly enabled for this run; the development replay never uses this function.
 */
export async function extractImpactDrafts(
  task: ImpactTask,
  requests: ImpactExtractionRequest[],
  opts: ExtractionGatewayOptions = {},
): Promise<ImpactExtraction & { receiptId: number }> {
  if (!(opts.modelCallsEnabled ?? config.modelCallsEnabled)) {
    throw new Error("Model calls are disabled (MODEL_CALLS_ENABLED=false)");
  }
  ImpactExtractionRequestSchema.array().max(12).parse(requests);
  const result = await chatJson({
    model: "default",
    purpose: "impact-extraction",
    subject: opts.subject ?? `phase6:impact:${task.story.story_id}`,
    promptVersion: IMPACT_EXTRACTION_PROMPT_VERSION,
    system: ExtractionSystemPrompt,
    schema: RawDraftsSchema,
    user: impactExtractionPrompt(task, requests),
    parse: (content: string) => {
      const start = content.indexOf("{"), end = content.lastIndexOf("}");
      if (start < 0 || end < start) throw new Error("extraction output contains no JSON object");
      return JSON.parse(content.slice(start, end + 1)) as unknown;
    },
    maxTokens: 4_000,
    timeoutMs: 180_000,
  });
  const allowed = new Set(task.evidence.map((item) => item.evidence_id));
  return { ...normalizeExtraction(result.data, allowed), receiptId: result.receiptId };
}
