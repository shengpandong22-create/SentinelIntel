import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";
import { z } from "zod";
import {
  EvidenceItemSchema,
  EvidenceManifestSchema,
  ReviewCaseSchema,
  semanticExpected,
  validateEvidencePack,
} from "../scripts/review-impact-e2e-holdout.ts";
import { disjointnessErrors } from "../scripts/validate-impact-e2e-disjoint.ts";

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function makeCase(overrides: Partial<z.infer<typeof ReviewCaseSchema>> = {}): z.infer<typeof ReviewCaseSchema> {
  return ReviewCaseSchema.parse({
    case_id: "IMP-TEST-001", split: "holdout", stratum: "test", cve: "CVE-2024-21762", vendor: "fortinet",
    story_title: "Test story",
    expected: {
      decisions: ["propose"], row_contains: ["fortios"], min_rows: 1, known_exploited: "yes", unknowns_min: 0,
    },
    provenance: {
      source_urls: ["https://nvd.nist.gov/vuln/detail/CVE-2024-21762", "https://www.cisa.gov/known-exploited-vulnerabilities-catalog", "https://www.fortiguard.com/psirt/FG-IR-24-015"],
      label_method: "UNREVIEWED", reviewers: [], note: "test",
    },
    ...overrides,
  });
}

function makeItem(overrides: Partial<z.infer<typeof EvidenceItemSchema>> = {}): z.infer<typeof EvidenceItemSchema> {
  const excerpt = overrides.excerpt ?? "CVE-2024-21762 FortiOS 7.4.0 through 7.4.2";
  return EvidenceItemSchema.parse({
    case_id: "IMP-TEST-001", source_type: "nvd", url: "https://nvd.nist.gov/vuln/detail/CVE-2024-21762",
    title: "NVD record", excerpt,
    retrieved_at: "2026-10-14T00:00:00.000Z",
    content_sha256: createHash("sha256").update(excerpt).digest("hex"),
    content_status: "ok",
    ...overrides,
  });
}

function makeManifest(items: Array<z.infer<typeof EvidenceItemSchema>>, packSha256: string): z.infer<typeof EvidenceManifestSchema> {
  return EvidenceManifestSchema.parse({
    schema_version: 1, pack: "test-pack.jsonl", pack_sha256: packSha256,
    constructed_at: "2026-10-14T00:00:00.000Z", kev_catalog_version: "2026.10.13",
    items: items.map((item) => ({ case_id: item.case_id, source_type: item.source_type, url: item.url, content_sha256: item.content_sha256, content_status: item.content_status })),
    note: "test",
  });
}

test("a complete evidence pack passes validation", () => {
  const items = [
    makeItem(),
    makeItem({ source_type: "cisa_kev", url: "https://www.cisa.gov/known-exploited-vulnerabilities-catalog", excerpt: '{"cveID":"CVE-2024-21762","vendorProject":"Fortinet"}' }),
    makeItem({ source_type: "vendor_advisory", url: "https://www.fortiguard.com/psirt/FG-IR-24-015", excerpt: "Version Affected Solution FortiOS 7.4 7.4.0 through 7.4.2 Upgrade to 7.4.3 or above" }),
  ];
  const manifest = makeManifest(items, createHash("sha256").update("pack-bytes").digest("hex"));
  assert.deepEqual(validateEvidencePack([makeCase()], items, manifest, manifest.pack_sha256), []);
});

test("semantic review input excludes deterministic behavior assertions", () => {
  const semantic = semanticExpected(makeCase());
  assert.deepEqual(Object.keys(semantic).sort(), [
    "allowed_decisions", "forbidden_evidence_strings", "known_exploited", "product_keywords",
  ]);
  assert.ok(!("human_reviews_min" in semantic));
  assert.ok(!("complete_claims_min" in semantic));
});

test("disjointness rejects CVEs already present in development or prior candidates", () => {
  const row = makeCase() as never;
  assert.match(disjointnessErrors([row], [{ file: "datasets/impact/development.jsonl", text: "CVE-2024-21762" }]).join("; "), /already appears/);
  assert.deepEqual(disjointnessErrors([row], [{ file: "prior.jsonl", text: "CVE-2025-0001" }]), []);
});

test("a source URL without an evidence item fails closed", () => {
  const items = [makeItem()];
  const manifest = makeManifest(items, createHash("sha256").update("pack-bytes").digest("hex"));
  const errors = validateEvidencePack([makeCase()], items, manifest, manifest.pack_sha256);
  assert.match(errors.join("; "), /source URL has no evidence item/);
});

