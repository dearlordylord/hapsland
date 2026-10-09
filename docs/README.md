# Documentation guide

<!--
**Purpose:** Route readers to Hapsland documentation by audience and task.
**Audience:** End users; rule authors; contributors, including coding agents; build and release maintainers; product and specification owners.
**Status:** Active documentation navigation.
**Authority:** Maintained navigation; linked documents retain their own contract, guidance, proposal, or evidence authority.
**Expected use:** Choose the task below, then follow its owning guide rather than treating every document as an installation prerequisite.
**Lifecycle:** Update when a task's owner moves or a supported workflow changes; review alongside README and repository-map changes and remove obsolete routes.
-->

## Use and configure Hapsland

| Task | Start here |
| --- | --- |
| Understand the product and review boundaries | [Product introduction](../README.md), [architecture](architecture.md), and [languages and limits](../README.md#languages-and-limits) |
| Install, update, disable, or remove an integration | [Installation workflows](installation-workflows.md); [runtime and platform evidence](installed-release-compatibility.md) |
| Configure file access, context, and privacy | [Configuration](configuration.md) |
| Set up credentials or a review backend | [Credentials and login](installation-workflows.md#credentials-and-login) and [review providers](review-providers.md) |
| Inspect, manage, and test existing rules | [Rules](rules.md) |
| Write your first custom rule | [First-rule walkthrough](write-first-rule.md); use an installed CLI |
| Diagnose readiness or inspect agent reviews | [Doctor, dashboard, status, and analytics](status.md) |
| Understand saturation and review budgets | [Review resources and limits](review-resources.md) |
| Compare existing solutions and inspect examples | [Comparisons with existing solutions](review-studies.md), including Abide architecture and measured studies |

## Build, maintain, and evaluate

| Audience and task | Start here |
| --- | --- |
| Contributors: set up source development and code style | [Contributing](../CONTRIBUTING.md) |
| Contributors and coding agents: find contracts, code, tests, website, or research | [Repository map](agents/navigation.md) and [project instructions](../AGENTS.md) |
| Contributors: select checks and interpret their evidence | [Checks policy](../CHECKS.md), then [testing matrix](testing-matrix.md) |
| Build and release maintainers: assemble and publish | [Publishing runbook](npm-publishing.md), [build contract](build-workflow-contract.md), and [compatibility evidence](installed-release-compatibility.md) |
| Evaluation reviewers: inspect semantic evaluation | [Evaluation protocol](evaluation.md) and [study evidence](review-studies.md) |
| Product and specification owners: locate accepted behavior | [Requirement authority and task owners](agents/navigation.md#requirement-authority), [product context](../CONTEXT.md), and [CLI journeys](cli-interactions/README.md) |

Research and implementation evidence inform decisions; their presence does not
make them accepted product requirements. Consult each document's authority and
limits before using it to justify behavior, release support, or acceptance.
