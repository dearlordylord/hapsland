# Canonical transition interface (#119)

## In plain language

When an agent edits a file, its agent runtime starts a short Hapsland command.
That command sends the edit event to Hapsland's **resident**: a local background
process that schedules review work and calls Jev. The resident keeps a **review
capacity ledger** in its own memory. The ledger tracks how much space its
review-related records reserve. It is not a record of all process memory or of
Jev's own capacity.

The command reaches the resident through a socket in a filesystem directory.
This **resident connection directory** contains no source files or ledger data.
By default it is outside Git worktrees and shared by Hapsland commands run by
the same operating-system user. Thus different worktrees, and Codex and Claude
Code commands with the same directory setting, can reach one resident. Their
source files stay in their own worktrees. The resident keeps review and advice
separate by exact working root, runtime, session, and supplied subagent ID.
The model calls each such scope an **advicee partition**. A missing subagent ID
currently maps to the main-agent scope; it does not prove the event came from
the main agent. Child-specific advice needs reliable child attribution.

The ledger checks four limits for each reservation: item count and bytes for
the whole resident, and item count and bytes for that agent scope. These are
two measurements at two scopes, not four kinds of work. Each agent's usage is
part of the resident total. The current #119 Bend slice describes two
reservation lifetimes: space used while Hapsland prepares review units, and
space held for each unit it sends to Jev. Preparing a unit is part of review.
The split exists because the first record ends when preparation yields zero or
more unit records. It does not divide review into arbitrary named phases.
The installed resident reserves space for other records too; #119 does not yet
model them all. Bend calls a reservation `Charge`; that is a code name, not a
payment or a Jev request.

When preparation finds several review units, Hapsland releases its temporary
reservation and checks the units in order. If a unit does not fit, it
refuses that unit and still checks the next one. For example, with a 60-byte
limit for one agent, units of 10, 60, and 20 bytes produce **accept, refuse,
accept**. A refusal does not mean Jev found the code clear. The current policy
does not put that refused unit on a retry queue.

At Stop, the agent asks to finish. `FinishReady` means Hapsland has finished
waiting for review work and can now choose whether it has advice to give. If
there is current advice and a continuation is available, Hapsland can ask the
agent to keep working with that advice. Otherwise it can let the agent finish.
This first interface stops before that choice; later tasks add it to Bend.

**Background advice submission** means Hapsland tries to send advice after an
edit, before the agent asks to finish. “Background” matters because this
submission has a different timing and delivery opportunity from a response to
Stop. “Advice submission” says what is sent; the older shorthand “background
write” obscures that. A source-file edit is a different event. A runtime may
accept the output without the agent seeing it. If that is uncertain, Stop may
consider the same advice once more under later delivery rules. The Bend result
`ReofferAtStop` marks that possibility; this slice does not select or send it.

The resident receives result notifications for preparation, review, and advice
submission. A **duplicate result** reports an operation already handled. A
**late result** arrives after its review round or resident lifetime ended.
Neither may change capacity. The current Bend result `StaleOperation` groups
both cases; it does not tell the operator which one occurred. The event names
`PreparationCompleted`, `ReviewCompleted`, and `OutputTerminal` identify which
operation reported a result.

