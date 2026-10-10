import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import {
  ImpactProposalSchema,
  ImpactTaskSchema,
  validateImpactProposal,
  type ImpactTask,
} from "@aihot/backend/agents/impact-contract";

// Shared cross-runtime fixture: the Python schema test parses the same file, proving both runtimes
// accept and reject the same shapes.
const fixture = JSON.parse(readFileSync(new URL("./fixtures/impact/task.json", import.meta.url), "utf8")) as {
  task: unknown;
  proposal: unknown;
};

function task(): ImpactTask {
  return ImpactTaskSchema.parse(fixture.task);
}

test("both runtimes share one impact task fixture and accept it", () => {
  const parsed = task();
  assert.equal(parsed.source_parameters.cve_id, "CVE-2026-10001");
  const proposal = ImpactProposalSchema.parse(fixture.proposal);
  assert.equal(proposal.impact_rows.length, 1);
  assert.equal(validateImpactProposal(parsed, fixture.proposal).decision, "propose");
});

test("poc status is unknown-only in Phase 6", () => {
  const poc = structuredClone(fixture.proposal) as Record<string, unknown>;
  (poc.exploit_status as Record<string, unknown>).poc = "reported";
  assert.throws(() => ImpactProposalSchema.parse(poc), /poc/);
});

test("known_exploited requires KEV-catalog evidence and stays consistent with it", () => {
  const noEvidence = structuredClone(fixture.proposal) as Record<string, unknown>;
  (noEvidence.known_exploited_evidence_ids as string[]) = [];
  assert.throws(() => ImpactProposalSchema.parse(noEvidence), /lacks KEV evidence/);

  const kevTask = task();
  const vendorOnly = structuredClone(fixture.proposal) as Record<string, unknown>;
  (vendorOnly.known_exploited_evidence_ids as string[]) = [kevTask.evidence[0]!.evidence_id];
  assert.throws(() => validateImpactProposal(kevTask, vendorOnly), /not from the KEV catalog/);
});

test("matcher-unsupported ranges are rejected instead of being trusted", () => {
  const bad = structuredClone(fixture.proposal) as { impact_rows: Array<Record<string, unknown>> };
  bad.impact_rows[0]!.affected_range = { raw: "1.2.x", supported: true };
  assert.throws(() => validateImpactProposal(task(), bad), /not matcher-supported/);

  const honest = structuredClone(fixture.proposal) as { impact_rows: Array<Record<string, unknown>> };
  honest.impact_rows[0]!.affected_range = { raw: "firmware R-1.0 beta", supported: false };
  assert.doesNotThrow(() => validateImpactProposal(task(), honest));
});

test("claims must cite task-local evidence and the task CVE", () => {
  const dangling = structuredClone(fixture.proposal) as { impact_rows: Array<Record<string, unknown>> };
  dangling.impact_rows[0]!.evidence_ids = ["00000000-0000-4000-8000-000000000999"];
  assert.throws(() => validateImpactProposal(task(), dangling), /dangling impact evidence/);

  const otherCve = structuredClone(fixture.proposal) as { impact_rows: Array<Record<string, unknown>> };
  (otherCve.impact_rows[0] as Record<string, unknown>).cve_id = "CVE-2026-99999";
  assert.throws(() => validateImpactProposal(task(), otherCve), /another CVE/);
});
