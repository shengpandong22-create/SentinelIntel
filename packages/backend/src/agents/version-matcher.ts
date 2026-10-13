// Deterministic version-range matcher for Product Impact claims (Phase 6 contract §7, revision 6).
//
// The MVP grammar is closed: exact versions, the comparators "< <= > >=", closed "a..b" ranges,
// and comma-separated comparator lists. Only plain numeric versions with one to three dot-separated
// parts are accepted (short forms are zero-padded, so "2.0" equals "2.0.0"). Anything else —
// prerelease/build tags, wildcards, free text, vendor firmware naming — is unsupported and must
// become an unknown with human review. Nothing here guesses vendor version ordering.
//
// Revision 6 (contract §13): an expression may be a pipe-separated union of at most 8 branches, each
// branch parsing under the same closed grammar (revision-2 rules: a branch is exact or clauses; a
// closed "a..b" range is its clause form). Unions are what real advisories state (per-branch
// affected sets), but they stay bounded: no nesting, no empty branches, no free text. Any unparsable
// branch makes the whole expression unknown. The matcher parses, normalizes, sorts, and answers
// membership; the model only extracts branch text.

export interface VersionClause {
  op: "<" | "<=" | ">" | ">=" | "==";
  version: string;
}

export type VersionBranch =
  | { kind: "exact"; version: string }
  | { kind: "clauses"; clauses: VersionClause[] };

export type VersionRange = VersionBranch | { kind: "union"; ranges: VersionBranch[] };

const MAX_UNION_BRANCHES = 8;
const MAX_UNION_EXPRESSION_CHARS = 240;
const MAX_CLAUSES_PER_BRANCH = 4;

const VERSION_PATTERN = /^v?(\d{1,5})(?:\.(\d{1,5}))?(?:\.(\d{1,5}))?$/;

function normalizeVersion(raw: string): string | null {
  const match = VERSION_PATTERN.exec(raw.trim());
  if (!match) return null;
  const parts = [match[1]!, match[2] ?? "0", match[3] ?? "0"];
  if (parts.some((part) => part.length > 1 && part.startsWith("0"))) return null;
  return parts.map((part) => String(Number.parseInt(part, 10))).join(".");
}

/** Numeric SemVer-style comparison of one to three dot-separated numeric parts; null when unparsable. */
export function compareVersions(a: string, b: string): -1 | 0 | 1 | null {
  const left = normalizeVersion(a);
  const right = normalizeVersion(b);
  if (!left || !right) return null;
  const [aMajor, aMinor, aPatch] = left.split(".").map(Number);
  const [bMajor, bMinor, bPatch] = right.split(".").map(Number);
  if (aMajor !== bMajor) return aMajor < bMajor ? -1 : 1;
  if (aMinor !== bMinor) return aMinor < bMinor ? -1 : 1;
  if (aPatch !== bPatch) return aPatch < bPatch ? -1 : 1;
  return 0;
}

/**
 * Parses one closed-grammar branch: exact version, comparator list, or closed "a..b" range (which is
 * normalized to its inclusive clause form). Returns null for anything unsupported.
 */
function parseVersionBranch(text: string): VersionBranch | null {
  if (text.length > MAX_UNION_EXPRESSION_CHARS) return null;
  if (text.includes("..")) {
    const [low, high, ...rest] = text.split("..").map((part) => part.trim());
    if (rest.length > 0 || !low || !high) return null;
    const lowVersion = normalizeVersion(low);
    const highVersion = normalizeVersion(high);
    if (!lowVersion || !highVersion) return null;
    if (compareVersions(lowVersion, highVersion) === 1) return null;
    return { kind: "clauses", clauses: [{ op: ">=", version: lowVersion }, { op: "<=", version: highVersion }] };
  }
  const segments = text.split(",").map((part) => part.trim()).filter(Boolean);
  if (segments.length === 0 || segments.length > MAX_CLAUSES_PER_BRANCH) return null;
  const clauses: VersionClause[] = [];
  for (const segment of segments) {
    const match = /^(<=|>=|<|>|==|=)?\s*(.+)$/.exec(segment);
    if (!match) return null;
    const opRaw = match[1] ?? "";
    const version = normalizeVersion(match[2]!);
    if (!version) return null;
    if (segment !== match[0] && /[\s]/.test(match[2]!)) return null;
    if (opRaw === "" || opRaw === "=" || opRaw === "==") {
      if (segments.length > 1) return null;
      return { kind: "exact", version };
    }
    clauses.push({ op: opRaw as VersionClause["op"], version });
  }
  if (clauses.length === 0) return null;
  return { kind: "clauses", clauses };
}

const OP_RANK = { "<": 0, "<=": 1, "==": 2, ">": 3, ">=": 4 } as const;

/** Deterministic branch ordering: exact first, then clause lists compared op-then-version. */
function compareBranches(a: VersionBranch, b: VersionBranch): number {
  if (a.kind === "exact" && b.kind === "exact") return compareVersions(a.version, b.version)!;
  if (a.kind === "exact") return -1;
  if (b.kind === "exact") return 1;
  for (let index = 0; index < Math.max(a.clauses.length, b.clauses.length); index += 1) {
    const clause = a.clauses[index], other = b.clauses[index];
    if (!clause) return -1;
    if (!other) return 1;
    if (clause.op !== other.op) return OP_RANK[clause.op] - OP_RANK[other.op];
    const order = compareVersions(clause.version, other.version);
    if (order !== 0 && order !== null) return order;
  }
  return 0;
}

/**
 * Parses one closed-grammar range expression: a single branch, or a pipe-separated union of at most
 * MAX_UNION_BRANCHES branches (contract §13 revision 6). Returns null for anything unsupported, so
 * callers can degrade to unknown + human review instead of guessing. Unions are sorted canonically;
 * a single branch keeps its plain form.
 */
export function parseVersionRange(raw: string): VersionRange | null {
  const text = raw.trim();
  if (!text || text.length > MAX_UNION_EXPRESSION_CHARS) return null;
  if (!text.includes("|")) return parseVersionBranch(text);
  const branches = text.split("|").map((part) => part.trim());
  if (branches.length > MAX_UNION_BRANCHES || branches.some((branch) => branch.length === 0)) return null;
  const parsed: VersionBranch[] = [];
  for (const branch of branches) {
    const item = parseVersionBranch(branch);
    if (item === null) return null;
    parsed.push(item);
  }
  if (parsed.length === 1) return parsed[0]!;
  return { kind: "union", ranges: parsed.sort(compareBranches) };
}

/** Checks a concrete version against a parsed range; null versions never match (unknown stays unknown). */
export function versionInRange(version: string, range: VersionRange): boolean | null {
  const normalized = normalizeVersion(version);
  if (!normalized) return null;
  if (range.kind === "union") {
    let unknown = false;
    for (const branch of range.ranges) {
      const holds = versionInRange(version, branch);
      if (holds === true) return true;
      if (holds === null) unknown = true;
    }
    return unknown ? null : false;
  }
  const clauses = range.kind === "exact" ? [{ op: "==" as const, version: range.version }] : range.clauses;
  for (const clause of clauses) {
    const order = compareVersions(normalized, clause.version);
    if (order === null) return null;
    const holds = clause.op === "==" ? order === 0
      : clause.op === "<" ? order === -1
      : clause.op === "<=" ? order !== 1
      : clause.op === ">" ? order === 1
      : order !== -1;
    if (!holds) return false;
  }
  return true;
}
