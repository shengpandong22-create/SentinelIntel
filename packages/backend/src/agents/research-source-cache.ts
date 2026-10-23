import { randomUUID } from "node:crypto";
import { sql } from "../db.ts";
import { sha256, stableJson } from "../lib/ids.ts";
import { ResearchEvidenceSchema } from "./research-contract.ts";
import {
  defaultFetchJson,
  fetchVendorAdvisory,
  kevResultFromCatalog,
  lookupNvd,
  parseCveId,
  parseVendorKey,
  KevResponseSchema,
  type AdapterResult,
} from "./research-adapters.ts";

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

/**
 * KEV lookups against a cached full-catalog pattern: the CISA feed is a large, occasionally
 * rate-limited download, so one successful fetch serves every subsequent CVE until refreshed; a live
 * failure falls back to the cached catalog and answers found/not-found from it — never a fabricated
 * yes. Negative answers (not in the catalog) are cached with the catalog version that proved them.
 */
export async function lookupKevPersistent(
  cveInput: string,
  fetchJson?: (url: string, maxBytes: number) => Promise<unknown>,
): Promise<AdapterResult> {
  const cve = parseCveId(cveInput);
  const loadCatalog = async (): Promise<{ catalog: Record<string, unknown>; fetched_at: string } | null> => {
    const [cached] = await sql<CacheRow[]>`
      SELECT payload, fetched_at FROM research_source_cache WHERE source_type = 'kev' AND source_key = 'catalog'`;
    if (!cached) return null;
    const parsed = KevResponseSchema.safeParse(cached.payload);
    if (!parsed.success) return null;
    return { catalog: parsed.data as unknown as Record<string, unknown>, fetched_at: cached.fetched_at.toISOString() };
  };
  const feedUrl = "https://www.cisa.gov/sites/default/files/feeds/known_exploited_vulnerabilities.json";
  let liveCatalog: Record<string, unknown> | null = null;
  try {
    const raw = await (fetchJson ?? defaultFetchJson)(feedUrl, 8 * 1024 * 1024);
    liveCatalog = KevResponseSchema.parse(raw) as unknown as Record<string, unknown>;
    await sql`
      INSERT INTO research_source_cache
        (source_type, source_key, payload, content_hash, source_updated_at, fetched_at)
      VALUES
        ('kev', 'catalog', ${sql.json(liveCatalog as never)}, ${sha256(stableJson(liveCatalog))},
         null, now())
      ON CONFLICT (source_type, source_key) DO UPDATE SET
        payload = EXCLUDED.payload, content_hash = EXCLUDED.content_hash,
        source_updated_at = EXCLUDED.source_updated_at, fetched_at = EXCLUDED.fetched_at, updated_at = now()`;
  } catch (liveError) {
    const cached = await loadCatalog();
    if (!cached) throw liveError;
    const result = kevResultFromCatalog(cve, KevResponseSchema.parse(cached.catalog));
    const evidence = result.evidence[0];
    if (evidence) {
      const refreshed = ResearchEvidenceSchema.parse({
        ...evidence,
        evidence_id: randomUUID(),
        retrieved_at: new Date().toISOString(),
        provenance: { ...(evidence.provenance as Record<string, unknown>), cache_hit: true, cached_at: cached.fetched_at },
      });
      return { ...result, evidence: [refreshed] };
    }
    return { ...result, output: { ...(result.output as Record<string, unknown>), cache_hit: true, cached_at: cached.fetched_at } };
  }
  return kevResultFromCatalog(cve, KevResponseSchema.parse(liveCatalog));
}

export async function fetchVendorAdvisoryPersistent(
  vendorInput: string,
  urlInput: string,
  liveFetch: (vendor: string, url: string) => Promise<AdapterResult> = fetchVendorAdvisory,
): Promise<AdapterResult> {
  const vendor = parseVendorKey(vendorInput);
  const sourceKey = new URL(urlInput).toString();
  try {
    const result = await liveFetch(vendor, sourceKey);
    const evidence = result.evidence.find((item) => item.source_type === "vendor_advisory");
    if (evidence) {
      await sql`
        INSERT INTO research_source_cache
          (source_type, source_key, payload, content_hash, source_updated_at, fetched_at)
        VALUES
          ('vendor_advisory', ${sourceKey}, ${sql.json({ output: result.output, evidence } as never)},
           ${evidence.content_hash}, ${evidence.source_updated_at}, ${evidence.retrieved_at})
        ON CONFLICT (source_type, source_key) DO UPDATE SET
          payload = EXCLUDED.payload, content_hash = EXCLUDED.content_hash,
          source_updated_at = EXCLUDED.source_updated_at, fetched_at = EXCLUDED.fetched_at, updated_at = now()`;
    }
    return result;
  } catch (liveError) {
    const [cached] = await sql<CacheRow[]>`
      SELECT payload, fetched_at FROM research_source_cache
      WHERE source_type = 'vendor_advisory' AND source_key = ${sourceKey}`;
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
    return {
      output: { ...((cached.payload.output as Record<string, unknown> | undefined) ?? {}), cache_hit: true },
      evidence: [evidence],
      receiptIds: [],
    };
  }
}
