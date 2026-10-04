# SentinelIntel Phase 1 — Tier-gap calibration supplement (24 cases)

## Purpose

This is a **separate calibration supplement**, not an extension of the frozen 200-case benchmark and not part of the 45-case holdout.

It fills two source-tier class gaps observed after the Phase 1 development baseline:

- 12 × **T1_5 negative** hard cases: fresh, concrete ZDI advisories whose direct impact is comparatively low or highly prerequisite-dependent. These cases test whether lowering the T1_5 threshold creates false positives.
- 12 × **T2 positive** hard cases: independent media reports containing active exploitation, concrete patches/mitigations, or consequential incidents. These cases test whether the current T2 threshold suppresses genuinely important media reporting.

Labels are **MODEL_REVIEWED by GPT-5.6 Sol**, not human gold. They should be described as model-reviewed calibration labels.

## Material construction

- Every case is grounded in a real public source listed below.
- `bodyOriginal` is a concise **model-written factual paraphrase**, not a verbatim archive of the source page.
- When the source exposed only a calendar date in the retrieved material, `publishedAt` was normalized to `12:00:00Z` on that date. Exact time-of-day should therefore not be treated as source-ground-truth metadata.
- These cases are for **threshold calibration only**. Keep the original `datasets/selection/candidates.jsonl` frozen.

## T1_5 negative cases — Zero Day Initiative Published Advisories

| Case | Source | Label rationale |
|---|---|---|
| CAL-T15-NEG-001 | https://www.zerodayinitiative.com/advisories/ZDI-26-725/ | Foxit Reader information disclosure, CVSS 3.3, user interaction required, patch available; fresh but low standalone attention value. |
| CAL-T15-NEG-002 | https://www.zerodayinitiative.com/advisories/ZDI-26-718/ | Cisco ISE information disclosure via XXE, authentication/high privileges required, patch available; security-product relevance makes this a useful hard negative. |
| CAL-T15-NEG-003 | https://www.zerodayinitiative.com/advisories/ZDI-26-701/ | Linux kernel information disclosure requiring pre-existing high-privileged local execution; patch available. |
| CAL-T15-NEG-004 | https://www.zerodayinitiative.com/advisories/ZDI-26-697/ | Linux NTFS3 information disclosure requiring local code execution; direct value is mostly as a chaining primitive. |
| CAL-T15-NEG-005 | https://www.zerodayinitiative.com/advisories/ZDI-26-690/ | Linux MCTP information disclosure requiring pre-existing high-privileged local execution. |
| CAL-T15-NEG-006 | https://www.zerodayinitiative.com/advisories/ZDI-26-687/ | Linux Open vSwitch information disclosure; local, higher-complexity, mainly useful in a chain. |
| CAL-T15-NEG-007 | https://www.zerodayinitiative.com/advisories/ZDI-26-660/ | Acrobat Reader information disclosure, CVSS 3.3, user interaction required, patch available. |
| CAL-T15-NEG-008 | https://www.zerodayinitiative.com/advisories/ZDI-26-666/ | Acrobat Reader JPEG2000 information disclosure, CVSS 3.3, user interaction required, patch available. |
| CAL-T15-NEG-009 | https://www.zerodayinitiative.com/advisories/ZDI-26-640/ | VirtualBox information disclosure requiring high privileges in the guest, patch available. |
| CAL-T15-NEG-010 | https://www.zerodayinitiative.com/advisories/ZDI-26-641/ | VirtualBox out-of-bounds read requiring high privileges in the guest, patch available. |
| CAL-T15-NEG-011 | https://www.zerodayinitiative.com/advisories/ZDI-26-631/ | LabVIEW file-parsing information disclosure, CVSS 3.3, user interaction required, patch available. |
| CAL-T15-NEG-012 | https://www.zerodayinitiative.com/advisories/ZDI-26-629/ | Entra ID endpoint information disclosure of limited organizational information; fixed, no active exploitation reported; deliberately near the boundary. |

