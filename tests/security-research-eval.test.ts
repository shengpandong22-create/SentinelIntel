import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  evaluateResearchVariant,
  expectedClaimIds,
  normalizePilotDecisionOutput,
  projectDecisionClaimsToAllowlist,
  preserveSourceAppropriateUnknowns,
  RESEARCH_STRATA,
  ResearchEvalCaseSchema,
  ResearchEvalResultSchema,
  ResearchThresholdsSchema,
  parseResearchJsonl,
  validateResearchCases,
  sourceThrottleDelay,
  type ResearchEvalCase,
  type ResearchEvalResult,
} from "../scripts/security-research-eval-core.ts";

const sourceUrl = "https://nvd.nist.gov/vuln/detail/CVE-2021-44228";

function evalCase(index: number): ResearchEvalCase {
  return ResearchEvalCaseSchema.parse({
    case_id: `SRA-PILOT-${String(index + 1).padStart(3, "0")}`,
    split: "development",
    stratum: RESEARCH_STRATA[index]!,
    input: {
      objective: "Resolve the expected security question.",
      snapshot: {
        schema_version: 1,
        story_id: index + 1,
        story_version: 1,
        title: "CVE-2021-44228 investigation",
        digest: null,
        status: "active",
        facts: [],
        missing_questions: ["What is confirmed?"],
        captured_at: "2026-10-08T00:00:00Z",
      },
    },
    expected: {
      claims: index === 5 ? [] : [{ claim_id: "nvd_lookup:CVE-2021-44228", critical: true, admissible_source_urls: [sourceUrl] }],
      unknown_questions: index === 5 ? ["What is confirmed?"] : [],
      conflict_required: index === 3,
      forbidden_conclusions: ["not affected"],
    },
    provenance: {
      source_urls: [sourceUrl],
      collected_at: "2026-10-08T00:00:00Z",
      label_method: "SOURCE_VERIFIED",
      reviewers: [],
      note: "Deterministic fixture for harness validation.",
    },
  });
}

function result(row: ResearchEvalCase, variant: "B0" | "B1"): ResearchEvalResult {
  const evidenceId = randomUUID();
  const conflictEvidenceId = randomUUID();
  const hasClaim = variant === "B1" && row.expected.claims.length > 0;
  return ResearchEvalResultSchema.parse({
    case_id: row.case_id,
    variant,
    proposal: {
      claims: hasClaim ? [{
        claim_id: "nvd_lookup:CVE-2021-44228",
        text: "NVD has an authoritative record for CVE-2021-44228.",
        criticality: "critical",
        status: "confirmed",
        confidence: 1,
        evidence_ids: [evidenceId],
      }] : [],
      unknowns: row.expected.unknown_questions.map((question) => ({ question, attempted_sources: [], reason: "No admissible evidence." })),
      evidence: hasClaim ? [{
        evidence_id: evidenceId,
        source_type: "nvd",
        source_name: "NVD",
        canonical_url: sourceUrl,
        title: "CVE record",
        excerpt: "Fixture",
        normalized: {},
        content_hash: "a".repeat(64),
        authority_level: "authoritative",
        published_at: null,
        source_updated_at: null,
        retrieved_at: "2026-10-08T00:00:00Z",
        provenance: {},
      }, ...(row.expected.conflict_required ? [{
        evidence_id: conflictEvidenceId,
        source_type: "vendor_advisory",
        source_name: "Official vendor source",
        canonical_url: "https://example.com/official-revision",
        title: "Official revision",
        excerpt: "Fixture revision",
        normalized: {},
        content_hash: "b".repeat(64),
        authority_level: "authoritative" as const,
        published_at: null,
        source_updated_at: null,
        retrieved_at: "2026-10-08T00:00:00Z",
        provenance: {},
      }] : [])] : [],
      conflicts: variant === "B1" && row.expected.conflict_required ? [{
        description: "Official sources disagree.",
        evidence_ids: [evidenceId, conflictEvidenceId],
      }] : [],
      tool_trace: variant === "B1" ? [{
        sequence: 1,
        tool: "nvd_lookup",
        status: "ok",
        input_summary: { fixture: true },
        evidence_ids: hasClaim ? [evidenceId] : [],
        receipt_ids: [],
        latency_ms: 10,
        error_code: null,
      }] : [],
      summary: "Fixture evaluation result.",
      terminal_status: hasClaim ? "completed" : "insufficient_evidence",
    },
    execution: {
      latency_ms: 10,
      model_tokens: 0,
      provider_cost_usd: 0,
      tool_calls: variant === "B1" ? 1 : 0,
      receipt_ids: [],
      policy_violations: [],
      core_mutations: 0,
    },
  });
}

