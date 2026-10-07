# TypeScript decisions outside Bend

**Purpose:** Account for reviewed product decisions that Hapsland deliberately makes in TypeScript before or around the canonical Bend reducer.
**Status:** Active maintained boundary ledger.
**Authority:** Maintained architecture guidance and a record of owner review. Accepted product contracts remain in their named specification owners; this ledger does not grant new runtime support.
**Expected use:** Use reviewed entries and source links to check the current implementation and Bend boundary. New unresolved candidates may be tracked separately until reviewed.
**Lifecycle:** Keep each reviewed entry current with its TypeScript owner, reducer input, and reason for its placement. Review entries when native adapters, canonical events, or accepted product boundaries change. Consolidate superseded entries or delete them after transferring current decisions to their contract owners.

The documentation generator owns each `TypeScript owner` row and the marked code-derived appendix. Owner selections are descriptive annotations; source paths resolve from current private exports. Decision, boundary, rationale and review prose remain authored guidance.

This ledger records **decisions**, not every measurement or external effect. Each entry must name the concrete choice, its TypeScript owner, what Bend receives, why the choice stays outside Bend, and the scope of its review. A new runtime adapter or a move into Bend requires review of the affected entry.

The synchronous [canonical adapter](../packages/canonical-policy/src/canonical/adapter.ts) and
[import-graph adapter](../packages/canonical-policy/src/canonical/graph-adapter.ts) validate representations
with Effect Schema. Their [canonical models](../packages/canonical-policy/src/canonical/models.ts),
[constructor schemas](../packages/canonical-policy/src/canonical/constructors.ts), and
[graph schemas](../packages/canonical-policy/src/canonical/graph-schema.ts) own exact field sets and numeric
shape constraints. The [shared boundary codecs](../packages/canonical-policy/src/canonical/boundary-schema.ts)
check array size before visiting elements and traverse linked lists iteratively
with fixed bounds. These checks establish representation validity; generated Bend
remains the sole authority for admission, dispatch, reuse and delivery decisions.
Schema decoding preserves the canonical state identity fence and synchronous
atomic publication. Registered snapshots and projections remain immutable;
weak-key projection memoization does not admit foreign canonical copies.
The [boundary tests](../src/canonical/boundary.test.ts) and
[authority check](../scripts/check-canonical-authority.mjs) provide deterministic
validation evidence. The [adapter benchmark](../scripts/benchmark-canonical-adapters.mjs)
compares fixed traces across checkouts; it does not declare a new timing budget or
establish native platform support.

## Decision-family coverage

The authority consolidation uses `Canonical.step` for resident transitions and
the specialized `ImportGraph` reducer for source-free reference exploration.
Both have checked shared adapters. The reviewed native entries below are not
a second resident policy engine.

| Decision family | Current authority | Native boundary and independent checks |
| --- | --- | --- |
| Runtime edit recognition and advicee attribution | Reviewed TypeScript placement in TS-001 and TS-002; Bend admits the resulting opaque identity | [Runtime event tests](../src/direct-event/adapter.test.ts), [Claude attribution](../src/direct-event/claude-adapter.test.ts), and [Pi attribution](../src/direct-event/pi-adapter.test.ts) check accepted payloads and uncertain identity. Recognition does not authorize source use or open a round. |
| Configuration precedence, file selection, rule eligibility, finding thresholds and ranking | Canonical configuration and rule events; `ImportGraph` controls reference traversal and budget outcomes | [Configuration](../src/configuration/configuration.test.ts), [rule decisions](../src/rules/decision.test.ts), and [graph authority](../src/direct-event/graph-resolver-authority.test.ts) check separately expected decisions. TS-006 keeps parsing, authored data, physical/Git facts, and pattern matches native. |
| Permits, round opening, work callbacks, shared capacity and scheduling | Canonical admission, round, work, ledger and dispatch transitions | [Capacity](../src/resident/capacity.test.ts), [dispatch](../src/resident/dispatch.test.ts), and [composed delivery](../src/resident/composed-delivery.test.ts) check lifetime/round fences and accounting. TS-003 through TS-007 retain identity maps, clocks, native jobs and byte measurements. |
| Backend authorization, physical settlement, supersession and reuse/cache | Canonical request, revision, reuse and cache transitions | [Request lifecycle](../src/resident/jev-request.test.ts), [revision](../src/resident/revision.test.ts), and [reuse](../src/resident/evaluation-reuse.test.ts) check saturation, stale outcomes, shared work and exact release. TS-008 and TS-010 retain external effects and provider-native input validation. |
| Finding collection, output fit, leases, submission, Stop and continuation | Canonical collection, handoff, delivery, submission and finish transitions | [Collection](../src/resident/collection.test.ts) and [terminal collection](../src/resident/terminal-collection.test.ts) check independently expected output and closure behavior. TS-008 measures the final encoded response; a native write is distinct from its decision and from model visibility. |
| Notices, expiry, identities with length limits and safe cleanup | Canonical notice, retention, round and cleanup transitions, with reviewed native identity limits in TS-005h | [Operational notices](../src/resident/operational-notices.test.ts) and [resident process cases](../src/resident/subprocess.test.ts) check logical and physical boundaries separately. TS-009a/TS-009b schedule checks and supply facts rather than closing rounds by native timer alone. |
| State/event representation and compiled ABI | Shared checked adapters and Effect Schema representation validation | [Boundary](../src/canonical/boundary.test.ts), [immutable state](../src/canonical/adapter.test.ts), and [constructor/ABI checks](../scripts/check-canonical-authority.mjs) reject malformed or foreign values. Validation cannot synthesize an admission or delivery decision. |
| Diagram state and route evidence | Checked reducer replay and read-only [flow projection](../packages/agent-flow-projection/README.md) | [Projection checks](../packages/agent-flow-viz/scripts/check-projection.mjs) verify supplied events, commands and state. Layout and display remain TypeScript; a highlighted command does not establish a completed native effect. |

The [production authority check](../scripts/check-production-authority.mjs)
rejects direct generated-policy consumers in production and the dashboard and
checks that work/round consumers are views or native bindings. The retained
standalone `Lifecycle` test model and `Flow` capacity dependency are not
production transition entry points. Their historical model results do not
substitute for canonical resident evidence.

