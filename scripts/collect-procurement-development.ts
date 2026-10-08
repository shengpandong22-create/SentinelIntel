// Collects cybersecurity procurement lifecycles from TED's unauthenticated official Search API.
// Cases remain disputed pending dual-model review and are never written to the frozen dataset here.
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { parseArgs } from "node:util";
import { REPO_ROOT } from "@aihot/backend/config";
import { FROZEN_ALLOCATION, parseEventRelationJsonl, type BenchmarkCandidate, type BenchmarkReport, type EventRelationCase } from "./event-grouping-eval-core.ts";

interface Notice {
  "publication-number": string; "publication-date": string; "procedure-identifier": string; "form-type": string;
  "notice-title": Record<string, string>; "change-notice-version-identifier"?: string;
  "change-description"?: Record<string, string> | string; "change-reason-code"?: string | string[];
  links?: { html?: Record<string, string>; htmlDirect?: Record<string, string> };
}
const { values } = parseArgs({ options: {
  out: { type: "string", default: ".data/event-relations/procurement-development-construction.jsonl" },
  "max-pages": { type: "string", default: "8" },
  split: { type: "string", default: "development" }, exclude: { type: "string", multiple: true },
} });
if (values.split !== "development" && values.split !== "holdout") throw new Error("--split must be development or holdout");
const split = values.split;
const excludedReports = new Set((values.exclude ?? []).flatMap((file) => parseEventRelationJsonl(readFileSync(path.resolve(REPO_ROOT, file), "utf8")))
  .flatMap((row) => [row.query.reportId, ...row.candidates.map((candidate) => candidate.reportId)]));
const maxPages = Number.parseInt(values["max-pages"]!, 10);
if (!Number.isInteger(maxPages) || maxPages < 1 || maxPages > 40) throw new Error("--max-pages must be 1..40");
const endpoint = "https://api.ted.europa.eu/v3/notices/search";
const fields = ["publication-number", "notice-title", "form-type", "publication-date", "procedure-identifier",
  "change-notice-version-identifier", "change-description", "change-reason-code"];
const queries = [
  "FT ~ cybersecurity", "FT ~ firewall", "FT ~ antivirus", "FT ~ SIEM",
  'FT ~ "intrusion detection"', 'FT ~ "vulnerability management"', 'FT ~ "network security"',
  'FT ~ "penetration testing"', 'FT ~ "security software"', 'FT ~ "video surveillance"',
];
async function page(queryTerm: string, pageNumber: number): Promise<{ notices: Notice[]; totalNoticeCount: number }> {
  const response = await fetch(endpoint, { method: "POST", headers: { "content-type": "application/json", accept: "application/json",
    "user-agent": "SentinelIntel-Phase2-evaluation" }, signal: AbortSignal.timeout(30_000), body: JSON.stringify({
      query: `(${queryTerm}) AND publication-date = (20170101 <> 20261006)`,
      fields, page: pageNumber, limit: 250, scope: "ALL",
    }) });
  if (!response.ok) throw new Error(`TED Search API: HTTP ${response.status}: ${(await response.text()).slice(0, 300)}`);
  return response.json() as Promise<{ notices: Notice[]; totalNoticeCount: number }>;
}
const pages: Array<{ notices: Notice[]; totalNoticeCount: number }> = [];
for (const queryTerm of queries) {
  const first = await page(queryTerm, 1); pages.push(first);
  // Recent results are sufficient for a bounded construction pass. Broad terms can otherwise
  // contain tens of thousands of notices and make this reproducible helper effectively unbounded.
  for (let number = 2; number <= Math.min(maxPages, Math.ceil(first.totalNoticeCount / 250)); number++) pages.push(await page(queryTerm, number));
}
const notices = [...new Map(pages.flatMap((item) => item.notices).map((row) => [row["publication-number"], row])).values()]
  .filter((row) => row["procedure-identifier"] && row["publication-date"] && row["notice-title"]);
