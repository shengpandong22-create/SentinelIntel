// Deterministic version-range matcher for Product Impact claims (Phase 6 contract §7).
//
// The MVP grammar is closed: exact versions, the comparators "< <= > >=", closed "a..b" ranges,
// and comma-separated comparator lists. Only plain numeric versions with one to three dot-separated
// parts are accepted (short forms are zero-padded, so "2.0" equals "2.0.0"). Anything else —
// prerelease/build tags, wildcards, free text, vendor firmware naming — is unsupported and must
// become an unknown with human review. Nothing here guesses vendor version ordering.

export interface VersionClause {
  op: "<" | "<=" | ">" | ">=" | "==";
  version: string;
}

export type VersionRange =
  | { kind: "exact"; version: string }
  | { kind: "clauses"; clauses: VersionClause[] };

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
 * Parses one closed-grammar range expression. Returns null for anything the matcher does not support,
 * so callers can degrade to unknown + human review instead of guessing.
 */
export function parseVersionRange(raw: string): VersionRange | null {
  const text = raw.trim();
  if (!text || text.length > 200) return null;
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
  if (segments.length === 0 || segments.length > 4) return null;
  const clauses: VersionClause[] = [];
  for (const segment of segments) {
    const match = /^(<=|>=|<|>|==|=)?\s*(.+)$/.exec(segment);
    if (!match) return null;
    const opRaw = match[1] ?? "";
    const version = normalizeVersion(match[2]!);
    if (!version) return null;
    if (segment !== match[0] && /[\s]/.test(match[2]!)) return null;
    if (opRaw === "" || opRaw === "=") {
      if (segments.length > 1) return null;
      return { kind: "exact", version };
    }
    if (opRaw === "==") {
      if (segments.length > 1) return null;
      return { kind: "exact", version };
    }
    clauses.push({ op: opRaw as VersionClause["op"], version });
  }
  if (clauses.length === 0) return null;
  return { kind: "clauses", clauses };
}

/** Checks a concrete version against a parsed range; null versions never match (unknown stays unknown). */
export function versionInRange(version: string, range: VersionRange): boolean | null {
  const normalized = normalizeVersion(version);
  if (!normalized) return null;
  const versions = range.kind === "exact" ? [{ op: "==" as const, version: range.version }] : range.clauses;
  for (const clause of versions) {
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
