// Explicit no-cost development connectivity check. It never writes the database or calls a model.
import { lookupKev, lookupNvd } from "@aihot/backend/agents/research-adapters";

if (process.env.AGENT_RESEARCH_NETWORK_ENABLED !== "true") {
  throw new Error("set AGENT_RESEARCH_NETWORK_ENABLED=true explicitly for the live source check");
}
const cve = process.argv[2] ?? "CVE-2021-44228";
async function check(name: string, call: () => Promise<{ output: Record<string, unknown>; evidence: unknown[]; receiptIds: number[] }>) {
  try {
    const result = await call();
    return { name, ok: true, found: result.output.found, evidence: result.evidence.length, receipts: result.receiptIds.length };
  } catch (error) {
    const code = error instanceof Error && "cause" in error
      ? (error.cause as { code?: string } | undefined)?.code
      : undefined;
    return { name, ok: false, error: code ?? (error instanceof Error ? error.name : "unknown_error") };
  }
}
const [nvd, kev] = await Promise.all([
  check("nvd", () => lookupNvd(cve)),
  check("kev", () => lookupKev(cve)),
]);
process.stdout.write(`${JSON.stringify({
  ok: nvd.ok && kev.ok,
  cve,
  nvd,
  kev,
})}\n`);
if (!nvd.ok || !kev.ok) process.exitCode = 1;