## T2 positive cases — independent security media

| Case | Source | Label rationale |
|---|---|---|
| CAL-T2-POS-001 | https://www.securityweek.com/critical-f5-big-ip-vulnerability-exploited-as-zero-day/ | F5 BIG-IP CVE-2026-94127, unauthenticated RCE, active exploitation, hotfixes, CISA KEV deadline. |
| CAL-T2-POS-002 | https://www.securityweek.com/check-point-patches-exploited-management-server-zero-day/ | Check Point CVE-2026-93616, CVSS 9.8, unauthenticated script execution, active exploitation, fixes and IoCs. |
| CAL-T2-POS-003 | https://www.securityweek.com/active-exploitation-triggers-emergency-patch-for-cisco-ise-zero-day/ | Cisco ISE CVE-2026-76460, CVSS 10, unauthenticated authentication bypass, exploited, emergency patch. |
| CAL-T2-POS-004 | https://www.securityweek.com/papercut-exploitation-escalates-to-active-intrusions/amp/ | PaperCut CVE-2026-82078/CVE-2026-81578, active intrusions, auth bypass + RCE, emergency patches and bypass of first fix. |
| CAL-T2-POS-005 | https://www.securityweek.com/microsoft-sharepoint-flaw-cve-2026-65660-now-exploited-in-attacks/amp/ | SharePoint CVE-2026-65660, observed exploitation, code execution, existing patch and CISA KEV action. |
| CAL-T2-POS-006 | https://therecord.media/warlock-ransomware-used-in-critical-infrastructure-attacks | Warlock ransomware affecting water, telecom, government and other organizations across multiple regions via SharePoint vulnerabilities. |
| CAL-T2-POS-007 | https://therecord.media/us-uk-warn-of-citrix-netscaler-zero-day-bug | Citrix NetScaler zero-days CVE-2026-88771/CVE-2026-88772, active exploitation, CVSS 9.5, patches and government warnings. |
| CAL-T2-POS-008 | https://therecord.media/shinyhunters-cyberattacks-oracle-mandiant | ShinyHunters resumed exploitation of Oracle PeopleSoft CVE-2026-35273 and adapted around published workarounds; patching is materially actionable. |
| CAL-T2-POS-009 | https://therecord.media/cyberattack-bavaria-germany-utility | Confirmed encryption attack on a Bavarian municipal utility, operational disruption and incident response; essential services remained available. |
| CAL-T2-POS-010 | https://www.darkreading.com/cyberattacks-data-breaches/apple-zero-day-vulnerability-weaponized-targeted-attacks | Apple CVE-2026-86950, CVSS 8.8, active targeted exploitation, iOS/macOS updates. |
| CAL-T2-POS-011 | https://www.darkreading.com/vulnerabilities-threats/sonicwall-sma-1000-zero-days-unauthenticated-rce | Two actively exploited SonicWall SMA 1000 zero-days, including a CVSS 10 pre-auth SSRF and an RCE flaw; immediate patching advised. |
| CAL-T2-POS-012 | https://www.bleepingcomputer.com/news/security/divd-says-zammad-zero-days-enabled-ai-driven-network-breach/ | Two Zammad zero-days enabled session hijacking, RCE and root escalation in a real breach; upgrade/offline guidance is concrete and actionable. |

## Expected file-level distribution

- rows: 24
- `benchmarkSplit=calibration`: 24
- `sourceTier=T1_5`: 12, all `gold.decision=reject`
- `sourceTier=T2`: 12, all `gold.decision=select`
- `MODEL_REVIEWED`: 24

## Suggested evaluation command

```powershell
node --env-file=.env scripts/eval-selection.ts `
  --gold datasets/selection/tier-calibration.jsonl `
  --split calibration `
  --n 24 `
  --seed 7 `
  --models default `
  --concurrency 3 `
  --label "Phase 1 source-tier gap calibration v1"
```

Do not run the 45-case holdout until prompt and tier thresholds are frozen.
