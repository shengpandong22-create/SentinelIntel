import { randomBytes, randomUUID } from "node:crypto";
import { config } from "../config.ts";
import { runAgentImpactTask, type AgentClientOptions } from "./client.ts";
import { applyImpactProposal } from "./impact-store.ts";
import { extractImpactDrafts } from "./impact-extraction.ts";
import { completeResearchRun, failResearchRun, startResearchRun } from "./research-store.ts";
import { DEFAULT_RESEARCH_LIMITS, ResearchProposalSchema } from "./research-contract.ts";
import { ImpactTaskSchema, type ImpactTask, type ImpactTaskResponse } from "./impact-contract.ts";
import { sql } from "../db.ts";

// Phase 6 orchestration: deterministic TypeScript decides eligibility (Stories whose title or digest
// carries a CVE id — the reliable public proxy for vulnerability/vendor-advisory content), extracts
// the task parameters, runs one bounded impact task through the Phase 4/5 boundaries, and persists the
// confidence-routed result. The Story itself is never mutated.

const VENDOR_KEYS = ["cisco", "fortinet", "hikvision", "microsoft"] as const;
const VENDOR_ALIASES: Record<(typeof VENDOR_KEYS)[number], string[]> = {
  cisco: ["cisco"],
  fortinet: ["fortinet", "fortigate", "fortios"],
  hikvision: ["hikvision", "海康威视"],
  microsoft: ["microsoft", "windows"],
};

export function impactSourceParameters(text: string): { cve_id: string | null; vendor: (typeof VENDOR_KEYS)[number] | null } {
  const cve = /\bCVE-\d{4}-\d{4,}\b/i.exec(text)?.[0]?.toUpperCase() ?? null;
  const lowered = text.toLowerCase();
  const vendor = (Object.entries(VENDOR_ALIASES) as Array<[(typeof VENDOR_KEYS)[number], string[]]>)
    .find(([, aliases]) => aliases.some((alias) => lowered.includes(alias)))?.[0] ?? null;
  return { cve_id: cve, vendor };
}

export async function listImpactCandidates(limit = 50): Promise<Array<{ id: number; version: number }>> {
  if (!Number.isInteger(limit) || limit < 1 || limit > 200) throw new Error("invalid impact candidate limit");
  return sql<{ id: number; version: number }[]>`
    SELECT s.id, s.version
    FROM stories s
    WHERE s.merged_into IS NULL
      AND (s.title ~* 'CVE-[0-9]{4}-[0-9]{4,}' OR coalesce(s.digest, '') ~* 'CVE-[0-9]{4}-[0-9]{4,}')
      AND NOT EXISTS (SELECT 1 FROM product_impacts i WHERE i.story_id = s.id AND i.status = 'current')
    ORDER BY s.id
    LIMIT ${limit}`;
}

