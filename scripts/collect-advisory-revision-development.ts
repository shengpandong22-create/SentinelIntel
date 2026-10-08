// Builds advisory-revision cases from real Git history in GitHub's public Advisory Database.
// Two distinct repository commits provide the before/after text and timestamps.
import { execFile as execFileCallback } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { parseArgs } from "node:util";
import { promisify } from "node:util";
import { REPO_ROOT } from "@aihot/backend/config";
import { FROZEN_ALLOCATION, parseEventRelationJsonl, type BenchmarkCandidate, type BenchmarkReport, type EventRelationCase } from "./event-grouping-eval-core.ts";

interface Evidence { evidenceId: string; publishedAt: string; updatedAt: string | null; raw?: { ghsaId?: string } }
interface Commit { sha: string; html_url: string; commit?: { author?: { date?: string }; message?: string } }
interface Advisory { summary?: string; details?: string; modified?: string; published?: string; aliases?: string[];
  affected?: unknown; severity?: unknown; database_specific?: unknown }
interface ApiAdvisory { ghsa_id?: string; published_at?: string; updated_at?: string }
const { values } = parseArgs({ options: {
  input: { type: "string", default: ".data/event-relations/evidence-pool.jsonl" },
  out: { type: "string", default: ".data/event-relations/advisory-revision-development-construction.jsonl" },
  split: { type: "string", default: "development" }, exclude: { type: "string" },
} });
if (values.split !== "development" && values.split !== "holdout") throw new Error("--split must be development or holdout");
const split = values.split;
const excludedReports = new Set(values.exclude ? parseEventRelationJsonl(readFileSync(path.resolve(REPO_ROOT, values.exclude), "utf8"))
  .flatMap((row) => [row.query.reportId, ...row.candidates.map((candidate) => candidate.reportId)]) : []);
