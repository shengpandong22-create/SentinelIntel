import { randomBytes, randomUUID } from "node:crypto";
import { config } from "../config.ts";
import { sql } from "../db.ts";
import { sha256 } from "../lib/ids.ts";
import {
  ResearchLimitsSchema,
  ResearchProposalSchema,
  StoryResearchSnapshotSchema,
  type ResearchLimits,
  type ResearchProposal,
  type StoryResearchSnapshot,
} from "./research-contract.ts";

export interface StartResearchRunInput {
  storyId: number;
  traceId: string;
  objective: string;
  graphVersion: string;
  snapshot: StoryResearchSnapshot;
  limits: ResearchLimits;
}

export interface ResearchRunIdentity {
  id: number;
  publicId: string;
  traceId: string;
  capability: string;
}

export async function startResearchRun(input: StartResearchRunInput): Promise<ResearchRunIdentity> {
  const snapshot = StoryResearchSnapshotSchema.parse(input.snapshot);
  const limits = ResearchLimitsSchema.parse(input.limits);
  if (snapshot.story_id !== input.storyId) throw new Error("research snapshot story id mismatch");
  const publicId = randomUUID();
  const capability = randomBytes(32).toString("base64url");
  const deadlineAt = new Date(Date.now() + limits.deadline_ms);
  const [row] = await sql<{ id: number }[]>`
    INSERT INTO agent_research_runs
      (public_id, story_id, trace_id, capability_hash, capability_expires_at, deadline_at,
       objective, status, graph_version, input_snapshot, limits)
    VALUES
      (${publicId}, ${input.storyId}, ${input.traceId}, ${sha256(capability)}, ${deadlineAt}, ${deadlineAt},
       ${input.objective}, 'running',
       ${input.graphVersion}, ${sql.json(snapshot as never)}, ${sql.json(limits as never)})
    RETURNING id`;
  return { id: row!.id, publicId, traceId: input.traceId, capability };
}

const RESEARCH_TOOLS = new Set(["nvd_lookup", "kev_lookup", "vendor_advisory_search", "evidence_fetch", "web_search", "stub"]);

/** Reserves one tool call in the backend before any adapter runs; Python cannot self-report these limits. */
export async function authorizeResearchToolCall(input: {
  runPublicId: string;
  traceId: string;
  capability: string;
  tool: string;
  networkEnabled?: boolean;
}): Promise<void> {
  if (!RESEARCH_TOOLS.has(input.tool)) throw new Error("research tool is not allowlisted");
  if (input.tool !== "stub" && !(input.networkEnabled ?? config.agentResearchNetworkEnabled)) {
    throw new Error("research network is disabled");
  }
  const capabilityHash = sha256(input.capability);
  await sql.begin(async (tx) => {
    const [run] = await tx<{
      status: string;
      capability_hash: string;
      capability_expires_at: Date;
      deadline_at: Date;
      tool_calls_used: number;
      generic_searches_used: number;
      limits: ResearchLimits;
    }[]>`
      SELECT status, capability_hash, capability_expires_at, deadline_at, tool_calls_used,
             generic_searches_used, limits
      FROM agent_research_runs WHERE public_id = ${input.runPublicId} AND trace_id = ${input.traceId} FOR UPDATE`;
    if (!run || run.status !== "running") throw new Error("research run is missing or terminal");
    if (run.capability_hash !== capabilityHash) throw new Error("invalid research run capability");
    if (run.capability_expires_at.getTime() <= Date.now() || run.deadline_at.getTime() <= Date.now()) {
      throw new Error("research run capability expired");
    }
    const limits = ResearchLimitsSchema.parse(run.limits);
    if (run.tool_calls_used >= limits.max_tool_calls) throw new Error("research tool call limit exhausted");
    if (input.tool === "web_search" && run.generic_searches_used >= limits.max_generic_searches) {
      throw new Error("research generic search limit exhausted");
    }
    await tx`
      UPDATE agent_research_runs SET
        tool_calls_used = tool_calls_used + 1,
        generic_searches_used = generic_searches_used + ${input.tool === "web_search" ? 1 : 0}
      WHERE public_id = ${input.runPublicId}`;
  });
}

