import { randomUUID } from "node:crypto";
import { z } from "zod";
import { sha256 } from "../lib/ids.ts";
import { authorizeResearchToolCall, recordResearchToolResult } from "./research-store.ts";
import { ResearchEvidenceSchema } from "./research-contract.ts";
import { lookupKev, lookupNvd, parseCveId, type ResearchFetchJson } from "./research-adapters.ts";

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

export async function executeResearchTool(
  request: ResearchToolRequest,
  capability: string,
  deps: { networkEnabled?: boolean; fetchJson?: ResearchFetchJson } = {},
): Promise<ResearchToolResponse> {
  const parsed = ResearchToolRequestSchema.parse(request);
  let question: string | null = null;
  let cveId: string | null = null;
  if (parsed.tool === "stub") question = z.string().min(1).max(2_000).parse(parsed.input.question);
  else if (parsed.tool === "nvd_lookup" || parsed.tool === "kev_lookup") cveId = parseCveId(parsed.input.cve_id);
  else throw new Error("research tool is not implemented");
  await authorizeResearchToolCall({
    runPublicId: parsed.run_id,
    traceId: parsed.trace_id,
    capability,
    tool: parsed.tool,
    networkEnabled: deps.networkEnabled,
  });

  const started = Date.now();
  let result: { output: Record<string, unknown>; evidence: z.infer<typeof ResearchEvidenceSchema>[]; receiptIds: number[] };
  if (parsed.tool === "stub") {
    const evidenceId = randomUUID();
    if (question === null) throw new Error("stub question is missing");
    result = {
      output: { answered: false, reason: "fixture evidence cannot resolve a real research question" },
      evidence: [ResearchEvidenceSchema.parse({
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
        retrieved_at: new Date().toISOString(),
        provenance: { adapter: "stub", external_network: false },
      })],
      receiptIds: [],
    };
  } else if (parsed.tool === "nvd_lookup") {
    if (cveId === null) throw new Error("CVE id is missing");
    result = await lookupNvd(cveId, deps.fetchJson);
  } else {
    if (cveId === null) throw new Error("CVE id is missing");
    result = await lookupKev(cveId, deps.fetchJson);
  }
  const response = ResearchToolResponseSchema.parse({
    trace_id: parsed.trace_id,
    run_id: parsed.run_id,
    tool: parsed.tool,
    status: "ok",
    output: result.output,
    evidence: result.evidence,
    receipt_ids: result.receiptIds,
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