const execFile = promisify(execFileCallback);
const localAdvisoryRepo = path.resolve(REPO_ROOT, ".data/advisory-database");
async function curl(url: string): Promise<string> {
  const { stdout } = await execFile("curl", ["--fail", "--silent", "--show-error", "--location", "--max-time", "30",
    "--retry", "5", "--retry-delay", "1", "--retry-all-errors",
    "--user-agent", "SentinelIntel-Phase2-evaluation", url], { encoding: "utf8", maxBuffer: 20 * 1024 * 1024 });
  return stdout;
}
async function json<T>(url: string): Promise<T> {
  let lastError: unknown;
  for (let attempt = 1; attempt <= 3; attempt++) try {
    const response = await fetch(url, { headers: { accept: "application/vnd.github+json", "user-agent": "SentinelIntel-Phase2-evaluation" }, signal: AbortSignal.timeout(30_000) });
    if (!response.ok) throw new Error(`${url}: HTTP ${response.status}`); return response.json() as Promise<T>;
  } catch (error) { lastError = error; if (attempt < 3) await new Promise((resolve) => setTimeout(resolve, attempt * 1_000)); }
  try { return JSON.parse(await curl(url)) as T; } catch (error) { throw new AggregateError([lastError, error], `unable to fetch ${url}`); }
}
async function text(url: string): Promise<string> {
  try {
    const response = await fetch(url, { headers: { "user-agent": "SentinelIntel-Phase2-evaluation" }, signal: AbortSignal.timeout(30_000) });
    if (!response.ok) throw new Error(`${url}: HTTP ${response.status}`); return response.text();
  } catch { return curl(url); }
}
async function advisoryAt(sha: string, file: string): Promise<Advisory> {
  try { return await json<Advisory>(`https://raw.githubusercontent.com/github/advisory-database/${sha}/${file}`); }
  catch {
    const { stdout } = await execFile("git", ["-C", localAdvisoryRepo, "show", `${sha}:${file}`],
      { encoding: "utf8", maxBuffer: 20 * 1024 * 1024 });
    return JSON.parse(stdout) as Advisory;
  }
}
const localRows = readFileSync(path.resolve(REPO_ROOT, values.input!), "utf8").split(/\r?\n/).filter(Boolean).map((line) => JSON.parse(line) as Evidence);
const olderPages: ApiAdvisory[][] = [];
for (const published of ["2023-01-01..2023-12-31", "2024-01-01..2024-12-31", "2025-01-01..2025-12-31"]) {
  try { olderPages.push(await json<ApiAdvisory[]>(`https://api.github.com/advisories?type=reviewed&per_page=100&published=${published}`)); }
  catch { break; }
  await new Promise((resolve) => setTimeout(resolve, 1_000));
}
const append = (ghsa: string, newer: Commit, older: Commit, newerDate: string, olderDate: string, newAdvisory: Advisory, oldAdvisory: Advisory) => {
  const comparable = (value: Advisory) => JSON.stringify({ summary: value.summary, details: value.details, aliases: value.aliases,
    affected: value.affected, severity: value.severity, database_specific: value.database_specific });
  if (comparable(newAdvisory) === comparable(oldAdvisory)) return;
  const query = report(ghsa, newer.sha, newerDate, newAdvisory), prior = report(ghsa, older.sha, olderDate, oldAdvisory);
  if (excludedReports.has(query.reportId) || excludedReports.has(prior.reportId)) return;
  const serial = output.length + 1;
  output.push({ caseId: `EVREL-${split === "development" ? "DEV" : "HOLD"}-advisory-revision-vs-republication-${String(serial).padStart(3, "0")}`, split,
    samplingStratum: "advisory-revision-vs-republication", query, candidates: [{ ...prior, factTitle: prior.title.slice(0, 200), members: 1,
      isDistractor: false, expectedInRecall: true, gold: { relation: "SAME_STORY" }, annotation: { status: "disputed",
        labelSource: "model-proposed", humanAdjudicated: false, labeller: "pending-dual-review", confidence: "low", adjudicator: null,
        sourceUrls: [newer.html_url, older.html_url], note: "two content-distinct commits of one GitHub advisory; pending independent review" } }],
    construction: { assembledAt: new Date().toISOString(), assembledBy: "scripts/collect-advisory-revision-development.ts",
      note: `${ghsa} revision ${older.sha.slice(0, 12)} -> ${newer.sha.slice(0, 12)}` } });
};
const olderRows: Evidence[] = olderPages.flat().flatMap((row) => row.ghsa_id && row.published_at && row.updated_at ? [{
  evidenceId: `GHSA:${row.ghsa_id}`, publishedAt: row.published_at, updatedAt: row.updated_at, raw: { ghsaId: row.ghsa_id },
}] : []);
const rows = [...new Map([...localRows, ...olderRows].map((row) => [row.evidenceId, row])).values()]
  .filter((row) => row.evidenceId.startsWith("GHSA:") && row.raw?.ghsaId && row.updatedAt && Date.parse(row.updatedAt) > Date.parse(row.publishedAt))
  .filter((row) => Date.parse(row.updatedAt!) - Date.parse(row.publishedAt) > 60_000)
  .filter((row) => Date.parse(row.updatedAt!) - Date.parse(row.publishedAt) < 14 * 86_400_000)
  .sort((a, b) => (Date.parse(b.updatedAt!) - Date.parse(b.publishedAt)) - (Date.parse(a.updatedAt!) - Date.parse(a.publishedAt)));
