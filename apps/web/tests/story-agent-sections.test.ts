// Run after `npm run build -w @aihot/web`. Real production server/router, synthetic HTTP API only.
// Phase 7 Story sections: populated, empty and partial agent states render through the one story
// API response; unknowns stay verbatim; no internal or human-review payload reaches the page.
import assert from "node:assert/strict";
import { spawn, type ChildProcess } from "node:child_process";
import { once } from "node:events";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { after, before, test } from "node:test";
import { fileURLToPath } from "node:url";
import type { StoryDetail } from "@aihot/contracts/site";

let web: ChildProcess;
let origin: string;
let logs = "";
const apiPaths: string[] = [];

function storyBase(publicId: string, title: string): StoryDetail {
  return {
    publicId, title, status: "active", reportCount: 1, sourceCount: 1,
    firstReportAt: "2026-10-01T00:00:00.000Z", latestAt: "2026-10-02T00:00:00.000Z",
    digest: "digest text", digestUpdatedAt: "2026-10-02T01:00:00.000Z", summary: null,
    excerpt: null, latest: "latest development",
    whyHot: { participants48h: 3, newParticipants6h: 1, recentReports24h: 2, observationComplete: true, rank: null, heat: null },
    developments: [], officialReports: [], timeline: [], heat: [], related: [],
  };
}

const populated: StoryDetail = {
  ...storyBase("11111111-1111-1111-1111-111111111111", "Populated agent story"),
  agentIntelligence: {
    present: true,
    dataUpdatedAt: "2026-10-02T02:00:00.000Z",
    reviewRequiredCount: 1,
    research: {
      status: "completed", completedAt: "2026-10-02T02:00:00.000Z",
      summary: "The vendor confirmed in-the-wild exploitation.",
      claims: [{ claimId: "c1", text: "Vendor advisory names affected versions.", criticality: "critical", status: "confirmed", evidenceIds: ["eaa11111-1111-1111-1111-111111111111"] }],
      conflictCount: 1,
    },
    tracking: {
      status: "active", whyTrack: "Patch rollout is still unfolding.",
      questions: [{ questionId: "q1", question: "Will every branch receive the fix?", status: "open" }],
      lastCheckedAt: "2026-10-01T12:00:00.000Z",
    },
    timelineChanges: [{
      id: "t1", changeType: "patch", summary: "A fixed build was published.", evidenceIds: ["eaa11111-1111-1111-1111-111111111111"], createdAt: "2026-10-02T03:00:00.000Z",
    }],
    productImpact: {
      reviewRequiredCount: 1,
      rows: [{
        id: "p1", vendor: "Acme", product: "Widget Platform", models: ["WIDGET-1"], affectedRange: { raw: ">=10.0,<10.2", supported: true },
        fixedRange: { raw: "10.2", supported: true }, mitigations: ["Upgrade to 10.2."], persistedKind: "claims", confidence: "high",
        routing: "auto", reviewRequired: false, exploitStatus: { poc: "unknown", knownExploited: "unknown" }, cveId: "CVE-2026-9999",
        evidenceIds: ["eaa11111-1111-1111-1111-111111111111"], unknowns: ["Whether pre-2024 builds get a backport is unstated."],
      }],
    },
    evidence: [{
      id: "eaa11111-1111-1111-1111-111111111111", sourceType: "vendor_advisory", sourceName: "Acme Security",
      url: "https://vendor.example/advisory-2026", title: "Acme advisory", excerpt: "Versions 10.0 to 10.1 are affected.",
      authorityLevel: "authoritative", publishedAt: "2026-09-30T00:00:00.000Z", retrievedAt: "2026-10-01T00:00:00.000Z",
    }],
    unknowns: [{ source: "research", text: "Which legacy builds ship the vulnerable component?", reason: "The advisory lists only current branches." }],
  },
};

const empty: StoryDetail = {
  ...storyBase("22222222-2222-2222-2222-222222222222", "Empty agent story"),
  agentIntelligence: {
    present: false, dataUpdatedAt: null, reviewRequiredCount: 0, research: null, tracking: null,
    timelineChanges: [], productImpact: { rows: [], reviewRequiredCount: 0 }, evidence: [], unknowns: [],
  },
};

const partial: StoryDetail = {
  ...storyBase("33333333-3333-3333-3333-333333333333", "Partial agent story"),
  agentIntelligence: {
    present: true, dataUpdatedAt: "2026-10-02T02:00:00.000Z", reviewRequiredCount: 0, research: null, tracking: null,
    timelineChanges: [],
    productImpact: {
      reviewRequiredCount: 0,
      rows: [{
        id: "p3", vendor: "Acme", product: "Legacy Widget", models: [], affectedRange: null, fixedRange: null, mitigations: [],
        persistedKind: "unknown_only", confidence: "low", routing: "unknown", reviewRequired: false,
        exploitStatus: { poc: "unknown", knownExploited: "unknown" }, cveId: null, evidenceIds: [],
        unknowns: ["The advisory states no version bounds."],
      }],
    },
    evidence: [],
    unknowns: [{ source: "product_impact", text: "The advisory states no version bounds.", reason: null }],
  },
};