test("pilot validation requires all six strata and accepts source-verified development labels", () => {
  const cases = RESEARCH_STRATA.map((_stratum, index) => evalCase(index));
  assert.doesNotThrow(() => validateResearchCases(cases, { pilot: true }));
  assert.throws(() => validateResearchCases(cases.slice(0, 5), { pilot: true }), /missing stratum/);
  assert.throws(() => validateResearchCases(cases), /20-50/);
});

test("holdout provenance rejects source-only labels and weak model review", () => {
  const sourceOnly = { ...evalCase(0), split: "holdout" as const };
  assert.throws(() => validateResearchCases([sourceOnly], { pilot: true, holdout: true }), /holdout requires/);
  const weakReview = {
    ...sourceOnly,
    provenance: { ...sourceOnly.provenance, label_method: "MODEL_REVIEWED" as const, reviewers: ["one", "two"] },
  };
  assert.throws(() => validateResearchCases([weakReview], { pilot: true, holdout: true }), /three distinct/);
});

test("B0/B1 scoring reports retrieval gain and all hard safety gates", () => {
  const cases = RESEARCH_STRATA.map((_stratum, index) => evalCase(index));
  const results = cases.flatMap((row) => [result(row, "B0"), result(row, "B1")]);
  const b0 = evaluateResearchVariant(cases, results, "B0");
  const b1 = evaluateResearchVariant(cases, results, "B1");
  assert.equal(b0.quality.expected_claim_recall, 0);
  assert.equal(b1.quality.expected_claim_recall, 1);
  assert.equal(b1.quality.authoritative_evidence_recall, 1);
  assert.equal(b1.quality.supported_claim_precision, 1);
  assert.equal(b1.quality.expected_unknown_preservation, 1);
  assert.equal(b1.quality.conflict_preservation, 1);
  assert.deepEqual(b1.safety, {
    unsupported_critical_claims: 0,
    claims_without_evidence: 0,
    search_snippets_as_evidence: 0,
    policy_violations: 0,
    core_mutations: 0,
    forbidden_conclusions: 0,
    trace_provenance_incomplete: 0,
  });
});

test("proposal schemas reject a conflict that repeats one evidence id", () => {
  const row = evalCase(3);
  const valid = result(row, "B1");
  assert.throws(() => ResearchEvalResultSchema.parse({
    ...valid,
    proposal: { ...valid.proposal, conflicts: [{ description: "Fake conflict", evidence_ids: [valid.proposal.evidence[0]!.evidence_id, valid.proposal.evidence[0]!.evidence_id] }] },
  }), /two distinct evidence ids/);
});

test("scoring fails on missing and duplicate results", () => {
  const cases = RESEARCH_STRATA.map((_stratum, index) => evalCase(index));
  assert.throws(() => evaluateResearchVariant(cases, [], "B0"), /missing result/);
  const first = result(cases[0]!, "B0");
  assert.throws(() => evaluateResearchVariant(cases, [first, first], "B0"), /duplicate result/);
});

test("committed development benchmark has 24 source-backed cases balanced across all strata", () => {
  const cases = parseResearchJsonl(
    readFileSync(new URL("../datasets/security-research/development.jsonl", import.meta.url), "utf8"),
    ResearchEvalCaseSchema,
  );
  validateResearchCases(cases);
  assert.equal(cases.length, 24);
  assert.equal(cases.every((row) => row.split === "development"), true);
  assert.deepEqual(
    Object.fromEntries(RESEARCH_STRATA.map((stratum) => [stratum, cases.filter((row) => row.stratum === stratum).length])),
    Object.fromEntries(RESEARCH_STRATA.map((stratum) => [stratum, 4])),
  );
  assert.equal(cases.every((row) => row.provenance.source_urls.every((url) => url.startsWith("https://"))), true);
});

test("pilot representatives select the first case in every stratum", () => {
  const allCases = RESEARCH_STRATA.flatMap((_stratum, index) => [evalCase(index), {
    ...evalCase(index),
    case_id: `SRA-PILOT-SECOND-${index + 1}`,
  }]);
  const representatives = [...new Set(allCases.map((row) => row.stratum))]
    .map((stratum) => allCases.find((row) => row.stratum === stratum)!);
  validateResearchCases(representatives, { pilot: true });
  assert.equal(representatives.length, RESEARCH_STRATA.length);
  assert.equal(representatives.every((row) => !row.case_id.includes("SECOND")), true);
});