Static import and ownership checks establish their scanned boundary, not every
possible dynamic execution or native race. Independent canonical traces,
resident scenarios and separately scoped native observations remain necessary.
The [#116 closure record](https://github.com/dearlordylord/hapsland/issues/116)
owns the dated acceptance accounting; this maintained table must follow future
owner or implementation changes rather than preserving that snapshot.

## TS-001 — Recognize a runtime event as a direct edit

| Field | Reviewed boundary |
| --- | --- |
| Decision | For the current direct-edit path, recognize a Codex CLI `PostToolUse` event for `apply_patch`, or a Claude Code `PostToolUse` event for `Edit` or `Write`, or a Pi 1.0.0 successful top-level native `edit` result, as a potential edit observation. Pi requires correlated tool-call identity and arguments, and successful unified-patch material verified against bounded ASCII current source; `write`, nested/child calls, failed results, unsupported versions, and mismatched evidence do not become attributed edits. Pi derives changed ranges from the native result patch independently of replacement grouping, including replacements spanning omitted context between hunks. Codex and Pi share post-edit patch verification; Pi uses native coordinates without a text-search fallback, while Codex requires unique text placement. The adapter also requires usable runtime identity and its supported success/attribution payload. An event that fails those checks does not become a direct edit observation. |
| TypeScript owner | [@hapsland/native-observation/direct-event/adapter](../packages/native-observation/src/direct-event/adapter.ts); [@hapsland/native-observation/direct-event/pi-adapter](../packages/native-observation/src/direct-event/pi-adapter.ts) |
| Bend boundary | Bend does not receive the native hook name, tool name, or raw tool response. After TypeScript has formed an attributed observation, the resident may supply permit and observation-admission events to `Canonical.step`. Recognition alone does not open a round or guarantee that source is eligible for review. |
| Why outside Bend | Runtime-specific event formats, identity fields, tool-result interpretation, and edit attribution belong at the agent-runtime boundary. The reducer operates on size-limited, source-free events and cannot inspect those native payloads. The choice of which tool events count remains product behavior and therefore belongs in this ledger. |
| Review and limits | On 2026-09-29 the owner explicitly confirmed that “which runtime event counts as an edit” is correctly outside Bend. The Pi entry implements the edit-only scope accepted in [#204](https://github.com/dearlordylord/hapsland/issues/204) and [#205](https://github.com/dearlordylord/hapsland/issues/205), applying that same TypeScript placement. The exact current host predicates above describe the implementation; this confirmation does not accept additional runtime event types or claim host/platform validation. Review this entry when a hook, tool, success rule, or attribution contract changes. |

The [Pi attribution checks](../src/direct-event/pi-adapter.test.ts) and [installed extension boundary](../src/pi/installed-boundary.test.ts) establish deterministic evidence separately from native support in the [Pi guide](pi-installation.md). The [Codex and Claude adapter checks](../packages/native-observation/src/direct-event/adapter.ts), [native event identity tests](../src/direct-event/adapter.test.ts), and [Claude edit adapter tests](../src/direct-event/claude-adapter.test.ts) are implementation evidence. File eligibility, admission, and round grouping are separate decisions; they are not silently approved by this entry.

## TS-002 — Identify the advicee from native event identity

| Field | Reviewed boundary |
| --- | --- |
| Decision | TypeScript uses agent runtime and accepted version, session ID, and reliably supplied subagent ID to identify the root-independent recipient. Source partitions additionally qualify that recipient by physical working root; the first admitted eligible edit pins the round to its target root (#246). A native tool-use ID identifies an edit or permit, not the advicee. Missing or unreliable child attribution cannot authorize child-specific advice. Pi 1.0.0 uses runtime/version and session manager session ID for the recipient, and native tool call ID plus target root for its edit permit; nested calls and child identities are unsupported rather than reassigned to the main session. |
| TypeScript owner | [@hapsland/native-observation/direct-event/adapter](../packages/native-observation/src/direct-event/adapter.ts); [@hapsland/native-observation/direct-event/pi-adapter](../packages/native-observation/src/direct-event/pi-adapter.ts) |
| Bend boundary | Bend receives an opaque partition ID in source-free permit, admission, work, capacity, and delivery events. It does not parse native runtime events or infer a working root, session, or subagent from source. Partition identity alone does not open a virtual round; the first accepted attributed edit does. |
| Why outside Bend | The agent runtime supplies these identity fields in its own event format, and physical-root resolution requires filesystem access. TypeScript must establish their meaning and reliability before sending a identity with length limits to the reducer. Bend applies the product rules to that established identity. |
| Review and limits | On 2026-09-29 the owner approved the original identity mapping; [#246](https://github.com/dearlordylord/hapsland/issues/246) subsequently separates recipient identity from physical source identity and its placement in TypeScript. The [accepted advicee contract](advicing-target-contract.md) owns the scope and child-attribution rule. This approval does not decide when to open or close a virtual round, which edits qualify for review, or how capacity is measured. Review when an adapter's identity evidence or runtime version accepted by the adapter changes. |

## TS-003 — Carry native work through one advicee and virtual round

| Field | Reviewed boundary |
| --- | --- |
| Decision | TypeScript owns native and asynchronous effects, while Bend decides their permitted state transitions. TypeScript must report each result with its original advicee and virtual round, including a result that arrives after another round has opened. Multiple edits in one open round share the advicee's capacity account. TypeScript holds the Stop response for the bounded wait, performs requested cancellations, and writes authorized output. |
| TypeScript owner | [@hapsland/resident-runtime/resident/composed-delivery](../packages/resident-runtime/src/resident/composed-delivery.ts) |
| Bend boundary | Bend receives opaque advicee, round, observation, work, and request IDs plus bounded measured facts. It decides admission and capacity transitions, work settlement, whether Stop continues waiting or reaches its decision, which work to cancel, and whether the selected advice may be presented. TypeScript must not reassign a late result to the current round or create an independent policy result. |
| Why outside Bend | Native hooks, pending promises, filesystem reading, Jev requests, clocks, cancellation handles, and output are effects that the pure reducer cannot execute. TypeScript carries their identity and measured facts; Bend determines the permitted state transitions and commands. |
| Review and limits | On 2026-09-29 the owner approved this division of responsibility, not a particular job structure, timer, or sequence of method calls. The [accepted contract](advicing-target-contract.md) owns the bounded Stop wait: unfinished reviews get time to become advice until settlement or the safe deadline, subject to the continuation limit. Cancellation of work still unfinished at the finish decision is the current simplification, not Stop's purpose. The [Pi transport](../packages/hook-runtime/src/pi/transport.ts) supplies the same shared admission, collection, and four-second finish effects. Its awaited native settlement handler proposes a custom message and continuation; Pi validates the final resulting context after all handlers, so an initial assistant-ending preview is not a final refusal. The native round trigger is recorded in TS-004; this entry does not decide specific measurements (TS-007) or particular output preconditions (TS-008). |

## TS-004 — Open a virtual round on the first accepted edit

| Field | Reviewed boundary |
| --- | --- |
| Decision | A synchronous pre-edit permit identifies the edit attempt and guards later admission, but does not open or reserve a virtual round. The first accepted attributed post-edit observation opens that advicee's virtual round. Later fresh edits join it while it is open; after closure only a provably fresh edit may open the next round. Repeated notifications, failed edits, and unused permits cannot open a round. The originating edit is a historical cause, not a promise that the round always retains unfinished work or pending advice. |
| TypeScript owner | [@hapsland/resident-runtime/resident/composed-delivery](../packages/resident-runtime/src/resident/composed-delivery.ts) |
| Bend boundary | Bend receives source-free permit issue and consumption facts, the opaque advicee and tool identity, and the relevant closure fence. It atomically decides whether the permit is consumed and whether that accepted edit opens or joins a round. The reducer checks that an accepted state has at most one open round per advicee. TypeScript cannot turn a permit-only event into an open round or independently renew a used tool identity. |
| Why outside Bend | The adapter must read native event order, success and attribution evidence, and source outside the pure reducer. The business rule for when a round starts is in the [accepted contract](advicing-target-contract.md) and enforced by Bend, rather than inferred from TypeScript call order. |
| Review and limits | On 2026-09-29 the owner decided to start the virtual round idempotently at the first accepted edit. This accepts the product rule, not a particular method sequence, data structure, or claim that current work can never be empty. Recheck this boundary if a runtime changes its pre-edit ordering or edit identity evidence. |

## TS-005a — Compare the pre-edit window in Bend

| Field | Reviewed boundary |
| --- | --- |
| Decision | TypeScript measures monotonic hook-start and current times and passes them as numeric values. Bend compares the elapsed time with a supplied window and rejects an edit attempt at or after its deadline. Bend also checks that the start is no later than the current reading and later than the prior round's closure. |
| TypeScript owner | [@hapsland/resident-runtime/resident/composed-delivery](../packages/resident-runtime/src/resident/composed-delivery.ts) |
| Bend boundary | [Admission](../packages/agent-flow-bend/Admission.bend) receives start, now, and window values and makes the time comparison. Its permit transition checks the closure fence. The numeric window is an input, so a future configuration can supply another value without moving the comparison back to TypeScript. |
| Why outside Bend | Reading the runtime's monotonic clock and converting units are native measurements. The deadline rule belongs in the reducer. |
| Review and limits | On 2026-09-29 the owner approved moving the time decision into Bend and using today's fixed value while preparing for configuration. Integer-microsecond bounds can conservatively reject a valid attempt near a boundary; they cannot admit an expired or reversed one. This does not approve the particular duration as a permanent product rule or resolve duplicate identities, counts, and capacity limits in the rest of TS-005. |

## TS-005b — Map native edit identity into Bend

| Field | Reviewed boundary |
| --- | --- |
| Decision | A repeated pre-edit notification while its permit is pending reuses that permit. After settlement, completed edit identities within the declared resident-wide history bound cannot receive a new permit; repeats in this window produce a source-free diagnostic. The oldest completed identity is evicted on overflow. A repeat after eviction may be admitted as a new attempt. A repeated post-edit notification without a permit starts no second review. |
| TypeScript owner | [@hapsland/resident-runtime/resident/composed-delivery](../packages/resident-runtime/src/resident/composed-delivery.ts) |
| Bend boundary | [Admission](../packages/agent-flow-bend/Admission.bend) owns pending permit uniqueness. [Edit history](../packages/agent-flow-bend/EditHistory.bend), inside the [canonical reducer](../packages/agent-flow-bend/Canonical.bend), owns the bounded resident-wide completed-history window, repeat decision, first-repeat reporting flag, and eviction order. |
| Why outside Bend | Reading native runtime identities, maintaining their opaque numeric mapping, and writing diagnostic output are adapter operations. TypeScript makes no completed-history retention or repeat-admission decision. |
| Review and limits | The declared window limits completed edit history, not pending permits, open virtual rounds, or retained advicee records. Those records have their own bounds, described in TS-005c, TS-005d, and TS-005h. |

## TS-005c — Bound pending edit permits in Bend

| Field | Reviewed boundary |
| --- | --- |
| Decision | A pending pre-edit permit occupies one slot for its advicee and one slot in the shared resident. Admission requires room under both limits. The [generated configuration reference](configuration.md) owns the current configurable defaults; they are not permanent product constants. A consumed, released, expired, or round-closed permit no longer occupies a pending slot. |
| TypeScript owner | [@hapsland/resident-runtime/resident/composed-delivery](../packages/resident-runtime/src/resident/composed-delivery.ts) |
| Bend boundary | [Canonical Bend admission](../packages/agent-flow-bend/Canonical.bend) counts pending permits in its own admission state, checks the advicee and resident limits, and reports which limit denied an attempt. TypeScript supplies no current count and makes no capacity verdict. |
| Why outside Bend | Reading the user's configuration is a filesystem effect. The occupancy count and permission to issue a permit are reducer decisions. The limit values are inputs so a user can tune capacity without changing the reducer. |
| Review and limits | This entry covers simultaneous **pending edit permits**, not IPC connections, accepted edits, active rounds, or review capacity. |

## TS-005d — Count open virtual rounds in Bend

| Field | Reviewed boundary |
| --- | --- |
| Decision | The reducer enforces its declared bound on simultaneously open virtual rounds in one resident. A pre-edit permit does not reserve a round slot. The first accepted edit opens a round if a slot is free; closure releases that slot. An advicee whose virtual round has closed does not occupy open-round capacity. |
| TypeScript owner | [@hapsland/resident-runtime/resident/composed-delivery](../packages/resident-runtime/src/resident/composed-delivery.ts) |
| Bend boundary | [Canonical Bend](../packages/agent-flow-bend/Canonical.bend) counts open rounds in its own state when the edit consumes its permit and atomically opens or joins a round. A failed opening leaves the permit admission unconsumed. |
| Why outside Bend | Native event pairing remains TypeScript adapter work. The count and admission limit are entirely reducer decisions. |
| Review and limits | On 2026-09-29 the owner chose the 64-record limit to apply to **simultaneously open rounds**, rather than advicees ever seen in a resident lifetime. Completed edit identities have a separate 1,000-entry window. Retained advicee identities have the separate TS-005h bound. An advicee is not itself closed. |

## TS-005h — Bound retained resident identities

| Field | Reviewed boundary |
| --- | --- |
| Decision | Service records must not grow indefinitely just because the resident sees more advicees or edits over its lifetime. A finished virtual round does not keep its native round record. Idle advicee identities and completed collection-token identities can be discarded. If the resident can no longer prove that an edit started after a discarded round, it may reject that edit. This does not withdraw advice already handed to an agent runtime. |
| TypeScript owner | [@hapsland/resident-runtime/resident/capacity](../packages/resident-runtime/src/resident/capacity.ts); [@hapsland/resident-runtime/resident/composed-delivery](../packages/resident-runtime/src/resident/composed-delivery.ts) |
| Bend boundary | [Canonical Bend](../packages/agent-flow-bend/Canonical.bend) forgets inactive admission records, removes delivery counters when a virtual round retires, compares a prospective edit's start with the freshness floor supplied by TypeScript, and owns the bounded completed edit history described in TS-005b. Bend also owns the pending-permit and open-round limits in TS-005c and TS-005d. |
| Why outside Bend | Mapping runtime strings to opaque reducer IDs and reading a monotonic clock are native operations. The current numeric metadata caps are implementation limits, not permanent product rules. |
| Review and limits | On 2026-09-30 the owner accepted the practical retention-limit approach and explicitly declined a full process-memory audit as the next task. Code inspection and tests cover the identified retained-record paths; this entry does not claim a fixed RSS ceiling for V8, native libraries, or temporary work. The installed pre-edit hook is synchronous, so a late pre-edit hook after that agent's ordinary Stop is a defensive overlap or replay case, not the expected serial path. |

## TS-006 — Observe source and let Bend select files and rules

| Field | Reviewed boundary |
| --- | --- |
| Decision | TypeScript reads and parses source, checks native filesystem and Git facts, matches configured patterns, and compiles rule documents. Bend decides whether those facts admit a file or a rule. Compiled rule candidates report declared input kind, language and required capabilities to the canonical rule gate; TypeScript does not measure a source-quality rung. The code-derived field inventory below records the actual reducer interface. |
| TypeScript owner | [@hapsland/source-analysis/direct-event/analyzer](../packages/source-analysis/src/direct-event/analyzer.ts); [@hapsland/source-analysis/direct-event/graph-resolver](../packages/source-analysis/src/direct-event/graph-resolver.ts); [@hapsland/native-observation/direct-event/selection](../packages/native-observation/src/direct-event/selection.ts); [@hapsland/review-definition/rules/compiler](../packages/review-definition/src/rules/compiler.ts); [@hapsland/review-definition/rules/decision](../packages/review-definition/src/rules/decision.ts) |
| Bend boundary | [ImportGraph](../packages/agent-flow-bend/ImportGraph.bend) commands path checks and source reads and accounts for graph limits; it does not parse source text. [Canonical file and rule gates](../packages/agent-flow-bend/Canonical.bend) decide file protection, inclusion, candidate admission, rule enablement, target and capability compatibility, and declared-target and required-capability compatibility. The current `applicableRule` wrapper supplies fixed `sourceRung: 1` and `minimumRung: 1` interface values; these are not measurements of source quality or authored rule requirements. The [import graph dashboard](../packages/agent-flow-viz/src/import-graph-view.ts) visualizes this combined native-observation and Bend-decision flow. |
| Why outside Bend | Tree-sitter, filesystem access, Git queries, source-bearing syntax trees, pattern matching, and rule-pack decoding are native effects and data interpretation. Bend receives size-limited, source-free facts and owns the decisions about admission and budget. |
| Review and limits | On 2026-09-30 the owner approved moving the two remaining rule-selection gates into Bend. Current individual rules author `inputs` and `requires`; TypeScript reports target and capability matches. The earlier rung-based review does not describe the current authoring contract; the [accepted rule contract](review-contract-compatibility.md#configuration-and-individual-rules) owns that amendment. This review does not move source parsing into Bend or change the file and rule contracts. |

## TS-007 — Measure native data before Bend capacity admission

| Field | Reviewed boundary |
| --- | --- |
| Decision | TypeScript measures the bytes needed to retain an observation, preparation workspace, review unit, result, notice, or advice recheck, and labels that reservation by its work stage. Bend counts reserved items and bytes for the resident and advicee, then grants, resizes, replaces, or refuses the charge. A label does not independently authorize work. |
| TypeScript owner | [@hapsland/resident-runtime/resident/capacity](../packages/resident-runtime/src/resident/capacity.ts); [@hapsland/resident-runtime/resident/composed-delivery](../packages/resident-runtime/src/resident/composed-delivery.ts) |
| Bend boundary | [Ledger.bend](../packages/agent-flow-bend/Ledger.bend) owns the global and per-advicee item and byte counts and the fit decision. All current reservation purposes use the same limits; their labels distinguish the resource being accounted for. |
| Why outside Bend | Measuring source-bearing objects and native workspace needs requires TypeScript. Bend receives only the measured byte count, purpose label, advicee ID, and limit values; it owns the capacity transition. If a purpose later changes which limit applies, review this boundary again. |
| Review and limits | On 2026-09-30 the owner approved native measurement with the fit decision in Bend. This does not approve today's numeric defaults as permanent product rules or assert an RSS bound. The [direct-event v1 profile](direct-event-v1-supported-profile.md) is historical validation evidence with older limits; its table is not the current capacity contract. |

## TS-008 — Execute external effects and measure final output in TypeScript

| Field | Reviewed boundary |
| --- | --- |
| Decision | TypeScript reads credential state, claims any explicitly configured live-demo provider budget, calls Jev, encodes the selected response, and writes it to the agent runtime. Bend decides whether the observed authority and current work permit review and delivery. For the final composed Claude response, TypeScript measures the exact encoded line and asks Bend whether the whole batch fits before handing it to the runtime. |
| TypeScript owner | [@hapsland/resident-runtime/resident/server](../packages/resident-runtime/src/resident/server.ts); [@hapsland/resident-runtime/resident/composed-delivery](../packages/resident-runtime/src/resident/composed-delivery.ts) |
| Bend boundary | [Canonical review and delivery gates](../packages/agent-flow-bend/Canonical.bend) receive observed credential, source, work, and request facts and decide the corresponding transitions. [Handoff](../packages/agent-flow-bend/Handoff.bend) decides finding selection and the final batch fit from item count and measured bytes. A response over the current limit is released on Bend's decision. |
| Why outside Bend | Credentials, filesystem checks, paid-call budget files, Jev requests, source-bearing output, and runtime writes are external effects. Their observed results and byte measurements can be passed to Bend; the reducer cannot execute those effects. The live-demo budget is a separate spending authority for that explicit mode, not a second rule for ordinary review eligibility. |
| Review and limits | On 2026-09-30 the owner approved this division and replacing the resident's independent final size refusal with Bend's fit decision. That dated review addressed the then-current 10 KiB response limit implemented in Bend; it did not declare that number permanent. The code path for leased operational notices is presently unused in ordinary composed delivery, so the final fit check also protects a possible future combined response. |

## TS-009a — Check for safe resident retirement after inactivity

| Field | Reviewed boundary |
| --- | --- |
| Decision | After a connection opens or closes, TypeScript starts its declared inactivity timer. When it fires with no connection, it asks Bend whether this resident lifetime can retire. A busy result schedules another check after the declared interval. An open virtual round or pending pre-edit permit prevents retirement even when there is no current review work or advice. The timer does not close a virtual round. |
| TypeScript owner | [@hapsland/resident-runtime/resident/server](../packages/resident-runtime/src/resident/server.ts); [@hapsland/resident-runtime/resident/composed-delivery](../packages/resident-runtime/src/resident/composed-delivery.ts) |
| Bend boundary | [Canonical cleanup](../packages/agent-flow-bend/Canonical.bend) checks its open-round and pending-permit state along with the supplied idle facts. Both its readiness check and final commit refuse retirement while either remains. |
| Why outside Bend | Scheduling a process timer and observing IPC connections are native operations. Whether the recorded work and round state are safe to discard is a reducer decision. |
| Review and limits | On 2026-09-30 the owner agreed that active rounds and permits prevent automatic retirement; the [accepted contract](advicing-target-contract.md) records this product rule. The owner suggested extending the former five-second check to ten or twenty seconds; that review selected twenty seconds as the operational value at that time. An open round without Stop follows the separate full-quiescence rule in TS-009b. The [direct-event v1 profile](direct-event-v1-supported-profile.md) records the earlier five-second behavior as historical validation evidence. |

## TS-009b — Close a fully quiescent virtual round

| Field | Reviewed boundary |
| --- | --- |
| Decision | A virtual round without Stop closes after the configured duration of continuous full quiescence. The [generated configuration reference](configuration.md) owns the current default. User configuration can set the duration, captured at round opening. Unfinished work, pending advice, a pending edit permit, an active delivery, or a Stop hold prevents the quiet interval from advancing. An accepted edit or renewed activity breaks the interval. A fresh edit after closure can open another virtual round within the same runtime turn. |
| TypeScript owner | [@hapsland/resident-runtime/resident/server](../packages/resident-runtime/src/resident/server.ts); [@hapsland/resident-runtime/resident/composed-delivery](../packages/resident-runtime/src/resident/composed-delivery.ts) |
| Bend boundary | [Canonical Bend](../packages/agent-flow-bend/Canonical.bend) stores the quiet start, checks recorded work and permits against supplied native facts, compares the elapsed monotonic time with the duration, and decides whether the round has expired. It clears the quiet interval when a permit is issued, an edit is accepted, or Stop begins. TypeScript does not decide the elapsed-time threshold or close the round on process idleness alone. |
| Why outside Bend | Timer scheduling, clock readings, user configuration, and observing native in-flight effects require TypeScript. The quiescence and elapsed-time decision is product logic and belongs in Bend. |
| Review and limits | On 2026-09-30 the owner approved full quiescence and the five-minute configurable default, separately from process retirement in TS-009a. The timer checks periodically, so closure can happen later than the nominal duration. Pending advice follows its normal relevance expiry; this rule does not discard it solely because no Stop arrives. The accepted behavior is in the [advicee contract](advicing-target-contract.md), and implementation is tracked in [#158](https://github.com/dearlordylord/hapsland/issues/158). |

## TS-010 — Validate provider request constraints at the transport boundary

The 2026-10-06 owner request to strengthen prompt/conversation isolation adds the
[content-isolation contract](review-contract-compatibility.md#review-content-isolation).
The shared [review transport](../packages/review-execution/src/review-providers/transport.ts) disables ambient
trace propagation; [inspection](../packages/inspection-records/src/inspection/transport.ts) receives copied bytes.
These native Effect/HTTP operations enforce the content boundary without changing
Bend dispatch authority. The [content laws and proof limits](../packages/agent-flow-bend/README.md#content-isolation-proofs)
now constrain the production Bend projector used immediately before HTTP dispatch.
The bridge passes every top-level JSON field; Bend selects and frames the three
permitted fields. Fresh compilation must match the imported artifact. Capture,
wire and mutation tests cover native boundaries; input provenance remains unproved.


| Field | Boundary |
| --- | --- |
| Decision | TypeScript resolves the user-selected review provider, model, and fixed-origin destination; encodes native JSON fragments for the Bend body projector; and rejects invalid native protocol sizes/counts before any HTTP effect. Unknown limits remain unknown. Declared token budgets are recorded without a claim of exact token enforcement. |
| TypeScript owner | [@hapsland/runtime-environment/runtime/backend](../packages/runtime-environment/src/runtime/backend.ts); [@hapsland/review-definition/review-providers/catalog](../packages/review-definition/src/review-providers/catalog.ts); [@hapsland/review-execution/review-providers/live](../packages/review-execution/src/review-providers/live.ts) |
| Bend boundary | Existing file/rule admission, source exploration, capacity, request permits, settlement, and advice authority retain their current reducer routes. Passing provider validation cannot authorize a request or synthesize a clear result. Existing internal `jevRequest` event names continue to describe the shared physical review-request lifecycle; they do not select a transport. |
| Why outside Bend | Provider formats, HTTP destinations, encoded UTF-8 sizes, response schemas, and credentials belong to the external adapter. This is protocol validation, separate from product scheduling and capacity policy. |
| Review and limits | Implemented under the owner's 2026-10-02 request to form a provider-limit architecture and support Clef. Offline checks cover transport and identity behavior; there is no live Cloudflare, token-budget, quality, or platform claim. Recheck this boundary when adding batching, truncation, retry, fallback, token counters, or dynamically fetched capabilities. |

<!-- decision-boundary-facts:start -->

## Code-derived boundary inventory

This inventory resolves declared private exports through the package graph and reads variant kinds and fields from the production Effect schemas. It establishes representation and ownership facts, not why a decision belongs outside Bend, review acceptance, runtime execution, or passing tests. A `?` marks an optional field. Regenerate with `npm run docs:generate`.

### Reviewed event selections

Event selections are descriptive annotations checked against the schema. TypeScript owner rows in the entries above are regenerated from selected private exports; reviewed decisions and reasons remain authored prose.

| Entry | Selected Canonical events |
| --- | --- |
| TS-006 | ruleApplicabilityCheck, ruleEnableCheck, ruleFindingCheck |

### Compiler and private export ownership

Compiler and host names below are manifest declarations, not measured execution evidence.

| Workspace | Compiler / host | Authored export sources |
| --- | --- | --- |
| @hapsland/canonical-policy | typescript / bun | [./canonical/adapter](../packages/canonical-policy/src/canonical/adapter.ts); [./canonical/boundary-schema](../packages/canonical-policy/src/canonical/boundary-schema.ts); [./canonical/canonical-boundary](../packages/canonical-policy/src/canonical/canonical-boundary.ts); [./canonical/constructors](../packages/canonical-policy/src/canonical/constructors.ts); [./canonical/event-reader](../packages/canonical-policy/src/canonical/event-reader.ts); [./canonical/graph-adapter](../packages/canonical-policy/src/canonical/graph-adapter.ts); [./canonical/graph-limits](../packages/canonical-policy/src/canonical/graph-limits.ts); [./canonical/graph-schema](../packages/canonical-policy/src/canonical/graph-schema.ts); [./canonical/immutable](../packages/canonical-policy/src/canonical/immutable.ts); [./canonical/models](../packages/canonical-policy/src/canonical/models.ts); [./canonical/simulation-codec](../packages/canonical-policy/src/canonical/simulation-codec.ts) |
| @hapsland/agent-flow-bend | bend / bun | [./canonical](../packages/agent-flow-bend/abi/canonical.generated.d.ts); [./import-graph](../packages/agent-flow-bend/abi/import-graph.generated.d.ts); [./request-content](../packages/agent-flow-bend/abi/request-content.generated.d.ts) |

### Canonical events

Schema owner: [packages/canonical-policy/src/canonical/models.ts](../packages/canonical-policy/src/canonical/models.ts).

| Kind | Fields after kind |
| --- | --- |
| admitObservation | lifetime, partition, round |
| adviceOrderCheck | idOrder, left, pathOrder, right |
| beginObservedPreparation | bytes, lifetime, observation, partition, round |
| beginPreparation | bytes, lifetime, partition, round |
| cacheClear | — |
| cacheCommit | byteLimit, bytes, entryLimit, id, partition, reservation |
| cacheDiscardPartition | partition |
| cachePrepare | byteLimit, bytes, entryLimit, id |
| cancelReview | lifetime, operation, partition, round |
| candidateFileCheck | gitAdmin, gitAllowed, physicalSafe |
| checkCompletedEdit | tool |
| cleanupCheck | facts |
| cleanupCommit | — |
| closeDispatch | — |
| closePermitRound | at, lifetime, partition, round |
| collectionCandidateCheck | authorityOwns, hasUnsuppressed, samePartition, unleased |
| collectionClaimBackground | active, capacity, group, token |
| collectionCredentialCheck | generationValid, sameScope |
| collectionExpireBackground | elapsed, group, lifetime, token |
| collectionExpiryCheck | elapsed, lifetime |
| collectionFindingCheck | ageMs, collectionReady, credential, currentCredential, currentSnapshot, partition, prospectiveBytes, round, selectedCount, selectionPartition, selectionRound, snapshot, soloBytes, unit |
| collectionFitCheck | bytes, items |
| collectionLeaseCheck | advice, expired, reofferable, sameGroup, stopCollector, token |
| collectionNoticeCheck | bytes, items, skipUnfitting |
| collectionOrderCheck | leftSequence, rightSequence |
| collectionReady | advice, joinedPending, lifetime, observation, partition, round |
| collectionReleaseBackground | group, token |
| collectionReleaseLease | advice, token |
| collectionReserveLease | advice, token |
| collectionRetireAdvice | advice |
| collectorFinalAuthorityCheck | admittedBlock, currentBlock |
| collectorGateCheck | credentialValid, expired |
| completeObservation | lifetime, observation, partition, round |
| consumePermit | lifetime, now, partition, token, tool |
| continuationConsume | group, round |
| deliveryAcknowledgeCheck | anyExpired, items |
| deliveryCredentialObserveCheck | authorized, generationValid, invalidSeen |
| deliveryExistingTokenCheck | existingToken, finishPermit, surface |
| deliveryFinalCredentialCheck | invalidSeen, sharedCollect |
| deliveryFinalizeCheck | allAcknowledged, anyExpired, items |
| deliveryFindingDispositionCheck | composed, remaining |
| deliveryReleaseCheck | acknowledged |
| deliverySubmissionAllowedCheck | active, barrier, deciding, existingToken, finishPermit, surface |
| deliverySubmissionBatchCheck | allValid, count |
| deliverySubmissionCandidateCheck | facts |
| deliveryUnreservedStopCheck | active, deciding |
| discardDispatch | operations |
| dispatchScopeCheck | cancelledCount, hasUnnamed, namedCount |
| dispatchSettled | lifetime, operation, partition, round |
| emptyPreparedCheck | authorityBound, hasNonSkipped, readyCount |
| expirePermit | deadlineReached, lifetime, partition, token |
| fileProtectionCheck | allowedExtension, generatedOrVendor, sensitiveName |
| fileProtectionInvalid | — |
| fileSelectionCheck | excluded, included, includesEmpty, protected |
| finalCandidateCheck | credentialAuthorized, credentialGeneration, expired, hasFindings, ownerCurrent, workCurrent |
| findingCountUpdated | count, lifetime, operation, partition, round |
| finishAuthorize | attempt, group, round, selected, token |
| finishEnd | attempt, group, round, token |
| finishRelease | attempt, group, round, token |
| finishReserve | attempt, bindingValid, canWrite, deadlineReached, group, hasNotice, lifetime, passNotices, round, selected, token |
| finishTerminal | attempt, group, outcome, round, selected, token |
| forgetAdmission | lifetime, partition |
| includeLayerCheck | candidateRank, currentRank, supplied |
| interruptObservation | lifetime, observation, partition, round |
| interruptPreparation | lifetime, operation, partition, round |
| issuePermit | deadline, facts, lifetime, minimumStarted, now, partition, started, tool |
| jevRequestInterrupted | lifetime, operation, partition, request, round |
| jevRequestReady | configurationValid, credentialReady, currentWork, lifetime, operation, partition, physicalAvailable, rootValid, round, selected |
| jevRequestSettled | currentWork, lifetime, operation, outcome, partition, request, round |
| jevRequestStarted | lifetime, operation, partition, request, round |
| noticeAdvance | key, maxCount, maximumKeys, proposed, remaining?, sequence |
| noticeClearPending | key |
| noticeCommit | group, key, maximumKeys, partition, pending, reservation, sequence |
| noticeDrop | key |
| noticeLease | key, leased |
| noticePrune | cooldownExpired, excepted, key, leaseExpired, pendingExpired |
| noticeSelect | allowed, authorityBound, composed, group, partition |
| openRound | lifetime, partition |
| outputStarted | lifetime, partition, round |
| outputTerminal | lifetime, operation, outcome, partition, round |
| postValidationCheck | expired, hasFitting, workAccepted |
| preparationCompleted | lifetime, operation, partition, round, unitBytes |
| preparedOfferCheck | ready, withinFrame |
| queueDispatch | lifetime, operation, partition, round |
| quietRoundReset | lifetime, partition, round |
| quietRoundTick | facts, lifetime, now, partition, round, window |
| releaseCapacity | reservation |
| releasePermit | lifetime, partition, token |
| rememberCompletedEdit | reason, tool |
| replaceCapacity | reservation, unitBytes |
| reserveCapacity | bytes, partition, purpose |
| resizeCapacity | bytes, purpose, reservation |
| retirePartition | lifetime, partition, round |
| retireReview | lifetime, operation, partition, round |
| reuseAttach | id |
| reuseClaim | id |
| reuseMemberCheck | hasAdviceId, hasRevision, staleUnavailable, state |
| reuseRelease | id |
| reuseRoute | id, liveAdvice |
| reuseTouch | id |
| reviewAdmissionCheck | configurationValid, credentialReady, rootValid, selected |
| reviewCompleted | lifetime, operation, outcome, partition, round |
| reviewFailureCheck | backendOrTimeout, credential, missing |
| reviewObserved | currentWork, lifetime, operation, outcome, partition, round |
| revisionCountCheck | — |
| revisionCurrentCheck | generation, input, subject |
| revisionGenerationCheck | subject |
| revisionRegister | addMember, input, subject |
| revisionRelease | generation, subject |
| revisionSupersededCheck | candidateSubject, generation, subject |
| roundActivityCheck | active, bound, closedAt, expectedGeneration, hasAdmission, round |
| roundBarrierCheck | hasStop, usedAtStart, usedNow |
| roundBeginStopCheck | active, hasStop, token |
| roundContinuationBudgetCheck | active, count |
| roundExpireCloseCheck | authorizedOutput, barrier |
| roundOwnsStopCheck | active, deciding, tokenMatches |
| roundStopTerminalCheck | authorized, hasOutput, requestedClose |
| ruleApplicabilityCheck | capabilitiesAvailable, complete, consent, globalExcluded, globalIncluded, minimumRung, packEnabled, ruleEnabled, ruleExcluded, ruleIncluded, sourceRung, target, targetDeclared |
| ruleBudgetCheck | limit, position |
| ruleEnableCheck | packEnabled, ruleEnabled |
| ruleFindingCheck | probability, threshold |
| ruleRankOrderCheck | left, leftRank, right, rightRank |
| startObservation | lifetime, observation, partition, round |
| startReview | lifetime, operation, partition, round |
| stopGroupEnded | group, lifetime, round, scopes |
| stopGroupPolled | continuations, deadline, extraPending, group, lifetime, round, scopes |
| stopPolled | deadline, lifetime, partition, round |
| submissionAuthorize | advice, token |
| submissionBegin | advice, authorizeNow, fingerprints, group, round, surface, token, units |
| submissionExpiryCheck | advice, elapsed, lifetime, token |
| submissionForget | advice |
| submissionRelease | advice, token |
| submissionReofferCheck | advice, token |
| submissionSuppressCheck | advice, fingerprint, round, surface |
| submissionTerminal | advice, certain, token |
| validationRouteCheck | ownerCurrent, status |

### Canonical commands

Schema owner: [packages/canonical-policy/src/canonical/models.ts](../packages/canonical-policy/src/canonical/models.ts).

| Kind | Fields after kind |
| --- | --- |
| admissionForgotten | — |
| cacheAlready | — |
| cacheCommitted | — |
| cacheDiscarded | ids |
| cachePrepared | evicted |
| cacheRejected | — |
| cancelWork | operation |
| candidateFile | candidate |
| capacityGranted | after, id |
| capacityRefused | after, reason |
| capacityResized | after, id |
| capacityUnitAdmitted | after, bytes, position, reservation |
| capacityUnitRefused | after, bytes, position, reason |
| cleanupBusy | — |
| cleanupCommitted | — |
| cleanupReady | — |
| collectionAdviceRetired | — |
| collectionAfter | — |
| collectionBackgroundClaimed | — |
| collectionBackgroundKept | — |
| collectionBackgroundRefused | — |
| collectionBackgroundReleased | — |
| collectionBefore | — |
| collectionCandidate | — |
| collectionCurrent | — |
| collectionEligible | — |
| collectionEqual | — |
| collectionExpired | — |
| collectionFindingExpired | — |
| collectionFindingLimited | — |
| collectionFindingRetained | — |
| collectionFindingSelected | — |
| collectionFits | — |
| collectionLeaseKept | — |
| collectionLeaseRefused | — |
| collectionLeaseReleased | — |
| collectionLeaseReserved | — |
| collectionLimited | — |
| collectionNoticeIncluded | — |
| collectionNoticeSkipped | — |
| collectionNoticeStopped | — |
| collectionRetainCredential | — |
| collectionRetireCredential | — |
| collectionSkip | — |
| collectionWaiting | — |
| collectorFinalProceed | — |
| collectorFinalRelease | — |
| collectorProceed | — |
| collectorUnavailable | reason |
| completedEditAbsent | — |
| completedEditRemembered | evicted? |
| completedEditSeen | reason, report |
| continuationConsumed | — |
| continuationRefused | — |
| continueCandidate | — |
| deliveryAckEmpty | — |
| deliveryAckExpired | — |
| deliveryAckReady | — |
| deliveryBatchProceed | — |
| deliveryBatchRelease | — |
| deliveryCredentialInvalid | — |
| deliveryCredentialValid | — |
| deliveryExistingTokenAllowed | — |
| deliveryExistingTokenDenied | — |
| deliveryFinalEmpty | — |
| deliveryFinalExpired | — |
| deliveryFinalReady | — |
| deliveryKeepAcknowledged | — |
| deliveryKeepForReoffer | — |
| deliveryKeepRemaining | — |
| deliveryReleaseUnacknowledged | — |
| deliveryRetireAdvice | — |
| deliverySubmissionAllowed | — |
| deliverySubmissionCandidate | — |
| deliverySubmissionDenied | — |
| deliverySubmissionRefused | — |
| deliveryUnreservedStopAllowed | — |
| deliveryUnreservedStopDenied | — |
| discardAllUnfinished | — |
| discardNamedOnly | — |
| dispatchDiscarded | operation, running |
| dispatchStarted | operation, sequence |
| emptyAccepted | — |
| emptyLost | — |
| failureBackend | — |
| failureCredential | — |
| failureLost | — |
| failureNone | — |
| fileProtection | protection |
| fileSelection | selection |
| findingCountRecorded | — |
| finishAllowedDeadline | — |
| finishAllowedNoAdvice | — |
| finishAllowedUnavailable | — |
| finishAuthorized | — |
| finishEnded | — |
| finishLimit | — |
| finishNotices | — |
| finishReady | — |
| finishRecorded | outcome |
| finishRefused | — |
| finishReleased | — |
| finishReserved | — |
| ignoreCandidate | — |
| includeChoice | choice |
| jevInterruptionRecorded | — |
| jevObservationIgnored | — |
| jevRequestIssued | lifetime, operation, partition, request, round |
| jevRequestOutcomeRecorded | outcome |
| jevRequestStartRecorded | — |
| jevRequestUnavailable | — |
| noticeCommitted | — |
| noticeCreateKey | — |
| noticeCreatePending | count |
| noticeDropped | — |
| noticeKeepLeased | — |
| noticeLeased | — |
| noticeMergePending | count |
| noticePendingCleared | — |
| noticePruned | dropKey, dropLease, dropPending |
| noticeRefused | — |
| noticeRejectedFull | — |
| noticeSelected | ids |
| noticeSuppressed | count |
| observationAdmitted | id |
| observationCompleted | — |
| observationInterrupted | — |
| observationStarted | — |
| partitionRetired | round |
| permitConsumed | round |
| permitExpired | — |
| permitIssued | round, token |
| permitKept | — |
| permitReleased | — |
| permitRoundClosed | round |
| preparationRefused | — |
| preparationReleased | after, id |
| prepare | operation, reservation |
| preparedAdmitted | — |
| preparedCapacityRefused | — |
| preparedSkipped | — |
| quietRoundBusy | — |
| quietRoundExpired | since |
| quietRoundResetRecorded | — |
| quietRoundWaiting | since |
| releaseCandidate | — |
| reofferAtStop | — |
| reservationReleased | id |
| retainCandidate | — |
| retainFinding | — |
| retireCandidate | — |
| retireStaleFinding | — |
| reuseAttached | — |
| reuseCached | — |
| reuseClaimed | — |
| reuseJoinAdvice | — |
| reuseJoinClaimed | — |
| reuseJoinPending | — |
| reuseKeepMember | — |
| reuseOwn | — |
| reuseRefused | — |
| reuseReleased | — |
| reuseSetMemberClear | — |
| reuseSetMemberFinding | — |
| reuseSetMemberLost | — |
| reuseSetMemberUnavailable | — |
| reviewAdmission | admission |
| reviewRecorded | outcome |
| reviewStarted | — |
| revisionCount | count |
| revisionCurrent | — |
| revisionGeneration | generation |
| revisionNotSuperseded | — |
| revisionReleased | — |
| revisionReplaced | generation |
| revisionReused | generation |
| revisionStale | — |
| revisionSuperseded | — |
| roundActive | — |
| roundBarrierClear | — |
| roundBarrierRaised | — |
| roundContinuationAvailable | — |
| roundContinuationExhausted | — |
| roundExpireCloses | — |
| roundExpireKeeps | — |
| roundInactive | — |
| roundStarted | id |
| roundStopBegun | — |
| roundStopNotOwned | — |
| roundStopOwned | — |
| roundStopRefused | — |
| roundStopTerminal | close, revokeProvisional |
| ruleGate | gate |
| ruleOrder | order |
| settleClear | — |
| settleStaleClear | — |
| stopEnded | — |
| submissionAuthorized | — |
| submissionBegun | — |
| submissionCurrent | — |
| submissionExpired | — |
| submissionForgotten | — |
| submissionNotReofferable | — |
| submissionRecorded | — |
| submissionRefused | — |
| submissionReleased | — |
| submissionReofferable | — |
| submissionSuppresses | — |
| submissionUnsuppressed | — |
| unitAdmitted | after, bytes, operation, position, reservation |
| unitRefused | after, bytes, position, reason |
| waitForOutput | — |
| waitForWork | — |
| writeAuthorized | operation |
| writeRecorded | outcome |

### ImportGraph events

Schema owner: [packages/canonical-policy/src/canonical/graph-schema.ts](../packages/canonical-policy/src/canonical/graph-schema.ts).

| Kind | Fields after kind |
| --- | --- |
| captured | edges, localWork?, sourceBytes, treeBytes |
| captureFailed | — |
| deadlineReached | — |
| next | — |
| pathChecked | allowed |
| resolved | result, target |
| root | edges, localWork?, sourceBytes, target, treeBytes |

### ImportGraph commands

Schema owner: [packages/canonical-policy/src/canonical/graph-schema.ts](../packages/canonical-policy/src/canonical/graph-schema.ts).

| Kind | Fields after kind |
| --- | --- |
| checkPath | target |
| none | — |
| readSource | target |
| resolveEdge | edge |
| skipImport | reason, target |
| unitComplete | — |
| unitIncomplete | reason |

<!-- decision-boundary-facts:end -->
