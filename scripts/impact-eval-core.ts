import { z } from "zod";
import { ImpactExtractionSchema, ImpactSourceParametersSchema } from "../packages/backend/src/agents/impact-contract.ts";
import { parseVersionRange } from "../packages/backend/src/agents/version-matcher.ts";
import { TrackingEvidenceRefSchema } from "../packages/backend/src/agents/tracking-contract.ts";

// Phase 6 offline evaluation contract. The evaluated unit is one normalization run: frozen Story
// context, frozen official Evidence, and frozen gateway extraction drafts in, deterministic
// normalization rows out. The replay never touches the network, a model, or a receipt; the
// model-gateway half of the round trip is exercised separately by live checks.

export const IMPACT_STRATA = [
  "single-product-cve",
  "multi-product-family",
  "model-alias-conflict",
  "unresolvable-range",
  "missing-advisory",
  "conflicting-statements",
  "kev-status",
  "non-security-negative",
] as const;

export const ImpactEvalCaseSchema = z.object({
  case_id: z.string().regex(/^IMP-[A-Z0-9-]+$/),
  split: z.enum(["development", "holdout"]),
  stratum: z.enum(IMPACT_STRATA),
  input: z.object({
    story_title: z.string().min(1).max(500),
    story_digest: z.string().max(2_000).nullable(),
    source_parameters: ImpactSourceParametersSchema,
    evidence: z.array(TrackingEvidenceRefSchema).max(20),
    extraction: ImpactExtractionSchema,
  }).strict(),
  expected: z.object({
    decision: z.enum(["propose", "insufficient_evidence"]),
    rows: z.array(z.object({
      vendor: z.string().min(1).max(200),
      product: z.string().min(1).max(200),
      affected_supported: z.boolean(),
      fixed_supported: z.boolean().nullable(),
      confidence: z.enum(["high", "medium", "low"]),
    }).strict()).max(20),
    known_exploited: z.enum(["unknown", "yes", "no"]),
    unknowns_min: z.number().int().min(0).max(50),
  }).strict(),
  provenance: z.object({
    source_urls: z.array(z.url()).min(1).max(30),
    collected_at: z.iso.datetime({ offset: true }),
    label_method: z.enum(["UNREVIEWED", "SOURCE_VERIFIED", "HUMAN_ADJUDICATED", "MODEL_REVIEWED"]),
    reviewers: z.array(z.string().min(1).max(200)).max(10),
    note: z.string().min(1).max(2_000),
  }).strict(),
}).strict();

export const ImpactResultSchema = z.object({
  case_id: z.string(),
  proposal: z.object({
    impact_rows: z.array(z.object({
      vendor: z.string(),
      product: z.string(),
      affected_range: z.object({ raw: z.string(), supported: z.boolean() }).passthrough(),
      fixed_range: z.object({ raw: z.string(), supported: z.boolean() }).passthrough().nullable(),
      models: z.array(z.string()),
      confidence: z.string(),
      evidence_ids: z.array(z.string()),
    }).passthrough()),
    exploit_status: z.object({ poc: z.string(), known_exploited: z.string() }),
    known_exploited_evidence_ids: z.array(z.string()),
    unknowns: z.array(z.string()),
    decision: z.string(),
    decision_reason: z.string(),
  }).passthrough(),
  execution: z.object({
    latency_ms: z.number().nonnegative(),
    tool_calls: z.number().int().nonnegative(),
    model_tokens: z.number().nonnegative(),
    provider_cost_usd: z.number().nonnegative(),
  }).strict(),
}).strict();

export type ImpactEvalCase = z.infer<typeof ImpactEvalCaseSchema>;
export type ImpactResult = z.infer<typeof ImpactResultSchema>;

export const ImpactThresholdsSchema = z.object({
  schema_version: z.literal(1),
  preregistered_at: z.iso.datetime({ offset: true }),
  applies_to: z.string().min(1),
  development: z.object({ cases: z.number().int().positive(), observed: z.record(z.string(), z.number()) }).strict(),
  hard_safety_maximums: z.record(z.string(), z.literal(0)),
  quality_minimums: z.record(z.string(), z.number().min(0).max(1)),
  freeze_rule: z.string().min(1),
}).strict();

export function parseImpactJsonl<T>(text: string, schema: z.ZodType<T>): T[] {
  return text.split(/\r?\n/).map((line) => line.trim()).filter(Boolean).map((line, index) => {
    try { return schema.parse(JSON.parse(line)); }
    catch (error) { throw new Error(`line ${index + 1}: ${error instanceof Error ? error.message : String(error)}`); }
  });
}

