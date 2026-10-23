// Phase 7 admin auth: every agent-intelligence admin endpoint rejects unauthenticated callers,
// and the public story endpoints never carry admin-only fields. Runs WITHOUT DEV_AUTH_ROLE, so a
// missing session is a real 401 rather than a dev impersonation.
import assert from "node:assert/strict";
import { after, test } from "node:test";
import { buildApp } from "../apps/api/src/app.ts";
import { closeDb } from "@aihot/backend/db";

const app = await buildApp();

after(async () => {
  await app.close();
  await closeDb();
});

const ADMIN_PATHS = [
  "/api/admin/agent-runs",
  "/api/admin/tracking-plans",
  "/api/admin/human-reviews",
  "/api/admin/product-impact-review",
  "/api/admin/eval-results",
];

test("agent-intelligence admin endpoints reject callers without a session", async () => {
  for (const path of ADMIN_PATHS) {
    const res = await app.inject({ method: "GET", url: path });
    assert.equal(res.statusCode, 401, `${path} must require an admin session`);
    assert.ok(!res.body.includes("trace_id"), `${path} must not leak internals to anonymous callers`);
  }
});

test("a forged session cookie is still rejected", async () => {
  const res = await app.inject({ method: "GET", url: "/api/admin/agent-runs", headers: { cookie: "aihot_admin=forged-token-value" } });
  assert.equal(res.statusCode, 401);
});

test("impact review commands reject unauthenticated callers", async () => {
  const res = await app.inject({
    method: "POST",
    url: "/api/admin/human-reviews/1/resolve",
    payload: { action: "dismiss", reason: "not authorized", version: 1 },
  });
  assert.equal(res.statusCode, 401);
});

test("public story endpoints answer without any session and carry no admin fields", async () => {
  const missing = await app.inject({ method: "GET", url: `/api/v1/stories/${"0".repeat(8)}-0000-0000-0000-000000000000` });
  assert.equal(missing.statusCode, 404);
  const body = missing.body;
  for (const fragment of ["payload", "reason", "trace_id", "receipt", "prompt_version", "error_detail"]) {
    assert.ok(!body.includes(fragment), `public error body leaked ${fragment}`);
  }
});
