import assert from "node:assert/strict";
import test from "node:test";
import { msrcVulnerabilityBody } from "@aihot/backend/content/extract";

test("builds an evidence-preserving internal body from an MSRC vulnerability record", () => {
  const body = msrcVulnerabilityBody({
    cveNumber: "CVE-2026-62765",
    cveTitle: "Microsoft Edge Remote Code Execution Vulnerability",
    description: "<p>Access of resource using an incompatible type allows an attacker to execute code over a network.</p>",
    severity: "Important",
    impact: "Remote Code Execution",
    baseScore: "7.5",
    vectorString: "CVSS:3.1/AV:N/AC:H/PR:N/UI:R/S:U/C:H/I:H/A:H",
    publiclyDisclosed: "No",
    exploited: "No",
    customerActionRequired: "Yes",
    latestRevisionDate: "2026-10-27T22:00:00+08:00",
  }, "https://msrc.microsoft.com/update-guide/vulnerability/CVE-2026-62765");
  assert.ok(body);
  assert.match(body.text, /CVE-2026-62765/);
  assert.match(body.text, /Remote Code Execution/);
  assert.match(body.text, /CVSS:3\.1/);
  assert.match(body.text, /Exploited No/);
  assert.doesNotMatch(body.html, /<script/i);
});

test("does not turn a thin API shell into confirmed body text", () => {
  assert.equal(msrcVulnerabilityBody({ cveNumber: "CVE-2026-1", description: "Information published." }, "https://example.test"), null);
});
