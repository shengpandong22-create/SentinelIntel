import { createHash } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { TrackingEvalCaseSchema, validateTrackingCases, type TrackingEvalCase } from "./event-tracking-eval-core.ts";

const collectedAt = "2026-10-10T00:00:00Z";
const officialSources = {
  vendor: [
    { vendor: "microsoft", cve: "CVE-2026-81963", url: "https://msrc.microsoft.com/update-guide/vulnerability/CVE-2026-81963" },
    { vendor: "microsoft", cve: "CVE-2026-85880", url: "https://msrc.microsoft.com/update-guide/vulnerability/CVE-2026-85880" },
    { vendor: "cisco", cve: "CVE-2024-20353", url: "https://sec.cloudapps.cisco.com/security/center/content/CiscoSecurityAdvisory/cisco-sa-asaftd-websrvs-dos-X8gNucD2" },
    { vendor: "cisco", cve: "CVE-2025-20333", url: "https://sec.cloudapps.cisco.com/security/center/content/CiscoSecurityAdvisory/cisco-sa-asaftd-webvpn-z5xP8EUB" },
  ],
  procurement: [
    { procedure: "8c068af4-57cc-4dff-ac84-8f6f7c79de89", publication: "696533-2026" },
    { procedure: "2e63d4e2-beaa-42f5-a6f3-f8de1f102e98", publication: "696534-2026" },
    { procedure: "1ff10451-6429-4570-aaa8-a22113d007b7", publication: "696545-2026" },
    { procedure: "030b0998-ad15-419d-a199-537a120fbfdd", publication: "696546-2026" },
  ],
  nvd: ["CVE-2026-72898", "CVE-2026-20349", "CVE-2026-68820", "CVE-2026-73570"],
  nonmaterial: [
    "https://www.cisa.gov/news-events/ics-advisories/icsa-26-251-01",
    "https://www.cisa.gov/news-events/ics-advisories/icsa-26-265-01",
    "https://www.cisa.gov/news-events/ics-advisories/icsa-26-265-02",
    "https://www.cisa.gov/news-events/ics-advisories/icsa-26-265-09",
  ],
} as const;

function uuid(seed: string): string {
  const hex = createHash("sha256").update(seed).digest("hex").slice(0, 32).split("");
  hex[12] = "4";
  hex[16] = (["8", "9", "a", "b"] as const)[Number.parseInt(hex[16]!, 16) % 4]!;
  return `${hex.slice(0, 8).join("")}-${hex.slice(8, 12).join("")}-${hex.slice(12, 16).join("")}-${hex.slice(16, 20).join("")}-${hex.slice(20).join("")}`;
}

type Observation = "vendor_confirmation" | "patch" | "procurement_award" | "material_update";
type SourceTarget = "nvd" | "cisa_kev" | "vendor_advisory" | "official_procurement";

function makeCase(args: {
  id: string;
  stratum: TrackingEvalCase["stratum"];
  title: string;
  sourceUrl: string;
  sourceType: string;
  sourceTarget: SourceTarget;
  observation?: Observation;
  expectedDecision: "continue" | "stop" | "insufficient_evidence";
  gatewayMode?: "empty" | "error";
  expectedTool?: TrackingEvalCase["fixture_gateway"]["expected_tools"][number];
  cve?: string;
  vendor?: "cisco" | "microsoft";
  tedProcedureId?: string;
  authority?: "authoritative" | "primary" | "secondary";
}): TrackingEvalCase {
  const evidenceId = uuid(`${args.id}:evidence`);
  const hasMaterialChange = Boolean(args.observation);
  const questionId = `question-${args.id.toLowerCase()}`;
  const expectedInterval = args.expectedDecision === "stop" ? null : args.expectedDecision === "insufficient_evidence" ? 12 : 24;
  return TrackingEvalCaseSchema.parse({
    case_id: args.id,
    split: "development",
    stratum: args.stratum,
    fixture_gateway: { mode: args.gatewayMode ?? "empty", expected_tools: args.expectedTool ? [args.expectedTool] : [] },
    input: {
      trace_id: uuid(`${args.id}:trace`),
      run_id: uuid(`${args.id}:run`),
      tool_capability: "fixture-capability-placeholder-0000000000000000",
      story: {
        schema_version: 1, story_id: 50_000 + Number(args.id.slice(-3)), story_version: 1,
        title: args.title, digest: null, status: "active", facts: [], missing_questions: [], captured_at: collectedAt,
      },
      plan: {
        schema_version: 1, plan_id: uuid(`${args.id}:plan`), story_id: 50_000 + Number(args.id.slice(-3)), version: 1,
        status: "active", why_track: "Track the declared material event transition.",
        questions: [{ question_id: questionId, question: "Has the declared material transition occurred?", resolve_on: [args.observation ?? "material_update"], status: "open", resolved_evidence_ids: [] }],
        source_targets: [args.sourceTarget],
        source_parameters: { cve_id: args.cve ?? null, vendor: args.vendor ?? null, ted_procedure_id: args.tedProcedureId ?? null },
        interval_policy: { min_hours: 6, max_hours: 168, no_change_multiplier: 2, max_no_change_checks: 4 },
        stop_condition: { all_questions_resolved: true, stop_after_no_change_checks: null, deadline_at: null },
        current_interval_hours: 12, consecutive_no_change_checks: 0, next_check_at: collectedAt, last_checked_at: "2026-10-09T00:00:00Z",
      },
      evidence: hasMaterialChange || args.stratum === "stale-or-nonmaterial" ? [{
        evidence_id: evidenceId,
        source_type: args.sourceType,
        authority_level: args.authority ?? "authoritative",
        canonical_url: args.sourceUrl,
        content_hash: createHash("sha256").update(`${args.id}:${args.sourceUrl}`).digest("hex"),
        retrieved_at: collectedAt,
        observations: args.observation ? [args.observation] : [],
      }] : [],
      limits: { max_rounds: 3, max_tool_calls: 8, max_generic_searches: 0, max_evidence_documents: 12, deadline_ms: 60_000, max_response_bytes: 2_097_152 },
    },
    expected: {
      changes: args.observation ? [{ change_type: args.observation, admissible_source_urls: [args.sourceUrl] }] : [],
      resolved_question_ids: args.observation ? [questionId] : [],
      open_question_ids: args.observation ? [] : [questionId],
      decision: args.expectedDecision,
      suggested_interval_hours: expectedInterval,
      forbidden_conclusions: ["absence proves the transition did not occur"],
    },
    provenance: {
      source_urls: [args.sourceUrl], collected_at: collectedAt, label_method: "SOURCE_VERIFIED", reviewers: [],
      note: "Official-source identity was verified during Phase 4 or the Phase 5 TED compatibility check; the case freezes a transition input and does not reuse a prior model label.",
    },
  });
}

