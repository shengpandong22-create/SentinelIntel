# Owner-reviewed selection development labels

Status: `DEVELOPMENT_ONLY`

Recorded on 2026-11-05 from the project owner's forced-choice review. These labels are not a frozen
holdout, do not replace the Phase 1 benchmark, and must not be described as independent security-expert
gold. The owner reviewed title, source and a short content summary without seeing the two model scores.

Label meanings:

- `featured`: important and sufficiently informative for homepage emphasis;
- `ordinary`: relevant security news, but not homepage-featured;
- `noise`: insufficient editorial value for the site;
- `skip`: owner could not decide (none in this batch).

| Article id | Short title | Owner label | Score 1 | Score 2 | Threshold | Current mean decision |
|---|---|---:|---:|---:|---:|---:|
| `wunhlscmhxxnugbw246hnv2ng` | Cisco NX-OS NX-API RCE | featured | 0 | 60 | 32 | not featured |
| `cr9krv1rloo6b1q5y5cf29b9f` | PowerShell RCE advisory revision | ordinary | 21 | 67 | 32 | featured |
| `t88cshbr5n3cyl73ol4iivq1y` | Exchange RCE acknowledgement update | noise | 43 | 0 | 32 | not featured |
| `sd3j0l0d22gtu8ddzbwb0kuuh` | Edge spoofing disclosure | ordinary | 8 | 48 | 32 | not featured |
| `xkntjtdw7a19259qvsexeu4k2` | Windows Shell RCE without remediation detail | noise | 0 | 36 | 32 | not featured |
| `dxhk2butjhoc1yfjswtfzk0sh` | Windows Kernel EoP information update | noise | 50 | 15 | 32 | featured |
| `dyn7b5ap5tm6eop8al31b1bj0` | Brotli decoder issue affecting .NET | featured | 47 | 15 | 32 | not featured |
| `fdrdy6gu58ugizym94sgi3gvz` | Azure Pipelines command injection | ordinary | 18 | 42 | 32 | not featured |

## Small-sample diagnostic

For the binary question `featured` versus `ordinary/noise`, the current mean-of-two policy matches
4/8 labels. Score 1 alone matches 5/8; score 2 alone matches 3/8; requiring both scores to meet the
threshold matches 6/8. These results are descriptive only: the batch was deliberately selected from
large threshold-crossing disagreements, contains only two positive labels, and is too small and
non-random to justify changing the production aggregation rule or threshold.

The useful finding is qualitative: the owner distinguishes a substantive advisory with actionable
version/remediation information from a title-only or information-only revision. A larger blinded batch
should stratify source, severity, remediation detail and information-only revisions before any policy
change is preregistered.

## Batch 2: stratified review

The second batch deliberately mixed actionable advisories, incomplete severe disclosures, routine
updates, information-only revisions and low-value notices. Scores remained hidden during review.

| Article id | Short title | Owner label | Score 1 | Score 2 | Threshold | Current mean decision |
|---|---|---:|---:|---:|---:|---:|
| `b21kdjjtuo737fu9xldaz8o9u` | Nexus MPLS OAM RCE | ordinary | 86 | 80 | 32 | featured |
| `tx0rncpkewvk4as965arw39bg` | FortiSandbox GUI authentication bypass | featured | 55 | 80 | 32 | featured |
| `d2z34q2j7t0fr32ilo5wvxdof` | Fortinet local double-free denial of service | featured | 62 | 48 | 32 | featured |
| `y6ocpxh7wljyxh4eidz9a6ea8` | Snort 3 security-hardening roundup | featured | 79 | 70 | 32 | featured |
| `a810ufc95dwx3dqv8knzf2sue` | Azure AI Foundry SSRF without remediation detail | ordinary | 32 | 29 | 32 | not featured |
| `httolkocjkac7boqnffz2e27r` | Exchange Online RCE without remediation detail | ordinary | 30 | 14 | 32 | not featured |
| `d47puki0c5vq261ist0au18np` | Unified Communications hardening roundup | ordinary | 74 | 74 | 32 | featured |
| `cc0v9otdoetzkv59mrjw90bb5` | Expressway unauthenticated root command execution | featured | 85 | 79 | 32 | featured |
| `epfbusx4ma02cbfg61v30zacp` | ASP.NET Core information-only update | noise | 20 | 35 | 32 | not featured |
| `u8iwohfzpr31uutq2x3glwrjd` | Chromium information leak inherited by Edge | ambiguous | 19 | 43 | 32 | not featured |
| `bzz8nyix3jracstrf7tsgdj0t` | Cisco advance publication notice | ordinary | 71 | 54 | 32 | featured |
| `a78xtobwu4g1atwpg8udmq11c` | FortiSIEM broken authorization | featured | 46 | 46 | 32 | featured |

