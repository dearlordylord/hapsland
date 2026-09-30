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
| Bend boundary | Bend receives source-free permit issue and consumption facts, the opaque advicee and tool identity, and the relevant closure fence. It atomically decides whether the permit is consumed and whether that accepted edit opens or joins a round. The reducer checks that an accepted state has at most one open round per advicee. TypeScript cannot turn a permit-only event into an open round or independently renew a used tool identity. |
| Why outside Bend | The adapter must read native event order, success and attribution evidence, and source outside the pure reducer. The business rule for when a round starts is in the [accepted contract](advicing-target-contract.md) and enforced by Bend, rather than inferred from TypeScript call order. |
| Review and limits | On 2026-09-29 the owner decided to start the virtual round idempotently at the first accepted edit. This accepts the product rule, not a particular method sequence, data structure, or claim that current work can never be empty. Recheck this boundary if a supported runtime changes its pre-edit ordering or edit identity evidence. |

## TS-005a — Compare the pre-edit window in Bend

| Field | Reviewed boundary |
| --- | --- |
| Decision | TypeScript measures monotonic hook-start and current times and passes them as numeric values. Bend compares the elapsed time with a supplied window and rejects an edit attempt at or after its deadline. Bend also checks that the start is no later than the current reading and later than the prior round's closure. |
| TypeScript owner | [Composed delivery](../src/resident/composed-delivery.ts) reads the native clock, converts milliseconds to lower and upper integer-microsecond bounds, and supplies the window value. Bend uses different bounds for event ordering and the elapsed-time deadline. The current value is 2,500 milliseconds in [the shared hook clock](../src/resident/hook-clock.ts). |
| Bend boundary | [Admission](../packages/agent-flow-bend/Admission.bend) receives start, now, and window values and makes the time comparison. Its permit transition checks the closure fence. The numeric window is an input, so a future configuration can supply another value without moving the comparison back to TypeScript. |
| Why outside Bend | Reading the runtime's monotonic clock and converting units are native measurements. The deadline rule belongs in the reducer. |
| Review and limits | On 2026-09-29 the owner approved moving the time decision into Bend and using today's fixed value while preparing for configuration. Integer-microsecond bounds can conservatively reject a valid attempt near a boundary; they cannot admit an expired or reversed one. This does not approve the particular duration as a permanent product rule or resolve duplicate identities, counts, and capacity limits in the rest of TS-005. |

## TS-005b — Pair pending edit identity and bound completed idempotency

| Field | Reviewed boundary |
| --- | --- |
| Decision | A repeated pre-edit notification while its permit is pending reuses that permit. After settlement, the last 1,000 completed edit identities across the resident cannot receive a new permit; repeats in this window produce a source-free diagnostic. The oldest completed identity is evicted on overflow. A repeat after eviction may be admitted as a new attempt. A repeated post-edit notification without a permit starts no second review. |
| TypeScript owner | [Composed delivery](../src/resident/composed-delivery.ts) pairs the runtime's opaque edit ID with one pending Bend permit. It removes that pairing on consumption, release, expiry, or closure. A resident-wide FIFO of at most 1,000 fixed-size identity digests supplies temporary idempotency and diagnostic detection. The resident writes source-free repeats to a diagnostic file reset at 256 KiB and keeps a fixed-size marker showing that at least one repeat occurred. |
| Bend boundary | [Admission](../packages/agent-flow-bend/Admission.bend) rejects a second permit while the same tool identity is pending, consumes a permit once, and retains no completed tool list. The FIFO decision is currently in TypeScript; moving it into Bend with a bounded global state and proof remains required. |
| Why outside Bend | Reading and pairing native runtime identities is adapter work. The temporary idempotency window remains a TypeScript product decision until Bend owns it; this is explicit debt, not an adapter fact. |
| Review and limits | On 2026-09-29 the owner replaced the earlier resident-lifetime deduplication rule with a bounded 1,000-entry window. This limits completed edit history, not pending permits, open virtual rounds, or retained advicee records. Those records have their own bounds, described in TS-005c, TS-005d, and TS-005h. |

## TS-005c — Bound pending edit permits in Bend

| Field | Reviewed boundary |
| --- | --- |
| Decision | A pending pre-edit permit occupies one slot for its advicee and one slot in the shared resident. Admission requires room under both limits. The starting defaults are 32 per advicee and 4096 across the resident; these are configurable values, not permanent product constants. A consumed, released, expired, or round-closed permit no longer occupies a pending slot. |
| TypeScript owner | The [resident](../src/resident/server.ts) loads user configuration and passes the two limit values through [composed delivery](../src/resident/composed-delivery.ts). The hook passes the path to the user's configuration, when explicitly supplied. Project configuration cannot set shared resident limits. |
| Bend boundary | [Canonical Bend admission](../packages/agent-flow-bend/Canonical.bend) counts pending permits in its own admission state, checks the advicee and resident limits, and reports which limit denied an attempt. TypeScript supplies no current count and makes no capacity verdict. |
| Why outside Bend | Reading the user's configuration is a filesystem effect. The occupancy count and permission to issue a permit are reducer decisions. The limit values are inputs so a user can tune capacity without changing the reducer. |
| Review and limits | On 2026-09-29 the owner chose two configurable limits and the starting values 32 and 4096. This entry covers simultaneous **pending edit permits**, not IPC connections, accepted edits, active rounds, or review capacity. The former accepted-edit event count and its 4096 gate were removed with the lifetime identity history. |

