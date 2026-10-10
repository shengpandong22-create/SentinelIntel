import { closeDb, sql } from "@aihot/backend/db";
const rows = await sql<{ id: number; resp: string }[]>`
  SELECT id, response::text AS resp FROM receipts WHERE id IN (12, 13) ORDER BY id`;
for (const r of rows) {
  const parsed = JSON.parse(r.resp) as { choices?: Array<{ message?: { content?: string } }> };
  console.log("=== receipt", r.id);
  console.log(parsed.choices?.[0]?.message?.content?.slice(0, 1_200));
}
await closeDb();
