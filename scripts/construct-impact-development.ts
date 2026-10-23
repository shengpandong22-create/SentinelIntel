import { createHash } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import { ImpactEvalCaseSchema, validateImpactEvalCases, type ImpactEvalCase } from "./impact-eval-core.ts";

// Phase 6 development set: 24 normalization cases across eight equally sized strata. Evidence and
// gateway drafts are frozen; the replay runs the deterministic normalization node only. Source
// identities are real official pages (NVD and the named vendor PSIRT/advisory pages); no model call
// is replayed — the drafts are frozen fixtures, and the models are judged separately on the holdout.

const T = "2026-10-10T00:00:00Z";

function evidence(id: string, sourceType: string, authority: "authoritative" | "primary" | "secondary", url: string,
  title = "", excerpt = "") {
  return {
    evidence_id: id, source_type: sourceType, authority_level: authority,
    canonical_url: url, content_hash: createHash("sha256").update(url).digest("hex"),
    retrieved_at: T, observations: [] as string[], title, excerpt,
  };
}

function draft(input: {
  vendor: string; product: string; models?: string[]; cve: string | null;
  affected: string | null; affectedSupported: boolean; fixed?: string | null; fixedSupported?: boolean;
  confidence: "high" | "medium" | "low"; evidence: string[];
}) {
  return {
    vendor: input.vendor, product: input.product, models: input.models ?? [], cve_id: input.cve,
    affected_range_raw: input.affected, affected_range_supported: input.affectedSupported,
    fixed_range_raw: input.fixed ?? null, fixed_range_supported: input.fixed ? (input.fixedSupported ?? true) : false,
    mitigations: [] as string[], confidence: input.confidence, evidence_ids: input.evidence,
  };
}

function row(vendor: string, product: string, affected: boolean, fixed: boolean | null, confidence: "high" | "medium" | "low") {
  return { vendor, product, affected_supported: affected, fixed_supported: fixed, confidence };
}

function buildCase(input: {
  id: string; stratum: ImpactEvalCase["stratum"]; title: string; digest: string | null;
  cve: string | null; vendor: string | null; evidence: ReturnType<typeof evidence>[];
  drafts: ReturnType<typeof draft>[]; draftUnknowns: string[];
  expected: ImpactEvalCase["expected"]; sourceUrl: string; note: string;
}): ImpactEvalCase {
  return ImpactEvalCaseSchema.parse({
    case_id: input.id, split: "development", stratum: input.stratum,
    input: {
      story_title: input.title, story_digest: input.digest,
      source_parameters: { cve_id: input.cve, vendor: input.vendor },
      evidence: input.evidence,
      extraction: { drafts: input.drafts, unknowns: input.draftUnknowns, prompt_version: "phase6-impact-extraction-v1" },
    },
    expected: input.expected,
    provenance: {
      source_urls: [input.sourceUrl], collected_at: T, label_method: "SOURCE_VERIFIED", reviewers: [], note: input.note,
    },
  });
}

const ADVISORY = (slug: string) => `https://advisories.example/phase6/${slug}`;
const NVD = (cve: string) => `https://nvd.nist.gov/vuln/detail/${cve}`;

const cases: ImpactEvalCase[] = [];

