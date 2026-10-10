import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { TrackingEvalCaseSchema, validateTrackingCases, type TrackingEvalCase } from "./event-tracking-eval-core.ts";

// The first holdout candidate froze its stale-or-nonmaterial evidence with a NVD URL while keeping the
// development template's "cisa_advisory" source_type; reviewers correctly withheld high confidence for
// that source-identity mismatch. The rejected rows keep their reviewed labels. This supplement builds
// fresh stale-or-nonmaterial cases directly from the development template, keeping the CISA advisory
// identity consistent, with source URLs disjoint from both development and the original candidate.
const advisories = [
  "icsa-26-265-11", "icsa-26-265-12", "icsa-26-265-13",
  "icsa-26-273-01", "icsa-26-273-02", "icsa-26-273-03",
] as const;

function uuid(seed: string): string {
  const chars = createHash("sha256").update(seed).digest("hex").slice(0, 32).split("");
  chars[12] = "4";
  chars[16] = (["8", "9", "a", "b"] as const)[Number.parseInt(chars[16]!, 16) % 4]!;
  return `${chars.slice(0, 8).join("")}-${chars.slice(8, 12).join("")}-${chars.slice(12, 16).join("")}-${chars.slice(16, 20).join("")}-${chars.slice(20).join("")}`;
}

const development = readFileSync("datasets/event-tracking/development.jsonl", "utf8")
  .split(/\r?\n/).filter(Boolean).map((line) => TrackingEvalCaseSchema.parse(JSON.parse(line)));
const existingCandidate = readFileSync(".data/event-tracking/holdout-candidate.jsonl", "utf8")
  .split(/\r?\n/).filter(Boolean).map((line) => TrackingEvalCaseSchema.parse(JSON.parse(line)));

const usedUrls = new Set([
  ...development.flatMap((row) => row.provenance.source_urls),
  ...existingCandidate.flatMap((row) => row.provenance.source_urls),
]);
const sourceUrl = (id: string) => `https://www.cisa.gov/news-events/ics-advisories/${id}`;
for (const id of advisories) if (usedUrls.has(sourceUrl(id))) throw new Error(`supplement source overlaps an existing source: ${id}`);

const templates = development.filter((row) => row.stratum === "stale-or-nonmaterial");
if (templates.length === 0) throw new Error("no stale-or-nonmaterial development template found");

const rows = advisories.map((advisory, index): TrackingEvalCase => {
  const template = templates[index % templates.length]!;
  const caseId = `TRK-HOLD-STALEORNONMATERIAL-${String(templates.length + index + 1).padStart(3, "0")}`;
  const url = sourceUrl(advisory);
  const row = structuredClone(template) as TrackingEvalCase;
  row.case_id = caseId;
  row.split = "holdout";
  row.input.trace_id = uuid(`${caseId}:trace`);
  row.input.run_id = uuid(`${caseId}:run`);
  row.input.plan.plan_id = uuid(`${caseId}:plan`);
  row.input.story.story_id = 61_000 + index;
  row.input.story.title = `CISA ${advisory} stale-or-nonmaterial`;
  row.input.plan.story_id = row.input.story.story_id;
  row.input.plan.questions.forEach((question) => {
    question.question_id = `question-${caseId.toLowerCase()}`;
    question.resolved_evidence_ids = [];
  });
  row.input.evidence.forEach((evidence) => {
    evidence.evidence_id = uuid(`${caseId}:evidence`);
    evidence.canonical_url = url;
    evidence.content_hash = createHash("sha256").update(`${caseId}:${url}`).digest("hex");
  });
  row.expected.resolved_question_ids = row.expected.resolved_question_ids.length ? row.input.plan.questions.map((item) => item.question_id) : [];
  row.expected.open_question_ids = row.expected.open_question_ids.length ? row.input.plan.questions.map((item) => item.question_id) : [];
  row.expected.changes.forEach((change) => { change.admissible_source_urls = [url]; });
  row.provenance = {
    source_urls: [url],
    collected_at: row.provenance.collected_at,
    label_method: "UNREVIEWED",
    reviewers: [],
    note: "Disjoint stale-or-nonmaterial holdout supplement. It is not frozen gold and cannot be evaluated before independent review.",
  };
  return TrackingEvalCaseSchema.parse(row);
});

const candidateIds = new Set(existingCandidate.map((row) => row.case_id));
for (const row of rows) if (candidateIds.has(row.case_id)) throw new Error(`${row.case_id}: supplement case id collides with the original candidate`);
validateTrackingCases(rows, { holdout: true, candidate: true, fragment: true });
const output = ".data/event-tracking/holdout-candidate-supplement.jsonl";
writeFileSync(output, `${rows.map((row) => JSON.stringify(row)).join("\n")}\n`);
process.stdout.write(`${JSON.stringify({ ok: true, cases: rows.length, stratum: "stale-or-nonmaterial", out: output, status: "UNREVIEWED" })}\n`);
