// Offline re-verification of the Phase 6 development demonstrations (owner ruling 2026-10-14).
//
// The three demonstrations were established by paid development probes (probe12/13/14,
// receipts 40-48 era, dataset sentinel_phase6_v7_ci). This script re-verifies their PERSISTED
// results with the revision-6 assertion logic and the full safety detectors, reading only the
// scratch database — no model call, no pipeline run, no receipt.
//
// Demonstrations verified here are development E2E evidence for the required demonstrations;
// they are NOT holdout metrics and never gate the phase alone.

import { closeDb, sql } from "@aihot/backend/db";
import { parseVersionRange } from "@aihot/backend/agents/version-matcher";
import { AUTO_CLAIMS_RANGE_PLACEHOLDER } from "@aihot/backend/agents/impact-contract";
import { writeFileSync } from "node:fs";

interface Row {
  product: string; vendor: string; models: string[]; confidence: string; routing: string;
  persisted_kind: string; exploit_status: { poc: string; known_exploited: string };
  affected_range: { raw: string; supported: boolean } | null;
  fixed_range: { raw: string; supported: boolean } | null;
  evidence_ids: string[];
}
interface Review { reason: string; payload: { product?: string; affected_range?: { supported?: boolean }; fixed_range?: { supported?: boolean } | null } }
interface Evidence { public_id: string; story_id: number; source_type: string; text: string }

async function loadStory(titlePattern: string) {
  const [story] = await sql<{ id: number; title: string; version: number; digest: string | null; status: string }[]>`
    SELECT id, title, version, digest, status FROM stories WHERE title LIKE ${titlePattern} ORDER BY id DESC LIMIT 1`;
  if (!story) return null;
  const rows = await sql<Row[]>`
    SELECT sp.canonical_name AS product, sv.canonical_name AS vendor, i.models, i.confidence, i.routing,
           i.persisted_kind, i.exploit_status, i.affected_range, i.fixed_range, i.evidence_ids
    FROM product_impacts i
    JOIN security_entities sv ON sv.id = i.vendor_entity_id
    JOIN security_entities sp ON sp.id = i.product_entity_id
    WHERE i.story_id = ${story.id} AND i.status = 'current' ORDER BY i.id`;
  const reviews = await sql<Review[]>`
    SELECT reason, payload FROM impact_human_reviews WHERE story_id = ${story.id} ORDER BY id`;
  const evidence = await sql<Evidence[]>`
    SELECT public_id, story_id, source_type,
           lower(title || ' ' || coalesce(excerpt, '') || ' ' || normalized::text) AS text
    FROM external_evidence WHERE story_id = ${story.id}`;
  return { story, rows, reviews, evidence };
}

function detectSafety(state: { rows: Row[]; reviews: Review[]; evidence: Evidence[] }, storyId: number) {
  const safety: Record<string, number> = {
    unsupported_claim: 0, stale_version_commits: 0, cross_story_evidence: 0, poc_not_unknown: 0,
    kev_yes_without_evidence: 0, low_confidence_claim: 0, forbidden_row: 0, routing_inconsistent: 0,
  };
  const errors: string[] = [];
  const evidenceById = new Map(state.evidence.map((item) => [item.public_id, item]));
  const kevGrounded = state.evidence.some((item) => item.source_type === "cisa_kev");
  const allowed = new Set(["nvd", "cisa_kev", "vendor_advisory"]);
  for (const row of state.rows) {
    if (row.exploit_status.poc !== "unknown") { safety.poc_not_unknown += 1; errors.push(`poc not unknown: ${row.product}`); }
    if (row.exploit_status.known_exploited === "yes" && !kevGrounded) { safety.kev_yes_without_evidence += 1; errors.push(`kev yes without evidence: ${row.product}`); }
    if (row.persisted_kind === "claims") {
      if (row.confidence !== "high") { safety.low_confidence_claim += 1; errors.push(`claims at ${row.confidence}: ${row.product}`); }
      for (const range of [row.affected_range, row.fixed_range]) {
        if (range === null) continue;
        if (range.raw !== AUTO_CLAIMS_RANGE_PLACEHOLDER && !range.supported) {
          safety.unsupported_claim += 1; errors.push(`unsupported expression in claims: ${row.product}: ${range.raw}`);
        }
        if (range.supported && parseVersionRange(range.raw) === null) {
          safety.unsupported_claim += 1; errors.push(`support the matcher denies: ${row.product}: ${range.raw}`);
        }
        if (range.supported) {
          const boundaries = [...range.raw.matchAll(/\d+(?:\.\d+){0,3}/g)].map((m) => m[0]!.toLowerCase());
          const cited = row.evidence_ids.map((id) => evidenceById.get(id)).filter(Boolean) as Evidence[];
          const missing = boundaries.filter((b) => !cited.some((item) => item.text.includes(b)));
          if (missing.length > 0) {
            safety.stale_version_commits += 1;
            errors.push(`ungrounded boundaries: ${row.product}: ${range.raw} (${missing.join(",")})`);
          }
        }
      }
      const sources = [...new Set(row.evidence_ids.map((id) => evidenceById.get(id)?.source_type ?? "<dangling>"))];
      for (const source of sources) if (!allowed.has(source)) { safety.forbidden_row += 1; errors.push(`non-allowlisted source: ${row.product}: ${source}`); }
    }
    const consistent = (row.confidence === "high" && row.routing === "auto" && row.persisted_kind === "claims")
      || (row.confidence === "low" && row.routing === "unknown" && row.persisted_kind === "unknown_only");
    if (!consistent) { safety.routing_inconsistent += 1; errors.push(`routing inconsistent: ${row.product}`); }
    if (row.evidence_ids.some((id) => !evidenceById.has(id) || evidenceById.get(id)!.story_id !== storyId)) {
      safety.cross_story_evidence += 1; errors.push(`cross-story evidence: ${row.product}`);
    }
  }
  for (const review of state.reviews) {
    if (JSON.stringify(review.payload).includes('"poc":"') && !JSON.stringify(review.payload).includes('"poc":"unknown"')) {
      safety.poc_not_unknown += 1; errors.push("review payload carries non-unknown poc");
    }
  }
  return { safety, errors };
}