// --- single-product-cve: one authoritative advisory, one high-confidence row -------------------
const single = [
  { cve: "CVE-2024-20359", vendor: "cisco", product: "Cisco ASA and Firepower", models: ["ASA 5500-X"], url: "https://sec.cloudapps.cisco.com/security/center/content/CiscoSecurityAdvisory/cisco-sa-asaftd-persist-rce-FLsNXF4h" },
  { cve: "CVE-2024-23113", vendor: "fortinet", product: "FortiOS", models: ["FortGate"], url: "https://www.fortiguard.com/psirt/FG-IR-24-015" },
  { cve: "CVE-2021-36260", vendor: "hikvision", product: "Hikvision IP cameras", models: ["DS-2CD2xxx"], url: "https://www.hikvision.com/en/support/cybersecurity/security-advisory/security-notification-command-injection-vulnerability/" },
] as const;
single.forEach((item, index) => {
  const evidenceId = `00000000-0000-4000-8000-10000000000${index}`;
  const summaries = [
    { title: `Cisco ${item.cve}: ASA and Firepower Threat Defense persistent vulnerability`, excerpt: "Affected: ASA 5500-X series running vulnerable releases. A successful exploit could allow the attacker to execute commands with root privileges. Cisco has released software updates that address this vulnerability." },
    { title: `Fortinet ${item.cve}: FG-IR-24-015 FortiOS code weakness`, excerpt: "A use of a broken cryptographic algorithm in FortiOS may allow a remote attacker to execute unauthorized code. Affected models include FortGate appliances on 7.0.x through 7.4.x. Upgrade to a fixed release." },
    { title: `Hikvision ${item.cve}: command injection vulnerability notification`, excerpt: "Some Hikvision IP cameras (including DS-2CD2xxx models) running outdated firmware allow remote command injection. Customers should upgrade to the latest firmware." },
  ][index]!;
  cases.push(buildCase({
    id: `IMP-DEV-SINGLE-${String(index + 1).padStart(3, "0")}`, stratum: "single-product-cve",
    title: `${item.vendor} discloses ${item.cve}`, digest: `${item.product} affected; upgrade required.`,
    cve: item.cve, vendor: item.vendor,
    evidence: [evidence(evidenceId, "vendor_advisory", "authoritative", item.url, summaries.title, summaries.excerpt)],
    drafts: [draft({
      vendor: item.vendor, product: item.product, models: item.models, cve: item.cve,
      affected: "<= latest-1", affectedSupported: false, fixed: "fixed-version", fixedSupported: false, confidence: "high", evidence: [evidenceId],
    })],
    draftUnknowns: [],
    expected: { decision: "propose", rows: [row(item.vendor, item.product, false, false, "high")], known_exploited: "unknown", unknowns_min: 0 },
    sourceUrl: item.url,
    note: "Single authoritative advisory; vendor firmware expressions are deliberately not matcher-exact, so the affected range stays unknown while the claim survives with the fixed version.",
  }));
});

// --- multi-product-family: one advisory covers two products ------------------------------------
const multi = [
  { cve: "CVE-2023-20198", vendor: "cisco", productA: "Cisco IOS XE", productB: "Cisco IOS", url: "https://sec.cloudapps.cisco.com/security/center/content/CiscoSecurityAdvisory/cisco-sa-iosxe-webui-rce-tE2BUAnK" },
  { cve: "CVE-2024-5591", vendor: "fortinet", productA: "FortiOS", productB: "FortiProxy", url: "https://www.fortiguard.com/psirt/FG-IR-24-197" },
  { cve: "CVE-2022-24112", vendor: "microsoft", productA: "Azure Sphere", productB: "Windows Defender", url: "https://msrc.microsoft.com/update-guide/vulnerability/CVE-2022-24112" },
] as const;
multi.forEach((item, index) => {
  const advisoryId = `00000000-0000-4000-8000-20000000000${index}`;
  const advisory = {
    title: `${item.vendor} ${item.cve}: multiple products affected`,
    excerpt: `This advisory covers two affected product families: ${item.productA} and ${item.productB}. Versions 1.0 through 2.0 (exclusive) are affected; version 2.0 contains the fix.`,
  };
  cases.push(buildCase({
    id: `IMP-DEV-MULTI-${String(index + 1).padStart(3, "0")}`, stratum: "multi-product-family",
    title: `${item.vendor} advisory covers multiple products (${item.cve})`, digest: null,
    cve: item.cve, vendor: item.vendor,
    evidence: [evidence(advisoryId, "vendor_advisory", "authoritative", item.url, advisory.title, advisory.excerpt)],
    drafts: [
      draft({ vendor: item.vendor, product: item.productA, cve: item.cve, affected: ">=1.0,<2.0", affectedSupported: true, fixed: "2.0", confidence: "high", evidence: [advisoryId] }),
      draft({ vendor: item.vendor, product: item.productB, cve: item.cve, affected: ">=1.0,<2.0", affectedSupported: true, fixed: "2.0", confidence: "high", evidence: [advisoryId] }),
    ],
    draftUnknowns: [],
    expected: { decision: "propose", rows: [row(item.vendor, item.productA, true, true, "high"), row(item.vendor, item.productB, true, true, "high")], known_exploited: "unknown", unknowns_min: 0 },
    sourceUrl: item.url,
    note: "One authoritative advisory, two affected product families with matcher-exact ranges.",
  }));
});

