import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, before, test } from "node:test";
import "./setup.ts";

process.env.DEV_AUTH_ROLE = "admin";

const { buildApp } = await import("../apps/api/src/app.ts");
const { closeDb, sql } = await import("@aihot/backend/db");
const app = await buildApp();
let storyId: number;
let reviewId: number;

before(async () => {
  const stories = await sql<{ id: number }[]>`
    INSERT INTO stories (public_id, title, first_report_at, latest_at)
    VALUES (${randomUUID()}, 'Review API fixture', now(), now()) RETURNING id`;
  storyId = stories[0]!.id;
  const reviews = await sql<{ id: number }[]>`
    INSERT INTO impact_human_reviews (public_id, story_id, run_id, reason, payload)
    VALUES (${randomUUID()}, ${storyId}, ${randomUUID()}, 'unknown-only fixture',
            ${sql.json({ unknowns: ["No supported claim."] } as never)}) RETURNING id`;
  reviewId = reviews[0]!.id;
});

after(async () => {
  await sql`DELETE FROM audit_log WHERE subject = ${`impact-review:${reviewId}`}`;
  await sql`DELETE FROM impact_human_review_actions WHERE review_id = ${reviewId}`;
  await sql`DELETE FROM impact_human_reviews WHERE id = ${reviewId}`;
  await sql`DELETE FROM stories WHERE id = ${storyId}`;
  await app.close();
  await closeDb();
});

test("admin API resolves a review with CSRF and exposes optimistic conflict", async () => {
  const resolved = await app.inject({
    method: "POST",
    url: `/api/admin/human-reviews/${reviewId}/resolve`,
    headers: { "x-csrf-token": "dev" },
    payload: { action: "dismiss", reason: "No evidence-backed claim.", version: 1 },
  });
  assert.equal(resolved.statusCode, 200, resolved.body);
  assert.equal(resolved.json().status, "dismissed");

  const stale = await app.inject({
    method: "POST",
    url: `/api/admin/human-reviews/${reviewId}/resolve`,
    headers: { "x-csrf-token": "dev" },
    payload: { action: "dismiss", reason: "duplicate", version: 1 },
  });
  assert.equal(stale.statusCode, 409, stale.body);
});