/** Accounts for a validated tool result before it is returned to Python. */
export async function recordResearchToolResult(input: {
  runPublicId: string;
  traceId: string;
  capability: string;
  evidenceDocuments: number;
  responseBytes: number;
}): Promise<void> {
  if (!Number.isInteger(input.evidenceDocuments) || input.evidenceDocuments < 0) throw new Error("invalid evidence document count");
  if (!Number.isInteger(input.responseBytes) || input.responseBytes < 0) throw new Error("invalid research response byte count");
  const capabilityHash = sha256(input.capability);
  const rows = await sql`
    UPDATE agent_research_runs SET
      evidence_documents_used = evidence_documents_used + ${input.evidenceDocuments},
      response_bytes_used = response_bytes_used + ${input.responseBytes}
    WHERE public_id = ${input.runPublicId} AND trace_id = ${input.traceId}
      AND status = 'running' AND capability_hash = ${capabilityHash}
      AND capability_expires_at > now() AND deadline_at > now()
      AND evidence_documents_used + ${input.evidenceDocuments} <= (limits->>'max_evidence_documents')::int
      AND response_bytes_used + ${input.responseBytes} <= (limits->>'max_response_bytes')::bigint
    RETURNING id`;
  if (rows.length !== 1) throw new Error("research result exceeds limits or capability is invalid");
}

/** Phase 4 must not inherit paidRequest's legacy "missing row means unlimited" behavior. */
export async function assertResearchPaidServiceBudget(service: string): Promise<void> {
  const [budget] = await sql<{ per_minute: number; per_hour: number; per_day: number }[]>`
    SELECT per_minute, per_hour, per_day FROM budgets WHERE service = ${service}`;
  if (!budget) throw new Error(`research paid service has no budget: ${service}`);
  if (budget.per_minute <= 0 || budget.per_hour <= 0 || budget.per_day <= 0) {
    throw new Error(`research paid service is stopped by budget: ${service}`);
  }
}

export interface CompleteResearchRunInput {
  runId: number;
  storyId: number;
  proposal: ResearchProposal;
  model?: string | null;
  provider?: string | null;
  promptVersion?: string | null;
  usage?: Record<string, unknown> | null;
}

export async function completeResearchRun(input: CompleteResearchRunInput): Promise<void> {
  const proposal = ResearchProposalSchema.parse(input.proposal);
  const receiptIds = [...new Set(proposal.tool_trace.flatMap((entry) => entry.receipt_ids))];

  await sql.begin(async (tx) => {
    const [run] = await tx<{ id: number }[]>`
      SELECT id FROM agent_research_runs
      WHERE id = ${input.runId} AND story_id = ${input.storyId} AND status = 'running'
      FOR UPDATE`;
    if (!run) throw new Error("research run is missing, belongs to another story, or is already terminal");

    if (receiptIds.length > 0) {
      const rows = await tx<{ id: number }[]>`SELECT id FROM receipts WHERE id = ANY(${receiptIds})`;
      if (rows.length !== receiptIds.length) throw new Error("research proposal references an unknown receipt");
    }

    for (const evidence of proposal.evidence) {
      await tx`
        INSERT INTO external_evidence
          (public_id, story_id, research_run_id, source_type, source_name, canonical_url, title,
           excerpt, normalized, content_hash, authority_level, published_at, source_updated_at,
           retrieved_at, provenance)
        VALUES
          (${evidence.evidence_id}, ${input.storyId}, ${input.runId}, ${evidence.source_type},
           ${evidence.source_name}, ${evidence.canonical_url}, ${evidence.title}, ${evidence.excerpt},
           ${tx.json(evidence.normalized as never)}, ${evidence.content_hash}, ${evidence.authority_level},
           ${evidence.published_at}, ${evidence.source_updated_at}, ${evidence.retrieved_at},
           ${tx.json(evidence.provenance as never)})`;
    }

    await tx`
      UPDATE agent_research_runs SET
        status = 'completed', model = ${input.model ?? null}, provider = ${input.provider ?? null},
        prompt_version = ${input.promptVersion ?? null}, output_proposal = ${tx.json(proposal as never)},
        tool_trace = ${tx.json(proposal.tool_trace as never)}, receipt_ids = ${receiptIds},
        usage = ${input.usage ? tx.json(input.usage as never) : null}, completed_at = now()
      WHERE id = ${input.runId}`;
  });
}

export async function failResearchRun(runId: number, code: string, detail: string): Promise<void> {
  const rows = await sql`
    UPDATE agent_research_runs SET
      status = 'failed', error_code = ${code}, error_detail = ${detail.slice(0, 2_000)}, completed_at = now()
    WHERE id = ${runId} AND status = 'running'
    RETURNING id`;
  if (rows.length !== 1) throw new Error("research run is missing or already terminal");
}
