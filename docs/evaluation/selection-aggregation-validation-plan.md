# Selection aggregation validation plan

Status: `PREREGISTERED_AWAITING_OWNER_LABELS`

This is a development validation of an existing selection decision, not a new Phase and not a rewrite
of the frozen Phase 1 benchmark. It follows the 30-label convenience study in
`selection-owner-review.md` and locks the comparison before the owner sees model scores.

## Question

Does requiring both independent scores to meet the existing source-tier threshold reduce homepage
false positives without materially increasing false negatives, compared with the current rule that the
mean of two scores meets the threshold?

The threshold, two-call model route and prompts remain unchanged for this comparison. The actionable
remediation preference discovered in the convenience set is documented but is not added to the prompt
in the same experiment; prompt-rubric work requires a separate preregistration.

## Labels and blinding

- The owner sees title, source and a concise content summary, but not scores, current selection state or
  the two policies' predictions.
- `featured` is positive; `ordinary` and `noise` are negative; `ambiguous/skip` is excluded.
- These labels represent the owner's editorial preference, not security-expert human gold.
- Labels are appended once. Cases are not replaced after a difficult or ambiguous choice.

## Frozen development cases

The 15 cases below are disjoint from the first 31 reviewed items and are frozen before owner labelling.
They cover actionable remediation, fix-only advice, incomplete severe disclosures, information-only
updates and multi-vulnerability hardening notices.

| Case | Article id | Review title |
|---|---|---|
| VAL-01 | `nwqi6b5utudqw0w4iessmheny` | Cisco IOS XR ASR 9000 packet-processing denial of service |
| VAL-02 | `z9g1wd5hx2edyjzi5y9vpck9a` | Cisco Catalyst SD-WAN Manager API authentication bypass |
| VAL-03 | `bd3cuala9pnpa3i1zavdbnphs` | FortiSandbox Fabric API authentication bypass |
| VAL-04 | `j8x5wws4cfejjd60xvkbocuau` | Cisco APIC unauthorized file access |
| VAL-05 | `ap0m645padgh26v1w37i2naoj` | Cisco UCS UEFI Secure Boot bypass |
| VAL-06 | `foy8a0imewp56dicmolzjofcu` | Cisco NX-OS control-plane denial of service |
| VAL-07 | `os0ns62wyijj2ksmt20lalpuh` | Cisco Finesse server-side request forgery |
| VAL-08 | `kg21fxq9ic6ebusvof3fgr9if` | Microsoft Edge remote code execution disclosure |
| VAL-09 | `dfdw0idwz1e0m1qf7yr5lrgkl` | Microsoft Edge double-free remote code execution disclosure |
| VAL-10 | `c9uqm9gtqkj8ys73cyjfi2e5c` | .NET and Visual Studio remote code execution information update |
| VAL-11 | `qle5v8kl0iicdw9r9fe2hg3ay` | Chromium uninitialized-resource advisory inherited by Edge |
| VAL-12 | `wdwy6pdxf99i7ucnqcpxa3251` | Chromium integer-overflow advisory inherited by Edge |
| VAL-13 | `o79cuhrf32r3er7lqixacxj50` | Cisco Meraki security-hardening release |
| VAL-14 | `gllidxe7kg19dhk2kure0g9kt` | Cisco Secure Email security-hardening release |
| VAL-15 | `ptwpzyf5uy5zxsktiqezndrgw` | Cisco License On-Prem multiple vulnerabilities |

## Locked policies and metrics

- Baseline: `score1 + score2 >= 2 * threshold`.
- Candidate: `score1 >= threshold AND score2 >= threshold`.
- Primary counts: TP, FN, FP and TN against decisive owner labels.
- Secondary metrics: accuracy, featured recall, negative specificity and balanced accuracy.

The candidate passes this small validation only if all are true:

1. at least 12 cases receive decisive labels;
2. candidate false positives are at least two lower than baseline;
3. candidate false negatives increase by no more than one;
4. candidate balanced accuracy is not below baseline.

Passing is evidence for a production-change proposal, not authorization to deploy. A change still needs
a minimal implementation contract, regression tests, canonical CI and an explicit rollback note. Failure
or insufficient decisive labels keeps the current policy unchanged. No frozen holdout is read or rerun.
