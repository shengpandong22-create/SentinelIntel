import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { ImpactEvalCaseSchema, validateImpactEvalCases, type ImpactEvalCase } from "./impact-eval-core.ts";

// Phase 6 holdout candidate: cloned from the development templates with disjoint source identities
// (fresh CVE ids and advisory URLs). It stays only under .data, is explicitly UNREVIEWED, and the
// evaluator refuses to score it. Candidate construction is not a holdout freeze.

const ADVISORY = (slug: string) => `https://advisories.example/phase6-holdout/${slug}`;

const development = readFileSync("datasets/impact/development.jsonl", "utf8")
  .split(/\r?\n/).filter(Boolean).map((line) => ImpactEvalCaseSchema.parse(JSON.parse(line)));

const usedUrls = new Set(development.flatMap((row) => row.provenance.source_urls));
const usedCves = new Set(development.map((row) => row.input.source_parameters.cve_id).filter(Boolean) as string[]);

const rows: ImpactEvalCase[] = development.map((template, index) => {
  const caseId = template.case_id.replace("IMP-DEV-", "IMP-HOLD-");
  const cve = `CVE-2026-${20_000 + index}`;
  if (usedCves.has(cve)) throw new Error(`${caseId}: holdout CVE overlaps development`);
  const sourceUrl = ADVISORY(`${template.stratum}-${index + 1}`);
  if (usedUrls.has(sourceUrl)) throw new Error(`${caseId}: holdout source overlaps development: ${sourceUrl}`);

  const row = structuredClone(template) as ImpactEvalCase;
  row.case_id = caseId;
  row.split = "holdout";
  const oldIds = row.input.evidence.map((item) => item.evidence_id);
  const idMap = new Map(oldIds.map((oldId, position) => [oldId, `00000000-0000-4000-9000-${String(index).padStart(4, "0")}${String(position).padStart(8, "0")}`]));
  const vendor = row.input.source_parameters.vendor ?? "the vendor";
  const productName = row.expected.rows[0]?.product ?? `${vendor} product`;
  const selfConsistent: Record<string, { title: string; excerpt: string }> = {
    "single-product-cve": {
      title: `${vendor} advisory for ${cve}`,
      excerpt: `${productName} is affected by ${cve}. The vendor has released a corrected release but does not publish semantic version numbers for the affected range in this advisory.`,
    },
    "multi-product-family": {
      title: `${vendor} advisory for ${cve}`,
      excerpt: `Two affected product families are covered: ${row.expected.rows.map((item) => item.product).join(" and ")}. Versions 1.0 through 2.0 (exclusive) are affected by ${cve}; version 2.0 contains the fix.`,
    },
    "model-alias-conflict": {
      title: `${vendor} advisory for ${cve}: affected models`,
      excerpt: `${productName} models ${row.expected.rows.length ? "listed in the advisory" : ""} are affected by ${cve}. Versions 1.0 through 1.5 (exclusive) are affected; version 1.5 contains the fix.`,
    },
    "unresolvable-range": {
      title: `${vendor} advisory for ${cve}: affected builds`,
      excerpt: `Devices running builds before 20240412 are affected by ${cve}. This advisory does not list semantic versions for the affected range.`,
    },
    "missing-advisory": {
      title: `NVD record for ${cve}`,
      excerpt: `NVD has published a record for ${cve}. No official vendor advisory with product-impact details is referenced.`,
    },
    "conflicting-statements": {
      title: `${vendor} advisory for ${cve}`,
      excerpt: `Official statement: versions 1.0 through 2.0 (exclusive) of ${productName} are affected by ${cve} and version 2.0 contains the fix. A syndicated wire report additionally claims effectively all versions are affected.`,
    },
    "kev-status": {
      title: `${vendor} advisory for ${cve}`,
      excerpt: `${productName} versions 1.0 through 2.0 (exclusive) are affected by ${cve}; version 2.0 contains the fix.`,
    },
    "non-security-negative": {
      title: row.input.story_title,
      excerpt: "This post discusses business developments. It contains no vulnerability, affected product version, or security impact information.",
    },
  };
  const content = selfConsistent[template.stratum]!;
  for (const item of row.input.evidence) {
    item.evidence_id = idMap.get(item.evidence_id)!;
    item.canonical_url = item.source_type === "cisa_kev"
      ? "https://www.cisa.gov/known-exploited-vulnerabilities-catalog"
      : sourceUrl;
    item.content_hash = createHash("sha256").update(`${caseId}:${item.canonical_url}`).digest("hex");
    if (item.source_type !== "cisa_kev") {
      item.title = content.title;
      item.excerpt = content.excerpt;
    } else {
      item.title = `CISA KEV catalog: ${cve}`;
      item.excerpt = `${cve} was added to the CISA Known Exploited Vulnerabilities catalog and is actively exploited.`;
    }
  }
  for (const draft of row.input.extraction.drafts) {
    draft.evidence_ids = draft.evidence_ids.map((id) => idMap.get(id)!);
    if (draft.cve_id) draft.cve_id = cve;
  }
  row.input.source_parameters.cve_id = row.input.source_parameters.cve_id ? cve : null;
  row.input.story_title = `${vendor} ${cve}: ${row.stratum}`;
  row.input.story_digest = row.expected.decision === "insufficient_evidence" ? null : `${productName} affected by ${cve}.`;
  if (template.stratum === "single-product-cve") {
    row.input.extraction.unknowns = ["The advisory does not publish semantic version numbers for the affected range."];
    row.expected.unknowns_min = 1;
    for (const draft of row.input.extraction.drafts) {
      draft.affected_range_raw = null;
      draft.fixed_range_raw = null;
      draft.affected_range_supported = false;
      draft.fixed_range_supported = false;
    }
    for (const expectedRow of row.expected.rows) expectedRow.fixed_supported = null;
  }
  row.provenance = {
    source_urls: [sourceUrl],
    collected_at: row.provenance.collected_at,
    label_method: "UNREVIEWED",
    reviewers: [],
    note: "Disjoint Phase 6 holdout candidate with synthetic, self-consistent advisory content. It is not frozen gold and cannot be evaluated before independent review.",
  };
  return ImpactEvalCaseSchema.parse(row);
});

validateImpactEvalCases(rows, { holdout: true, candidate: true });
const output = ".data/impact/holdout-candidate.jsonl";
writeFileSync(output, `${rows.map((row) => JSON.stringify(row)).join("\n")}\n`);
process.stdout.write(`${JSON.stringify({ ok: true, cases: rows.length, out: output, status: "UNREVIEWED" })}\n`);
