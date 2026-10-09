import { readFileSync } from "node:fs";
import path from "node:path";
import { parseArgs } from "node:util";
import { closeDb } from "@aihot/backend/db";
import { lookupNvdPersistent } from "@aihot/backend/agents/research-source-cache";
import { parseResearchJsonl, ResearchEvalCaseSchema } from "./security-research-eval-core.ts";

const { values } = parseArgs({ options: { cases: { type: "string" } } });
if (!values.cases) throw new Error("--cases is required");
const cases = parseResearchJsonl(readFileSync(path.resolve(values.cases), "utf8"), ResearchEvalCaseSchema);
const cves = [...new Set(cases.flatMap((row) => `${row.input.objective}\n${row.input.snapshot.title}`.match(/CVE-\d{4}-\d{4,}/gi) ?? []).map((cve) => cve.toUpperCase()))];
const failures: Array<{ cve: string; error: string }> = [];
try {
  for (const [index, cve] of cves.entries()) {
    if (index) await new Promise((resolve) => setTimeout(resolve, 6_100));
    try {
      const result = await lookupNvdPersistent(cve);
      if (!result.evidence.length) failures.push({ cve, error: "NVD returned no Evidence" });
    } catch (error) {
      failures.push({ cve, error: error instanceof Error ? `${error.name}: ${error.message}` : String(error) });
    }
  }
  if (failures.length) throw new Error(`NVD cache warm incomplete: ${JSON.stringify(failures)}`);
  process.stdout.write(`${JSON.stringify({ ok: true, cases: cases.length, cves: cves.length })}\n`);
} finally {
  await closeDb();
}
