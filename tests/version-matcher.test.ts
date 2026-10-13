import assert from "node:assert/strict";
import { test } from "node:test";
import { compareVersions, parseVersionRange, versionInRange } from "@aihot/backend/agents/version-matcher";

test("matcher supports the predeclared closed grammar", () => {
  assert.deepEqual(parseVersionRange("1.2.3"), { kind: "exact", version: "1.2.3" });
  assert.deepEqual(parseVersionRange("v2.0"), { kind: "exact", version: "2.0.0" });
  assert.deepEqual(parseVersionRange("<=1.0.2"), { kind: "clauses", clauses: [{ op: "<=", version: "1.0.2" }] });
  assert.deepEqual(parseVersionRange(">=2.3,<3.0"), { kind: "clauses", clauses: [
    { op: ">=", version: "2.3.0" }, { op: "<", version: "3.0.0" },
  ] });
  assert.deepEqual(parseVersionRange("1.0.0..2.0.0"), { kind: "clauses", clauses: [
    { op: ">=", version: "1.0.0" }, { op: "<=", version: "2.0.0" },
  ] });
});

test("matcher returns null outside the closed grammar so callers can degrade to unknown", () => {
  for (const raw of [
    "", "latest", "*", "1.2.x", "1.0.0-beta", "1.0.0+build.5", "build 5", "R-1.0 beta",
    "!=1.5.0", ">= 1.0 < 2.0", "1.0.0.0", "00.1.2", ">=1.0,<2.0,<3.0,<4.0,<5.0", "2.0..", "..3.0", "3.2.1..1.2.3",
  ]) {
    assert.equal(parseVersionRange(raw), null, `expected unsupported: ${JSON.stringify(raw)}`);
  }
});

test("range membership uses zero-padded numeric ordering and inclusive closed ends", () => {
  const range = parseVersionRange("1.0.0..2.0.0")!;
  assert.equal(versionInRange("1.0.0", range), true);
  assert.equal(versionInRange("2.0.0", range), true);
  assert.equal(versionInRange("2.0.1", range), false);
  assert.equal(versionInRange("2.0", range), true);
  const below = parseVersionRange("<4.19")!;
  assert.equal(versionInRange("4.2", below), true);
  assert.equal(versionInRange("4.19", below), false);
  assert.equal(versionInRange("10.0", below), false);
});

test("unknown concrete versions never match, preserving unknown state", () => {
  const range = parseVersionRange(">=1.0,<2.0")!;
  assert.equal(versionInRange("5 (build 3)", range), null);
  assert.equal(versionInRange("1.2.3-beta", range), null);
});

test("version comparison is numeric, not lexicographic, and rejects unparsable input", () => {
  assert.equal(compareVersions("9.10", "9.9"), 1);
  assert.equal(compareVersions("1.0", "1.0.0"), 0);
  assert.equal(compareVersions("1.0.0-alpha", "1.0.0"), null);
});

// Contract §13 revision 6: bounded range unions.
test("union expressions parse into canonically sorted branches", () => {
  assert.deepEqual(parseVersionRange(">=7.2.0,<7.2.3 | >=7.0.0,<7.0.10"), {
    kind: "union", ranges: [
      { kind: "clauses", clauses: [{ op: ">=", version: "7.0.0" }, { op: "<", version: "7.0.10" }] },
      { kind: "clauses", clauses: [{ op: ">=", version: "7.2.0" }, { op: "<", version: "7.2.3" }] },
    ],
  });
  // A single branch keeps the plain branch representation; a trailing empty branch is forbidden.
  assert.deepEqual(parseVersionRange(">=1.0,<2.0"), { kind: "clauses", clauses: [
    { op: ">=", version: "1.0.0" }, { op: "<", version: "2.0.0" },
  ] });
  // Branch forms stay the closed grammar: exact, comparator list, closed a..b.
  assert.deepEqual(parseVersionRange("1.0.0..2.0.0 | 3.0.0"), {
    kind: "union", ranges: [
      { kind: "exact", version: "3.0.0" },
      { kind: "clauses", clauses: [{ op: ">=", version: "1.0.0" }, { op: "<=", version: "2.0.0" }] },
    ],
  });
  const eight = Array.from({ length: 8 }, (_unused, index) => `>=${index + 1}.0,<${index + 2}.0`).join(" | ");
  assert.equal((parseVersionRange(eight) as { kind: string }).kind, "union");
});

test("unions fail closed on any invalid, empty, over-numerous, or oversized branch", () => {
  for (const raw of [
    ">=1.0,<2.0 | latest",             // one unparsable branch makes the whole expression unknown
    ">=1.0,<2.0 | ",                   // empty branch
    " | >=1.0,<2.0",                   // leading empty branch
    ">=1.0,<2.0 | >=3.0,<4.0 | >=5.0,<6.0 | >=7.0,<8.0 | >=9.0,<10.0 | >=11.0,<12.0 | >=13.0,<14.0 | >=15.0,<16.0 | >=17.0,<18.0", // 9 branches
    `${">=1.0,<2.0 | ".repeat(12)}x`,  // over the length cap
    ">=1.0,<2.0 | >=1.0,<2.0,<3.0,<4.0,<5.0", // over the clause cap in one branch
  ]) {
    assert.equal(parseVersionRange(raw), null, `expected unsupported union: ${JSON.stringify(raw.slice(0, 60))}`);
  }
});

test("union membership is any-branch true, null only for unknown concrete versions", () => {
  const union = parseVersionRange(">=7.2.0,<7.2.3 | >=7.0.0,<7.0.10")!;
  assert.equal(versionInRange("7.0.5", union), true);
  assert.equal(versionInRange("7.2.2", union), true);
  assert.equal(versionInRange("7.0.10", union), false);
  assert.equal(versionInRange("7.1.0", union), false);
  assert.equal(versionInRange("build 12", union), null);
});
