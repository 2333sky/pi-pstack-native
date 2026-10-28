# Documentation index

[Project overview](../README.md) · [中文说明](../README.zh-CN.md)

## Start and operate

| Document | Purpose |
| --- | --- |
| [Chinese user guide](../README.zh-CN.md) | Installation, model setup, commands, workflows, and troubleshooting. |
| [Runtime and maintainer reference](REFERENCE.md) | Agent and workflow behavior, recovery, scheduling, verification, benchmark, and upstream sync. |
| [AI algorithm workflow](ML-WORKFLOWS.zh-CN.md) | Chinese guide to the ML Skill, experiment stages, and open-source tools. |
| [Examples](../examples/README.md) | Strict briefs, policy, templates, CLI, and benchmark examples. |
| [PR protocol](PR-PROTOCOL.md) | Evidence, stack preparation, and authorized delivery. |
| [Statechart](STATECHART.md) | Statechart toolchain and external dependencies. |
| [Live test plan](LIVE-TEST-PLAN.zh-CN.md) · [Windows test record](WINDOWS-MODEL-TEST.zh-CN.md) | Procedure and user-reported Windows model results. |

## Maintain and review

| Document | Purpose |
| --- | --- |
| [Contributing](../CONTRIBUTING.md) · [Security](../SECURITY.md) | Development workflow and vulnerability reporting. |
| [Semantic compatibility](SEMANTIC-COMPATIBILITY.md) · [Parity](../PARITY.md) | Scope of adaptation, limitations, and evidence status. |
| [Pi semantic adapter](PI-SEMANTIC-ADAPTER.md) | Platform substitutions and deliberate deviations. |
| [Dependencies](DEPENDENCIES.md) · [Publishing](PUBLISHING.md) | Locked SDK, dependency review, and release preparation. |
| [Upstream 0.15.36 upgrade](upstream-upgrade-0.15.36.md) · [PR #41 plan](PR-41-ALIGNMENT-PLAN.zh-CN.md) | Source changes, implementation plan, and evidence boundaries. |
| [Changelog](../CHANGELOG.md) | Product changes and earlier version history. |

## Historical records

[Acceptance](../ACCEPTANCE.md), [installation check](../INSTALLATION-CHECK.md), [implementation notes](../IMPLEMENTATION.md), [original PRD](../PRD.md), and [release validation](VALIDATION.md) record earlier snapshots. Their package names, versions, test counts, and pending items describe those snapshots; consult the current compatibility documents and CI for present status. The `upstream-sync/` reports and `vendor/upstream/` snapshots retain provenance and are used by review and drift checks.
