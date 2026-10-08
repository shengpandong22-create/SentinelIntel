// Reconstructs the last three holdout deficits with unique case IDs and disputed labels. Two rows
// repair historical case-ID collisions; the roundup row uses an independent CVE Program view.
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { REPO_ROOT } from "@aihot/backend/config";
import { parseEventRelationJsonl, type BenchmarkCandidate, type EventRelationCase } from "./event-grouping-eval-core.ts";

const read = (file: string) => parseEventRelationJsonl(readFileSync(path.resolve(REPO_ROOT, file), "utf8"));
const reset = (candidate: BenchmarkCandidate, note: string): BenchmarkCandidate => ({ ...candidate, annotation: { ...candidate.annotation,
  status: "disputed", labelSource: "model-proposed", humanAdjudicated: false, labeller: "pending-three-model-review",
  confidence: "low", adjudicator: null, reviewers: [], note } });
const output: EventRelationCase[] = [];

const roundup = read(".data/event-relations/holdout-repair-round2-construction.jsonl")
  .find((row) => row.caseId === "EVREL-HOLD-roundup-containing-one-event-FIX2-003")!;
const cve = "CVE-2026-75618", response = await fetch(`https://cveawg.mitre.org/api/cve/${cve}`, { signal: AbortSignal.timeout(30_000) });
if (!response.ok) throw new Error(`${cve}: CVE API HTTP ${response.status}`);
const record = await response.json() as { cveMetadata?: { datePublished?: string }; containers?: { cna?: { descriptions?: Array<{ lang: string; value: string }> } } };
const publishedAt = record.cveMetadata?.datePublished, summary = record.containers?.cna?.descriptions?.find((row) => row.lang.startsWith("en"))?.value;
if (!publishedAt || !summary) throw new Error(`${cve}: missing CVE Program evidence`);
const digest = roundup.candidates[0], focused: BenchmarkCandidate = reset({ ...digest, reportId: `CVEORG:${cve}`,
  title: `${cve}: ${summary}`.slice(0, 240), summary, sourceName: "CVE Program", firstParty: true, publishedAt, ingestedAt: publishedAt,
  identity: { eventKey: cve, storyKey: cve }, factTitle: `${cve}: ${summary}`.slice(0, 200),
  annotation: { ...digest.annotation, sourceUrls: [`https://www.cve.org/CVERecord?id=${cve}`, digest.annotation.sourceUrls[1]!] } },
  `TP-Link advisory explicitly lists ${cve} among two different vulnerabilities`);
if (Date.parse(focused.ingestedAt) <= Date.parse(digest.ingestedAt)) throw new Error("expected CVE Program report after digest");
output.push({ ...roundup, caseId: "EVREL-HOLD-roundup-containing-one-event-FIX3-001", query: focused, candidates: [reset({ ...digest,
  annotation: { ...digest.annotation, sourceUrls: focused.annotation.sourceUrls } }, `TP-Link advisory explicitly lists ${cve} among two different vulnerabilities`)],
  construction: { assembledAt: new Date().toISOString(), assembledBy: "scripts/assemble-event-relation-holdout-repair-round3.ts", note: "independent CVE Program view" } });

const procurement = read(".data/event-relations/annotated-holdout-round4.jsonl")
  .find((row) => row.samplingStratum === "procurement-correction-or-cancellation" && row.caseId.endsWith("-002"))!;
output.push({ ...procurement, caseId: "EVREL-HOLD-procurement-correction-or-cancellation-FIX3-001",
  candidates: procurement.candidates.map((item) => reset(item, "re-reviewed after correcting a construction-time case-ID collision")),
  construction: { ...procurement.construction, assembledAt: new Date().toISOString(), assembledBy: "scripts/assemble-event-relation-holdout-repair-round3.ts",
    note: "content unchanged; unique case ID assigned before independent re-review" } });

const policy = read(".data/event-relations/annotated-holdout-replacements.jsonl")
  .find((row) => row.samplingStratum === "policy-amendment-or-implementation-date")!;
output.push({ ...policy, caseId: "EVREL-HOLD-policy-amendment-or-implementation-date-FIX3-001",
  candidates: policy.candidates.map((item) => reset(item, "re-reviewed after correcting a construction-time case-ID collision")),
  construction: { ...policy.construction, assembledAt: new Date().toISOString(), assembledBy: "scripts/assemble-event-relation-holdout-repair-round3.ts",
    note: "content unchanged; unique case ID assigned before independent re-review" } });

const out = path.resolve(REPO_ROOT, ".data/event-relations/holdout-repair-round3-construction.jsonl");
writeFileSync(out, output.map((row) => JSON.stringify(row)).join("\n") + "\n"); console.log(JSON.stringify({ cases: output.length, out }));
