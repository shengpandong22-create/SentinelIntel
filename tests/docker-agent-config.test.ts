import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

test("Docker passes every agent feature gate to the Python runtime", () => {
  const compose = readFileSync(path.join(root, "docker-compose.yml"), "utf8");
  for (const variable of [
    "AGENT_RESEARCH_ENABLED",
    "AGENT_RESEARCH_NETWORK_ENABLED",
    "AGENT_TRACKING_ENABLED",
    "PRODUCT_IMPACT_ENABLED",
  ]) {
    const expected = `${variable}: \${${variable}:-false}`;
    assert.ok(
      compose.split(/\r?\n/).some((line) => line.trim() === expected),
      `agent service must receive ${variable} with a fail-closed default`,
    );
  }
});
