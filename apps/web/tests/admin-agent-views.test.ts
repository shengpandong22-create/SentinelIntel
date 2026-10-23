// Run after `npm run build -w @aihot/web`. Real production server/router, synthetic HTTP API only.
// Phase 7 admin views: without a session the admin pages redirect to login; with one they render the
// agent tables through /api/admin/* only.
import assert from "node:assert/strict";
import { spawn, type ChildProcess } from "node:child_process";
import { once } from "node:events";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { after, before, test } from "node:test";
import { fileURLToPath } from "node:url";

let web: ChildProcess;
let origin: string;
let logs = "";
const adminPaths: string[] = [];

const AGENT_RUNS = {
  page: 1,
  rows: [{
    id: 42, publicId: "run-42", storyId: 7, storyTitle: "Fortinet advisory story", agentType: "product-impact",
    graphVersion: "phase6-impact-v1", objective: "Analyze product impact", status: "failed",
    model: "fixture-model", provider: "fixture", promptVersion: "fixture-v1", errorCode: "provider_timeout",
    errorDetail: "the provider did not answer in time", startedAt: "2026-10-20T10:00:00.000Z",
    completedAt: "2026-10-20T10:00:30.000Z", traceId: "abcdef01-2345-6789-abcd-ef0123456789", receiptIds: [9, 10],
  }],
};
const PLANS = [{
  publicId: "plan-1", storyId: 7, storyTitle: "Fortinet advisory story", status: "active", whyTrack: "Watching for the patch.",
  questionCount: 3, openQuestions: 2, nextCheckAt: "2026-10-21T10:00:00.000Z", lastCheckedAt: "2026-10-20T10:00:00.000Z",
  currentIntervalHours: 24, planVersion: 2, lastChangeType: "patch", lastChangeAt: "2026-10-20T09:00:00.000Z",
}];
const REVIEWS = [{
  id: 5, publicId: "review-5", storyId: 7, storyTitle: "Fortinet advisory story", runId: "run-42",
  reason: "medium-confidence impact row needs review: FortiOS", status: "open", payload: { product: "FortiOS", confidence: "medium" },
  createdAt: "2026-10-20T10:00:00.000Z", resolvedAt: null, resolvedBy: null, resolutionReason: null, version: 1,
}];
const IMPACT_REVIEW = {
  rows: [{
    publicId: "impact-1", storyId: 7, storyTitle: "Fortinet advisory story", vendor: "Fortinet", product: "FortiOS",
    confidence: "low", routing: "unknown", persistedKind: "unknown_only", affectedRange: null, fixedRange: null,
    unknowns: ["No machine-readable versions were published."],
    evidence: [{ id: "e1", title: "FortiGuard advisory", url: "https://www.fortiguard.com/advisory" }],
    createdAt: "2026-10-20T10:00:00.000Z",
  }],
};
const EVAL = {
  records: [{
    phase: "Phase 6", title: "Product Impact Agent 端到端闸门（v16）", status: "PASSED — 关闭闸门（MODEL_REVIEWED）",
    doc: "docs/evaluation/impact-e2e-baseline.md",
    recorded: ["v16 单次授权运行：13 项安全计数为 0，5 项质量指标 1.0"],
    limitations: ["标签为 MODEL_REVIEWED，不是 human gold"],
  }],
  note: "以上均为仓库已提交、可复现的评测结论。",
};

const api = createServer((req, res) => {
  const url = new URL(req.url!, "http://api.local");
  const json = (value: unknown) => {
    res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify(value));
  };
  if (url.pathname === "/api/admin/me") return json({ name: "测试管理员", csrf: "csrf", dev: true });
  if (url.pathname === "/api/admin/nav-counts") return json({});
  if (!url.pathname.startsWith("/api/admin/")) return json({});
  adminPaths.push(url.pathname);
  // The synthetic API enforces the same session gate as the real one.
  if (!(req.headers.cookie ?? "").includes("aihot_admin=test")) {
    res.statusCode = 401;
    return json({ code: "unauthorized", detail: "Sign in to the admin first." });
  }
  if (url.pathname === "/api/admin/agent-runs") return json(AGENT_RUNS);
  if (url.pathname === "/api/admin/tracking-plans") return json(PLANS);
  if (url.pathname === "/api/admin/human-reviews") return json(REVIEWS);
  if (url.pathname === "/api/admin/product-impact-review") return json(IMPACT_REVIEW);
  if (url.pathname === "/api/admin/eval-results") return json(EVAL);
  res.statusCode = 404;
  return json({ code: "not_found" });
});

