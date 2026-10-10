import { closeDb, sql } from "@aihot/backend/db";
const rows = await sql<{ id: number; service: string; model: string | null; status: string; resp: string }[]>`
  SELECT id, service, model, status, left(response::text, 800) AS resp FROM receipts ORDER BY id`;
for (const r of rows) console.log(r.id, r.service, r.model, r.status, "::", String(r.resp).slice(0, 500));
await closeDb();