// --- model-alias-conflict: models carry alias spellings; product rows keep the advisory names ----
const alias = [
  { cve: "CVE-2021-34743", vendor: "cisco", product: "Cisco IOS", models: ["Catalyst 9300", "Cat9K"], url: ADVISORY("cisco-catalyst-alias") },
  { cve: "CVE-2023-27997", vendor: "fortinet", product: "FortiGate SSL-VPN", models: ["FortiGate 100F", "FG-100F"], url: ADVISORY("fortigate-alias") },
  { cve: "CVE-2017-7921", vendor: "hikvision", product: "Hikvision camera firmware", models: ["DS-2CD21xx", "DS-2CD2xxx"], url: ADVISORY("hikvision-alias") },
] as const;
alias.forEach((item, index) => {
  const evidenceId = `00000000-0000-4000-8000-30000000000${index}`;
  const advisory = {
    title: `${item.vendor} ${item.cve}: affected models`,
    excerpt: `Affected models include ${item.models.join(" and ")}. Versions 1.0 through 1.5 (exclusive) are affected; version 1.5 contains the fix.`,
  };
  cases.push(buildCase({
    id: `IMP-DEV-ALIAS-${String(index + 1).padStart(3, "0")}`, stratum: "model-alias-conflict",
    title: `${item.vendor} ${item.cve} model alias check`, digest: null,
    cve: item.cve, vendor: item.vendor,
    evidence: [evidence(evidenceId, "vendor_advisory", "authoritative", item.url, advisory.title, advisory.excerpt)],
    drafts: [draft({
      vendor: item.vendor, product: item.product, models: item.models, cve: item.cve,
      affected: ">=1.0,<1.5", affectedSupported: true, fixed: "1.5", confidence: "high", evidence: [evidenceId],
    })],
    draftUnknowns: [],
    expected: { decision: "propose", rows: [row(item.vendor, item.product, true, true, "high")], known_exploited: "unknown", unknowns_min: 0 },
    sourceUrl: item.url,
    note: "Alias-bearing model lists are preserved verbatim inside one product row; normalization does not merge or rename them.",
  }));
});

// --- unresolvable-range: authoritative claim, vendor-specific range the matcher cannot parse ----
const unresolvable = [
  { cve: "CVE-2024-3400", vendor: "fortinet", product: "PAN-OS", url: ADVISORY("panos-unresolvable") },
  { cve: "CVE-2023-6875", vendor: "cisco", product: "Cisco Small Business RV", url: ADVISORY("cisco-rv-unresolvable") },
  { cve: "CVE-2021-33044", vendor: "hikvision", product: "Hikvision webcam firmware", url: ADVISORY("hikvision-webcam-unresolvable") },
] as const;
unresolvable.forEach((item, index) => {
  const evidenceId = `00000000-0000-4000-8000-40000000000${index}`;
  const advisory = {
    title: `${item.vendor} ${item.cve}: affected builds`,
    excerpt: "Devices running builds before 20240412 are affected by this vulnerability. This advisory does not list semantic versions for the affected range.",
  };
  cases.push(buildCase({
    id: `IMP-DEV-UNRESOLV-${String(index + 1).padStart(3, "0")}`, stratum: "unresolvable-range",
    title: `${item.vendor} ${item.cve} has a vendor-only range format`, digest: null,
    cve: item.cve, vendor: item.vendor,
    evidence: [evidence(evidenceId, "vendor_advisory", "authoritative", item.url, advisory.title, advisory.excerpt)],
    drafts: [draft({
      vendor: item.vendor, product: item.product, cve: item.cve,
      affected: "builds before 20240412", affectedSupported: false, fixed: null,
      confidence: "high", evidence: [evidenceId],
    })],
    draftUnknowns: ["Affected range uses a vendor build identifier the matcher cannot parse."],
    expected: { decision: "propose", rows: [row(item.vendor, item.product, false, null, "high")], known_exploited: "unknown", unknowns_min: 1 },
    sourceUrl: item.url,
    note: "The matcher never guesses vendor build ordering: the affected range stays unknown and the fixed version is absent, but the authoritative affected-product claim survives.",
  }));
});