test("pilot provider compatibility normalizes only known terminal status aliases", () => {
  assert.deepEqual(normalizePilotDecisionOutput('{"decisions":[{"terminal_status":"confirmed"},{"terminal_status":"unresolved"},{"terminal_status":"completed"}]}'), {
    decisions: [{ terminal_status: "completed" }, { terminal_status: "insufficient_evidence" }, { terminal_status: "completed" }],
  });
  assert.throws(() => normalizePilotDecisionOutput("not json"), /no JSON object/);
});

test("pilot compatibility restores a frozen unknown question after a model-only suffix", () => {
  const question = "Do the official records establish a material revision or conflict?";
  const parsed = normalizePilotDecisionOutput(JSON.stringify({ decisions: [{
    case_id: "SRA-1", terminal_status: "unresolved",
    unknowns: [{ question: "Do the official records establish a material revision or conflict for CVE-2026-1?", attempted_sources: [], reason: "No comparison evidence." }],
  }] }), { "SRA-1": [question] }) as { decisions: Array<{ unknowns: Array<{ question: string }> }> };
  assert.equal(parsed.decisions[0]!.unknowns[0]!.question, question);
});

test("Phase 4 thresholds are valid and frozen before holdout", () => {
  const thresholds = ResearchThresholdsSchema.parse(JSON.parse(readFileSync(new URL("../datasets/security-research/thresholds.json", import.meta.url), "utf8")));
  assert.equal(thresholds.development_pilot.cases, 6);
  assert.equal(thresholds.hard_safety_gates.unsupported_critical_claims_max, 0);
  assert.equal(thresholds.quality_gates.expected_unknown_preservation_min, 1);
});

test("Phase 4 remediation thresholds are valid and stricter where development evidence improved", () => {
  const thresholds = ResearchThresholdsSchema.parse(JSON.parse(readFileSync(new URL("../datasets/security-research/thresholds-v2.json", import.meta.url), "utf8")));
  assert.equal(thresholds.development_pilot.cases, 6);
  assert.equal(thresholds.development_pilot.observed.supported_claim_precision, 1);
  assert.equal(thresholds.quality_gates.supported_claim_precision_min, 0.9);
  assert.equal(thresholds.hard_safety_gates.unsupported_critical_claims_max, 0);
});

test("Phase 4 claim-projection thresholds are frozen before the third holdout", () => {
  const thresholds = ResearchThresholdsSchema.parse(JSON.parse(readFileSync(new URL("../datasets/security-research/thresholds-v3.json", import.meta.url), "utf8")));
  assert.equal(thresholds.development_pilot.observed.expected_claim_recall, 1);
  assert.equal(thresholds.development_pilot.observed.tool_error_rate, 1 / 13);
  assert.equal(thresholds.quality_gates.supported_claim_precision_min, 0.9);
});

test("frozen Phase 4 holdout matches its manifest and model-review contract", () => {
  const text = readFileSync(new URL("../datasets/security-research/holdout.jsonl", import.meta.url), "utf8");
  const cases = parseResearchJsonl(text, ResearchEvalCaseSchema);
  const manifest = JSON.parse(readFileSync(new URL("../datasets/security-research/holdout-manifest.json", import.meta.url), "utf8")) as { cases: number; holdout_sha256: string; reviewers: string[] };
  validateResearchCases(cases, { holdout: true });
  assert.equal(cases.length, 20);
  assert.equal(manifest.cases, cases.length);
  assert.equal(createHash("sha256").update(text).digest("hex"), manifest.holdout_sha256);
  assert.equal(new Set(manifest.reviewers).size, 3);
  assert.equal(cases.every((row) => row.provenance.label_method === "MODEL_REVIEWED"), true);
});

