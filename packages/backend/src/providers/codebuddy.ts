// Structured CodeBuddy CLI calls used by offline evaluation tooling. The CLI is treated like every
// other paid provider: calls are gated, budgeted and persisted before the subprocess is started.
import { spawn } from "node:child_process";
import type { z } from "zod";
import { config, credential } from "../config.ts";
import { sha256 } from "../lib/ids.ts";
import { paidRequest, rejectReceivedResponse } from "./receipts.ts";

async function runCodeBuddyStream(args: string[], prompt: string | null, env: NodeJS.ProcessEnv, timeoutMs: number): Promise<CodeBuddyEnvelope> {
  return new Promise((resolve, reject) => {
    const child = spawn("codebuddy", args, { env, windowsHide: true });
    let stdout = "", stderr = "", settled = false;
    const timer = setTimeout(() => finish(new Error(`CodeBuddy stream timed out after ${timeoutMs} ms`)), timeoutMs);
    const finish = (error?: Error, envelope?: CodeBuddyEnvelope) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (!child.killed) child.kill();
      if (error) reject(error); else resolve(envelope!);
    };
    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk: string) => {
      stdout += chunk;
      const lines = stdout.split(/\r?\n/);
      stdout = lines.pop() ?? "";
      for (const line of lines) try {
        const row = JSON.parse(line) as Record<string, unknown>;
        if (row.type === "result") finish(undefined, parseCodeBuddyStream(line));
      } catch { /* wait for the terminal result event */ }
      if (!settled) try {
        const row = JSON.parse(stdout) as Record<string, unknown>;
        if (row.type === "result") finish(undefined, parseCodeBuddyStream(stdout));
      } catch { /* the current line is still incomplete */ }
    });
    child.stderr.on("data", (chunk: string) => { stderr = (stderr + chunk).slice(-4000); });
    child.stdin.on("error", (error) => finish(error));
    child.stdin.end(prompt ?? undefined);
    child.on("error", (error) => finish(error));
    child.on("exit", (code) => {
      if (settled) return;
      try { finish(undefined, parseCodeBuddyOutput(stdout)); }
      catch { finish(new Error(`CodeBuddy exited ${code ?? "without a code"}: ${stderr || `unusable output ${stdout.slice(0, 1000)}`}`)); }
    });
  });
}

export interface CodeBuddyEnvelope {
  subtype?: string;
  is_error?: boolean;
  session_id?: string;
  result?: string;
  structured_output?: unknown;
  usage?: Record<string, unknown>;
  total_cost_usd?: number;
  duration_ms?: number;
  duration_api_ms?: number;
  num_turns?: number;
  errors?: string[];
}

export function parseCodeBuddyEnvelope(stdout: string): CodeBuddyEnvelope {
  let value: unknown;
  try { value = JSON.parse(stdout); } catch { throw new Error("CodeBuddy returned invalid JSON"); }
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("CodeBuddy result must be an object");
  const row = value as CodeBuddyEnvelope;
  if (row.is_error || (row.subtype && row.subtype !== "success")) {
    throw new Error(`CodeBuddy failed: ${(row.errors ?? [row.result ?? row.subtype ?? "unknown error"]).join("; ")}`);
  }
  if (row.structured_output === undefined) throw new Error("CodeBuddy result is missing structured_output");
  return row;
}

export function parseCodeBuddyStream(stdout: string): CodeBuddyEnvelope {
  const rows = stdout.split(/\r?\n/).filter(Boolean).map((line) => {
    try { return JSON.parse(line) as Record<string, unknown>; } catch { return null; }
  }).filter((row): row is Record<string, unknown> => Boolean(row));
  const result = [...rows].reverse().find((row) => row.type === "result");
  if (!result) throw new Error("CodeBuddy stream is missing a result event");
  let structuredOutput: unknown;
  const raw = String(result.result ?? "").trim();
  const fenced = raw.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i)?.[1];
  const candidate = fenced ?? raw.slice(raw.indexOf("{"), raw.lastIndexOf("}") + 1);
  try { structuredOutput = JSON.parse(candidate); }
  catch { throw new Error("CodeBuddy stream result is not valid JSON"); }
  return parseCodeBuddyEnvelope(JSON.stringify({ ...result, structured_output: structuredOutput }));
}