export function validateImpactEvalCases(cases: ImpactEvalCase[], opts: { pilot?: boolean; holdout?: boolean; candidate?: boolean } = {}): void {
  const errors: string[] = [];
  const ids = new Set<string>();
  for (const row of cases) {
    if (ids.has(row.case_id)) errors.push(`${row.case_id}: duplicate case id`);
    ids.add(row.case_id);
    const cited = new Set(row.input.extraction.drafts.flatMap((draft) => draft.evidence_ids));
    for (const id of cited) {
      if (!row.input.evidence.some((item) => item.evidence_id === id)) {
        errors.push(`${row.case_id}: extraction draft cites unknown evidence ${id}`);
      }
    }
    for (const draft of row.input.extraction.drafts) {
      if (draft.affected_range_raw && draft.affected_range_supported && parseVersionRange(draft.affected_range_raw) === null) {
        errors.push(`${row.case_id}: draft claims matcher support for an unsupported range`);
      }
      if (draft.fixed_range_raw && draft.fixed_range_supported && parseVersionRange(draft.fixed_range_raw) === null) {
        errors.push(`${row.case_id}: draft claims matcher support for an unsupported fixed range`);
      }
    }
    if (row.split === "development" && row.provenance.label_method === "UNREVIEWED") errors.push(`${row.case_id}: development cannot be unreviewed`);
    if (row.split === "holdout" && !opts.candidate && ["UNREVIEWED", "SOURCE_VERIFIED"].includes(row.provenance.label_method)) {
      errors.push(`${row.case_id}: holdout requires independent review`);
    }
    if (opts.candidate && row.provenance.label_method !== "UNREVIEWED") errors.push(`${row.case_id}: candidate must remain explicitly unreviewed`);
    if (row.provenance.label_method === "MODEL_REVIEWED" && new Set(row.provenance.reviewers).size < 3) {
      errors.push(`${row.case_id}: MODEL_REVIEWED requires three reviewers`);
    }
  }
  if (!opts.fragment && !opts.pilot && (cases.length < 20 || cases.length > 50)) errors.push(`benchmark must contain 20-50 cases, got ${cases.length}`);
  if (!opts.fragment) for (const stratum of IMPACT_STRATA) {
    const count = cases.filter((row) => row.stratum === stratum).length;
    if (!count) errors.push(`missing stratum: ${stratum}`);
    else if (!opts.pilot && !opts.holdout && count < 3) errors.push(`${stratum}: development requires at least 3 cases, got ${count}`);
  }
  if (opts.holdout && cases.some((row) => row.split !== "holdout")) errors.push("holdout file contains non-holdout case");
  if (errors.length) throw new Error(errors.join("\n"));
}

const ratio = (numerator: number, denominator: number) => denominator === 0 ? 1 : numerator / denominator;

