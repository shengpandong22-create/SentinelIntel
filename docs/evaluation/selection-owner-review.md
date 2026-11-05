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
