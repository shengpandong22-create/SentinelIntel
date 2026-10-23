import { readFileSync } from "node:fs";
import { sql } from "@aihot/backend/db";
import { KevResponseSchema } from "@aihot/backend/agents/research-adapters";
import { sha256, stableJson } from "@aihot/backend/lib/ids";

// Seeds the KEV catalog cache from a locally fetched copy of the official CISA feed
// (fetched out-of-band, e.g. with PowerShell, on networks where the runtime cannot reach CISA).
// The payload is the parsed official feed, exactly what a successful live lookup would cache.

const feedPath = process.argv[2];
if (!feedPath) throw new Error("usage: seed-kev-cache.ts <path-to-known_exploited_vulnerabilities.json>");
const parsed = KevResponseSchema.parse(JSON.parse(readFileSync(feedPath, "utf8")));
await sql`
  INSERT INTO research_source_cache
    (source_type, source_key, payload, content_hash, source_updated_at, fetched_at)
  VALUES
    ('kev', 'catalog', ${sql.json(parsed as never)}, ${sha256(stableJson(parsed))},
     null, now())
  ON CONFLICT (source_type, source_key) DO UPDATE SET
    payload = EXCLUDED.payload, content_hash = EXCLUDED.content_hash,
    source_updated_at = EXCLUDED.source_updated_at, fetched_at = EXCLUDED.fetched_at, updated_at = now()`;
process.stdout.write(`${JSON.stringify({ ok: true, catalog_version: parsed.catalogVersion, vulnerabilities: parsed.vulnerabilities.length })}\n`);