export function parseCodeBuddyOutput(stdout: string): CodeBuddyEnvelope {
  try {
    const envelope = JSON.parse(stdout) as CodeBuddyEnvelope;
    if (envelope.structured_output !== undefined) return parseCodeBuddyEnvelope(stdout);
    const raw = String(envelope.result ?? "").trim();
    const fenced = raw.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i)?.[1]
      ?? raw.match(/```(?:json)?\s*([\s\S]*?)\s*```/i)?.[1];
    const candidate = fenced ?? raw.slice(raw.indexOf("{"), raw.lastIndexOf("}") + 1);
    return parseCodeBuddyEnvelope(JSON.stringify({ ...envelope, structured_output: JSON.parse(candidate) }));
  } catch {
    try {
      const raw = stdout.trim();
      const fenced = raw.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i)?.[1]
        ?? raw.match(/```(?:json)?\s*([\s\S]*?)\s*```/i)?.[1];
      const candidate = fenced ?? raw.slice(raw.indexOf("{"), raw.lastIndexOf("}") + 1);
      return parseCodeBuddyEnvelope(JSON.stringify({ subtype: "success", structured_output: JSON.parse(candidate) }));
    } catch {
      return parseCodeBuddyStream(stdout);
    }
  }
}

export function codeBuddyArgs(input: { model: string; system: string; prompt: string; jsonSchema: Record<string, unknown>; promptInArgument?: boolean; useJsonSchema?: boolean }): string[] {
  const useJsonSchema = input.useJsonSchema !== false;
  return [
    "--model", input.model,
    "--agent", "minimal",
    "--tools", "",
    "--strict-mcp-config", "--mcp-config", "{}",
    "--no-session-persistence",
    "--system-prompt", input.system,
    "-p", "--max-turns", "1",
    "--output-format", useJsonSchema ? "stream-json" : "text",
    ...(useJsonSchema ? ["--input-format", "text", "--json-schema", JSON.stringify(input.jsonSchema)] : []),
    ...(input.promptInArgument ? [input.prompt] : []),
  ];
}

export interface CodeBuddyStructuredOptions<S extends z.ZodType> {
  model: string;
  purpose: string;
  subject: string;
  promptVersion: string;
  system: string;
  prompt: string;
  jsonSchema: Record<string, unknown>;
  schema: S;
  attemptTag?: string;
  timeoutMs?: number;
  promptInArgument?: boolean;
  useJsonSchema?: boolean;
}

export async function codeBuddyStructured<S extends z.ZodType>(opts: CodeBuddyStructuredOptions<S>): Promise<{
  data: z.infer<S>; receiptId: number; reused: boolean; model: string; usage: Record<string, unknown> | null;
}> {
  if (!config.modelCallsEnabled) throw new Error("Model calls are disabled (MODEL_CALLS_ENABLED=false)");
  const apiKey = credential("models", "CODEBUDDY_API_KEY");
  const args = codeBuddyArgs(opts);
  const receipt = await paidRequest({
    service: "codebuddy", model: opts.model, purpose: opts.purpose, subject: opts.subject,
    identity: { model: opts.model, promptVersion: opts.promptVersion, system: sha256(opts.system), prompt: sha256(opts.prompt), jsonSchema: opts.jsonSchema },
    requestSummary: { promptVersion: opts.promptVersion, systemHash: sha256(opts.system), promptHash: sha256(opts.prompt), promptChars: opts.prompt.length },
    attemptTag: opts.attemptTag,
  }, async () => {
    const envelope = await runCodeBuddyStream(args, opts.promptInArgument ? null : opts.prompt,
      { ...process.env, ...(apiKey ? { CODEBUDDY_API_KEY: apiKey } : {}) },
      opts.timeoutMs ?? 180_000);
    return {
      response: envelope,
      requestId: envelope.session_id ?? null,
      usage: envelope.usage ?? null,
      cost: typeof envelope.total_cost_usd === "number" ? { amount: envelope.total_cost_usd, currency: "USD", basis: "actual" as const } : null,
    };
  });

  const envelope = receipt.response as CodeBuddyEnvelope;
  let data: z.infer<S>;
  try { data = opts.schema.parse(envelope.structured_output); }
  catch (error) {
    await rejectReceivedResponse(receipt.receiptId, `unusable CodeBuddy output: ${String(error).slice(0, 500)}`);
    throw error;
  }
  return { data, receiptId: receipt.receiptId, reused: receipt.reused, model: opts.model, usage: envelope.usage ?? null };
}