test("known_exploited=yes requires a usable KEV entry for the same CVE", () => {
  const items = [
    makeItem(),
    makeItem({ source_type: "cisa_kev", url: "https://www.cisa.gov/known-exploited-vulnerabilities-catalog", excerpt: '{"cveID":"CVE-2024-35250","vendorProject":"Microsoft"}' }),
    makeItem({ source_type: "vendor_advisory", url: "https://www.fortiguard.com/psirt/FG-IR-24-015", excerpt: "advisory text" }),
  ];
  const manifest = makeManifest(items, createHash("sha256").update("pack-bytes").digest("hex"));
  const errors = validateEvidencePack([makeCase()], items, manifest, manifest.pack_sha256);
  assert.match(errors.join("; "), /KEV evidence does not contain the case CVE/);

  const missing = validateEvidencePack([makeCase()], [makeItem()], makeManifest([makeItem()], createHash("sha256").update("pack-bytes").digest("hex"), ), createHash("sha256").update("pack-bytes").digest("hex"));
  assert.match(missing.join("; "), /known_exploited=yes without a usable CISA KEV evidence item/);
});

test("pack hash and item hash drift fail closed", () => {
  const items = [makeItem()];
  const manifest = makeManifest(items, createHash("sha256").update("pack-bytes").digest("hex"));
  assert.match(validateEvidencePack([makeCase()], items, manifest, createHash("sha256").update("other-bytes").digest("hex")).join("; "), /pack hash mismatch/);
  const tampered = [makeItem({ content_sha256: "0".repeat(64) })];
  assert.match(validateEvidencePack([makeCase()], tampered, manifest, manifest.pack_sha256).join("; "), /content hash mismatch/);
});

test("an unfetchable evidence item must carry a reason", () => {
  const excerpt = "the URL returned HTTP 404 at construction time";
  const items = [makeItem({
    source_type: "vendor_advisory", url: "https://www.cisco.com/partner-summit", excerpt,
    content_status: "unfetchable",
  })];
  const manifest = makeManifest(items, createHash("sha256").update("pack-bytes").digest("hex"));
  assert.match(validateEvidencePack([makeCase()], items, manifest, manifest.pack_sha256).join("; "), /unfetchable evidence without a reason/);
  const withReason = [makeItem({
    source_type: "vendor_advisory", url: "https://www.cisco.com/partner-summit", excerpt,
    content_status: "unfetchable", unfetchable_reason: "HTTP 404",
  })];
  const errors = validateEvidencePack([makeCase()], withReason, makeManifest(withReason, createHash("sha256").update("pack-bytes").digest("hex")), createHash("sha256").update("pack-bytes").digest("hex"));
  assert.ok(!errors.some((error) => error.includes("without a reason")));
});

test("the frozen v11 evidence pack validates against the v11 candidate and its manifest", () => {
  const cases = z.array(ReviewCaseSchema).parse(
    readFileSync(path.join(REPO_ROOT, "datasets/impact/e2e-holdout-v11-candidate.jsonl"), "utf8")
      .split(/\r?\n/).filter(Boolean).map((line) => JSON.parse(line)),
  );
  const packBytes = readFileSync(path.join(REPO_ROOT, "datasets/impact/e2e-holdout-v11-evidence.jsonl"));
  const items = z.array(EvidenceItemSchema).parse(
    packBytes.toString("utf8").split(/\r?\n/).filter(Boolean).map((line) => JSON.parse(line)),
  );
  const manifest = EvidenceManifestSchema.parse(
    JSON.parse(readFileSync(path.join(REPO_ROOT, "datasets/impact/e2e-holdout-v11-evidence-manifest.json"), "utf8")),
  );
  const errors = validateEvidencePack(cases, items, manifest, createHash("sha256").update(packBytes).digest("hex"));
  assert.deepEqual(errors, []);
  // Every KEV-labelled case carries the actual catalog entry for its own CVE.
  for (const item of cases.filter((row) => row.expected.known_exploited === "yes")) {
    const kev = items.find((entry) => entry.case_id === item.case_id && entry.source_type === "cisa_kev");
    assert.ok(kev, `${item.case_id}: missing KEV entry`);
    assert.match(kev!.excerpt, new RegExp(item.cve!));
  }
});

test("the frozen v12 evidence pack validates against the disjoint v12 candidate", () => {
  const cases = z.array(ReviewCaseSchema).parse(
    readFileSync(path.join(REPO_ROOT, "datasets/impact/e2e-holdout-v12-candidate.jsonl"), "utf8")
      .split(/\r?\n/).filter(Boolean).map((line) => JSON.parse(line)),
  );
  const packBytes = readFileSync(path.join(REPO_ROOT, "datasets/impact/e2e-holdout-v12-evidence.jsonl"));
  const items = z.array(EvidenceItemSchema).parse(
    packBytes.toString("utf8").split(/\r?\n/).filter(Boolean).map((line) => JSON.parse(line)),
  );
  const manifest = EvidenceManifestSchema.parse(
    JSON.parse(readFileSync(path.join(REPO_ROOT, "datasets/impact/e2e-holdout-v12-evidence-manifest.json"), "utf8")),
  );
  assert.deepEqual(validateEvidencePack(cases, items, manifest, createHash("sha256").update(packBytes).digest("hex")), []);
});
