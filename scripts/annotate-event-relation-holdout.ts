// Paid, explicitly invoked holdout annotation. Three distinct model identifiers review every pair
// independently; only unanimous high-confidence decisions are eligible for the frozen holdout.
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { parseArgs } from "node:util";
import { REPO_ROOT } from "@aihot/backend/config";
import { codeBuddyStructured } from "@aihot/backend/providers/codebuddy";
import { markReceiptsCompleted } from "@aihot/backend/providers/llm";
import { parseEventRelationJsonl } from "./event-grouping-eval-core.ts";
import { mergeHoldoutReviews, REVIEW_JSON_SCHEMA, REVIEW_SYSTEM, ReviewBatchSchema, reviewPrompt } from "./event-grouping-development-annotation.ts";

const { values } = parseArgs({ options: {
  input: { type: "string" }, out: { type: "string", default: ".data/event-relations/annotated-holdout.jsonl" },
  reviewOut: { type: "string", default: ".data/event-relations/holdout-review-pool.jsonl" },
  batch: { type: "string", default: "12" }, "allow-paid": { type: "boolean", default: false },
  n: { type: "string" }, skip: { type: "string", default: "0" },
  model: { type: "string", multiple: true, default: ["deepseek-v4.1-flash", "glm-5.3-flash", "kimi-k3-2"] },
} });
if (!values.input) throw new Error("pass --input with holdout construction JSONL");
if (!values["allow-paid"]) throw new Error("paid holdout annotation requires the explicit --allow-paid flag");
const models = values.model!;
if (models.length < 3 || new Set(models).size !== models.length) throw new Error("pass at least three distinct --model values");
const batchSize = Number.parseInt(values.batch!, 10);
if (!Number.isInteger(batchSize) || batchSize < 1 || batchSize > 25) throw new Error("--batch must be between 1 and 25");
const parsedRows = parseEventRelationJsonl(readFileSync(path.resolve(REPO_ROOT, values.input), "utf8"));
const skip = Number.parseInt(values.skip!, 10);
if (!Number.isInteger(skip) || skip < 0 || skip >= parsedRows.length) throw new Error("--skip must be between 0 and input case count - 1");
const requested = values.n === undefined ? parsedRows.length - skip : Number.parseInt(values.n, 10);
if (!Number.isInteger(requested) || requested < 1 || skip + requested > parsedRows.length) throw new Error("--n must fit within the remaining cases after --skip");
const rows = parsedRows.slice(skip, skip + requested);
if (rows.some((row) => row.split !== "holdout")) throw new Error("holdout annotation input may contain holdout cases only");

const decisive = [], review = [], receiptIds: number[] = [];
const codeBuddyCooldownMs = 13_000;
for (let offset = 0; offset < rows.length; offset += batchSize) {
  const batch = rows.slice(offset, offset + batchSize);
  const prompt = reviewPrompt(batch);
  const passes = [];
  for (const model of models) {
    const result = await codeBuddyStructured({ model, purpose: "event-relation-holdout-review",
      subject: `holdout:${offset}-${offset + batch.length - 1}:${model}`, promptVersion: "event-relation-holdout-v1",
      system: REVIEW_SYSTEM, prompt, jsonSchema: REVIEW_JSON_SCHEMA, schema: ReviewBatchSchema, timeoutMs: 600_000 });
    receiptIds.push(result.receiptId);
    passes.push({ model: result.model, decisions: result.data.decisions });
    await new Promise((resolve) => setTimeout(resolve, codeBuddyCooldownMs));
  }
  for (const row of mergeHoldoutReviews(batch, passes)) {
    (row.candidates.every((candidate) => candidate.annotation.status === "decisive") ? decisive : review).push(row);
  }
  for (const [target, content] of [[values.out!, decisive], [values.reviewOut!, review]] as const) {
    const outputPath = path.resolve(REPO_ROOT, target);
    mkdirSync(path.dirname(outputPath), { recursive: true });
    writeFileSync(outputPath, content.map((row) => JSON.stringify(row)).join("\n") + (content.length ? "\n" : ""));
  }
}

for (const [target, content] of [[values.out!, decisive], [values.reviewOut!, review]] as const) {
  const outputPath = path.resolve(REPO_ROOT, target);
  mkdirSync(path.dirname(outputPath), { recursive: true });
  writeFileSync(outputPath, content.map((row) => JSON.stringify(row)).join("\n") + (content.length ? "\n" : ""));
}
await markReceiptsCompleted(receiptIds);
console.log(JSON.stringify({ decisive: decisive.length, review: review.length, models, receipts: receiptIds,
  out: path.resolve(REPO_ROOT, values.out!), reviewOut: path.resolve(REPO_ROOT, values.reviewOut!) }));
