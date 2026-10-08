// Builds only the Phase 2 development artifact. It never creates holdout rows and never resolves a
// disputed label: any case containing a non-decisive candidate is routed to the review pool.
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { parseArgs } from "node:util";
import { REPO_ROOT } from "@aihot/backend/config";
import { parseEventRelationJsonl, partitionDevelopmentCases, validateEventRelationDataset } from "./event-grouping-eval-core.ts";

const { values } = parseArgs({ options: {
  input: { type: "string", multiple: true }, out: { type: "string", default: "datasets/event-relations/dev.jsonl" },
  review: { type: "string", default: ".data/event-relations/review-pool.jsonl" }, freeze: { type: "boolean", default: false },
} });
if (!values.input?.length) throw new Error("pass one or more --input JSONL construction files");

const rows = values.input.flatMap((file) => parseEventRelationJsonl(readFileSync(path.resolve(REPO_ROOT, file), "utf8")));
const { decisive, review } = partitionDevelopmentCases(rows);
validateEventRelationDataset(decisive, { development: values.freeze });

const render = (items: unknown[]) => items.map((item) => JSON.stringify(item)).join("\n") + (items.length ? "\n" : "");
const reviewPath = path.resolve(REPO_ROOT, values.review!);
mkdirSync(path.dirname(reviewPath), { recursive: true });
writeFileSync(reviewPath, render(review));
if (values.freeze) {
  const outPath = path.resolve(REPO_ROOT, values.out!);
  mkdirSync(path.dirname(outPath), { recursive: true });
  writeFileSync(outPath, render(decisive));
  console.log(`development frozen: ${outPath}`);
} else {
  console.log("development not written: rerun with --freeze after the exact 180-case allocation validates");
}
console.log(JSON.stringify({ input: rows.length, decisive: decisive.length, review: review.length }));
