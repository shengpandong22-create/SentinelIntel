// Strict replacement collector for lifecycle strata. It requires a real later timestamp and explicit
// confirmation/fix cues before a pair is allowed to consume model-review budget.
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { REPO_ROOT } from "@aihot/backend/config";
import type { BenchmarkCandidate, BenchmarkReport, EventRelationCase } from "./event-grouping-eval-core.ts";

interface Evidence { evidenceId: string; source: string; sourceName: string; url: string; title: string; summary: string;
  publishedAt: string | null; cves: string[]; raw?: { category?: string; parentEvidenceIds?: string[] } }
const read = (file: string) => readFileSync(path.resolve(REPO_ROOT, file), "utf8").split(/\r?\n/).filter(Boolean)
  .map((line) => JSON.parse(line) as Evidence);
const base = [...new Map(read(".data/event-relations/evidence-pool.jsonl").map((row) => [row.evidenceId, row])).values()];
const refs = read(".data/event-relations/reference-evidence.jsonl");
const byId = new Map(base.map((row) => [row.evidenceId, row]));
const hash = (value: string) => createHash("sha256").update(value).digest("hex").slice(0, 12);
const output: EventRelationCase[] = [];
function view(row: Evidence, cve: string, eventKey: string, group: string): BenchmarkReport {
  return { reportId: row.evidenceId, title: row.title, summary: row.summary, sourceName: row.sourceName,
    firstParty: row.source === "reference-page", publishedAt: row.publishedAt, ingestedAt: row.publishedAt!, frame: null,
    splitGroupId: group, identity: { eventKey, storyKey: cve } };
}
function add(stratum: "disclosure-vs-patch" | "disclosure-vs-vendor-confirmation", later: Evidence, prior: Evidence) {
  const cve = later.cves[0]!, group = `development:strict-lifecycle:${cve}`, serial = output.filter((row) => row.samplingStratum === stratum).length + 1;
  const query = view(later, cve, `${stratum}:${hash(later.url)}`, group), candidateReport = view(prior, cve, cve, group);
  const candidate: BenchmarkCandidate = { ...candidateReport, factTitle: candidateReport.title.slice(0, 200), members: 1,
    isDistractor: false, expectedInRecall: true, gold: { relation: "SAME_STORY" }, annotation: {
      status: "disputed", labelSource: "model-proposed", humanAdjudicated: false, labeller: "pending-dual-review",
      confidence: "low", adjudicator: null, sourceUrls: [later.url, prior.url],
      note: `${stratum} with explicit later timestamp and lifecycle cue; pending independent review`,
    } };
  output.push({ caseId: `EVREL-DEV-${stratum}-strict-${String(serial).padStart(3, "0")}`, split: "development",
    samplingStratum: stratum, query, candidates: [candidate], construction: { assembledAt: new Date().toISOString(),
      assembledBy: "scripts/collect-lifecycle-replacements.ts", note: `${later.raw?.category}; ${(Date.parse(later.publishedAt!) - Date.parse(prior.publishedAt!)) / 3_600_000} hours after base disclosure` } });
}
const used = new Set<string>();
for (const later of refs) {
  if (later.cves.length !== 1 || !later.publishedAt) continue;
  const prior = (later.raw?.parentEvidenceIds ?? []).map((id) => byId.get(id)).find((row) => row?.publishedAt && row.cves.includes(later.cves[0]!));
  if (!prior) continue;
  const gap = Date.parse(later.publishedAt) - Date.parse(prior.publishedAt!);
  if (gap < 24 * 3_600_000 || gap >= 14 * 86_400_000) continue;
  const key = `${later.evidenceId}\0${prior.evidenceId}`;
  if (used.has(key)) continue;
  const text = `${later.title} ${later.summary}`;
  if (later.raw?.category === "patch-or-release" && /\b(fix(?:ed|es)?|patch|release[sd]?|upgrade|version)\b/i.test(text)
      && output.filter((row) => row.samplingStratum === "disclosure-vs-patch").length < 16) {
    used.add(key); add("disclosure-vs-patch", later, prior);
  } else if (later.raw?.category === "vendor-advisory" && !/oss-security|cert\.|cert\//i.test(later.url)
      && output.filter((row) => row.samplingStratum === "disclosure-vs-vendor-confirmation").length < 24) {
    used.add(key); add("disclosure-vs-vendor-confirmation", later, prior);
  }
}
const outPath = path.resolve(REPO_ROOT, ".data/event-relations/lifecycle-replacements.jsonl");
mkdirSync(path.dirname(outPath), { recursive: true });
writeFileSync(outPath, output.map((row) => JSON.stringify(row)).join("\n") + (output.length ? "\n" : ""));
console.log(JSON.stringify({ cases: output.length, counts: Object.fromEntries([...new Set(output.map((row) => row.samplingStratum))]
  .map((stratum) => [stratum, output.filter((row) => row.samplingStratum === stratum).length])), out: outPath }));