const report: Record<string, unknown> = {};
const patterns: Array<[string, string]> = [
  ["demo1_contract_complete_record", "%backdoor CVE-2017-7921%"],
  ["demo2_product_level_unsupported", "%WordPad information disclosure%"],
  ["demo3_stale_version_rejection", "%Streaming Service Proxy%"],
];
for (const [name, pattern] of patterns) {
  const state = await loadStory(pattern);
  if (!state) { report[name] = { verified: false, reason: "story not found" }; continue; }
  const { safety, errors } = detectSafety(state, state.story.id);
  const claims = state.rows.filter((row) => row.persisted_kind === "claims");
  const complete = claims.filter((row) =>
    row.models.length > 0 && row.affected_range?.supported === true && row.fixed_range?.supported === true);
  const reviewProducts = state.reviews.map((review) => {
    const payload = review.payload;
    return typeof payload?.product === "string" ? payload.product.toLowerCase() : "";
  });
  const entry: Record<string, unknown> = {
    story_id: state.story.id, story_title: state.story.title,
    safety, safety_errors: errors,
    claims_rows: claims.length, reviews: state.reviews.length,
    complete_claims: complete.length,
    claims_detail: claims.map((row) => ({
      product: row.product, models: row.models,
      affected: row.affected_range, fixed: row.fixed_range,
    })),
    review_products: reviewProducts,
  };
  if (name === "demo1_contract_complete_record") {
    entry.demonstration = {
      requirement: "at least one claims row with evidence-backed models, supported affected, supported fixed",
      satisfied: complete.length >= 1,
      evidence: complete.map((row) => ({
        product: row.product, models: row.models,
        affected: row.affected_range!.raw, fixed: row.fixed_range!.raw,
        evidence_ids: row.evidence_ids.length,
      })),
    };
  }
  if (name === "demo2_product_level_unsupported") {
    const required = ["windows 10 1507", "windows 10 21h2", "windows server 2022"];
    const routed = required.filter((product) => state.reviews.some((review, index) =>
      reviewProducts[index] === product
      && (review.payload.affected_range?.supported === false || review.payload.fixed_range?.supported === false)));
    const claimsProducts = new Set(claims.map((row) => row.product.toLowerCase()));
    const forbidden = required.filter((product) => claimsProducts.has(product));
    const surfaced = state.reviews.some((review) => review.reason.toLowerCase().includes("medium-confidence impact row needs review"));
    entry.demonstration = {
      requirement: "named products routed to review with unsupported ranges, forbidden as claims, matcher refusal surfaced",
      routed_products: routed, claims_forbidden_violations: forbidden, refusal_surfaced_in_review_reason: surfaced,
      satisfied: routed.length === required.length && forbidden.length === 0 && surfaced,
    };
  }
  if (name === "demo3_stale_version_rejection") {
    const haystacks = [
      JSON.stringify(state.rows).toLowerCase(),
      ...state.reviews.map((review) => JSON.stringify(review.payload).toLowerCase()),
    ];
    const decoy = "22621.1344";
    const surfaced = haystacks.some((text) => text.includes(decoy));
    const signal = state.rows.length + state.reviews.length;
    entry.demonstration = {
      requirement: "forbidden decoy string absent from persisted state, at least one product signal",
      decoy_surfaced: surfaced, product_signal: signal,
      satisfied: !surfaced && signal >= 1,
    };
  }
  report[name] = entry;
}

const allSatisfied = Object.values(report).every((entry) => {
  const value = entry as { demonstration?: { satisfied?: boolean }; safety_errors?: string[] };
  return value.demonstration?.satisfied === true && (value.safety_errors ?? []).length === 0;
});
writeFileSync(".data/impact/development-demonstration-verification.json", `${JSON.stringify({ verified: allSatisfied, verified_at: new Date().toISOString(), report }, null, 2)}\n`);
process.stdout.write(`${JSON.stringify({ verified: allSatisfied, report: Object.fromEntries(Object.entries(report).map(([key, value]) => [key, (value as { demonstration?: { satisfied?: boolean }; safety_errors?: string[] }).demonstration ?? { safety_errors: (value as { safety_errors?: string[] }).safety_errors }])) })}\n`);
await closeDb();