export async function runImpactForStory(
  storyId: number,
  opts: AgentClientOptions & { productImpactEnabled?: boolean } = {},
) {
  const traceId = randomUUID();
  const [story] = await sql<{ id: number; title: string; digest: string | null; status: "active" | "watching" | "settled"; version: number }[]>`
    SELECT id, title, digest, status, version FROM stories WHERE id = ${storyId} AND merged_into IS NULL`;
  if (!story) throw new Error("impact Story is missing or merged");
  const sourceParameters = impactSourceParameters(`${story.title}\n${story.digest ?? ""}`);
  if (!sourceParameters.cve_id) return { storyId, traceId, skipped: "no_cve" as const };
  const [existing] = await sql<{ rows: number }[]>`
    SELECT count(*) AS rows FROM product_impacts WHERE story_id = ${storyId} AND status = 'current'`;
  if ((existing?.rows ?? 0) > 0) return { storyId, traceId, skipped: "already_analyzed" as const };

  const snapshot = {
    schema_version: 1 as const,
    story_id: story.id,
    story_version: story.version,
    title: story.title,
    digest: story.digest,
    status: story.status,
    facts: [] as Array<{ fact_id: number; public_id: string; title: string }>,
    missing_questions: [] as string[],
    captured_at: new Date().toISOString(),
  };
  const run = await startResearchRun({
    storyId: story.id,
    traceId,
    objective: "Analyze public product impact for the vulnerability in this Story.",
    graphVersion: "phase6-impact-v1",
    snapshot,
    limits: DEFAULT_RESEARCH_LIMITS,
  });
  const task = ImpactTaskSchema.parse({
    trace_id: traceId,
    run_id: run.publicId,
    tool_capability: run.capability,
    story: snapshot,
    source_parameters: { cve_id: sourceParameters.cve_id, vendor: sourceParameters.vendor },
    evidence: [],
    limits: DEFAULT_RESEARCH_LIMITS,
  });
  try {
    const acquisition = await runAgentImpactTask(task, opts);
    const { response: finalResponse, extractionReceiptId } = await completeWithExtraction(task, acquisition, opts);
    await completeResearchRun({
      runId: run.id,
      storyId: task.story.story_id,
      provider: "impact-agent",
      promptVersion: "phase6-impact-v1",
      proposal: ResearchProposalSchema.parse({
        claims: [],
        unknowns: finalResponse.proposal.unknowns.map((unknown) => ({
          question: unknown,
          attempted_sources: finalResponse.proposal.tool_trace.map((trace) => trace.tool),
          reason: unknown,
        })),
        evidence: finalResponse.proposal.new_evidence,
        conflicts: [],
        tool_trace: finalResponse.proposal.tool_trace,
        summary: finalResponse.proposal.decision_reason,
        terminal_status: finalResponse.proposal.decision === "insufficient_evidence" ? "insufficient_evidence" : "completed",
      }),
    });
    const committed = await applyImpactProposal({ task, proposal: finalResponse.proposal });
    return { storyId, traceId, runId: run.publicId, extractionReceiptId, ...committed, proposal: finalResponse.proposal };
  } catch (error) {
    await failResearchRun(run.id, "impact_failed", error instanceof Error ? error.message : String(error)).catch(() => undefined);
    throw error;
  }
}

/**
 * The contract's extraction round trip: when acquisition yields evidence but no rows, the Python
 * graph's extraction requests are executed through the TypeScript model gateway (receipts, budgets),
 * and the drafts are normalized by a second graph call. Fails closed unless both switches are on.
 * The extraction receipt id is returned for the audit trail.
 */
async function completeWithExtraction(
  task: ImpactTask,
  response: ImpactTaskResponse,
  opts: AgentClientOptions & { productImpactEnabled?: boolean; modelCallsEnabled?: boolean },
): Promise<{ response: ImpactTaskResponse; extractionReceiptId: number | null }> {
  if (response.proposal.impact_rows.length > 0 || response.proposal.extraction_requests.length === 0) {
    return { response, extractionReceiptId: null };
  }
  if (!(opts.productImpactEnabled ?? config.productImpactEnabled)) return { response, extractionReceiptId: null };
  if (!(opts.modelCallsEnabled ?? config.modelCallsEnabled)) return { response, extractionReceiptId: null };

  const { receiptId, ...extraction } = await extractImpactDrafts(task, response.proposal.extraction_requests);
  const evidenceRefs = [
    ...task.evidence,
    ...response.proposal.new_evidence.map((item) => ({
      evidence_id: item.evidence_id,
      source_type: item.source_type,
      authority_level: item.authority_level,
      canonical_url: item.canonical_url,
      content_hash: item.content_hash,
      retrieved_at: item.retrieved_at,
      observations: [] as never[],
    })),
  ];
  const normalized = await runAgentImpactTask(
    ImpactTaskSchema.parse({ ...task, evidence: evidenceRefs, extraction }),
    opts,
  );
  return { response: normalized, extractionReceiptId: receiptId };
}