// A story whose only agent signal is a pending human review: the store routes a medium row to
// impact_human_reviews and persists no impact row, so the section must say "under review" rather
// than "no conclusions" — the exact shape the audit found missing.
const reviewOnly: StoryDetail = {
  ...storyBase("44444444-4444-4444-4444-444444444444", "Review-only agent story"),
  agentIntelligence: {
    present: true, dataUpdatedAt: "2026-10-02T04:00:00.000Z", reviewRequiredCount: 1,
    research: null, tracking: null, timelineChanges: [],
    productImpact: { rows: [], reviewRequiredCount: 1 },
    evidence: [], unknowns: [],
  },
};

const api = createServer((req, res) => {
  const url = new URL(req.url!, "http://api.local");
  apiPaths.push(url.pathname);
  res.setHeader("Content-Type", "application/json");
  if (url.pathname === "/api/site/meta") return res.end(JSON.stringify({ changelogVersion: "2026-09-28T12:00" }));
  const story = {
    "11111111-1111-1111-1111-111111111111": populated,
    "22222222-2222-2222-2222-222222222222": empty,
    "33333333-3333-3333-3333-333333333333": partial,
    "44444444-4444-4444-4444-444444444444": reviewOnly,
  }[url.pathname.replace("/api/site/stories/", "")];
  if (story) return res.end(JSON.stringify(story));
  res.statusCode = 404;
  res.end(JSON.stringify({ code: "not_found" }));
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

async function page(publicId: string): Promise<string> {
  const res = await fetch(`${origin}/story/${publicId}`);
  assert.equal(res.status, 200);
  return res.text();
}

const INTERNAL = ["content_hash", "normalized", "provenance", "tool_trace", "trace_id", "receipt", "prompt_version", "error_detail", "input_snapshot"];

test("populated story renders all six agent sections from one API response", async () => {
  const before = apiPaths.length;
  const html = await page("11111111-1111-1111-1111-111111111111");
  for (const heading of ["安全研究", "追踪状态", "时间线变更", "产品影响", "证据", "未知项"]) {
    assert.ok(html.includes(heading), `missing section ${heading}`);
  }
  assert.ok(html.includes("安全研判"), "nav entry missing");
  // Research, tracking, changes and impact content.
  assert.ok(html.includes("The vendor confirmed in-the-wild exploitation."));
  assert.ok(html.includes("Vendor advisory names affected versions."));
  assert.ok(html.includes("Patch rollout is still unfolding."));
  assert.ok(html.includes("A fixed build was published."));
  assert.ok(html.includes("Acme · Widget Platform"));
  assert.ok(html.includes("WIDGET-1"));
  assert.ok(html.includes("&gt;=10.0,&lt;10.2"), "affected range is rendered (html-escaped)");
  assert.ok(html.includes("CVE-2026-9999"));
  // Exploit status and unknowns stay honest.
  assert.ok(html.includes("在野利用：未知"));
  assert.ok(html.includes("Whether pre-2024 builds get a backport is unstated."));
  assert.ok(html.includes("Which legacy builds ship the vulnerable component?"));
  // Evidence links out to the original official source.
  assert.ok(html.includes("https://vendor.example/advisory-2026"));
  assert.ok(html.includes('rel="noopener noreferrer"'));
  // One story request; no separate agent endpoint, no internal state, no review payload.
  const storyFetches = apiPaths.slice(before).filter((p) => p.startsWith("/api/site/stories/"));
  assert.equal(storyFetches.length, 1, "the page must read agent data through the single story DTO");
  assert.ok(apiPaths.slice(before).every((p) => p.startsWith("/api/site/")), "the page only reads the api");
  for (const fragment of INTERNAL) assert.ok(!html.includes(fragment), `leaked ${fragment}`);
});

test("story without agent data renders normally without agent sections", async () => {
  const html = await page("22222222-2222-2222-2222-222222222222");
  assert.ok(html.includes("Empty agent story"));
  assert.ok(!html.includes("安全研究"));
  assert.ok(!html.includes("安全研判"));
  assert.ok(!html.includes("未知项"));
});

test("partial story degrades section by section", async () => {
  const html = await page("33333333-3333-3333-3333-333333333333");
  assert.ok(html.includes("产品影响"));
  assert.ok(html.includes("未知项"));
  // The unknown-only row is never rendered as a conclusion.
  assert.ok(html.includes("未知记录"));
  assert.ok(html.includes("The advisory states no version bounds."));
  // Missing sections do not render and do not error.
  assert.ok(!html.includes("安全研究"));
  assert.ok(!html.includes("追踪状态"));
  assert.ok(!html.includes("时间线变更"));
});

test("a story with only a pending review says so instead of showing no conclusions", async () => {
  const html = await page("44444444-4444-4444-4444-444444444444");
  assert.ok(html.includes("产品影响"));
  assert.ok(html.includes("有 1 条产品影响结论正在人工复核，确认后再展示。"));
  assert.ok(!html.includes("这个事件还没有可展示的产品影响结论。"), "a pending review must not read as 'no conclusions'");
  // No review payload or conclusion text can be inferred from a pending review.
  for (const fragment of INTERNAL) assert.ok(!html.includes(fragment), `leaked ${fragment}`);
});
