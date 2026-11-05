import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const path = resolve(root, "docs/interview/SentinelIntel-Interview-Guide.html");
const html = readFileSync(path, "utf8");

test("interview guide is self-contained and has no unfinished placeholders", () => {
  assert.doesNotMatch(html, /<script\b|<link\b|<img\b|https?:\/\//i);
  assert.doesNotMatch(html, /TODO|TBD|待补充|placeholder|lorem ipsum/i);
  assert.match(html, /<style>/);
});

test("every figure is an accessible inline SVG and is referenced by prose", () => {
  const figures = [...html.matchAll(/<figure\s+id="(fig-\d+-[^"]+)"/g)].map((m) => m[1]);
  assert.ok(figures.length >= 7, `expected at least 7 figures, got ${figures.length}`);
  for (const id of figures) {
    const block = html.slice(html.indexOf(`<figure id="${id}"`), html.indexOf("</figure>", html.indexOf(`<figure id="${id}"`)) + 9);
    assert.match(block, /<svg\b[^>]*viewBox=/);
    assert.match(block, /<title\b[^>]*>/);
    assert.match(block, /<desc\b[^>]*>/);
    assert.match(block, /role="img"/);
    assert.match(html, new RegExp(`href="#${id}"`));
  }
});

test("table-of-contents anchors and repository evidence links resolve", () => {
  const ids = new Set([...html.matchAll(/\sid="([^"]+)"/g)].map((m) => m[1]));
  for (const [, href] of html.matchAll(/href="#([^"]+)"/g)) assert.ok(ids.has(href), `missing anchor #${href}`);
  for (const [, relative] of html.matchAll(/href="\.\.\/([^"#]+)(?:#[^"]*)?"/g)) {
    assert.ok(existsSync(resolve(root, "docs", relative)), `missing repository evidence ${relative}`);
  }
});

test("guide covers the full interview learning contract", () => {
  for (const term of [
    "项目定位与上游归属", "Article → Analysis → Fact → Story", "付费请求的回执、预算与恢复", "Security Research Agent",
    "Event Tracking Agent", "Product Impact Agent", "MODEL_REVIEWED", "REPRODUCIBLE_PARTIAL",
    "72 小时", "演示脚本", "高频追问", "学习路线", "证据核验矩阵",
  ]) assert.match(html, new RegExp(term));
});

