// Repairs a construction-time case-ID collision without changing evidence or model labels. The
// source row already has three independent high-confidence reviews; only its opaque identifier is
// replaced so both distinct procurement cases can coexist in the frozen split.
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { REPO_ROOT } from "@aihot/backend/config";
import { parseEventRelationJsonl } from "./event-grouping-eval-core.ts";

const source = path.resolve(REPO_ROOT, ".data/event-relations/annotated-holdout-round4.jsonl");
const row = parseEventRelationJsonl(readFileSync(source, "utf8")).find((item) =>
  item.samplingStratum === "procurement-correction-or-cancellation" && item.caseId.endsWith("-002"));
if (!row || row.candidates.some((candidate) => candidate.annotation.status !== "decisive"
  || candidate.annotation.confidence !== "high" || candidate.annotation.reviewers.length < 3)) throw new Error("source row is not three-model decisive/high");
const output = { ...row, caseId: "EVREL-HOLD-procurement-correction-or-cancellation-REKEY-001",
  construction: { ...row.construction, assembledAt: new Date().toISOString(), assembledBy: "scripts/rekey-event-relation-holdout-collision.ts",
    note: `case ID rekey only; evidence and labels unchanged from ${row.caseId}` } };
const out = path.resolve(REPO_ROOT, ".data/event-relations/annotated-holdout-rekeyed-collision.jsonl");
writeFileSync(out, `${JSON.stringify(output)}\n`); console.log(JSON.stringify({ from: row.caseId, to: output.caseId, out }));
