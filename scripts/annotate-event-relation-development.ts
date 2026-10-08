// Paid, explicitly invoked development-only annotation. It never reads or writes holdout data.
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { parseArgs } from "node:util";
import { REPO_ROOT } from "@aihot/backend/config";
import { markReceiptsCompleted } from "@aihot/backend/providers/llm";
import { codeBuddyStructured } from "@aihot/backend/providers/codebuddy";
import { parseEventRelationJsonl } from "./event-grouping-eval-core.ts";
import { mergeDevelopmentReviews, REVIEW_JSON_SCHEMA, REVIEW_SYSTEM, ReviewBatchSchema, reviewPrompt } from "./event-grouping-development-annotation.ts";

const { values } = parseArgs({ options: {
  input: { type: "string" }, out: { type: "string", default: ".data/event-relations/annotated-development.jsonl" },
  n: { type: "string" }, skip: { type: "string", default: "0" },
  batch: { type: "string", default: "12" }, proposedModel: { type: "string", default: "deepseek-v4.1-flash" },
  reviewModel: { type: "string", default: "glm-5.3-flash" }, "allow-paid": { type: "boolean", default: false },
} });
if (!values.input) throw new Error("pass --input with development construction JSONL");
if (!values["allow-paid"]) throw new Error("paid annotation requires the explicit --allow-paid flag");
const batchSize = Number.parseInt(values.batch!, 10);
if (!Number.isInteger(batchSize) || batchSize < 1 || batchSize > 25) throw new Error("--batch must be between 1 and 25");
const parsedRows = parseEventRelationJsonl(readFileSync(path.resolve(REPO_ROOT, values.input), "utf8"));
const skip = Number.parseInt(values.skip!, 10);
if (!Number.isInteger(skip) || skip < 0 || skip >= parsedRows.length) throw new Error("--skip must be between 0 and input case count - 1");
const requested = values.n === undefined ? parsedRows.length - skip : Number.parseInt(values.n, 10);
if (!Number.isInteger(requested) || requested < 1 || skip + requested > parsedRows.length) throw new Error("--n must fit within the remaining input cases after --skip");
const rows = parsedRows.slice(skip, skip + requested);
if (rows.some((row) => row.split !== "development")) throw new Error("annotation input may contain development cases only");

const output = [], receiptIds: number[] = [];
const codeBuddyCooldownMs = 13_000;
for (let offset = 0; offset < rows.length; offset += batchSize) {
  const batch = rows.slice(offset, offset + batchSize);
  const prompt = reviewPrompt(batch);
  const proposed = await codeBuddyStructured({ model: values.proposedModel!, purpose: "event-relation-development-proposal",
    subject: `development:${offset}-${offset + batch.length - 1}`, promptVersion: "event-relation-development-v1",
    system: REVIEW_SYSTEM, prompt, jsonSchema: REVIEW_JSON_SCHEMA, schema: ReviewBatchSchema, timeoutMs: 600_000,
    attemptTag: "phase2-stream-v6" });
  await new Promise((resolve) => setTimeout(resolve, codeBuddyCooldownMs));
  const reviewed = await codeBuddyStructured({ model: values.reviewModel!, purpose: "event-relation-development-review",
    subject: `development:${offset}-${offset + batch.length - 1}`, promptVersion: "event-relation-development-v1",
    system: REVIEW_SYSTEM, prompt, jsonSchema: REVIEW_JSON_SCHEMA, schema: ReviewBatchSchema, timeoutMs: 600_000,
    attemptTag: "phase2-stream-v6" });
  receiptIds.push(proposed.receiptId, reviewed.receiptId);
  output.push(...mergeDevelopmentReviews(batch, proposed.data.decisions, reviewed.data.decisions,
    { proposed: proposed.model, reviewed: reviewed.model }));
  if (offset + batchSize < rows.length) await new Promise((resolve) => setTimeout(resolve, codeBuddyCooldownMs));
}

const outPath = path.resolve(REPO_ROOT, values.out!);
mkdirSync(path.dirname(outPath), { recursive: true });
writeFileSync(outPath, output.map((row) => JSON.stringify(row)).join("\n") + (output.length ? "\n" : ""));
await markReceiptsCompleted(receiptIds);
console.log(JSON.stringify({ cases: output.length, receipts: receiptIds, out: outPath }));
