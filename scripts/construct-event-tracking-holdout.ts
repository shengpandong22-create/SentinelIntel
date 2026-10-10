import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { TrackingEvalCaseSchema, validateTrackingCases, type TrackingEvalCase } from "./event-tracking-eval-core.ts";

const vendor = [
  { cve: "CVE-2024-20359", vendor: "cisco", url: "https://sec.cloudapps.cisco.com/security/center/content/CiscoSecurityAdvisory/cisco-sa-asaftd-persist-rce-FLsNXF4h" },
  { cve: "CVE-2025-20362", vendor: "cisco", url: "https://sec.cloudapps.cisco.com/security/center/content/CiscoSecurityAdvisory/cisco-sa-asaftd-webvpn-YROOTUW" },
  { cve: "CVE-2026-76461", vendor: "cisco", url: "https://sec.cloudapps.cisco.com/security/center/content/CiscoSecurityAdvisory/cisco-sa-esa-inj-2bLVGmhX" },
  { cve: "CVE-2026-76460", vendor: "cisco", url: "https://sec.cloudapps.cisco.com/security/center/content/CiscoSecurityAdvisory/cisco-sa-ISE-ABP-VNSW7Tn5" },
] as const;
const procurement = [
  { procedure: "897615fd-5bea-4d35-b219-46b907d9e58b", publication: "696547-2026" },
  { procedure: "319c91bb-0d68-42c3-97ad-fd529f6e8c88", publication: "696548-2026" },
  { procedure: "e52ae6cc-7493-4e46-8e65-ff72077fcb0e", publication: "696549-2026" },
  { procedure: "78e38dde-9095-43eb-80bb-da31d78eae93", publication: "696551-2026" },
] as const;
const cves = [
  "CVE-2026-93991", "CVE-2026-78254", "CVE-2026-86287", "CVE-2026-104874",
  "CVE-2026-104991", "CVE-2026-102332", "CVE-2026-85083", "CVE-2026-87121",
  "CVE-2026-91018", "CVE-2026-88020", "CVE-2026-73309", "CVE-2026-73310",
] as const;

function uuid(seed: string): string {
  const chars = createHash("sha256").update(seed).digest("hex").slice(0, 32).split("");
  chars[12] = "4";
  chars[16] = (["8", "9", "a", "b"] as const)[Number.parseInt(chars[16]!, 16) % 4]!;
  return `${chars.slice(0, 8).join("")}-${chars.slice(8, 12).join("")}-${chars.slice(12, 16).join("")}-${chars.slice(16, 20).join("")}-${chars.slice(20).join("")}`;
}

const development = readFileSync(path.resolve("datasets/event-tracking/development.jsonl"), "utf8")
  .split(/\r?\n/).filter(Boolean).map((line) => TrackingEvalCaseSchema.parse(JSON.parse(line)));
const counters = new Map<string, number>();
const rows = development.map((source): TrackingEvalCase => {
  const index = counters.get(source.stratum) ?? 0;
  counters.set(source.stratum, index + 1);
  const suffix = String(index + 1).padStart(3, "0");
  const caseId = `TRK-HOLD-${source.stratum.toUpperCase().replace(/[^A-Z]/g, "")}-${suffix}`;
  const row = structuredClone(source) as TrackingEvalCase;
  row.case_id = caseId;
  row.split = "holdout";
  row.input.trace_id = uuid(`${caseId}:trace`);
  row.input.run_id = uuid(`${caseId}:run`);
  row.input.plan.plan_id = uuid(`${caseId}:plan`);
  row.input.story.story_id = 60_000 + development.indexOf(source);
  row.input.plan.story_id = row.input.story.story_id;
  row.provenance.label_method = "UNREVIEWED";
  row.provenance.reviewers = [];
  row.provenance.note = "Disjoint Phase 5 holdout candidate. It is not frozen gold and cannot be evaluated before independent review.";

  let sourceUrl: string;
  if (source.stratum === "vendor-confirmation" || source.stratum === "patch-release") {
    const selected = vendor[index]!;
    sourceUrl = selected.url;
    row.input.story.title = `${selected.cve} Cisco ${source.stratum}`;
    row.input.plan.source_parameters = { cve_id: selected.cve, vendor: selected.vendor, ted_procedure_id: null };
  } else if (source.stratum === "procurement-award") {
    const selected = procurement[index]!;
    sourceUrl = `https://ted.europa.eu/en/notice/-/detail/${selected.publication}`;
    row.input.story.title = `TED procedure ${selected.procedure}`;
    row.input.plan.source_parameters = { cve_id: null, vendor: null, ted_procedure_id: selected.procedure };
  } else {
    const selected = cves[(source.stratum === "no-material-change" ? 0 : source.stratum === "tool-failure" ? 4 : 8) + index]!;
    sourceUrl = `https://nvd.nist.gov/vuln/detail/${selected}`;
    row.input.story.title = `${selected} ${source.stratum}`;
    row.input.plan.source_targets = ["nvd"];
    row.input.plan.source_parameters = { cve_id: selected, vendor: null, ted_procedure_id: null };
    row.fixture_gateway.expected_tools = ["nvd_lookup"];
  }
  row.provenance.source_urls = [sourceUrl];
  row.expected.changes.forEach((change) => { change.admissible_source_urls = [sourceUrl]; });
  row.input.evidence.forEach((evidence) => {
    evidence.evidence_id = uuid(`${caseId}:evidence`);
    evidence.canonical_url = sourceUrl;
    evidence.content_hash = createHash("sha256").update(`${caseId}:${sourceUrl}`).digest("hex");
  });
  const evidenceIds = row.input.evidence.map((item) => item.evidence_id);
  row.input.plan.questions.forEach((question) => {
    question.question_id = `question-${caseId.toLowerCase()}`;
    question.resolved_evidence_ids = [];
  });
  row.expected.resolved_question_ids = row.expected.resolved_question_ids.length ? row.input.plan.questions.map((item) => item.question_id) : [];
  row.expected.open_question_ids = row.expected.open_question_ids.length ? row.input.plan.questions.map((item) => item.question_id) : [];
  if (row.expected.changes.length && evidenceIds.length === 0) throw new Error(`${caseId}: material change lacks frozen evidence`);
  return TrackingEvalCaseSchema.parse(row);
});

const developmentUrls = new Set(development.flatMap((row) => row.provenance.source_urls));
for (const row of rows) for (const url of row.provenance.source_urls) {
  if (developmentUrls.has(url)) throw new Error(`${row.case_id}: source identity overlaps development: ${url}`);
}
validateTrackingCases(rows, { holdout: true, candidate: true });
const output = path.resolve(".data/event-tracking/holdout-candidate.jsonl");
writeFileSync(output, `${rows.map((row) => JSON.stringify(row)).join("\n")}\n`);
process.stdout.write(`${JSON.stringify({ ok: true, cases: rows.length, strata: counters.size, out: output, status: "UNREVIEWED" })}\n`);
