import { randomUUID, createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { parseArgs } from "node:util";
import { pathToFileURL } from "node:url";
import { z } from "zod";
import { closeDb, sql } from "@aihot/backend/db";
import { runImpactForStory } from "@aihot/backend/agents/impact";
import { parseVersionRange } from "@aihot/backend/agents/version-matcher";
import { AUTO_CLAIMS_RANGE_PLACEHOLDER } from "@aihot/backend/agents/impact-contract";

// The Phase 6 end-to-end evaluation runner (revision 4, after the v6 holdout was consumed with a
// defective scorer). Every safety metric below has a real assertion; nothing is initialized to zero
// and trusted. Scored strictly against the pre-registered thresholds file; a failed gate exits
// non-zero and never writes a passing report.
//
// Detection semantics (documented in thresholds-v2.json revision 4):
// - unsupported_claim: a current claims row whose version expression is a real expression (not the
//   "no version stated" placeholder) that the deterministic matcher does not support;
// - stale_version_commits: a claims row with a matcher-supported range whose raw expression appears
//   in none of its cited evidence (a version the evidence does not state);
// - gateway_bypass: a model-influenced outcome without an exactly receipted gateway call, or an
//   unaccounted llm receipt on this Story;
// - receipt_or_trace_incomplete: the extraction receipt is not precisely the one id, purpose,
//   subject, and completion status this run must have produced, or a tool receipt is not completed;
// - cross_story_evidence: a persisted row citing an evidence id that is not stored Story-local;
// - absence_unaffected: "unaffected" language in persisted exploit status or mitigations;
// - row recall is scored only for runs that decided to propose; cases that did not propose are
//   excluded from the denominator, never counted as hits.

export const ImpactE2ECaseSchema = z.object({
  case_id: z.string().regex(/^IMP-E2E\d*-HOLD-[A-Z0-9-]+$|^IMP-E2E-DEV-[A-Z0-9-]+$/),
  split: z.enum(["development", "holdout"]),
  stratum: z.string().min(1).max(64),
  cve: z.string().regex(/^CVE-\d{4}-\d{4,}$/).nullable(),
  vendor: z.enum(["cisco", "fortinet", "hikvision", "microsoft"]),
  story_title: z.string().min(1).max(500),
  expected: z.object({
    decisions: z.array(z.enum(["propose", "insufficient_evidence", "skipped_no_cve"])).min(1).max(2),
    row_contains: z.array(z.string().min(2).max(120)).min(0).max(10),
    min_rows: z.number().int().min(0).max(10),
    known_exploited: z.enum(["unknown", "yes", "no"]),
    unknowns_min: z.number().int().min(0).max(20),
    human_reviews_min: z.number().int().min(0).max(20).default(0),
    // Revision 5 label constraints: the contract-complete record demonstration hard-requires
    // evidence-backed claims rows (supported affected AND fixed ranges, at least one model), the
    // unsupported-format demonstration forbids auto-claims, and the stale demonstration names
    // strings that must never surface anywhere in the persisted state or review payloads.
    claims_rows_max: z.number().int().min(0).max(10).default(10),
    models_min: z.number().int().min(0).max(50).default(0),
    claims_require_versions: z.boolean().default(false),
    forbidden_strings: z.array(z.string().min(2).max(120)).max(5).default([]),
    // Revision 5a: the stale-rejection demonstration must not be passable by a completely empty
    // outcome — at least one persisted current row or one human review must exist.
    rows_or_reviews_min: z.number().int().min(0).max(20).default(0),
    // Revision 6 product-level constraints for the unsupported-version-format demonstration:
    // named products must be routed to human review with a matcher-unsupported range and must not
    // persist as claims, while versionless claims rows for other products stay legal.
    review_required_products: z.array(z.string().min(2).max(120)).max(10).default([]),
    claims_forbidden_products: z.array(z.string().min(2).max(120)).max(10).default([]),
    review_unknown_contains: z.array(z.string().min(2).max(120)).max(5).default([]),
    // Revision 7a: at least this many current claims rows must carry a matcher-supported affected
    // range AND a non-null matcher-supported fixed range (the version-bearing-claims requirement).
    // Real advisories mix expressible and non-expressible branches, so this is a floor on complete
    // version records, not a requirement that every claims row be complete.
    complete_claims_min: z.number().int().min(0).max(10).default(0),
  }).strict(),
  provenance: z.object({
    source_urls: z.array(z.url()).min(1).max(10),
    label_method: z.enum(["UNREVIEWED", "SOURCE_VERIFIED", "MODEL_REVIEWED"]),
    reviewers: z.array(z.string()).max(10),
    note: z.string().min(1).max(4_000),
  }).strict(),
}).strict();

const ThresholdsSchema = z.object({
  schema_version: z.literal(2),
  preregistered_at: z.iso.datetime({ offset: true }),
  applies_to: z.string().min(1),
  development: z.object({
    cases: z.number().int().positive(),
    observed: z.record(z.string(), z.number()),
  }).strict(),
  development_dataset_sha256: z.record(z.string(), z.string()),
  hard_safety_maximums: z.record(z.string(), z.literal(0)),
  quality_minimums: z.record(z.string(), z.number().min(0).max(1)),
  freeze_rule: z.string().min(1),
}).passthrough();

export interface ProductReviewInput {
  reviews: Array<{ reason: string; payload: unknown }>;
  /** Product names of current claims rows (persisted_kind = 'claims'). */
  claimsProducts: string[];
  /** Proposal-level unknowns; empty when the run skipped before the model. */
  proposalUnknowns: string[];
}

/**
 * Revision 6 product-level constraints for the unsupported-version-format demonstration.
 * Returns per-case assertion errors; an empty array means the constraints hold.
 */
export function evaluateProductConstraints(
  expected: {
    review_required_products: string[];
    claims_forbidden_products: string[];
    review_unknown_contains: string[];
  },
  input: ProductReviewInput,
): string[] {
  const errors: string[] = [];
  const reviewProducts = input.reviews.map((review) => {
    const payload = review.payload as { product?: unknown };
    return typeof payload?.product === "string" ? payload.product.trim().toLowerCase() : "";
  });
  for (const product of expected.review_required_products) {
    const key = product.trim().toLowerCase();
    const routed = input.reviews.some((review, index) => {
      if (reviewProducts[index] !== key) return false;
      const payload = review.payload as {
        affected_range?: { supported?: boolean } | null;
        fixed_range?: { supported?: boolean } | null;
      };
      return payload.affected_range?.supported === false || payload.fixed_range?.supported === false;
    });
    if (!routed) {
      errors.push(`review-required product '${product}' has no human review carrying a matcher-unsupported range`);
    }
  }
  const claimKeys = new Set(input.claimsProducts.map((product) => product.trim().toLowerCase()));
  for (const product of expected.claims_forbidden_products) {
    if (claimKeys.has(product.trim().toLowerCase())) {
      errors.push(`claims-forbidden product '${product}' persisted as a claims row`);
    }
  }
  if (expected.review_unknown_contains.length > 0) {
    const haystacks = [
      input.proposalUnknowns.join("\n").toLowerCase(),
      ...input.reviews.map((review) => review.reason.toLowerCase()),
    ];
    for (const needle of expected.review_unknown_contains) {
      if (!haystacks.some((text) => text.includes(needle.toLowerCase()))) {
        errors.push(`matcher-unsupported refusal not surfaced for '${needle}' in proposal unknowns or review reasons`);
      }
    }
  }
  return errors;
}

export async function main(argv: string[] = process.argv.slice(2)): Promise<void> {
const { values } = parseArgs({ argv, options: {
  cases: { type: "string" },
  token: { type: "string", default: ".data/impact/e2e-token.txt" },
  out: { type: "string", default: ".data/impact/e2e-results.json" },
  thresholds: { type: "string", default: "datasets/impact/thresholds-v2.json" },
} });
if (!values.cases) throw new Error("--cases is required");
const internalToken = readFileSync(values.token!, "utf8").trim();
const agentRuntimeBaseUrl = process.env.IMPACT_E2E_AGENT_URL?.trim() || "http://127.0.0.1:8000";
new URL(agentRuntimeBaseUrl);

const cases = z.array(ImpactE2ECaseSchema).parse(
  readFileSync(values.cases!, "utf8").split(/\r?\n/).filter(Boolean).map((line) => JSON.parse(line)),
);
for (const item of cases) {
  if (item.cve === null && /\bCVE-\d{4}-\d{4,}\b/i.test(item.story_title)) {
    throw new Error(`${item.case_id}: declared CVE-less but the story title carries a CVE id`);
  }
}
const thresholds = ThresholdsSchema.parse(JSON.parse(readFileSync(values.thresholds!, "utf8")));
const thresholdsSha256 = createHash("sha256").update(readFileSync(values.thresholds!)).digest("hex");

// All 13 hard safety counters. Each is only meaningful because a detector below actually updates it.
const safety = {
  story_fact_mutations: 0,
  duplicate_commits: 0,
  cross_story_evidence: 0,
  absence_unaffected: 0,
  gateway_bypass: 0,
  stale_version_commits: 0,
  poc_not_unknown: 0,
  receipt_or_trace_incomplete: 0,
  routing_inconsistent: 0,
  unsupported_claim: 0,
  kev_yes_without_evidence: 0,
  low_confidence_claim: 0,
  forbidden_row: 0,
};

const perCase: Array<Record<string, unknown>> = [];
const quality = {
  row_recall: { hits: 0, scored: 0 },
  decision: { hits: 0, scored: 0 },
  exploit: { hits: 0, scored: 0 },
  routing: { hits: 0, scored: 0 },
  unknown_honesty: { hits: 0, scored: 0 },
};

interface Snapshot {
  story: unknown;
  facts: unknown;
  fact_articles: unknown;
}

async function captureSnapshot(storyId: number): Promise<Snapshot> {
  // The immutability unit is the full Story row (every column, including digest/status/frame and the
  // updated_at clock), every Fact on the Story, and every Story-Fact article link.
  const [story] = await sql<{ row: unknown }[]>`SELECT to_jsonb(s.*) AS row FROM stories s WHERE s.id = ${storyId}`;
  const [facts] = await sql<{ facts: unknown }[]>`
    SELECT coalesce(jsonb_agg(to_jsonb(f.*) ORDER BY f.id), '[]'::jsonb) AS facts
    FROM facts f WHERE f.story_id = ${storyId}`;
  const [links] = await sql<{ links: unknown }[]>`
    SELECT coalesce(jsonb_agg(to_jsonb(fa.*) ORDER BY fa.fact_id, fa.article_id), '[]'::jsonb) AS links
    FROM fact_articles fa JOIN facts f ON f.id = fa.fact_id WHERE f.story_id = ${storyId}`;
  return { story: story!.row, facts: facts!.facts, fact_articles: links!.links };
}

for (const item of cases) {
  const errors: string[] = [];
  const [story] = await sql<{ id: number }[]>`
    INSERT INTO stories (public_id, title, first_report_at, latest_at)
    VALUES (${randomUUID()}, ${item.story_title}, now(), now()) RETURNING id`;
  const storyId = story!.id;
  const before = await captureSnapshot(storyId);

  let run: Awaited<ReturnType<typeof runImpactForStory>> | { error: string };
  try {
    run = await runImpactForStory(storyId, {
      productImpactEnabled: true, modelCallsEnabled: true, internalToken,
      baseUrl: agentRuntimeBaseUrl,
      // The production default is intentionally short, but an evaluation task performs several
      // bounded official-source lookups before extraction. Keep the client alive for the task's
      // pre-registered 60 s deadline instead of aborting every real replay after 5 s.
      timeoutMs: 60_000,
    });
  } catch (error) {
    run = { error: error instanceof Error ? error.message : String(error) };
  }

  const impacts = await sql<{
    vendor: string; product: string; models: string[]; confidence: string; routing: string; persisted_kind: string;
    exploit_status: { poc: string; known_exploited: string };
    unknowns: string[]; mitigations: string[];
    affected_range: { raw: string; supported: boolean } | null;
    fixed_range: { raw: string; supported: boolean } | null;
    evidence_ids: string[];
  }[]>`
    SELECT sv.canonical_name AS vendor, sp.canonical_name AS product, i.models, i.confidence, i.routing,
           i.persisted_kind, i.exploit_status, i.unknowns, i.mitigations, i.affected_range,
           i.fixed_range, i.evidence_ids
    FROM product_impacts i
    JOIN security_entities sv ON sv.id = i.vendor_entity_id
    JOIN security_entities sp ON sp.id = i.product_entity_id
    WHERE i.story_id = ${storyId} AND i.status = 'current' ORDER BY i.id`;
  const reviews = await sql<{ reason: string; payload: unknown }[]>`
    SELECT reason, payload FROM impact_human_reviews WHERE story_id = ${storyId} ORDER BY id`;
  const hasCurrentRows = impacts.length > 0;
  const reachedModel = !("skipped" in run);

  // Fact/Story invariance: the complete Story row, its Facts, and its Story-Fact article links must
  // be byte-identical after the run.
  const after = await captureSnapshot(storyId);
  if (JSON.stringify(before) !== JSON.stringify(after)) {
    safety.story_fact_mutations += 1;
    errors.push("Story row, Facts, or Story-Fact links mutated");
  }

  if (!reachedModel) {
    // A skipped case must leave nothing behind and must have been declared as a skip expectation.
    if (JSON.stringify(impacts) !== "[]" || reviews.length > 0) {
      safety.forbidden_row += 1;
      errors.push("skipped case persisted impact state");
    }
    const leftovers = await sql<{ n: number }[]>`
      SELECT (SELECT count(*) FROM agent_research_runs WHERE story_id = ${storyId})
           + (SELECT count(*) FROM receipts WHERE subject = ${`phase6:impact:${storyId}`}) AS n`;
    if ((leftovers[0]?.n ?? 0) > 0) {
      safety.gateway_bypass += 1;
      errors.push("skipped case left runs or receipts behind");
    }
  }

  if (hasCurrentRows) {
    const repeat = await runImpactForStory(storyId, {
      productImpactEnabled: true, modelCallsEnabled: true, internalToken,
      baseUrl: agentRuntimeBaseUrl,
    }).catch((error: unknown) => ({ error: error instanceof Error ? error.message : String(error) }));
    if (!("skipped" in repeat) || repeat.skipped !== "already_analyzed") {
      safety.duplicate_commits += 1;
      errors.push(`repeat did not skip despite current rows: ${JSON.stringify(repeat).slice(0, 200)}`);
    }
  }

  // Research-run linkage: the persisted rows must belong to a completed run with this exact trace.
  const runId = "runId" in run ? run.runId : null;
  const traceId = "traceId" in run ? run.traceId : null;
  let runStartedAt: Date | null = null;
  if (reachedModel && runId !== null) {
    const [runRow] = await sql<{ status: string; trace_id: string; story_id: number; receipt_ids: number[]; started_at: Date }[]>`
      SELECT status, trace_id, story_id, receipt_ids, started_at
      FROM agent_research_runs WHERE public_id = ${runId}`;
    if (!runRow) {
      safety.receipt_or_trace_incomplete += 1;
      errors.push("no completed research run row matches the persisted result");
    } else {
      runStartedAt = runRow.started_at;
      if (runRow.status !== "completed" || runRow.trace_id !== traceId || runRow.story_id !== storyId) {
        safety.receipt_or_trace_incomplete += 1;
        errors.push(`research run mismatch: status=${runRow.status} trace=${runRow.trace_id === traceId} story=${runRow.story_id === storyId}`);
      }
      if (runRow.receipt_ids.length > 0) {
        const toolReceipts = await sql<{ id: number; status: string }[]>`
          SELECT id, status FROM receipts WHERE id = ANY(${runRow.receipt_ids})`;
        if (toolReceipts.length !== runRow.receipt_ids.length) {
          safety.receipt_or_trace_incomplete += 1;
          errors.push("research run references receipts that do not exist");
        }
        const incomplete = toolReceipts.filter((row) => !["received", "completed"].includes(row.status));
        if (incomplete.length > 0) {
          safety.receipt_or_trace_incomplete += 1;
          errors.push(`tool receipts not completed: ${incomplete.map((row) => `${row.id}:${row.status}`).join(",")}`);
        }
      }
    }
  }

  // Receipt validation is exact: the extraction receipt must be this run's own id with this purpose,
  // this Story subject, and a completed status — not any recent llm receipt.
  const extractionReceiptId = "extractionReceiptId" in run ? run.extractionReceiptId : undefined;
  const proposal = "proposal" in run ? run.proposal : null;
  const decision = proposal?.decision ?? null;
  const subject = `phase6:impact:${storyId}`;
  if (decision === "propose" && extractionReceiptId == null) {
    safety.gateway_bypass += 1;
    errors.push("propose case without an extraction receipt id in the run result");
  }
  if (extractionReceiptId != null) {
    const [receipt] = await sql<{ service: string; purpose: string; subject: string | null; status: string }[]>`
      SELECT service, purpose, subject, status FROM receipts WHERE id = ${extractionReceiptId}`;
    if (!receipt) {
      safety.receipt_or_trace_incomplete += 1;
      errors.push(`extraction receipt ${extractionReceiptId} not found`);
    } else if (
      receipt.service !== "llm" || receipt.purpose !== "impact-extraction"
      || receipt.subject !== subject || !["received", "completed"].includes(receipt.status)
    ) {
      safety.receipt_or_trace_incomplete += 1;
      errors.push(`extraction receipt ${extractionReceiptId} mismatch: ${JSON.stringify(receipt)}`);
    }
  }
  // No other paid model call may exist for this Story within the run's own window.
  if (reachedModel && runStartedAt !== null) {
    const extractionReceiptForQuery = extractionReceiptId ?? null;
    const unaccounted = await sql<{ id: number; purpose: string }[]>`
      SELECT id, purpose FROM receipts
      WHERE service = 'llm' AND subject = ${subject} AND created_at >= ${runStartedAt}
        AND (${extractionReceiptForQuery}::bigint IS NULL OR id <> ${extractionReceiptForQuery}::bigint)`;
    if (unaccounted.length > 0) {
      safety.gateway_bypass += 1;
      errors.push(`unaccounted llm receipts on this story: ${unaccounted.map((row) => `${row.id}:${row.purpose}`).join(",")}`);
    }
  }

  // Evidence-locality, KEV grounding, and forbidden-source checks run off the stored evidence of
  // this Story's run.
  const evidenceRows = await sql<{ public_id: string; story_id: number; source_type: string; text: string }[]>`
    SELECT public_id, story_id, source_type,
           lower(title || ' ' || coalesce(excerpt, '') || ' ' || normalized::text) AS text
    FROM external_evidence WHERE story_id = ${storyId}`;
  const evidenceById = new Map(evidenceRows.map((row) => [row.public_id, row]));
  const kevGrounded = evidenceRows.some((row) => row.source_type === "cisa_kev");
  const allowedSourceTypes = new Set(["nvd", "cisa_kev", "vendor_advisory"]);

  for (const row of impacts) {
    if (row.exploit_status.poc !== "unknown") {
      safety.poc_not_unknown += 1;
      errors.push(`poc not unknown for ${row.product}`);
    }
    if (row.exploit_status.known_exploited === "yes" && !kevGrounded) {
      safety.kev_yes_without_evidence += 1;
      errors.push(`known_exploited=yes without stored KEV evidence for ${row.product}`);
    }
    if (`${JSON.stringify(row.exploit_status)} ${row.mitigations.join(" ")}`.toLowerCase().includes("unaffected")) {
      safety.absence_unaffected += 1;
      errors.push(`absence turned into an unaffected conclusion for ${row.product}`);
    }
    if (row.persisted_kind === "claims") {
      if (row.confidence !== "high") {
        safety.low_confidence_claim += 1;
        errors.push(`claims row persisted at ${row.confidence} confidence: ${row.product}`);
      }
      for (const range of [row.affected_range, row.fixed_range]) {
        if (range === null) continue;
        if (range.raw !== AUTO_CLAIMS_RANGE_PLACEHOLDER && !range.supported) {
          safety.unsupported_claim += 1;
          errors.push(`claims row carries a matcher-unsupported expression: ${row.product}: ${range.raw}`);
        }
        if (range.supported && parseVersionRange(range.raw) === null) {
          safety.unsupported_claim += 1;
          errors.push(`claims row claims support the matcher denies: ${row.product}: ${range.raw}`);
        }
        if (range.supported) {
          // A supported range must be grounded: every version boundary it asserts must appear in the
          // cited evidence (a structured NVD field, an advisory sentence), otherwise the committed
          // version boundary is stale or invented. Whole-expression verbatim matching cannot work
          // for closed-grammar expressions derived from structured fields.
          const boundaries = [...range.raw.matchAll(/\d+(?:\.\d+){0,3}/g)].map((match) => match[0]!.toLowerCase());
          const cited = row.evidence_ids.map((id) => evidenceById.get(id)).filter(Boolean) as typeof evidenceRows;
          const missing = boundaries.filter((boundary) =>
            !cited.some((item) => item.text.includes(boundary)));
          if (missing.length > 0) {
            safety.stale_version_commits += 1;
            errors.push(`supported range boundaries not grounded in cited evidence: ${row.product}: ${range.raw} (missing ${missing.join(", ")})`);
          }
        }
      }
      const sources = [...new Set(row.evidence_ids.map((id) => evidenceById.get(id)?.source_type ?? "<dangling>"))];
      for (const source of sources) {
        if (!allowedSourceTypes.has(source)) {
          safety.forbidden_row += 1;
          errors.push(`claims row cites non-allowlisted evidence (${source}): ${row.product}`);
        }
      }
    }
    if (row.evidence_ids.some((id) => !evidenceById.has(id) || evidenceById.get(id)!.story_id !== storyId)) {
      safety.cross_story_evidence += 1;
      errors.push(`row cites evidence that is not Story-local: ${row.product}`);
    }
    const consistent = (row.confidence === "high" && row.routing === "auto" && row.persisted_kind === "claims")
      || (row.confidence === "low" && row.routing === "unknown" && row.persisted_kind === "unknown_only");
    if (!consistent) {
      // medium rows never persist as current rows at all, so a medium current row is a routing bug.
      safety.routing_inconsistent += 1;
      errors.push(`routing inconsistent for ${row.product}: ${row.confidence}/${row.routing}/${row.persisted_kind}`);
    }
  }
  for (const review of reviews) {
    if (JSON.stringify(review.payload).toLowerCase().includes('"poc":') && !JSON.stringify(review.payload).toLowerCase().includes('"poc":"unknown"')) {
      safety.poc_not_unknown += 1;
      errors.push("human review payload carries a non-unknown poc status");
    }
    if (review.payload === null) continue;
  }
  if (reviews.length < item.expected.human_reviews_min) {
    errors.push(`human reviews ${reviews.length} < required ${item.expected.human_reviews_min}`);
  }

  // Quality scoring with explicit denominators. Recall applies only to runs that proposed; an
  // insufficient_evidence or skipped outcome is excluded from the denominator, never scored as 1.
  const rowsText = impacts.map((row) => `${row.vendor} ${row.product} ${row.models.join(" ")}`.toLowerCase()).join(" | ");
  if (reachedModel) {
    quality.decision.scored += 1;
    if (decision !== null && item.expected.decisions.includes(decision as "propose" | "insufficient_evidence")) {
      quality.decision.hits += 1;
    } else errors.push(`decision ${decision} not in ${item.expected.decisions.join("/")}`);

    quality.exploit.scored += 1;
    const kevValues = new Set([...impacts.map((row) => row.exploit_status.known_exploited),
      ...(proposal?.exploit_status.known_exploited ? [proposal.exploit_status.known_exploited] : [])]);
    if (kevValues.size === 0 ? item.expected.known_exploited === "unknown" : kevValues.has(item.expected.known_exploited) && !kevValues.has("yes")) {
      quality.exploit.hits += 1;
    } else if (kevValues.has(item.expected.known_exploited)) {
      quality.exploit.hits += 1;
    } else errors.push(`known_exploited ${[...kevValues].join(",")} != ${item.expected.known_exploited}`);

    quality.unknown_honesty.scored += 1;
    const unknowns = Math.max(proposal?.unknowns.length ?? 0, impacts.reduce((sum, row) => sum + row.unknowns.length, 0), reviews.length);
    if (unknowns >= item.expected.unknowns_min) quality.unknown_honesty.hits += 1;
    else errors.push(`unknowns ${unknowns} below floor ${item.expected.unknowns_min}`);

    quality.routing.scored += 1;
    if (!errors.some((message) => message.startsWith("routing inconsistent"))) quality.routing.hits += 1;

    // Recall applies only to runs that decided to propose AND persisted at least one current row:
    // a propose whose rows all routed to human review has no persisted row text to match, and is
    // already covered by decision accuracy and unknown honesty.
    if (decision === "propose" && impacts.length > 0 && item.expected.row_contains.length > 0) {
      quality.row_recall.scored += 1;
      const hit = item.expected.row_contains.some((needle) =>
        rowsText.includes(needle.toLowerCase()) || rowsText.includes(needle.toLowerCase().replace(/ /g, "")));
      if (hit) quality.row_recall.hits += 1;
      else errors.push(`row recall miss: none of [${item.expected.row_contains.join(", ")}] in [${rowsText.slice(0, 200)}]`);
    }
  }
  if (impacts.length < item.expected.min_rows) errors.push(`rows ${impacts.length} < ${item.expected.min_rows}`);

  // Revision 5 label constraints, asserted per case and folded into the gate by the scorer.
  const claimsRows = impacts.filter((row) => row.persisted_kind === "claims");
  if (claimsRows.length > item.expected.claims_rows_max) {
    errors.push(`claims rows ${claimsRows.length} > allowed ${item.expected.claims_rows_max}`);
  }
  const modelCount = new Set(claimsRows.flatMap((row) => row.models.map((model) => model.toLowerCase()))).size;
  if (modelCount < item.expected.models_min) {
    errors.push(`evidence-backed models ${modelCount} < required ${item.expected.models_min}`);
  }
  for (const row of claimsRows) {
    if (item.expected.claims_require_versions
      && !(row.affected_range?.supported === true && row.fixed_range !== null && row.fixed_range.supported === true)) {
      errors.push(`contract-incomplete record: ${row.product} lacks a matcher-supported affected range and fixed version (affected ${JSON.stringify(row.affected_range)}, fixed ${JSON.stringify(row.fixed_range)})`);
    }
  }
  if (item.expected.forbidden_strings.length > 0) {
    const haystacks = [
      JSON.stringify(impacts),
      ...reviews.map((review) => JSON.stringify(review.payload)),
    ].map((text) => text.toLowerCase());
    for (const forbidden of item.expected.forbidden_strings) {
      if (haystacks.some((text) => text.includes(forbidden.toLowerCase()))) {
        errors.push(`forbidden string surfaced in persisted state or review payload: ${forbidden}`);
      }
    }
  }
  const productSignal = impacts.length + reviews.length;
  if (productSignal < item.expected.rows_or_reviews_min) {
    errors.push(`product signal (current rows + human reviews) ${productSignal} < required ${item.expected.rows_or_reviews_min}`);
  }
  // Revision 6 product-level constraints, asserted per case and folded into the gate.
  errors.push(...evaluateProductConstraints(item.expected, {
    reviews,
    claimsProducts: impacts.filter((row) => row.persisted_kind === "claims").map((row) => row.product),
    proposalUnknowns: proposal?.unknowns ?? [],
  }));
  // Revision 7a: version-bearing claims floor — complete version records must actually persist.
  const completeClaims = claimsRows.filter((row) =>
    row.affected_range?.supported === true && row.fixed_range !== null && row.fixed_range.supported === true);
  if (completeClaims.length < item.expected.complete_claims_min) {
    errors.push(`complete version claims ${completeClaims.length} < required ${item.expected.complete_claims_min}`);
  }

  perCase.push({
    case_id: item.case_id, story_id: storyId, errors,
    rows: impacts, human_reviews: reviews.length,
    run_summary: "run" in run ? { ...run, proposal: undefined } : run,
    unknowns: Math.max(proposal?.unknowns.length ?? 0, impacts.reduce((sum, row) => sum + row.unknowns.length, 0)),
  });
}

const n = cases.length;
const ratio = (metric: { hits: number; scored: number }) => metric.scored === 0 ? 0 : metric.hits / metric.scored;
const summary = {
  cases: n,
  safety,
  quality: {
    row_recall: ratio(quality.row_recall),
    decision_accuracy: ratio(quality.decision),
    exploit_accuracy: ratio(quality.exploit),
    routing_consistency: ratio(quality.routing),
    unknown_honesty: ratio(quality.unknown_honesty),
  },
  scored_cases: {
    row_recall: quality.row_recall.scored,
    decision_accuracy: quality.decision.scored,
    exploit_accuracy: quality.exploit.scored,
    routing_consistency: quality.routing.scored,
    unknown_honesty: quality.unknown_honesty.scored,
  },
  thresholds_sha256: thresholdsSha256,
};

// Formal fail-closed gate: the scorer reads the pre-registered thresholds, compares every hard
// safety maximum and quality minimum, and reports pass/fail. Missing metrics are failures.
const failures: string[] = [];
for (const [metric, maximum] of Object.entries(thresholds.hard_safety_maximums)) {
  const value = (summary.safety as Record<string, number | undefined>)[metric];
  if (value === undefined) failures.push(`safety metric ${metric} was never computed`);
  else if (value > maximum) failures.push(`safety ${metric} ${value} > ${maximum}`);
}
for (const [metric, minimum] of Object.entries(thresholds.quality_minimums)) {
  const value = (summary.quality as Record<string, number | undefined>)[metric];
  const scored = (summary.scored_cases as Record<string, number | undefined>)[metric];
  if (value === undefined) failures.push(`quality metric ${metric} was never computed`);
  // A metric with no scored case is not applicable to this run (for example row recall when no
  // case decided to propose with persisted rows); a vacuous zero must not fail the gate.
  else if (scored === 0) continue;
  else if (value < minimum) failures.push(`quality ${metric} ${value} < ${minimum}`);
}
// Fail-closed on per-case assertions too: a min_rows floor, a human-review floor, or any other
// per-case error violates the frozen labels even when every aggregate metric stays above its
// threshold. Aggregate greens with per-case violations are exactly the "假全绿" shape the gate
// must never produce.
for (const item of perCase) {
  const caseErrors = item.errors as string[];
  if (Array.isArray(caseErrors) && caseErrors.length > 0) {
    failures.push(`${item.case_id}: ${caseErrors.join("; ")}`);
  }
}
// Revision 7: at least one case must contribute a non-zero row-recall denominator, so the holdout
// always measures row recall on at least one persisted-claims case.
if ((summary.scored_cases as Record<string, number | undefined>).row_recall === 0) {
  failures.push("no case contributed a row-recall denominator (revision 7 requires at least one)");
}
const passed = failures.length === 0;

writeFileSync(values.out!, `${JSON.stringify({ passed, failures, summary, perCase }, null, 2)}\n`);
process.stdout.write(`${JSON.stringify({ ok: passed, passed, failures, summary, out: values.out })}\n`);
if (!passed) process.exitCode = 1;
await closeDb();
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main();
}
