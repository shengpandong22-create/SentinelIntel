// Bounded operator tool for finishing already-collected article analyses without spreading a small
// budget window across many partial chains. The normal Worker must be stopped first; every model call
// still goes through receipts and the database budget.
import { config } from "../packages/backend/src/config.ts";
import { closeDb, sql } from "../packages/backend/src/db.ts";
import { processArticle } from "../packages/backend/src/jobs/content.ts";
import { BudgetExceededError } from "../packages/backend/src/providers/receipts.ts";
import { ModelOutputError } from "../packages/backend/src/providers/llm.ts";

const args = new Set(process.argv.slice(2));
const valueOf = (name: string, fallback: number) => {
  const prefix = `${name}=`;
  const raw = [...args].find((arg) => arg.startsWith(prefix))?.slice(prefix.length);
  const value = raw === undefined ? fallback : Number.parseInt(raw, 10);
  if (!Number.isSafeInteger(value) || value < 1) throw new Error(`${name} must be a positive integer`);
  return value;
};
const enabled = (name: string) => ["1", "true", "yes", "on"].includes((process.env[name] ?? "").trim().toLowerCase());
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

function assertSafety(): void {
  if (!args.has("--allow-model")) throw new Error("Pass --allow-model to acknowledge bounded paid/model execution");
  if (!args.has("--worker-stopped")) throw new Error("Stop the normal Worker, then pass --worker-stopped");
  if (!config.modelCallsEnabled) throw new Error("MODEL_CALLS_ENABLED must be true for the recovery process only");
  if (enabled("COLLECT_ENABLED")) throw new Error("COLLECT_ENABLED must remain false");
  if (config.agentResearchEnabled || config.agentTrackingEnabled || config.productImpactEnabled) {
    throw new Error("All Agent feature gates must remain false during backlog recovery");
  }
}

async function main(): Promise<void> {
  assertSafety();
  const limit = valueOf("--limit", 50);
  const maxWaitSeconds = valueOf("--max-wait-seconds", 7_200);
  const started = Date.now();
  const rows = await sql<{ id: string }[]>`
    SELECT a.id FROM articles a
    WHERE a.processing_state = 'new'
    ORDER BY (
      SELECT count(*) FROM receipts r
      WHERE r.subject = ('article:' || a.id || '@' || a.revision) AND r.status IN ('received', 'completed')
    ) DESC, a.discovered_at DESC
    LIMIT ${limit}`;
  let completed = 0;
  process.stdout.write(`${JSON.stringify({ event: "start", waiting: rows.length, limit, maxWaitSeconds })}\n`);
  for (const row of rows) {
    for (;;) {
      try {
        const result = await processArticle(row.id);
        if (result.state === "unknown-receipt") throw new Error(`unknown receipt while processing ${row.id}`);
        process.stdout.write(`${JSON.stringify({ event: "article", id: row.id, state: result.state })}\n`);
        completed += 1;
        break;
      } catch (error) {
        if (error instanceof BudgetExceededError) {
          const elapsed = Math.ceil((Date.now() - started) / 1000);
          if (elapsed + error.retryAfterSeconds > maxWaitSeconds) {
            process.stdout.write(`${JSON.stringify({ event: "wait_cap", completed, retryAfterSeconds: error.retryAfterSeconds })}\n`);
            return;
          }
          process.stdout.write(`${JSON.stringify({ event: "budget_wait", completed, window: error.message, seconds: error.retryAfterSeconds })}\n`);
          await sleep(error.retryAfterSeconds * 1000);
          continue;
        }
        if (error instanceof ModelOutputError) {
          process.stderr.write(`${JSON.stringify({ event: "model_output_error", id: row.id, kind: error.kind, message: error.message })}\n`);
        } else {
          process.stderr.write(`${JSON.stringify({ event: "fatal", id: row.id, name: error instanceof Error ? error.name : "unknown", message: String(error) })}\n`);
        }
        process.exitCode = 1;
        return;
      }
    }
  }
  process.stdout.write(`${JSON.stringify({ event: "done", completed })}\n`);
}

try {
  await main();
} finally {
  await closeDb();
}
