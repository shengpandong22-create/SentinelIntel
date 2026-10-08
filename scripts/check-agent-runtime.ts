import { runAgentTestTask } from "@aihot/backend/agents/client";

const at = process.argv.indexOf("--base");
const baseUrl = at >= 0 ? process.argv[at + 1] : undefined;
if (at >= 0 && !baseUrl) throw new Error("--base requires a URL");

const result = await runAgentTestTask("phase-3-contract-check", {}, { baseUrl, retries: 0 });
if (result.result.echo !== "phase-3-contract-check") throw new Error("Agent runtime returned the wrong echo");
process.stdout.write(`${JSON.stringify({ ok: true, traceId: result.trace_id, model: result.result.model, tools: result.result.tools })}\n`);