const rows: TrackingEvalCase[] = [];
officialSources.vendor.forEach((source, index) => rows.push(makeCase({
  id: `TRK-DEV-CONFIRM-${String(index + 1).padStart(3, "0")}`, stratum: "vendor-confirmation",
  title: `${source.cve} ${source.vendor} vendor confirmation`, sourceUrl: source.url, sourceType: "vendor_advisory",
  sourceTarget: "vendor_advisory", observation: "vendor_confirmation", expectedDecision: "stop",
  expectedTool: "vendor_advisory_search", cve: source.cve, vendor: source.vendor,
})));
officialSources.vendor.forEach((source, index) => rows.push(makeCase({
  id: `TRK-DEV-PATCH-${String(index + 1).padStart(3, "0")}`, stratum: "patch-release",
  title: `${source.cve} ${source.vendor} remediation`, sourceUrl: source.url, sourceType: "vendor_advisory",
  sourceTarget: "vendor_advisory", observation: "patch", expectedDecision: "stop",
  expectedTool: "vendor_advisory_search", cve: source.cve, vendor: source.vendor,
})));
officialSources.procurement.forEach((source, index) => rows.push(makeCase({
  id: `TRK-DEV-AWARD-${String(index + 1).padStart(3, "0")}`, stratum: "procurement-award",
  title: `TED procedure ${source.procedure}`, sourceUrl: `https://ted.europa.eu/en/notice/-/detail/${source.publication}`,
  sourceType: "official_procurement", sourceTarget: "official_procurement", observation: "procurement_award",
  expectedDecision: "stop", expectedTool: "ted_procurement_lookup", tedProcedureId: source.procedure,
})));
officialSources.nvd.forEach((cve, index) => rows.push(makeCase({
  id: `TRK-DEV-NOCHANGE-${String(index + 1).padStart(3, "0")}`, stratum: "no-material-change",
  title: `${cve} unchanged official record`, sourceUrl: `https://nvd.nist.gov/vuln/detail/${cve}`, sourceType: "nvd",
  sourceTarget: "nvd", expectedDecision: "continue", expectedTool: "nvd_lookup", cve,
})));
officialSources.nvd.forEach((cve, index) => rows.push(makeCase({
  id: `TRK-DEV-ERROR-${String(index + 1).padStart(3, "0")}`, stratum: "tool-failure",
  title: `${cve} unavailable official lookup`, sourceUrl: `https://nvd.nist.gov/vuln/detail/${cve}`, sourceType: "nvd",
  sourceTarget: "nvd", expectedDecision: "insufficient_evidence", gatewayMode: "error", expectedTool: "nvd_lookup", cve,
})));
officialSources.nonmaterial.forEach((sourceUrl, index) => rows.push(makeCase({
  id: `TRK-DEV-NONMATERIAL-${String(index + 1).padStart(3, "0")}`, stratum: "stale-or-nonmaterial",
  title: "Official advisory with no declared target observation", sourceUrl, sourceType: "cisa_advisory",
  sourceTarget: "cisa_kev", expectedDecision: "continue", authority: "authoritative",
})));

validateTrackingCases(rows);
const out = path.resolve("datasets/event-tracking/development.jsonl");
mkdirSync(path.dirname(out), { recursive: true });
writeFileSync(out, `${rows.map((row) => JSON.stringify(row)).join("\n")}\n`);
process.stdout.write(`${JSON.stringify({ ok: true, cases: rows.length, strata: new Set(rows.map((row) => row.stratum)).size, out })}\n`);
