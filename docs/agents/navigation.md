# Repository map

**Purpose:** Route contributors and coding agents to current contracts, implementation owners, checks, and public assets.
**Status:** Active repository navigation.
**Authority:** Maintained guidance; the linked accepted contracts own product behavior, and tests and reports establish only their stated evidence.
**Expected use:** Choose the task below before searching or reading historical material.
**Lifecycle:** Update with file moves, owner changes, and runner or asset changes. Review when a contract is amended or an implementation owner is replaced; remove obsolete entries rather than building a historical index.

## Find the task owner

Paths in the implementation column are entry points, not a complete module inventory.

| Task | Contract or guidance | Implementation entry points | Focused checks |
| --- | --- | --- | --- |
| Understand the product and vocabulary | [Product context](../../CONTEXT.md), [architecture](../architecture.md) | [CLI](../../src/cli.ts) | [Testing matrix](../testing-matrix.md) |
| Change feedback, collection, or finish behavior | [Advice and handoff contract](../advicing-target-contract.md), [Claude blocking decision](../adr/0003-claude-direct-edit-blocking-authority.md) | [Collection and formatting](../../src/resident/collection.ts), [Claude output](../../src/direct-event/claude-output.ts), [composed delivery](../../src/resident/composed-delivery.ts) | [Collection](../../src/resident/collection.test.ts), [Claude delivery](../../src/resident/claude-delivery.test.ts), [terminal collection](../../src/resident/terminal-collection.test.ts) |
| Change resident work, RPC, reuse, or lifetime | [Advice contract](../advicing-target-contract.md), [TypeScript decision ledger](../typescript-decision-boundary-ledger.md) | [Server](../../src/resident/server.ts), [IPC contract](../../src/resident/protocol.ts), [reuse](../../src/resident/evaluation-reuse.ts) | [Server](../../src/resident/server.test.ts), [protocol](../../src/resident/protocol.test.ts), [reuse](../../src/resident/evaluation-reuse.test.ts) |
| Change Bend policy or its generated interface | [Bend package guide](../../packages/agent-flow-bend/README.md), [TypeScript decision ledger](../typescript-decision-boundary-ledger.md) | [Canonical reducer](../../packages/agent-flow-bend/Canonical.bend), [checked adapter](../../src/canonical/adapter.ts) | [Laws and proofs](../../packages/agent-flow-bend/PROOF.bend), [ABI check](../../scripts/check-canonical-authority.mjs), [production authority check](../../scripts/check-production-authority.mjs) |
| Change edit attribution, parsing, or related-code traversal | [Supported event profile](../direct-event-v1-supported-profile.md), [review input contract](../review-contract-compatibility.md), [adding a language](../adding-language-support.md) | [Runtime event adapter](../../src/direct-event/adapter.ts), [analyzer](../../src/direct-event/analyzer.ts), [graph resolver](../../src/direct-event/graph-resolver.ts), [pipeline](../../src/direct-event/pipeline.ts) | [Adapter](../../src/direct-event/adapter.test.ts), [analyzer](../../src/direct-event/analyzer.test.ts), [graph resolver](../../src/direct-event/graph-resolver.test.ts), [pipeline](../../src/direct-event/pipeline.test.ts) |
| Change file selection, configuration, or rules | [Configuration](../configuration.md), [compatibility contract](../review-contract-compatibility.md), [file exclusions decision](../adr/0002-accumulate-file-exclusions.md) | [Configuration](../../src/configuration/index.ts), [file policy](../../src/policy/file-policy.ts), [rule decisions](../../src/rules/decision.ts) | [Configuration](../../src/configuration/configuration.test.ts), [generated configuration check](../../scripts/generate-configuration.ts), [rule decisions](../../src/rules/decision.test.ts) |
| Change review providers, request limits, or transport | [Provider boundary and limits](../review-providers.md), [review input and result identity](../review-contract-compatibility.md#review-input-and-result-identity) | [Provider catalog](../../src/review-providers/catalog.ts), [Effect DecisionModel integration](../../src/jev-decision.ts), [review pipeline](../../src/direct-event/pipeline.ts) | [Cloudflare and limits](../../src/review-providers/cloudflare.test.ts), [Jev](../../src/jev-decision.test.ts), [HTTP wire](../../src/direct-event/provider-http-wire.test.ts), [review wire](../../src/direct-event/review-wire-contract.test.ts) |
| Change setup, update, packaging, or installed hooks | [Installation workflows](../installation-workflows.md), [publishing](../npm-publishing.md), [installed compatibility](../installed-release-compatibility.md) | [Onboarding](../../src/onboarding/), [launcher](../../bin/launch.sh), [local release](../../scripts/local-release.mjs) | [Testing matrix package gates](../testing-matrix.md#which-gate-to-run) |
| Change status or optional session analytics | [Status and analytics](../status.md), [configuration](../configuration.md) | [Status](../../src/activity/status.ts), [analytics](../../src/activity/analytics.ts), [storage limits](../../src/activity/storage.ts) | [Status](../../src/activity/status.test.ts), [analytics](../../src/activity/analytics.test.ts), [storage](../../src/activity/storage.test.ts) |

## Website, diagrams, and brand assets

| Artifact | Owner and entry point |
| --- | --- |
| Public website and Cloudflare deployment | [Visualization package README](../../packages/agent-flow-viz/README.md#public-site-and-shared-import-replay); source starts at [site.ts](../../packages/agent-flow-viz/src/site.ts). Run package commands from `packages/agent-flow-viz`. |
| Production decision dashboard | [Visualization package](../../packages/agent-flow-viz/README.md), [dashboard rules](../../packages/agent-flow-viz/DASHBOARD-RULES.md), [production page](../../packages/agent-flow-viz/src/production-main.ts). |
| Reducer-to-diagram projection | [Projection package](../../packages/agent-flow-projection/README.md), [projection implementation](../../packages/agent-flow-projection/src/index.ts). This derives display evidence from checked transitions; layout belongs to the visualization package. |
| Simulated agent activity | [Monkey Business](../../packages/monkey-business/README.md). Simulation supplies events to the checked reducer; it does not establish native runtime behavior. |
| Approved brand artwork and README animation | [Brand assets](../../assets/brand/), [review animation](../../assets/review-flow.gif). |
| Research, video sources, and rendered presentation | [Sibling research repository](https://github.com/dearlordylord/hapsland-research). In this workspace it is `../hapsland-research`, with video source and render commands under `marketing/video/` and rendered output under `marketing/video/output/`. It is a separate Git checkout; `../research` is not its directory name. |

## Decisions and evidence

Read the current contract and executable check before a milestone report. Use the
[issue tracker guide](issue-tracker.md) when an originating issue or owner decision
is needed. Research is advisory until an accepted contract adopts it.

The [#137 final authority review](https://github.com/dearlordylord/hapsland/issues/137#issuecomment-5873005822)
records the completed authority milestone and its then-current limits. The
[later reconciliation](https://github.com/dearlordylord/hapsland/issues/137#issuecomment-5881756901)
records retired checkpoints and subsequent decisions; neither describes the current
implementation by itself. Current authority placement is in the
[TypeScript decision ledger](../typescript-decision-boundary-ledger.md), contracts,
and structural checks above. The [#170 implementation](https://github.com/dearlordylord/hapsland/pull/171)
removed retained Claude edit tickets; current response authority belongs to the
[advice contract](../advicing-target-contract.md).

Delete superseded snapshots once their useful decisions and validation limits are
in their current owner. Git and GitHub retain the history. Keep repository evidence
only when a current decision, claim, or still-open review requires its provenance.
The [#136 native observations](../issue-136-native-evidence.md) and
[pre-execution declaration](../issue-136-native-run-plan.md) remain linked evidence
through the open #116 owner review; their stated cleanup trigger still applies.