const language = (value: unknown): string => {
  if (typeof value === "string") return value;
  if (Array.isArray(value)) return value.map(language).filter(Boolean).join("; ");
  if (value && typeof value === "object") {
    const row = value as Record<string, unknown>;
    return language(row.eng ?? Object.values(row)[0]);
  }
  return "";
};
const url = (row: Notice) => row.links?.htmlDirect?.ENG ?? row.links?.html?.ENG ?? `https://ted.europa.eu/en/notice/-/detail/${row["publication-number"]}`;
const instant = (row: Notice) => Date.parse(`${row["publication-date"].slice(0, 10)}T00:00:00Z`);
const byProcedure = new Map<string, Notice[]>();
for (const row of notices) (byProcedure.get(row["procedure-identifier"]) ?? byProcedure.set(row["procedure-identifier"], []).get(row["procedure-identifier"])!).push(row);

function report(row: Notice): BenchmarkReport {
  const procedure = row["procedure-identifier"];
  return { reportId: `TED:${row["publication-number"]}`, title: language(row["notice-title"]),
    summary: language(row["change-description"]) || `${row["form-type"]} notice for TED procedure ${procedure}`,
    sourceName: "Tenders Electronic Daily", firstParty: true, publishedAt: new Date(instant(row)).toISOString(),
    ingestedAt: new Date(instant(row)).toISOString(), frame: null, splitGroupId: `${split}:procurement:${procedure}`,
    identity: { eventKey: `ted:${row["publication-number"]}`, storyKey: `procurement:${procedure}` } };
}
function candidate(query: Notice, row: Notice): BenchmarkCandidate {
  return { ...report(row), factTitle: language(row["notice-title"]).slice(0, 200), members: 1, isDistractor: false, expectedInRecall: true,
    gold: { relation: "SAME_STORY" }, annotation: { status: "disputed", labelSource: "model-proposed", humanAdjudicated: false,
      labeller: "pending-dual-review", confidence: "low", adjudicator: null, sourceUrls: [url(query), url(row)],
      note: "same TED procedure and sub-14-day lifecycle hypothesis; pending independent review" } };
}
const output: EventRelationCase[] = [], used = new Set<string>();
function add(stratum: string, left: Notice, right: Notice, quota: number) {
  if (output.filter((row) => row.samplingStratum === stratum).length >= quota) return;
  const pair = [left["publication-number"], right["publication-number"]].sort().join("\u0000");
  if (used.has(pair) || excludedReports.has(`TED:${left["publication-number"]}`) || excludedReports.has(`TED:${right["publication-number"]}`)
    || Math.abs(instant(left) - instant(right)) >= 14 * 86_400_000) return;
  const [query, prior] = instant(left) >= instant(right) ? [left, right] : [right, left];
  const serial = output.filter((row) => row.samplingStratum === stratum).length + 1;
  used.add(pair); output.push({ caseId: `EVREL-${split === "development" ? "DEV" : "HOLD"}-${stratum}-${String(serial).padStart(3, "0")}`, split,
    samplingStratum: stratum, query: report(query), candidates: [candidate(query, prior)],
    construction: { assembledAt: new Date().toISOString(), assembledBy: "scripts/collect-procurement-development.ts",
      note: `TED form transition ${prior["form-type"]} -> ${query["form-type"]}` } });
}
for (const group of [...byProcedure.values()].sort((a, b) => a[0]!["procedure-identifier"].localeCompare(b[0]!["procedure-identifier"]))) {
  const competition = group.filter((row) => row["form-type"] === "competition");
  const result = group.filter((row) => row["form-type"] === "result");
  for (const before of competition) for (const after of result) add("procurement-notice-vs-award", before, after, FROZEN_ALLOCATION["procurement-notice-vs-award"][split]);
  const changes = group.filter((row) => split === "holdout"
    ? Boolean(language(row["change-description"]) || language(row["change-reason-code"]))
    : Boolean(row["change-notice-version-identifier"] || row["form-type"] === "change"));
  for (const change of changes) for (const prior of group.filter((row) => row !== change)) add("procurement-correction-or-cancellation", change, prior, FROZEN_ALLOCATION["procurement-correction-or-cancellation"][split]);
}
const outPath = path.resolve(REPO_ROOT, values.out!);
mkdirSync(path.dirname(outPath), { recursive: true });
writeFileSync(outPath, output.map((row) => JSON.stringify(row)).join("\n") + (output.length ? "\n" : ""));
console.log(JSON.stringify({ notices: notices.length, procedures: byProcedure.size, cases: output.length,
  counts: Object.fromEntries([...new Set(output.map((row) => row.samplingStratum))].map((key) => [key, output.filter((row) => row.samplingStratum === key).length])), out: outPath }));
