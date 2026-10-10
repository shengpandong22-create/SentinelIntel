import { closeDb, sql } from "@aihot/backend/db";
const rows = await sql<{ story_id: number; source_type: string; title: string; excerpt: string }[]>`
  SELECT story_id, source_type, title, excerpt FROM external_evidence WHERE story_id = 14 ORDER BY id`;
for (const r of rows) {
  console.log("=== story", r.story_id, r.source_type, "::", (r.title ?? "").slice(0, 120));
  console.log("excerpt[", (r.excerpt ?? "").length, "]:", (r.excerpt ?? "").slice(0, 600).replace(/\s+/g, " "));
}
await closeDb();