before(async () => {
  api.listen(0, "127.0.0.1");
  await once(api, "listening");
  web = spawn(process.execPath, [fileURLToPath(new URL("../server.ts", import.meta.url))], {
    env: { ...process.env, WEB_PORT: "0", TRUST_PROXY: "false", API_BASE_URL: `http://127.0.0.1:${(api.address() as AddressInfo).port}` },
    stdio: ["ignore", "pipe", "pipe"],
  });
  await new Promise<void>((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error(`web did not start: ${logs}`)), 15_000);
    web.on("exit", () => { clearTimeout(timeout); reject(new Error(`web exited: ${logs}`)); });
    web.stderr!.on("data", (chunk) => { logs += String(chunk); });
    web.stdout!.on("data", (chunk) => {
      logs += String(chunk);
      const match = logs.match(/"msg":"web started","port":(\d+)/);
      if (match) {
        origin = `http://127.0.0.1:${match[1]}`;
        clearTimeout(timeout);
        resolve();
      }
    });
  });
});

after(async () => {
  if (web && web.exitCode === null) {
    web.kill("SIGTERM");
    await once(web, "exit");
  }
  api.closeAllConnections();
  await new Promise<void>((resolve) => api.close(() => resolve()));
});

test("admin agent views redirect to login without a session", async () => {
  for (const path of ["/admin/agent-runs", "/admin/tracking-plans", "/admin/human-reviews", "/admin/product-impact-review", "/admin/eval-results"]) {
    const res = await fetch(`${origin}${path}`, { redirect: "manual" });
    assert.equal(res.status, 302, `${path} must require a session`);
    assert.match(res.headers.get("location") ?? "", /\/admin\/login/);
  }
});

test("signed-in admin sees the agent run table", async () => {
  const res = await fetch(`${origin}/admin/agent-runs`, { headers: { cookie: "aihot_admin=test" } });
  assert.equal(res.status, 200);
  const html = await res.text();
  assert.ok(html.includes("Agent 运行"));
  assert.ok(html.includes("Fortinet advisory story"));
  assert.ok(html.includes("产品影响"));
  assert.ok(html.includes("provider_timeout"));
  assert.ok(html.includes("the provider did not answer in time"));
  assert.ok(html.includes("abcdef01"), "trace id is shown for correlation");
  // Model/provider/prompt-version metadata is admin-safe; the prompt body never is.
  assert.ok(html.includes("fixture-v1"));
  for (const fragment of ["content_hash", "normalized", "capability", "input_snapshot", "usage", "output_proposal"]) {
    assert.ok(!html.includes(fragment), `agent runs page leaked ${fragment}`);
  }
});

test("signed-in admin sees tracking plans, reviews and impact review", async () => {
  const plans = await (await fetch(`${origin}/admin/tracking-plans`, { headers: { cookie: "aihot_admin=test" } })).text();
  assert.ok(plans.includes("追踪计划"));
  assert.ok(plans.includes("Watching for the patch."));
  assert.ok(plans.includes("2/3"), "open/total questions");

  const reviews = await (await fetch(`${origin}/admin/human-reviews`, { headers: { cookie: "aihot_admin=test" } })).text();
  assert.ok(reviews.includes("人工复核"));
  assert.ok(reviews.includes("medium-confidence impact row needs review: FortiOS"));
  assert.ok(reviews.includes("FortiOS"), "payload is visible to the admin");
  assert.ok(reviews.includes("接受"), "medium-confidence rows expose the audited accept command");
  assert.ok(reviews.includes("忽略"), "open rows expose the dismiss command");

  const impact = await (await fetch(`${origin}/admin/product-impact-review`, { headers: { cookie: "aihot_admin=test" } })).text();
  assert.ok(impact.includes("产品影响复核"));
  assert.ok(impact.includes("FortiOS"));
  assert.ok(impact.includes("No machine-readable versions were published."));
  assert.ok(impact.includes("https://www.fortiguard.com/advisory"), "evidence links to the official source");
});

test("eval results page shows recorded conclusions and their limitations", async () => {
  const html = await (await fetch(`${origin}/admin/eval-results`, { headers: { cookie: "aihot_admin=test" } })).text();
  assert.ok(html.includes("评测结论"));
  assert.ok(html.includes("Product Impact Agent 端到端闸门（v16）"));
  assert.ok(html.includes("MODEL_REVIEWED"));
  assert.ok(html.includes("不是 human gold"));
  assert.ok(html.includes("docs/evaluation/impact-e2e-baseline.md"));
});

test("admin pages read only through /api/admin", async () => {
  const before = adminPaths.length;
  await fetch(`${origin}/admin/agent-runs`, { headers: { cookie: "aihot_admin=test" } });
  const used = adminPaths.slice(before);
  assert.ok(used.length > 0 && used.every((p) => p.startsWith("/api/admin/")), `unexpected api paths: ${used.join(", ")}`);
});