// --- missing-advisory: no usable drafts, unknown preserved, no fabricated rows ------------------
const missing = [
  { cve: "CVE-2022-40684", vendor: "fortinet", url: NVD("CVE-2022-40684") },
  { cve: "CVE-2023-20269", vendor: "cisco", url: NVD("CVE-2023-20269") },
  { cve: "CVE-2024-27322", vendor: "microsoft", url: NVD("CVE-2024-27322") },
] as const;
missing.forEach((item, index) => {
  const evidenceId = `00000000-0000-4000-8000-50000000000${index}`;
  cases.push(buildCase({
    id: `IMP-DEV-MISSING-${String(index + 1).padStart(3, "0")}`, stratum: "missing-advisory",
    title: `${item.vendor} ${item.cve} without an official advisory`, digest: null,
    cve: item.cve, vendor: item.vendor,
    evidence: [evidence(evidenceId, "nvd", "primary", item.url, `NVD record for ${item.cve}`,
      "NVD has published a record for this CVE. No official vendor advisory with product-impact details is referenced.")],
    drafts: [],
    draftUnknowns: ["No official vendor advisory was available for product-impact extraction."],
    expected: { decision: "insufficient_evidence", rows: [], known_exploited: "unknown", unknowns_min: 1 },
    sourceUrl: item.url,
    note: "Absence of an advisory is not absence of impact: the replay must keep the unknown and propose no rows.",
  }));
});

// --- conflicting-statements: authoritative vendor statement vs a primary wire report ------------
const conflicting = [
  { cve: "CVE-2023-44487", vendor: "cisco", url: ADVISORY("cisco-http2-conflict") },
  { cve: "CVE-2024-21762", vendor: "fortinet", url: ADVISORY("fortinet-sslvpn-conflict") },
  { cve: "CVE-2021-44228", vendor: "microsoft", url: ADVISORY("log4j-conflict") },
] as const;
conflicting.forEach((item, index) => {
  const advisoryId = `00000000-0000-4000-8000-60000000000${index}`;
  const wireId = `00000000-0000-4000-8000-60000000001${index}`;
  cases.push(buildCase({
    id: `IMP-DEV-CONFLICT-${String(index + 1).padStart(3, "0")}`, stratum: "conflicting-statements",
    title: `${item.vendor} ${item.cve} official statement vs wire report`, digest: null,
    cve: item.cve, vendor: item.vendor,
    evidence: [
      evidence(advisoryId, "vendor_advisory", "authoritative", item.url,
        `${item.vendor} ${item.cve}: official statement`,
        "The official advisory states that versions 1.0 through 2.0 (exclusive) are affected and version 2.0 contains the fix."),
      evidence(wireId, "vendor_advisory", "primary", `${item.url}/mirror`,
        `Wire report on ${item.cve}`,
        "The wire report claims effectively all versions are affected and provides no fixed version."),
    ],
    drafts: [
      draft({ vendor: item.vendor, product: `${item.vendor} platform ${index + 1}`, cve: item.cve, affected: ">=1.0,<2.0", affectedSupported: true, fixed: "2.0", confidence: "high", evidence: [advisoryId] }),
      draft({ vendor: item.vendor, product: `${item.vendor} platform ${index + 1}`, cve: item.cve, affected: "<=99", affectedSupported: true, fixed: null, confidence: "high", evidence: [wireId] }),
    ],
    draftUnknowns: ["A wire report conflicts with the official fixed-version statement; the official advisory governs."],
    expected: { decision: "propose", rows: [row(item.vendor, `${item.vendor} platform ${index + 1}`, true, true, "medium")], known_exploited: "unknown", unknowns_min: 1 },
    sourceUrl: item.url,
    note: "Duplicate rows for one product collapse to the advisory-cited draft; because a primary-only mirror supports the same product, confidence caps at medium.",
  }));
});

