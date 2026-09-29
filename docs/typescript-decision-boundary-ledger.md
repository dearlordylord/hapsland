# TypeScript decisions outside Bend

**Purpose:** Account for reviewed product decisions that Hapsland deliberately makes in TypeScript before or around the canonical Bend reducer, and track candidate boundaries until each is resolved.
**Status:** Active maintained boundary ledger.
**Authority:** Maintained architecture guidance and a record of owner review. Accepted product contracts remain in their named specification owners; this ledger does not grant new runtime support.
**Expected use:** Record reviewed decisions as entries and keep unresolved candidates in the TODO table below. Use source links to check the current implementation and Bend boundary; a TODO is not an approved boundary.
**Lifecycle:** Keep each reviewed entry current with its TypeScript owner, reducer input, and reason for its placement. Work through TODOs one by one: promote an approved TypeScript boundary to a reviewed entry, or record its resolution in the accepted contract and remove the TODO. Review entries when native adapters, canonical events, or accepted product boundaries change. Consolidate superseded entries or delete them after transferring current decisions to their contract owners.

This ledger records **decisions**, not every measurement or external effect. Each entry must name the concrete choice, its TypeScript owner, what Bend receives, why the choice stays outside Bend, and the scope of its review. A new runtime adapter or a move into Bend requires review of the affected entry.

## TS-001 — Recognize a runtime event as a direct edit

| Field | Reviewed boundary |
| --- | --- |
| Decision | For the current direct-edit path, recognize a Codex CLI `PostToolUse` event for `apply_patch`, or a Claude Code `PostToolUse` event for `Edit` or `Write`, as a potential edit observation. The adapter also requires usable runtime identity and its supported success/attribution payload. An event that fails those checks does not become a direct edit observation. |
| TypeScript owner | The native-event adapters in [`src/direct-event/adapter.ts`](../src/direct-event/adapter.ts), entered from [`src/cli.ts`](../src/cli.ts). `isCodexNativeApplyPatch` and `adaptCodexDirectEvent` handle Codex; `adaptClaudeDirectEvent` handles Claude. |
| Bend boundary | Bend does not receive the native hook name, tool name, or raw tool response. After TypeScript has formed an attributed observation, the resident may supply permit and observation-admission events to `Canonical.step`. Recognition alone does not open a round or guarantee that source is eligible for review. |
| Why outside Bend | Runtime-specific event formats, identity fields, tool-result interpretation, and edit attribution belong at the agent-runtime boundary. The reducer operates on bounded, source-free events and cannot inspect those native payloads. The choice of which tool events count remains product behavior and therefore belongs in this ledger. |
| Review and limits | On 2026-09-29 the owner explicitly confirmed that “which runtime event counts as an edit” is correctly outside Bend. The exact current host predicates above describe the implementation; this confirmation does not accept additional runtime event types or claim host/platform validation. Review this entry when a supported hook, tool, success rule, or attribution contract changes. |

The [Codex and Claude adapter checks](../src/direct-event/adapter.ts), [native event identity tests](../src/direct-event/adapter.test.ts), and [Claude edit adapter tests](../src/direct-event/claude-adapter.test.ts) are implementation evidence. File eligibility, admission, and round grouping are separate decisions; they are not silently approved by this entry.

## TS-002 — Identify the advicee from native event identity

| Field | Reviewed boundary |
| --- | --- |
| Decision | TypeScript uses the canonical physical working root, agent runtime and supported version, session ID, and supplied subagent ID to identify the advicee partition. Edits with those same fields share one partition. A native tool-use ID identifies an edit or permit, not the advicee. Missing or unreliable child attribution cannot authorize child-specific advice. |
| TypeScript owner | The [native-event adapters](../src/direct-event/adapter.ts) validate and normalize runtime identity and the working root; [`adviceePartition` in the resident](../src/resident/server.ts) forms the stable partition key. |
| Bend boundary | Bend receives an opaque partition ID in source-free permit, admission, work, capacity, and delivery events. It does not parse native runtime events or infer a working root, session, or subagent from source. Partition identity alone does not open a virtual round; the first accepted attributed edit does. |
| Why outside Bend | The agent runtime supplies these identity fields in its own event format, and physical-root resolution requires filesystem access. TypeScript must establish their meaning and reliability before sending a bounded identity to the reducer. Bend applies the product rules to that established identity. |
| Review and limits | On 2026-09-29 the owner approved this exact identity mapping and its placement in TypeScript. The [accepted advicee contract](advicing-target-contract.md) owns the scope and child-attribution rule. This approval does not decide when to open or close a virtual round, which edits qualify for review, or how capacity is measured. Review when an adapter's identity evidence or supported runtime version changes. |

## TS-003 — Carry native work through one advicee and virtual round

