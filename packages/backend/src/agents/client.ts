import { randomUUID } from "node:crypto";
import { z } from "zod";
import { config } from "../config.ts";
import {
  ResearchLimitsSchema,
  ResearchTaskResponseSchema,
  StoryResearchSnapshotSchema,
  type ResearchLimits,
  type ResearchTaskResponse,
  type StoryResearchSnapshot,
} from "./research-contract.ts";
import {
  TrackingTaskResponseSchema,
  TrackingTaskSchema,
  validateTrackingProposal,
  type TrackingTask,
  type TrackingTaskResponse,
} from "./tracking-contract.ts";

const TestTaskResponseSchema = z.object({
  trace_id: z.uuid(),
  status: z.literal("ok"),
  result: z.object({ echo: z.string(), model: z.string(), tools: z.array(z.string()) }),
});

const ErrorEnvelopeSchema = z.object({
  error: z.object({
    code: z.string(),
    message: z.string(),
    retryable: z.boolean(),
    trace_id: z.uuid().nullable(),
  }),
});

export type AgentTestBehavior = "success" | "transient_error" | "permanent_error" | "delay";
export type AgentTestResult = z.infer<typeof TestTaskResponseSchema>;

export class AgentRuntimeError extends Error {
  readonly code: string;
  readonly retryable: boolean;
  readonly traceId: string;
  readonly status: number | null;

  constructor(
    message: string,
    code: string,
    retryable: boolean,
    traceId: string,
    status: number | null,
  ) {
    super(message);
    this.name = "AgentRuntimeError";
    this.code = code;
    this.retryable = retryable;
    this.traceId = traceId;
    this.status = status;
  }
}

export interface AgentClientOptions {
  baseUrl?: string;
  timeoutMs?: number;
  retries?: number;
  fetch?: typeof fetch;
  internalToken?: string | null;
  researchEnabled?: boolean;
}

function transientStatus(status: number): boolean {
  return status === 429 || status === 502 || status === 503 || status === 504;
}

export async function runAgentTestTask(
  input: string,
  task: { traceId?: string; behavior?: AgentTestBehavior; delayMs?: number } = {},
  opts: AgentClientOptions = {},
): Promise<AgentTestResult> {
  const traceId = task.traceId ?? randomUUID();
  const baseUrl = (opts.baseUrl ?? config.agentRuntimeUrl).replace(/\/$/, "");
  const timeoutMs = opts.timeoutMs ?? config.agentRuntimeTimeoutMs;
  const retries = opts.retries ?? config.agentRuntimeRetries;
  const request = opts.fetch ?? fetch;
  let last: AgentRuntimeError | null = null;

  for (let attempt = 0; attempt <= retries; attempt += 1) {
    try {
      const response = await request(`${baseUrl}/v1/tasks/test`, {
        method: "POST",
        headers: { "content-type": "application/json", "x-trace-id": traceId },
        body: JSON.stringify({
          trace_id: traceId,
          input,
          behavior: task.behavior ?? "success",
          delay_ms: task.delayMs ?? 0,
        }),
        signal: AbortSignal.timeout(timeoutMs),
      });
      const body: unknown = await response.json().catch(() => null);
      if (response.ok) {
        const parsed = TestTaskResponseSchema.safeParse(body);
        if (!parsed.success || parsed.data.trace_id !== traceId) {
          throw new AgentRuntimeError("Invalid agent runtime response", "invalid_response", false, traceId, response.status);
        }
        return parsed.data;
      }
      const parsed = ErrorEnvelopeSchema.safeParse(body);
      if (parsed.success && parsed.data.error.trace_id !== null && parsed.data.error.trace_id !== traceId) {
        throw new AgentRuntimeError("Agent runtime error trace id mismatch", "invalid_response", false, traceId, response.status);
      }
      const retryable = parsed.success ? parsed.data.error.retryable : transientStatus(response.status);
      last = new AgentRuntimeError(
        parsed.success ? parsed.data.error.message : `Agent runtime HTTP ${response.status}`,
        parsed.success ? parsed.data.error.code : "http_error",
        retryable,
        parsed.success ? (parsed.data.error.trace_id ?? traceId) : traceId,
        response.status,
      );
    } catch (error) {
      if (error instanceof AgentRuntimeError) last = error;
      else {
        const timeout = error instanceof Error && error.name === "TimeoutError";
        last = new AgentRuntimeError(
          timeout ? `Agent runtime timed out after ${timeoutMs} ms` : `Agent runtime request failed: ${error instanceof Error ? error.message : String(error)}`,
          timeout ? "timeout" : "network_error",
          true,
          traceId,
          null,
        );
      }
    }
    if (!last.retryable || attempt === retries) throw last;
  }
  throw last ?? new AgentRuntimeError("Agent runtime request failed", "network_error", true, traceId, null);
}

