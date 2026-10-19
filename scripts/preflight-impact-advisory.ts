import { parseArgs } from "node:util";
import {
  assertVendorAdvisoryUrl,
  fetchVendorAdvisory,
  lookupNvd,
  parseVendorKey,
  searchVendorAdvisories,
} from "@aihot/backend/agents/research-adapters";

const { values } = parseArgs({ options: {
  cve: { type: "string" },
  vendor: { type: "string" },
  advisory: { type: "string" },
} });
if (!values.cve || !values.vendor || !values.advisory) {
  throw new Error("usage: preflight-impact-advisory.ts --cve CVE-... --vendor vendor --advisory https://...");
}

const vendor = parseVendorKey(values.vendor);
const advisory = assertVendorAdvisoryUrl(vendor, values.advisory).toString();
const nvd = await lookupNvd(values.cve);
const references = nvd.evidence.flatMap((entry) => {
  const raw = entry.normalized.references;
  return Array.isArray(raw)
    ? raw.flatMap((item) => item && typeof item === "object" && typeof (item as { url?: unknown }).url === "string"
      ? [(item as { url: string }).url]
      : [])
    : [];
});
if (!references.includes(advisory)) throw new Error("advisory URL is not present in the NVD reference set");

const search = await searchVendorAdvisories(vendor, values.cve, undefined, references);
const candidates = Array.isArray(search.output.candidates) ? search.output.candidates : [];
if (!candidates.some((item) => item && typeof item === "object" && (item as { url?: unknown }).url === advisory)) {
  throw new Error("production vendor search did not retain the official advisory candidate");
}

const fetched = await fetchVendorAdvisory(vendor, advisory);
const evidence = fetched.evidence.find((entry) => entry.source_type === "vendor_advisory" && entry.authority_level === "authoritative");
if (!evidence?.excerpt) throw new Error("production advisory fetch returned no authoritative usable text");
const hasAffected = /affected|through|all versions/i.test(evidence.excerpt);
const hasFixed = /solution|upgrade to|fixed|migrate to a fixed release/i.test(evidence.excerpt);
if (!hasAffected || !hasFixed) throw new Error("advisory text lacks affected-version or explicit fixed/upgrade wording");

process.stdout.write(`${JSON.stringify({
  ok: true,
  cve: values.cve,
  vendor,
  advisory,
  nvd_reference_count: references.length,
  advisory_excerpt_bytes: Buffer.byteLength(evidence.excerpt),
  content_hash: evidence.content_hash,
})}\n`);