## TS-005d — Count open virtual rounds in Bend

| Field | Reviewed boundary |
| --- | --- |
| Decision | At most 64 virtual rounds may be open in one resident at once. A pre-edit permit does not reserve a round slot. The first accepted edit opens a round if a slot is free; closure releases that slot. An advicee whose virtual round has closed does not occupy open-round capacity. |
| TypeScript owner | [Composed delivery](../src/resident/composed-delivery.ts) pairs native edit notifications with pending permits. It no longer supplies a round count, a new-round verdict, or a round-limit value to the permit gate. |
| Bend boundary | [Canonical Bend](../packages/agent-flow-bend/Canonical.bend) counts open rounds in its own state when the edit consumes its permit and atomically opens or joins a round. A failed opening leaves the permit admission unconsumed. |
| Why outside Bend | Native event pairing remains TypeScript adapter work. The count and admission limit are entirely reducer decisions. |
| Review and limits | On 2026-09-29 the owner chose the 64-record limit to apply to **simultaneously open rounds**, rather than advicees ever seen in a resident lifetime. Completed edit identities have a separate 1,000-entry window. Retained advicee identities have the separate TS-005h bound. An advicee is not itself closed. |

## TS-005h — Bound retained resident identities

| Field | Reviewed boundary |
| --- | --- |
| Decision | Service records must not grow indefinitely just because the resident sees more advicees or edits over its lifetime. A finished virtual round does not keep its native round record. Idle advicee identities and completed collection-token identities can be discarded. If the resident can no longer prove that an edit started after a discarded round, it may reject that edit. This does not withdraw advice already handed to an agent runtime. |
| TypeScript owner | [CapacityLedger](../src/resident/capacity.ts) bounds advicee and token ID maps by count and key bytes and reclaims idle entries. [Composed delivery](../src/resident/composed-delivery.ts) bounds recent completed edit IDs and releases native round records. The [resident](../src/resident/server.ts) releases its matching round and selection records. |
| Bend boundary | [Canonical Bend](../packages/agent-flow-bend/Canonical.bend) forgets inactive admission records, removes delivery counters when a virtual round retires, and compares a prospective edit's start with the freshness floor supplied by TypeScript. Bend still owns the pending-permit and open-round limits in TS-005c and TS-005d. |
| Why outside Bend | The mapping from runtime strings to opaque reducer IDs and the reading of a monotonic clock are native operations. The current numeric metadata caps are implementation limits, not permanent product rules. Moving the whole bounded-history mechanism into Bend remains a future refinement, alongside TS-005b; it is not a prerequisite for continuing this boundary review. |
| Review and limits | On 2026-09-30 the owner accepted the practical bounded-retention approach and explicitly declined a full process-memory audit as the next task. Code inspection and tests cover the identified retained-record paths; this entry does not claim a fixed RSS ceiling for V8, native libraries, or temporary work. The installed pre-edit hook is synchronous, so a late pre-edit hook after that agent's ordinary Stop is a defensive overlap or replay case, not the expected serial path. |

## TODO — TypeScript choices awaiting boundary review

These are the remaining choices from the owner-facing “Choice made in TypeScript” table. They describe current implementation and unresolved placement, **not owner approval of each TypeScript boundary**. Review them in order; keep the replay walkthrough in the separate [temporary table](issue-147-default-replay-walkthrough.md) for later diagram review. The former per-edit capacity and round split was corrected before this boundary review; it is not a supported alternative.

| ID | Choice currently made in TypeScript | What needs review |
| --- | --- | --- |
| TS-006 | TypeScript reads Git and filesystem facts, normalizes paths, matches configured patterns, parses source, and compiles rule packs. Bend already decides file protection, configured file selection, physical/Git admission, rule enablement, and final rule applicability from supplied facts. One rule-target check still returns early in [`selectApplicableRules`](../src/rules/compiler.ts): TypeScript decides whether the rule declares this artifact kind and input contract and whether the prepared input has every declared capability, before Bend sees the candidate. The bundled Noul source-rung check is another TypeScript-supplied fact. | Review the early target/capability check as a product decision: should Bend receive its result and make the final gate, while TypeScript continues to compare schema strings and inspect source? Confirm whether the Noul source-rung result is correctly a native semantic observation. Keep filesystem reads, glob matching, and parsing in TypeScript. |
| TS-007 | The resident [measures encoded objects and selects reservation purposes](../src/resident/server.ts) before Bend enforces capacity for the advicee partition. | Review the measurement contract and purpose mapping. The corrected partition identity does not approve a particular numeric limit. Reconcile the numeric limits in [the supported profile](direct-event-v1-supported-profile.md) with the current code separately. |
| TS-008 | The resident checks credentials, calls Jev, encodes output, and writes to the agent runtime around Bend decisions ([resident](../src/resident/server.ts)). | Keep external effects native, but examine each TypeScript precondition that can deny or change a user-visible result without a Bend decision. |
| TS-009 | The resident starts an [idle timer and cleanup attempt](../src/resident/server.ts) after connection activity. Its timer is TypeScript; Bend checks supplied idle facts and its canonical cleanup state. The canonical check does not currently require the open-round or admission lists to be empty. | Decide whether five seconds and the retry schedule are native operation settings or product policy, and whether an open round or pending pre-edit permit should prevent lifetime retirement. Do not treat the current timer as a Bend-authored decision. |