export async function runAgentResearchTask(
  task: {
    traceId?: string;
    runId: string;
    toolCapability: string;
    objective: string;
    snapshot: StoryResearchSnapshot;
    limits: ResearchLimits;
  },
  opts: AgentClientOptions = {},
): Promise<ResearchTaskResponse> {
  const traceId = task.traceId ?? randomUUID();
  if (!(opts.researchEnabled ?? config.agentResearchEnabled)) {
    throw new AgentRuntimeError("Security research is disabled", "research_disabled", false, traceId, null);
  }
  const token = opts.internalToken ?? config.agentInternalToken;
  if (!token) throw new AgentRuntimeError("Agent internal token is not configured", "auth_not_configured", false, traceId, null);

  const snapshot = StoryResearchSnapshotSchema.parse(task.snapshot);
  const limits = ResearchLimitsSchema.parse(task.limits);
  const baseUrl = (opts.baseUrl ?? config.agentRuntimeUrl).replace(/\/$/, "");
  const timeoutMs = opts.timeoutMs ?? Math.min(config.agentRuntimeTimeoutMs, limits.deadline_ms);
  const retries = opts.retries ?? config.agentRuntimeRetries;
  const request = opts.fetch ?? fetch;
  let last: AgentRuntimeError | null = null;

  for (let attempt = 0; attempt <= retries; attempt += 1) {
    try {
      const response = await request(`${baseUrl}/v1/research/story/${snapshot.story_id}`, {
        method: "POST",
        headers: { "content-type": "application/json", authorization: `Bearer ${token}`, "x-trace-id": traceId },
        body: JSON.stringify({
          trace_id: traceId,
          run_id: task.runId,
          tool_capability: task.toolCapability,
          objective: task.objective,
          snapshot,
          limits,
        }),
        signal: AbortSignal.timeout(timeoutMs),
      });
      const body: unknown = await response.json().catch(() => null);
      if (response.ok) {
        const parsed = ResearchTaskResponseSchema.safeParse(body);
        if (!parsed.success || parsed.data.trace_id !== traceId || parsed.data.run_id !== task.runId) {
          throw new AgentRuntimeError("Invalid research runtime response", "invalid_response", false, traceId, response.status);
        }
        return parsed.data;
      }
      const parsed = ErrorEnvelopeSchema.safeParse(body);
      if (parsed.success && parsed.data.error.trace_id !== null && parsed.data.error.trace_id !== traceId) {
        throw new AgentRuntimeError("Agent runtime error trace id mismatch", "invalid_response", false, traceId, response.status);
      }
      const retryable = parsed.success ? parsed.data.error.retryable : transientStatus(response.status);
      last = new AgentRuntimeError(
        parsed.success ? parsed.data.error.message : `Agent runtime HTTP ${response.status}`,
        parsed.success ? parsed.data.error.code : "http_error",
        retryable,
        traceId,
        response.status,
      );
    } catch (error) {
      if (error instanceof AgentRuntimeError) last = error;
      else {
        const timeout = error instanceof Error && error.name === "TimeoutError";
        last = new AgentRuntimeError(
          timeout ? `Agent runtime timed out after ${timeoutMs} ms` : `Agent runtime request failed: ${error instanceof Error ? error.message : String(error)}`,
          timeout ? "timeout" : "network_error",
          true,
          traceId,
          null,
        );
      }
    }
    if (!last.retryable || attempt === retries) throw last;
  }
  throw last ?? new AgentRuntimeError("Agent runtime request failed", "network_error", true, traceId, null);
}

export async function runAgentTrackingTask(
  taskInput: TrackingTask,
  opts: AgentClientOptions & { trackingEnabled?: boolean } = {},
): Promise<TrackingTaskResponse> {
  const task = TrackingTaskSchema.parse(taskInput);
  const traceId = task.trace_id;
  if (!(opts.trackingEnabled ?? config.agentTrackingEnabled)) {
    throw new AgentRuntimeError("Event tracking is disabled", "tracking_disabled", false, traceId, null);
  }
  const token = opts.internalToken ?? config.agentInternalToken;
  if (!token) throw new AgentRuntimeError("Agent internal token is not configured", "auth_not_configured", false, traceId, null);
  const baseUrl = (opts.baseUrl ?? config.agentRuntimeUrl).replace(/\/$/, "");
  const timeoutMs = opts.timeoutMs ?? config.agentRuntimeTimeoutMs;
  const retries = opts.retries ?? config.agentRuntimeRetries;
  const request = opts.fetch ?? fetch;
  let last: AgentRuntimeError | null = null;

  for (let attempt = 0; attempt <= retries; attempt += 1) {
    try {
      const response = await request(`${baseUrl}/v1/tracking/story/${task.story.story_id}`, {
        method: "POST",
        headers: { "content-type": "application/json", authorization: `Bearer ${token}`, "x-trace-id": traceId },
        body: JSON.stringify(task),
        signal: AbortSignal.timeout(timeoutMs),
      });
      const body: unknown = await response.json().catch(() => null);
      if (response.ok) {
        const parsed = TrackingTaskResponseSchema.safeParse(body);
        if (!parsed.success || parsed.data.trace_id !== traceId || parsed.data.run_id !== task.run_id) {
          throw new AgentRuntimeError("Invalid tracking runtime response", "invalid_response", false, traceId, response.status);
        }
        validateTrackingProposal(task, parsed.data.proposal);
        return parsed.data;
      }
      const parsed = ErrorEnvelopeSchema.safeParse(body);
      if (parsed.success && parsed.data.error.trace_id !== null && parsed.data.error.trace_id !== traceId) {
        throw new AgentRuntimeError("Agent runtime error trace id mismatch", "invalid_response", false, traceId, response.status);
      }
      const retryable = parsed.success ? parsed.data.error.retryable : transientStatus(response.status);
      last = new AgentRuntimeError(
        parsed.success ? parsed.data.error.message : `Agent runtime HTTP ${response.status}`,
        parsed.success ? parsed.data.error.code : "http_error",
        retryable,
        traceId,
        response.status,
      );
    } catch (error) {
      if (error instanceof AgentRuntimeError) last = error;
      else {
        const timeout = error instanceof Error && error.name === "TimeoutError";
        last = new AgentRuntimeError(
          timeout ? `Agent runtime timed out after ${timeoutMs} ms` : `Agent runtime request failed: ${error instanceof Error ? error.message : String(error)}`,
          timeout ? "timeout" : "network_error",
          true,
          traceId,
          null,
        );
      }
    }
    if (!last.retryable || attempt === retries) throw last;
  }
  throw last ?? new AgentRuntimeError("Agent runtime request failed", "network_error", true, traceId, null);
}