This is the first checked production-boundary slice for the [#116](https://github.com/dearlordylord/hapsland/issues/116) migration. `Canonical.step` is the single Bend entry point for the state, events, and commands in this slice. The resident still uses its existing generated modules; no installed behavior changes here. Later issues extend this state and event set, then switch resident paths and the final full-flow page to the same compiled transition. The #141 import graph remains a separate model until its events are joined to this boundary.

## Ownership and identities

`Canonical.State` owns one resident lifetime's shared `Ledger.Ledger`, one active `Round` per agent scope, a list of preparation/review work, and monotonic round and operation counters. The ledger holds all active logical reservations across agent scopes. A partition ID identifies one exact agent scope; a lifetime ID identifies its resident incarnation; a round ID identifies one Hapsland round; an operation ID identifies one preparation job, review unit, or background advice submission. The native adapter must map exact runtime identities bijectively to positive integers and must not recycle them within a resident lifetime. Generated IDs must remain below `2^48`.

The existing `CapacityLedger.replace` behavior is the reference for replacement: release the preparation workspace, attempt independent unit reservations in source order, retain successful units, and emit a refusal for each unit that does not fit. `Canonical.PreparationCompleted` performs this sequence in one transition. A reservation is represented by one `Work` entry, and each accepted review result removes that work and its ledger reservation once. A duplicate result returns `StaleOperation` without commands or ledger change. A wrong lifetime, round, partition, or operation is also rejected without effect. A deadline marks the round decision-pending, releases all its logical reservations, and emits exact operation IDs for native cancellation. A result that arrives afterward is late. The round remains addressable for later finish selection; a repeated Stop poll is rejected. This avoids depending on when the external cancellation takes effect.

Resident-wide and per-agent limits are passed to `initial`; Bend checks both when work requests space. The adapter's initial contract requires positive safe integers no larger than `2^48 - 1`. Event identity and operation fields are positive integers in the same range. Byte fields and byte limits are capped at `2^47 - 1` so existing plus requested bytes stay within Bend's immediate Nat range. One preparation result can report the measured sizes of at most 16 review units; this is an input-list bound, not a byte or file-size limit. The first-slice adapter also caps simultaneous reservations and active rounds at 256 per resident and simultaneous reservations at 16 per agent scope. Those are temporary model bounds, not installed capacity limits. #120/#122 must revisit them with #138 review fan-out. The current installed limits remain 64 items/8 MiB per resident and 16 items/2 MiB per agent scope until those tasks change them.

## Event and command envelopes

| Event | Native fact supplied | Bend-owned result |
| --- | --- | --- |
| `OpenRound` | Exact agent identity and resident lifetime | Allocate unique round ID; refuse a second active round for that agent scope |
| `BeginPreparation` | Attributed round and measured workspace bytes | Reserve shared and per-agent capacity; issue preparation operation and reservation or refuse capacity |
| `PreparationCompleted` | Exact operation and ordered measured unit bytes | Release workspace, partially admit units in order, issue review operations and reservations |
| `ReviewCompleted` | Exact review operation and one of Finding/Clear/Unavailable | Release reservation once and report outcome; unavailable remains distinct from clear |
| `StopPolled` | Exact round and a native deadline fact | Wait while work or advice submission is pending, or close admission for that finish attempt, release reservations, request exact cancellations, and emit `FinishReady` or `ReofferAtStop` |
| `OutputStarted` | Exact round when background advice submission starts | Issue one output operation token; a second simultaneous submission is rejected |
| `OutputTerminal` | Exact advice-submission token and runtime result: acknowledged, failed, or unknown | Consume the token once; an unknown result preserves the possibility of one offer at Stop |
| `RetirePartition` | Exact agent scope, lifetime, and round at final finish or shutdown | Release remaining reservations, request exact cancellations, remove the old round, and reject late results |

`FinishReady` means this slice is done waiting; later rules must still decide whether to offer advice or let the agent finish. `ReofferAtStop` says an uncertain background advice submission did not establish that the agent saw the advice. It does not submit advice again by itself. Later delivery work must check that the advice is still relevant, reserve a continuation if needed, and authorize output to the runtime. An unfinished submission causes `WaitForOutput` before the deadline. The deadline can close the finish decision even while submission is in progress; its later result is rejected. `RetirePartition` explicitly cleans up an agent scope; later slices must place it after the final output or shutdown boundary. This first slice does not claim to model permits, evidence capture, review scheduling, advice selection, IPC acknowledgements, or the complete installed finish sequence.

The installed sequence joins native hook and attribution facts; Bend admission and round/work reservation; native source capture and Jev effects; Bend outcome and logical release; Stop's Bend wait/cutoff fence; native cancellation and final evidence/writer checks; Bend selection/continuation reservation; native output attempt; Bend acknowledgement/unknown disposition. The resident routes capacity, permits, observation and review work, dispatch, grouped Stop waiting/cutoff, selected output slots, and per finding submission leases through `Canonical.step`. `Handoff` and `Delivery` supply reusable policy functions inside that state machine. Native code retains payloads and clock facts and uses canonical commands at the host handoff barrier.

The #127 revision events also retain one current canonical input identity and
generation per semantic subject, with a count of live same-input members.
`RevisionRegister` reuses that generation or replaces it; `RevisionRelease`
decrements only the matching current generation. Current and supersession
queries fence older callbacks after replacement. Native code maps the exact
canonical input to a numeric identity before crossing this boundary and
keeps source-bearing input and random tokens outside Bend.

The #128 ticket events retain ticket phase, ordered unit stages, and failure
reasons in canonical state. Native code supplies live advice, notice, clock,
credential, and host handoff facts. Terminal commands distinguish pending,
clear, delivered, no-work, and unavailable without claiming agent visibility.

The #129 reuse events retain numeric evaluation claims and successful cache
entries in oldest-first order. A single route transition decides live advice,
attached work, bare claim, cache hit, or new owner priority. Cache preparation
chooses admissions and evictions before native reservation; commit records a
successful reservation. Partition expiry and cleanup return exact IDs whose
native reservations are released. Source-derived keys, request handles,
cached evaluations, and credential facts remain outside Bend.

## Checked TypeScript boundary

[`src/canonical/adapter.ts`](../src/canonical/adapter.ts) is the only TypeScript entry for this model. It maps semantic event tags to compiled Bend constructors, validates positive numeric bounds, limits list length, and rejects unknown event and outcome tags. It checks every returned constructor and field set, state list, ledger charge, round, work kind, command, and rejection tag. An opaque state returned by `initialCanonical` or `stepCanonical` is required; a forged state is rejected. The build script verifies the compiled `Canonical.initial` and `Canonical.step` symbols before writing `src/canonical/canonical.generated.js`.

The projection reads shared and per-advicee usage from compiled `Ledger.total`
and `Ledger.partition_usage`. TypeScript checks these results against the
returned charge list for a malformed-output guard; it does not use a
TypeScript sum as the displayed capacity total. Bend now returns each live
charge's owner, purpose, bytes, and ID, plus ordered preparation decisions
with intermediate snapshots. The planned layout is in the
[capacity dashboard plan](capacity-dashboard-plan.md).

The adapter validates shape, not native truth: the caller still has to measure bytes, authenticate advicee attribution, compute deadlines, and bind exact runtime IDs. Native effects execute only emitted commands. A malformed input throws before calling Bend; an unknown or malformed compiled output throws before a native effect may be run. Rejected Bend events return their unchanged state with no commands. The fixture at `conformance/canonical-v1.json` was written from the accepted contract, independent of the old TypeScript reducer; `scripts/check-canonical.mjs` compares exact command order, rejections, and global ledger totals. The four added laws in `LAWS.bend` are checked by `PROOF.bend`; they are focused facts, not a universal proof of the whole transition system.
