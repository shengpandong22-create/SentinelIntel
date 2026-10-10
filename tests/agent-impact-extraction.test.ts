import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import {
  impactExtractionPrompt,
  normalizeExtraction,
} from "@aihot/backend/agents/impact-extraction";
import { ImpactTaskSchema } from "@aihot/backend/agents/impact-contract";

const fixture = JSON.parse(readFileSync(new URL("./fixtures/impact/task.json", import.meta.url), "utf8")) as { task: unknown };
const task = ImpactTaskSchema.parse(fixture.task);

const requests = [{
  request_id: "00000000-0000-4000-8000-000000000301",
  evidence_ids: [task.evidence[0]!.evidence_id],
  focus: "product_versions" as const,
  instructions: "Extract affected and fixed versions exactly.",
}];

test("the extraction prompt carries the requests, evidence identity, and closed output shape", () => {
  const prompt = JSON.parse(impactExtractionPrompt(task, requests)) as {
    requests: Array<{ focus: string; evidence: Array<{ evidence_id: string; url: string }> }>;
    cve_id: string | null;
  };
  assert.equal(prompt.cve_id, "CVE-2026-10001");
  assert.equal(prompt.requests[0]!.evidence[0]!.evidence_id, task.evidence[0]!.evidence_id);
  assert.ok(prompt.requests[0]!.evidence[0]!.url.startsWith("https://"));
});

test("normalizeExtraction flags range support from the matcher, not the model, and drops dangling drafts", () => {
  const allowed = new Set([task.evidence[0]!.evidence_id]);
  const drafts = normalizeExtraction({
    drafts: [
      {
        vendor: "Acme", product: "CamFirm", models: ["CAM-100"], cve_id: "CVE-2026-10001",
        affected_range_raw: ">=1.0,<2.3.5", fixed_range_raw: "2.3.5",
        mitigations: [], confidence: "high", evidence_ids: [task.evidence[0]!.evidence_id],
      },
      {
        vendor: "Acme", product: "LegacyCam", models: [], cve_id: "CVE-2026-10001",
        affected_range_raw: "firmware R-1.0 beta", fixed_range_raw: null,
        mitigations: [], confidence: "high", evidence_ids: [task.evidence[0]!.evidence_id],
      },
      {
        vendor: "Acme", product: "GhostCam", models: [], cve_id: null,
        affected_range_raw: "1.0", fixed_range_raw: null,
        mitigations: [], confidence: "low", evidence_ids: ["00000000-0000-4000-8000-000000000999"],
      },
    ],
    unknowns: ["Firmware range format is not machine-readable."],
  }, allowed);
  assert.equal(drafts.drafts.length, 2);
  const supported = drafts.drafts.find((draft) => draft.product === "CamFirm")!;
  assert.deepEqual(
    { affected: supported.affected_range_supported, fixed: supported.fixed_range_supported },
    { affected: true, fixed: true },
  );
  const unsupported = drafts.drafts.find((draft) => draft.product === "LegacyCam")!;
  assert.equal(unsupported.affected_range_supported, false);
  assert.equal(unsupported.fixed_range_raw, null);
  assert.equal(unsupported.fixed_range_supported, false);
  assert.equal(drafts.drafts.some((draft) => draft.product === "GhostCam"), false);
});

test("extraction fails closed without model calls", async () => {
  const { extractImpactDrafts } = await import("@aihot/backend/agents/impact-extraction");
  await assert.rejects(
    extractImpactDrafts(task, requests, { modelCallsEnabled: false }),
    /Model calls are disabled/,
  );
});
