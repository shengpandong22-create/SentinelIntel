import { randomUUID } from "node:crypto";
import { z } from "zod";
import { sha256 } from "../lib/ids.ts";
import { authorizeResearchToolCall, recordResearchToolResult } from "./research-store.ts";
import { ResearchEvidenceSchema } from "./research-contract.ts";

export const ResearchToolRequestSchema = z.object({
  trace_id: z.uuid(),
  run_id: z.uuid(),
  tool: z.enum(["stub", "nvd_lookup", "kev_lookup", "vendor_advisory_search", "evidence_fetch", "web_search"]),
  input: z.record(z.string(), z.unknown()),
}).strict();

export const ResearchToolResponseSchema = z.object({
  trace_id: z.uuid(),
  run_id: z.uuid(),
  tool: z.string(),
  status: z.literal("ok"),
  output: z.record(z.string(), z.unknown()),
  evidence: z.array(ResearchEvidenceSchema),
  receipt_ids: z.array(z.number().int().positive()),
  latency_ms: z.number().int().nonnegative(),
}).strict();

export type ResearchToolRequest = z.infer<typeof ResearchToolRequestSchema>;
export type ResearchToolResponse = z.infer<typeof ResearchToolResponseSchema>;

/** Checkpoint-2 deterministic tool. It proves the callback contract but makes no external request. */
export async function executeResearchTool(request: ResearchToolRequest, capability: string): Promise<ResearchToolResponse> {
  const parsed = ResearchToolRequestSchema.parse(request);
  if (parsed.tool !== "stub") throw new Error("live research tools are not implemented");
  await authorizeResearchToolCall({
    runPublicId: parsed.run_id,
    traceId: parsed.trace_id,
    capability,
    tool: parsed.tool,
  });

  const started = Date.now();
  const question = z.string().min(1).max(2_000).parse(parsed.input.question);
  const evidenceId = randomUUID();
  const retrievedAt = new Date().toISOString();
  const evidence = ResearchEvidenceSchema.parse({
    evidence_id: evidenceId,
    source_type: "stub_fixture",
    source_name: "SentinelIntel deterministic fixture",
    canonical_url: `https://fixture.invalid/research/${evidenceId}`,
    title: "Deterministic research callback evidence",
    excerpt: question,
    normalized: { question, fixture: true },
    content_hash: sha256(question),
    authority_level: "secondary",
    published_at: null,
    source_updated_at: null,
    retrieved_at: retrievedAt,
    provenance: { adapter: "stub", external_network: false },
  });
  const response = ResearchToolResponseSchema.parse({
    trace_id: parsed.trace_id,
    run_id: parsed.run_id,
    tool: parsed.tool,
    status: "ok",
    output: { answered: false, reason: "fixture evidence cannot resolve a real research question" },
    evidence: [evidence],
    receipt_ids: [],
    latency_ms: Date.now() - started,
  });
  await recordResearchToolResult({
    runPublicId: parsed.run_id,
    traceId: parsed.trace_id,
    capability,
    evidenceDocuments: response.evidence.length,
    responseBytes: Buffer.byteLength(JSON.stringify(response)),
  });
  return response;
}
