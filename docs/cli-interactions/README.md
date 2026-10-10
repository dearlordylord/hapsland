# CLI user journeys

<!--
**Purpose:** Index administration user journeys by the CLI commands that start them and link their generated diagrams.
**Audience:** Contributors, including coding agents; Product and specification owners reviewing CLI journeys.
**Status:** Maintained flow documentation and inventory.
**Authority:** Maintained implementation documentation. [#244](https://github.com/dearlordylord/hapsland/issues/244) and the linked domain contracts own required behavior; test results establish only their executed scope.
**Expected use:** Locate command journeys and their diagrams; use source preflight for UI contracts and manual replay freshness checks when updating their documentation.
**Lifecycle:** Update when a CLI input surface, owner or generated diagram changes. Review when accepted interaction behavior changes or another interactive command is added.
-->

The [architecture decision](../adr/0004-administration-cli-interactions.md) defines ownership, consent and Effect lifetime. Installation and credential behavior remain governed by [installation workflows](../installation-workflows.md). The [testing matrix](../testing-matrix.md) determines required checks.

`node scripts/check-ui-flows.mjs` checks source registration without building dependencies. The supported TypeScript compiler and workspace-build entries run it before compiling. Manual `npm run interaction:diagrams:check` runs registered documentation replays and rejects stale Markdown. [Flow-contract tests](../../scripts/check-ui-flows.test.mjs) exercise missing registrations, diagrams and generators against the real compiler/replay entries; [production replay checks](../../src/onboarding/ui-flow-diagrams.test.ts) run every registered interpreter.

The closed registry binds public journeys to actual CLI handlers through typed `cliJourney` calls. Source preflight verifies those handler bindings and requires every input flow to be reachable from a journey. The registry also governs each prompt owner’s permitted input kinds, shared fragments, child-flow connections and replay generator. Production input uses `flowInteraction`; child effects use typed `childFlow` dispatch. Source preflight rejects unregistered input, undeclared child entries or fragments, missing production dispatches, diagrams and replay mappings. Raw input capabilities are restricted to the fixed transport and composition boundaries. Source preflight enforces workflow registration; the manual documentation check enforces generated-document freshness. Finite replay scenarios do not establish exhaustive transition coverage.

<!-- ui-flow-inventory:start -->

Choose the journey by the command you run. Named-agent variants skip discovery or selection where the command already supplies the agent. This index is generated from the command and parameter declarations used by the CLI parser.

| User journey | CLI command | Diagram |
| --- | --- | --- |
| Set up selected agents | `hapsland setup` | [Journey diagram](setup.md) |
| Set up a named agent | `hapsland setup <client>` | [Journey diagram](setup.md) |
| Save a credential | `hapsland --login` | [Journey diagram](login.md) |
| Update installed agents | `hapsland update`<br>`hapsland update <client>` | [Journey diagram](update.md) |
| Repair an installation | `hapsland repair`<br>`hapsland repair <client>` | [Journey diagram](maintenance.md) |
| Reinstall an agent | `hapsland reinstall`<br>`hapsland reinstall <client>` | [Journey diagram](maintenance.md) |
| Uninstall an agent | `hapsland uninstall`<br>`hapsland uninstall <client>` | [Journey diagram](maintenance.md) |
| Manage rules | `hapsland rules create --id <id>`<br>`hapsland rules connect --path <path>`<br>`hapsland rules enable --id <id>`<br>`hapsland rules disable --id <id>` | [Journey diagram](rules.md) |


Credential verification is a step within setup, not a separate CLI journey. Its [detail diagram](verification.md) explains paid-check approval and recovery. Setup includes credential saving; [login](login.md) also documents the standalone saving command.

Explicit automation and observation commands keep their existing contracts: [unattended setup and lifecycle JSON](../installation-workflows.md), [credential stdin input](../configuration.md), [doctor and dashboard](../status.md), and [rule inspection](../rules.md#editable-rule-files). They do not introduce implicit terminal dialogs.

<!-- ui-flow-inventory:end -->

## Documentation scope

These diagrams describe user-visible navigation, consent and outcomes. Executable generators and focused tests retain the scripted scenarios and assertions; revision counters and command identities are internal test evidence and are not published here.

The diagrams are generated from bounded production replays. They do not establish exhaustive transition coverage, physical terminal readability or installed-platform support. See the [testing matrix](../testing-matrix.md), [runtime and platform support profile](../installed-release-compatibility.md) and [interaction architecture](../adr/0004-administration-cli-interactions.md) for those boundaries. Historical #244 acceptance and validation records remain in Git and the issue tracker.

`npm run interaction:diagrams:write` manually regenerates the flow documents and inventory. `npm run interaction:diagrams:check` manually checks freshness without writing. Builds, gates, Git hooks and CI do not invoke these documentation operations automatically.