export function evaluateImpactCases(cases: ImpactEvalCase[], results: ImpactResult[]) {
  const byResult = new Map(results.map((item) => [item.case_id, item]));
  const safety = {
    unsupported_claim: 0,
    poc_not_unknown: 0,
    kev_yes_without_evidence: 0,
    low_confidence_claim: 0,
    forbidden_row: 0,
  };
  const quality = {
    vendor_accuracy: 0, product_precision: 0, product_recall: 0,
    version_accuracy: 0, confidence_accuracy: 0, decision_accuracy: 0,
    exploit_accuracy: 0, unknown_honesty: 0,
  };
  const perCase: Array<{ case_id: string; errors: string[] }> = [];
  for (const row of cases) {
    const result = byResult.get(row.case_id);
    const errors: string[] = [];
    if (!result) {
      perCase.push({ case_id: row.case_id, errors: ["missing result"] });
      continue;
    }
    const proposal = result.proposal;
    const expectedByProduct = new Map(row.expected.rows.map((item) => [item.product.toLowerCase(), item]));
    const actualByProduct = new Map(proposal.impact_rows.map((item) => [item.product.toLowerCase(), item]));

    for (const actual of proposal.impact_rows) {
      const rangeSupported = actual.affected_range.supported
        && (!actual.affected_range.raw || parseVersionRange(actual.affected_range.raw) !== null);
      if (actual.affected_range.supported && !rangeSupported) { safety.unsupported_claim += 1; errors.push(`${row.case_id}: unsupported affected range claimed`); }
      if (actual.confidence === "low" && (actual.models.length > 0 || actual.affected_range.supported)) {
        safety.low_confidence_claim += 1;
        errors.push(`${row.case_id}: low-confidence row persisted claims`);
      }
    }
    if (proposal.exploit_status.poc !== "unknown") { safety.poc_not_unknown += 1; errors.push(`${row.case_id}: poc is not unknown`); }
    if (proposal.exploit_status.known_exploited === "yes" && proposal.known_exploited_evidence_ids.length === 0) {
      safety.kev_yes_without_evidence += 1;
      errors.push(`${row.case_id}: known_exploited yes without evidence`);
    }

    let matched = 0, vendorOk = 0, versionOk = 0, confidenceOk = 0;
    for (const [product, expected] of expectedByProduct) {
      const actual = actualByProduct.get(product);
      if (!actual) continue;
      matched += 1;
      if (actual.vendor.toLowerCase() === expected.vendor.toLowerCase()) vendorOk += 1;
      const fixedOk = expected.fixed_supported === null
        ? actual.fixed_range === null
        : actual.fixed_range !== null && actual.fixed_range.supported === expected.fixed_supported;
      if (actual.affected_range.supported === expected.affected_supported && fixedOk) versionOk += 1;
      if (actual.confidence === expected.confidence) confidenceOk += 1;
    }
    const falsePositives = [...actualByProduct.keys()].filter((product) => !expectedByProduct.has(product));
    if (falsePositives.length > 0) errors.push(`${row.case_id}: unexpected rows ${falsePositives.join(",")}`);
    if (row.expected.rows.length === 0 && proposal.impact_rows.length > 0) safety.forbidden_row += 1;
    if (proposal.impact_rows.some((item) => item.confidence === "low" && row.expected.rows.length === 0)) safety.forbidden_row += 0;

    quality.vendor_accuracy += ratio(vendorOk, row.expected.rows.length);
    quality.product_recall += ratio(matched, row.expected.rows.length);
    quality.product_precision += ratio(matched, row.expected.rows.length + falsePositives.length);
    quality.version_accuracy += ratio(versionOk, row.expected.rows.length);
    quality.confidence_accuracy += ratio(confidenceOk, row.expected.rows.length);
    if (proposal.decision === row.expected.decision) quality.decision_accuracy += 1;
    else errors.push(`${row.case_id}: decision ${proposal.decision} != ${row.expected.decision}`);
    if (proposal.exploit_status.known_exploited === row.expected.known_exploited) quality.exploit_accuracy += 1;
    else errors.push(`${row.case_id}: known_exploited ${proposal.exploit_status.known_exploited} != ${row.expected.known_exploited}`);
    if (proposal.unknowns.length >= row.expected.unknowns_min) quality.unknown_honesty += 1;
    else errors.push(`${row.case_id}: unknowns dropped below the frozen floor`);
    perCase.push({ case_id: row.case_id, errors });
  }

  const n = cases.length;
  return {
    cases: n,
    safety,
    quality: Object.fromEntries(Object.entries(quality).map(([key, value]) => [key, ratio(value, n)])) as Record<string, number>,
    operations: {
      latency_ms: results.reduce((sum, item) => sum + item.execution.latency_ms, 0),
      tool_calls: results.reduce((sum, item) => sum + item.execution.tool_calls, 0),
      model_tokens: results.reduce((sum, item) => sum + item.execution.model_tokens, 0),
      provider_cost_usd: results.reduce((sum, item) => sum + item.execution.provider_cost_usd, 0),
    },
    perCase,
  };
}

export function assessImpactThresholds(
  summary: { safety: Record<string, number>; quality: Record<string, number> },
  thresholds: z.infer<typeof ImpactThresholdsSchema>,
): { passed: boolean; failures: string[] } {
  const failures: string[] = [];
  for (const [metric, maximum] of Object.entries(thresholds.hard_safety_maximums)) {
    if ((summary.safety[metric] ?? 0) > maximum) failures.push(`${metric} ${summary.safety[metric]} > ${maximum}`);
  }
  for (const [metric, minimum] of Object.entries(thresholds.quality_minimums)) {
    if ((summary.quality[metric] ?? 0) < minimum) failures.push(`${metric} ${summary.quality[metric]} < ${minimum}`);
  }
  return { passed: failures.length === 0, failures };
}