| Field | Reviewed boundary |
| --- | --- |
| Decision | TypeScript owns native and asynchronous effects, while Bend decides their permitted state transitions. TypeScript must report each result with its original advicee and virtual round, including a result that arrives after another round has opened. Multiple edits in one open round share the advicee's capacity account. TypeScript holds the Stop response for the bounded wait, performs requested cancellations, and writes authorized output. |
| TypeScript owner | The [resident](../src/resident/server.ts) owns native jobs, tickets, Stop timers, cancellation, and output; [`CapacityLedger`](../src/resident/capacity.ts) binds asynchronous request IDs to their originating round; [composed delivery](../src/resident/composed-delivery.ts) supplies bounded Stop facts and executes reducer commands. |
| Bend boundary | Bend receives opaque advicee, round, observation, work, request, and ticket IDs plus bounded measured facts. It decides admission and capacity transitions, work settlement, whether Stop continues waiting or reaches its decision, which work to cancel, and whether the selected advice may be presented. TypeScript must not reassign a late result to the current round or create an independent policy result. |
| Why outside Bend | Native hooks, pending promises, filesystem reading, Jev requests, clocks, cancellation handles, and output are effects that the pure reducer cannot execute. TypeScript carries their identity and measured facts; Bend determines the permitted state transitions and commands. |
| Review and limits | On 2026-09-29 the owner approved this division of responsibility, not a particular job structure, timer, or sequence of method calls. The [accepted contract](advicing-target-contract.md) owns the bounded Stop wait: unfinished reviews get time to become advice until settlement or the safe deadline, subject to the continuation limit. Cancellation of work still unfinished at the finish decision is the current simplification, not Stop's purpose. The native round trigger is recorded in TS-004; this entry does not decide specific measurements (TS-007) or particular output preconditions (TS-008). |

## TS-004 — Open a virtual round on the first accepted edit

| Field | Reviewed boundary |
| --- | --- |
| Decision | A synchronous pre-edit permit identifies the edit attempt and guards later admission, but does not open or reserve a virtual round. The first accepted attributed post-edit observation opens that advicee's virtual round. Later fresh edits join it while it is open; after closure only a provably fresh edit may open the next round. Repeated notifications, failed edits, and unused permits cannot open a round. The originating edit is a historical cause, not a promise that the round always retains unfinished work or pending advice. |
| TypeScript owner | The [native adapters](../src/direct-event/adapter.ts) establish whether the post-edit event is an attributed edit. [Composed delivery](../src/resident/composed-delivery.ts) carries its permit and edit identity through resident admission; the [resident](../src/resident/server.ts) starts native work only after canonical admission. |
| Bend boundary | Bend receives source-free permit issue and consumption facts, the opaque advicee and tool identity, and the relevant closure fence. It atomically decides whether the permit is consumed and whether that accepted edit opens or joins a round. TypeScript cannot turn a permit-only event into an open round or independently renew a used tool identity. |
| Why outside Bend | The adapter must read native event order, success and attribution evidence, and source outside the pure reducer. The business rule for when a round starts is in the [accepted contract](advicing-target-contract.md) and enforced by Bend, rather than inferred from TypeScript call order. |
| Review and limits | On 2026-09-29 the owner decided to start the virtual round idempotently at the first accepted edit. This accepts the product rule, not a particular method sequence, data structure, or claim that current work can never be empty. Recheck this boundary if a supported runtime changes its pre-edit ordering or edit identity evidence. |

## TODO — TypeScript choices awaiting boundary review

These are the remaining choices from the owner-facing “Choice made in TypeScript” table. They describe current implementation and unresolved placement, **not owner approval of each TypeScript boundary**. Review them in order; keep the replay walkthrough in the separate [temporary table](issue-147-default-replay-walkthrough.md) for later diagram review. The former per-edit capacity and round split was corrected before this boundary review; it is not a supported alternative.

| ID | Choice currently made in TypeScript | What needs review |
| --- | --- | --- |
| TS-005 | [`ComposedDelivery.registerEditDecision`](../src/resident/composed-delivery.ts) measures hook times, duplicate identities, and round/permit counts and supplies them to Bend's permit decision. | Separate native measurements from policy thresholds and decide which thresholds or predicates must be modeled in Bend. |
| TS-006 | Native [file selection](../src/direct-event/selection.ts), source capture, parsing, and [rule compilation](../src/rules/compiler.ts) establish what code and rules can enter review. | Separate facts that require filesystem/runtime access from product choices about eligible files and applicable rules; verify which choices Bend already owns. |
| TS-007 | The resident [measures encoded objects and selects reservation purposes](../src/resident/server.ts) before Bend enforces capacity for the advicee partition. | Review the measurement contract and purpose mapping. The corrected partition identity does not approve a particular numeric limit. Reconcile the numeric limits in [the supported profile](direct-event-v1-supported-profile.md) with the current code separately. |
| TS-008 | The resident checks credentials, calls Jev, encodes output, and writes to the agent runtime around Bend decisions ([resident](../src/resident/server.ts)). | Keep external effects native, but examine each TypeScript precondition that can deny or change a user-visible result without a Bend decision. |
| TS-009 | The resident starts an [idle timer and cleanup attempt](../src/resident/server.ts) after connection activity. | Decide whether five seconds and the retry schedule are native operation settings or product policy; Bend still checks the cleanup transition. |