const report = (ghsa: string, sha: string, date: string, advisory: Advisory): BenchmarkReport => ({
  reportId: `GHSA-REV:${ghsa}:${sha}`, title: advisory.summary ?? ghsa,
  summary: `${advisory.details ?? ""}\nAffected: ${JSON.stringify(advisory.affected ?? [])}\nSeverity: ${JSON.stringify(advisory.severity ?? [])}`.slice(0, 4000),
  sourceName: "GitHub Advisory Database", firstParty: true, publishedAt: date, ingestedAt: date, frame: null,
  splitGroupId: `${split}:advisory-revision:${ghsa}`, identity: { eventKey: `advisory-revision:${ghsa}:${sha}`, storyKey: `advisory:${ghsa}` },
});
const output: EventRelationCase[] = [];
for (const row of rows.slice(0, 40)) {
  if (output.length === FROZEN_ALLOCATION["advisory-revision-vs-republication"][split]) break;
  const ghsa = row.raw!.ghsaId!, published = new Date(row.publishedAt), year = published.getUTCFullYear();
  const month = String(published.getUTCMonth() + 1).padStart(2, "0");
  const file = `advisories/github-reviewed/${year}/${month}/${ghsa}/${ghsa}.json`;
  let commits: Commit[];
  try { commits = await json<Commit[]>(`https://api.github.com/repos/github/advisory-database/commits?path=${encodeURIComponent(file)}&per_page=10`); }
  catch { continue; }
  if (commits.length < 2) continue;
  for (let index = 0; index + 1 < commits.length && output.length < FROZEN_ALLOCATION["advisory-revision-vs-republication"][split]; index++) try {
    const newer = commits[index]!, older = commits[index + 1]!, newerDate = newer.commit?.author?.date, olderDate = older.commit?.author?.date;
    if (!newerDate || !olderDate || Date.parse(newerDate) - Date.parse(olderDate) >= 14 * 86_400_000) continue;
    const [newAdvisory, oldAdvisory] = await Promise.all([advisoryAt(newer.sha, file), advisoryAt(older.sha, file)]);
    append(ghsa, newer, older, newerDate, olderDate, newAdvisory, oldAdvisory);
  } catch { continue; }
}
for (const seed of [
  { ghsa: "GHSA-69fq-xp46-6x23", year: 2026, month: "03", hashes: [
    "63ba709eaf40b5184b805bfd5a378616651294e2", "834615d8da62a48b3b312c3a5e3368bb8addba5c", "7bc78b5b48acf0537fa055662507039d017214a5",
  ] },
  { ghsa: "GHSA-r584-6283-p7xc", year: 2026, month: "03", hashes: [
    "41e3b419053cacb7d60710df933f0406134ef68c", "fc4e0e8f4e8024bf8996237818cf08b21a5919a0",
  ] },
]) {
  if (output.length === FROZEN_ALLOCATION["advisory-revision-vs-republication"][split]) break;
  const file = `advisories/github-reviewed/${seed.year}/${seed.month}/${seed.ghsa}/${seed.ghsa}.json`;
  try {
    const hashes = seed.hashes;
    for (let index = 0; index + 1 < hashes.length && output.length < FROZEN_ALLOCATION["advisory-revision-vs-republication"][split]; index++) {
      const [newSha, oldSha] = [hashes[index]!, hashes[index + 1]!];
      const [newAdvisory, oldAdvisory] = await Promise.all([advisoryAt(newSha, file), advisoryAt(oldSha, file)]);
      const newDate = newAdvisory.modified, oldDate = oldAdvisory.modified;
      if (!newDate || !oldDate || Date.parse(newDate) - Date.parse(oldDate) >= 14 * 86_400_000) continue;
      append(seed.ghsa, { sha: newSha, html_url: `https://github.com/github/advisory-database/commit/${newSha}` },
        { sha: oldSha, html_url: `https://github.com/github/advisory-database/commit/${oldSha}` }, newDate, oldDate, newAdvisory, oldAdvisory);
    }
  } catch { continue; }
}
const outPath = path.resolve(REPO_ROOT, values.out!); mkdirSync(path.dirname(outPath), { recursive: true });
writeFileSync(outPath, output.map((row) => JSON.stringify(row)).join("\n") + (output.length ? "\n" : ""));
console.log(JSON.stringify({ candidates: rows.length, cases: output.length, out: outPath }));
