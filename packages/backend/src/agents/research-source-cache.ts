import { randomUUID } from "node:crypto";
import { sql } from "../db.ts";
import { ResearchEvidenceSchema } from "./research-contract.ts";
import { lookupNvd, parseCveId, type AdapterResult } from "./research-adapters.ts";

interface CacheRow { payload: Record<string, unknown>; fetched_at: Date }

export async function lookupNvdPersistent(
  cveInput: string,
  liveLookup: (cve: string) => Promise<AdapterResult> = lookupNvd,
): Promise<AdapterResult> {
  const cve = parseCveId(cveInput);
  try {
    const result = await liveLookup(cve);
    const evidence = result.evidence[0];
    if (evidence) {
      await sql`
        INSERT INTO research_source_cache
          (source_type, source_key, payload, content_hash, source_updated_at, fetched_at)
        VALUES
          ('nvd', ${cve}, ${sql.json({ output: result.output, evidence } as never)}, ${evidence.content_hash},
           ${evidence.source_updated_at}, ${evidence.retrieved_at})
        ON CONFLICT (source_type, source_key) DO UPDATE SET
          payload = EXCLUDED.payload, content_hash = EXCLUDED.content_hash,
          source_updated_at = EXCLUDED.source_updated_at, fetched_at = EXCLUDED.fetched_at, updated_at = now()`;
    }
    return result;
  } catch (liveError) {
    const [cached] = await sql<CacheRow[]>`
      SELECT payload, fetched_at FROM research_source_cache WHERE source_type = 'nvd' AND source_key = ${cve}`;
    if (!cached) throw liveError;
    const raw = cached.payload.evidence;
    const prior = typeof raw === "object" && raw ? raw as Record<string, unknown> : {};
    const evidence = ResearchEvidenceSchema.parse({
      ...prior,
      evidence_id: randomUUID(),
      retrieved_at: new Date().toISOString(),
      provenance: {
        ...(typeof prior.provenance === "object" && prior.provenance ? prior.provenance : {}),
        cache_hit: true,
        cached_at: cached.fetched_at.toISOString(),
        live_error: liveError instanceof Error ? liveError.name : "Error",
      },
    });
    return { output: { ...((cached.payload.output as Record<string, unknown> | undefined) ?? {}), cache_hit: true }, evidence: [evidence], receiptIds: [] };
  }
}