The Nexus label carries an owner condition: the reviewed summary did not present a complete operational
workaround; a clearly executable workaround would have changed the choice from `ordinary` to
`featured`. The Chromium/Edge item was explicitly judged acceptable as either `ordinary` or `noise`,
so it is recorded as `ambiguous` and excluded from binary strategy comparisons rather than being forced
into a class.

## Combined diagnostic after two batches

There are 19 decisive labels: 7 `featured` and 12 `ordinary/noise`. On this deliberately enriched,
non-random set, the current mean-of-two rule matches 12/19 labels. Score 1 alone also matches 12/19;
score 2 alone matches 10/19; requiring both scores to meet the existing threshold matches 14/19
(5 true positives, 2 false negatives, 3 false positives and 9 true negatives). The apparent 2-case
advantage is not yet a promotion gate: the sample is small, owner-specific and enriched for disagreement.

The more stable product signal is that severity alone is insufficient. The owner promotes advisories
with actionable upgrade or remediation information, but often keeps incomplete disclosures, broad
routine hardening roundups and advance notices as ordinary even when both model scores are high. The
next batch should specifically distinguish complete workarounds from generic "upgrade" language and
should include more low-scoring but actionable advisories before any aggregation change is proposed.

## Batch 3: remediation-quality review

The third batch tested the owner's emerging distinction between a complete, executable mitigation and
generic upgrade language. Scores remained hidden during review.

| Article id | Short title | Owner label | Score 1 | Score 2 | Threshold | Current mean decision |
|---|---|---:|---:|---:|---:|---:|
| `lfshk954d63oosz9z1wrny5yy` | FortiSIEM arbitrary file write with port restriction | featured | 51 | 70 | 32 | featured |
| `q789kpykh3yvrhc4h0jh8w2yw` | FortiOS GUI denial of service with virtual patch | featured | 42 | 82 | 32 | featured |
| `j1revcr8r9gw0bznuv3wpbloa` | Nexus NGOAM RCEs with state-check command | featured | 41 | 58 | 32 | featured |
| `mpd42e3lu69shdb4vb7pbcfjm` | APIC contract bypass with configuration switch | featured | 84 | 85 | 32 | featured |
| `q6bqupwmda6igh3qhpnuf5k74` | Secure Email root file write with update procedure | featured | 84 | 92 | 32 | featured |
| `ml1ifkbfgs4nfrhfabb9has02` | NX-OS Python sandbox escape, upgrade only | ordinary | 50 | 57 | 32 | featured |
| `x14w2ydk4xq1r54joafc2ca7y` | Expressway hardening release, no workaround | ordinary | 67 | 63 | 32 | featured |
| `zjypgfdx5lu3rjhunb9ys4df4` | AAD App Proxy EoP without remediation detail | ordinary | 38 | 43 | 32 | featured |
| `sdjayzrfaomysfr258f72id3n` | Azure Kubernetes configuration-service EoP | noise | 26 | 32 | 32 | not featured |
| `n7d0b0j63vlepju5yjiqaf02c` | Azure VM Inspector EoP without remediation detail | noise | 30 | 35 | 32 | featured |
| `m31j1335sbyko2flqs0juee69` | Chromium authorization issue inherited by Edge | ordinary | 17 | 39 | 32 | not featured |

## Thirty-label checkpoint

The three batches now contain 30 decisive owner labels: 12 `featured` and 18 `ordinary/noise`, plus
one excluded ambiguous label. This is enough for a first product-preference checkpoint, but it remains
a convenience development sample rather than an independently sampled holdout.

| Aggregation policy | Matches | Accuracy | TP | FN | FP | TN |
|---|---:|---:|---:|---:|---:|---:|
| Current mean of two | 19/30 | 0.633 | 10 | 2 | 9 | 9 |
| Score 1 only | 20/30 | 0.667 | 11 | 1 | 9 | 9 |
| Score 2 only | 15/30 | 0.500 | 11 | 1 | 14 | 4 |
| Both scores must pass | 22/30 | 0.733 | 10 | 2 | 6 | 12 |

The stricter two-vote rule reduces false positives from 9 to 6 without changing the current rule's
10/12 recall on owner-featured items. That is a promising development observation, not authorization
to change production: the examples were selected by the system operator, several came from the same
vendors, and the labels express one owner's homepage preference rather than security-expert truth.

The qualitative rule is now consistent across batches: an actionable workaround, virtual patch,
configuration switch, state-check command or concrete update procedure can justify `featured` even for
a narrower vulnerability. Generic upgrade advice, a serious title without remediation detail, or an
information-only update usually remains `ordinary` or `noise`. A production proposal should first turn
that distinction into an explicit prompt rubric, preregister a disjoint development comparison, and
measure whether it preserves recall while reducing false positives.
