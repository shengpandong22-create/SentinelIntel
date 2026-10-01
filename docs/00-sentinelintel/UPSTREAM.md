# SentinelIntel Upstream

## Upstream Project

SentinelIntel is derived from the open-source AIHOT project:

https://github.com/KKKKhazix/AIHOT

AIHOT is licensed under the MIT License.

The original copyright notice and MIT license are preserved in this repository.

## Audited Baseline

SentinelIntel V2 development starts from the following audited AIHOT commit:

f6c2952a9984d4840442558be114ac959b512b0c

Git tag:

aihot-baseline-f6c2952

This commit is the baseline used by the SentinelIntel V2 technical design and migration specification.

## Upstream Relationship

Git remotes are expected to be:

- origin: SentinelIntel repository
- upstream: KKKKhazix/AIHOT

Upstream changes must not be merged automatically.

Any future upstream update must first be reviewed for compatibility with:

1. SentinelIntel Technical Design
2. SentinelIntel Migration Specification
3. existing Evaluation baselines
4. current database migrations
5. Agent Runtime integration

## SentinelIntel-specific Scope

SentinelIntel-specific work focuses on:

- security-domain verticalization
- security-specific selection and event evaluation datasets
- Python Agent Runtime
- Security Research Agent
- long-running Event Tracking Agent
- Product Impact Agent
- security entity normalization
- external evidence management
- Human-in-the-loop
- Agent-specific Evaluation and observability

AIHOT capabilities that already satisfy the project requirements should be reused rather than reimplemented.

## Branding

SentinelIntel must not use the AIHOT name or logo as its own product identity.

The upstream license and attribution remain preserved.