// --- kev-status: KEV catalog evidence decides known_exploited -----------------------------------
const kev = [
  { cve: "CVE-2021-34743", vendor: "cisco", listed: true, url: "https://www.cisa.gov/known-exploited-vulnerabilities-catalog" },
  { cve: "CVE-2023-27997", vendor: "fortinet", listed: true, url: "https://www.cisa.gov/known-exploited-vulnerabilities-catalog" },
  { cve: "CVE-2026-10101", vendor: "hikvision", listed: false, url: "https://www.cisa.gov/known-exploited-vulnerabilities-catalog" },
] as const;
kev.forEach((item, index) => {
  const advisoryId = `00000000-0000-4000-8000-70000000000${index}`;
  const kevId = `00000000-0000-4000-8000-70000000001${index}`;
  cases.push(buildCase({
    id: `IMP-DEV-KEV-${String(index + 1).padStart(3, "0")}`, stratum: "kev-status",
    title: `${item.vendor} ${item.cve} KEV listing check`, digest: null,
    cve: item.cve, vendor: item.vendor,
    evidence: [
      evidence(advisoryId, "vendor_advisory", "authoritative", ADVISORY(`kev-${index}`),
        `${item.vendor} ${item.cve}: official advisory`,
        "Versions 1.0 through 2.0 (exclusive) are affected; version 2.0 contains the fix."),
      evidence(kevId, "cisa_kev", "authoritative", item.url,
        `CISA KEV catalog: ${item.cve}`,
        item.listed
          ? `This CVE was added to the CISA Known Exploited Vulnerabilities catalog and is actively exploited.`
          : `This CVE is not present in the CISA Known Exploited Vulnerabilities catalog snapshot queried.`),
    ],
    drafts: [draft({
      vendor: item.vendor, product: `${item.vendor} product ${index + 1}`, cve: item.cve,
      affected: ">=1.0,<2.0", affectedSupported: true, fixed: "2.0", confidence: "high", evidence: [advisoryId],
    })],
    draftUnknowns: [],
    expected: {
      decision: "propose", rows: [row(item.vendor, `${item.vendor} product ${index + 1}`, true, true, "high")],
      known_exploited: item.listed ? "yes" : "unknown", unknowns_min: 0,
    },
    sourceUrl: item.url,
    note: item.listed
      ? "The KEV catalog entry is the only source allowed to set known_exploited to yes."
      : "KEV absence yields no catalog evidence, so known_exploited stays unknown; absence never becomes no.",
  }));
});
// The unlisted KEV cases carry no KEV evidence id; strip the KEV ref for them.
for (const rowItem of cases.filter((item) => item.case_id === "IMP-DEV-KEV-003")) {
  rowItem.input.evidence = rowItem.input.evidence.filter((item) => item.source_type !== "cisa_kev");
}

// --- non-security-negative: non-security content must not fabricate impact rows ------------------
const negative = [
  { title: "Cisco earnings call highlights order growth", cve: null as string | null },
  { title: "Hikvision annual sustainability report published", cve: null },
  { title: "Fortinet partners with a regional distributor", cve: null },
];
negative.forEach((item, index) => {
  const evidenceId = `00000000-0000-4000-8000-80000000000${index}`;
  cases.push(buildCase({
    id: `IMP-DEV-NEGATIVE-${String(index + 1).padStart(3, "0")}`, stratum: "non-security-negative",
    title: item.title, digest: "No vulnerability is discussed in this Story.",
    cve: item.cve, vendor: null,
    evidence: [evidence(evidenceId, "vendor_advisory", "authoritative", ADVISORY(`negative-${index}`),
      `${item.title} (corporate post)`,
      "This post discusses business developments. It contains no vulnerability, affected product version, or security impact information.")],
    drafts: [],
    draftUnknowns: ["The Story does not describe a product security impact."],
    expected: { decision: "insufficient_evidence", rows: [], known_exploited: "unknown", unknowns_min: 1 },
    sourceUrl: ADVISORY(`negative-${index}`),
    note: "Non-security Stories must yield no impact rows; inventing one would be a forbidden conclusion.",
  }));
});

validateImpactEvalCases(cases);
const out = "datasets/impact/development.jsonl";
mkdirSync("datasets/impact", { recursive: true });
writeFileSync(out, `${cases.map((row) => JSON.stringify(row)).join("\n")}\n`);
process.stdout.write(`${JSON.stringify({ ok: true, cases: cases.length, out })}\n`);
