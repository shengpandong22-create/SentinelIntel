import { closeDb, sql } from "@aihot/backend/db";
const id = Number(process.argv[2] ?? 25);
const rows = await sql<{ story_id: number; source_type: string; authority_level: string; title: string }[]>`
  SELECT story_id, source_type, authority_level, title FROM external_evidence WHERE story_id = ${id} ORDER BY id`;
for (const r of rows) console.log(r.story_id, r.source_type, r.authority_level, "::", (r.title ?? "").slice(0, 100));
await closeDb();
