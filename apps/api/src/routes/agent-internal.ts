import { timingSafeEqual } from "node:crypto";
import type { FastifyInstance, FastifyRequest } from "fastify";
import { config } from "@aihot/backend/config";
import { executeResearchTool, ResearchToolRequestSchema } from "@aihot/backend/agents/tool-gateway";

function internalAuthorized(req: FastifyRequest): boolean {
  const expected = config.agentInternalToken ?? "";
  const supplied = /^Bearer\s+(.+)$/i.exec(req.headers.authorization ?? "")?.[1]?.trim() ?? "";
  const left = Buffer.from(expected);
  const right = Buffer.from(supplied);
  return expected.length >= 32 && left.length === right.length && timingSafeEqual(left, right);
}

export function registerAgentInternal(app: FastifyInstance) {
  app.post("/api/internal/agent/tools/:tool", async (req, reply) => {
    reply.header("Cache-Control", "no-store");
    if (!internalAuthorized(req)) return reply.code(401).send({ error: { code: "unauthorized", retryable: false } });
    if (!config.agentResearchEnabled) return reply.code(403).send({ error: { code: "research_disabled", retryable: false } });
    const capability = String(req.headers["x-run-capability"] ?? "");
    if (capability.length < 32) return reply.code(401).send({ error: { code: "invalid_capability", retryable: false } });
    const parsed = ResearchToolRequestSchema.safeParse({ ...(req.body as object), tool: (req.params as { tool: string }).tool });
    if (!parsed.success) return reply.code(400).send({ error: { code: "invalid_request", retryable: false } });
    if (req.headers["x-trace-id"] !== parsed.data.trace_id) {
      return reply.code(400).send({ error: { code: "trace_mismatch", retryable: false } });
    }
    try {
      return await executeResearchTool(parsed.data, capability);
    } catch (error) {
      req.log.warn({ code: "research_tool_rejected", tool: parsed.data.tool }, "research tool rejected");
      const message = error instanceof Error ? error.message : String(error);
      const limit = /limit|expired|terminal|network is disabled/.test(message);
      return reply.code(limit ? 409 : 400).send({
        error: { code: limit ? "tool_rejected" : "invalid_tool_request", retryable: false },
      });
    }
  });
}