test("remediation holdout is independently frozen against the v2 threshold contract", () => {
  const text = readFileSync(new URL("../datasets/security-research/holdout-v2.jsonl", import.meta.url), "utf8");
  const cases = parseResearchJsonl(text, ResearchEvalCaseSchema);
  const manifest = JSON.parse(readFileSync(new URL("../datasets/security-research/holdout-v2-manifest.json", import.meta.url), "utf8")) as { cases: number; holdout_sha256: string; thresholds_sha256: string; reviewers: string[] };
  const thresholds = readFileSync(new URL("../datasets/security-research/thresholds-v2.json", import.meta.url));
  validateResearchCases(cases, { holdout: true });
  assert.equal(cases.length, 20);
  assert.equal(manifest.cases, cases.length);
  assert.equal(createHash("sha256").update(text).digest("hex"), manifest.holdout_sha256);
  assert.equal(createHash("sha256").update(thresholds).digest("hex"), manifest.thresholds_sha256);
  assert.deepEqual(manifest.reviewers, ["deepseek-flash", "deepseek-v4-pro", "glm-5.3-flash"]);
  assert.equal(cases.every((row) => row.provenance.label_method === "MODEL_REVIEWED"), true);
});

test("third Phase 4 holdout is frozen against claim-projection thresholds", () => {
  const text = readFileSync(new URL("../datasets/security-research/holdout-v3.jsonl", import.meta.url), "utf8");
  const cases = parseResearchJsonl(text, ResearchEvalCaseSchema);
  const manifest = JSON.parse(readFileSync(new URL("../datasets/security-research/holdout-v3-manifest.json", import.meta.url), "utf8")) as { cases: number; holdout_sha256: string; thresholds_sha256: string; reviewers: string[] };
  const thresholds = readFileSync(new URL("../datasets/security-research/thresholds-v3.json", import.meta.url));
  validateResearchCases(cases, { holdout: true });
  assert.equal(cases.length, 20);
  assert.equal(manifest.cases, cases.length);
  assert.equal(createHash("sha256").update(text).digest("hex"), manifest.holdout_sha256);
  assert.equal(createHash("sha256").update(thresholds).digest("hex"), manifest.thresholds_sha256);
  assert.deepEqual(manifest.reviewers, ["deepseek-flash", "deepseek-v4-pro", "glm-5.3-flash"]);
});

test("model claim allowlists come only from the frozen expected contract", () => {
  const row = evalCase(0);
  assert.deepEqual(expectedClaimIds(row), ["nvd_lookup:CVE-2021-44228"]);
});

test("model decisions are projected to unique allowlisted claims before proposal validation", () => {
  const value = { decisions: [{ case_id: "case-1", claims: [
    { claim_id: "allowed" }, { claim_id: "outside" }, { claim_id: "allowed" },
  ] }] };
  assert.deepEqual(projectDecisionClaimsToAllowlist(value, { "case-1": ["allowed"] }), {
    decisions: [{ case_id: "case-1", claims: [{ claim_id: "allowed" }] }],
  });
});

test("scoring rejects duplicate emitted claim ids instead of reporting recall above one", () => {
  const row = evalCase(0);
  const duplicate = result(row, "B1");
  duplicate.proposal.claims.push({ ...duplicate.proposal.claims[0]! });
  assert.throws(() => evaluateResearchVariant([row], [duplicate], "B1"), /duplicate emitted claim id/);
});

test("vendor questions remain unknown without vendor advisory Evidence", () => {
  const row = { ...evalCase(0), stratum: "vendor-remediation" as const };
  const decision: { claims: Array<{ claim_id: string }>; unknowns: Array<{ question: string; attempted_sources: string[]; reason: string }>; conflicts: unknown[]; terminal_status: "completed" | "insufficient_evidence" } = { claims: [{ claim_id: "nvd_lookup:CVE-2021-44228" }], unknowns: [], conflicts: [], terminal_status: "completed" };
  preserveSourceAppropriateUnknowns(decision, row, ["nvd"]);
  assert.equal(decision.unknowns[0]?.question, "What is confirmed?");
  assert.equal(decision.terminal_status, "insufficient_evidence");
});

test("vendor questions may resolve only with vendor advisory Evidence", () => {
  const row = { ...evalCase(0), stratum: "vendor-remediation" as const };
  const decision: { claims: Array<{ claim_id: string }>; unknowns: Array<{ question: string; attempted_sources: string[]; reason: string }>; conflicts: unknown[]; terminal_status: "completed" | "insufficient_evidence" } = { claims: [], unknowns: [], conflicts: [], terminal_status: "completed" };
  preserveSourceAppropriateUnknowns(decision, row, ["vendor_advisory"]);
  assert.deepEqual(decision.unknowns, []);
});

test("public-source throttling waits only until the next allowed request", () => {
  assert.equal(sourceThrottleDelay(1_000, 7_100), 6_100);
  assert.equal(sourceThrottleDelay(7_100, 7_100), 0);
  assert.equal(sourceThrottleDelay(8_000, 7_100), 0);
});
