# Canonical transition interface (#119)

## In plain language

One Hapsland resident can review edits for several agents. Each agent keeps its
own review and advice scope, called an **advicee partition**. The resident has
one **capacity ledger** for all those partitions. It records how much review
work the resident has accepted: one count of work items and one count of
reserved bytes. Each accepted preparation job or review unit adds a **capacity
charge** to its agent's partition and to the shared total. The charge is a
temporary reservation, not money, process RAM, or a Jev request. When that
work finishes or is cancelled, Hapsland removes the charge. An agent's row is
a breakdown of the shared total; it is not a second pool of capacity.

When preparation finds several review units, Hapsland releases the temporary
preparation charge and checks the units in order. If a unit does not fit, it
refuses that unit and still checks the next one. For example, with a 60-byte
limit for one agent, units of 10, 60, and 20 bytes produce **accept, refuse,
accept**. A refusal does not mean Jev found the code clear. The current policy
does not put that refused unit on a retry queue.

At Stop, the agent asks to finish. `FinishReady` means Hapsland has finished
waiting for review work and can now choose whether it has advice to give. If
there is current advice and a continuation is available, Hapsland can ask the
agent to keep working with that advice. Otherwise it can let the agent finish.
This first interface stops before that choice; later tasks add it to Bend.

“Background write” in older code means an attempt to submit advice to the
agent runtime after an edit, before the agent asks to finish. It is not a
source-file edit. If Hapsland cannot tell whether the runtime received that
submission, it must not claim the agent saw the advice. At Stop, the same
advice can be considered for one more offer, subject to the later delivery
rules. `ReofferAtStop` marks that situation; this first interface does not
select or send the advice.

An operation **completion** is a callback saying that preparation, review, or
an output attempt ended. A **duplicate** completion reports the same work a
second time. A **stale** completion belongs to work whose round or lifetime
has ended. This first interface rejects both without changing capacity; it
uses the same `StaleOperation` result for both cases.

This is the first checked production-boundary slice for the [#116](https://github.com/dearlordylord/hapsland/issues/116) migration. `Canonical.step` is the single Bend entry point for the state, events, and commands in this slice. The resident still uses its existing generated modules; no installed behavior changes here. Later issues extend this state and event set, then switch resident paths and the final full-flow page to the same compiled transition. The #141 import graph remains a separate model until its events are joined to this boundary.

## Ownership and identities

`Canonical.State` owns one resident lifetime's global `Ledger.Ledger`, one active `Round` per advicee partition, a list of preparation/review work, and monotonic round and operation counters. The ledger holds all active logical reservations across partitions. A partition ID identifies an advicee; a lifetime ID identifies its resident incarnation; a round ID identifies one virtual round; an operation ID identifies one preparation, review unit, or background output attempt. The native adapter must map exact runtime identities bijectively to positive integers and must not recycle them within a resident lifetime. Generated IDs must remain below `2^48`.

The existing `CapacityLedger.replace` behavior is the reference for replacement: release the preparation workspace, attempt independent unit reservations in source order, retain successful units, and emit a refusal for each unit that does not fit. `Canonical.PreparationCompleted` performs this sequence in one transition. A reservation is represented by one `Work` entry, and each accepted review completion removes that work and its ledger charge once. A second completion returns `StaleOperation` without commands or ledger change. A wrong lifetime, round, partition, or operation is also rejected without effect. A deadline marks the round decision-pending, releases all its logical charges, and emits exact operation IDs for native cancellation. A callback that arrives afterward is stale. The round remains addressable for later finish selection; a repeated Stop poll is rejected. This avoids depending on when the external cancellation takes effect.

Global and partition limits are passed to `initial`; the limits are shared across advicees and are checked by Bend's ledger function. The adapter's initial contract requires positive safe integers no larger than `2^48 - 1`. Event identity and operation fields are positive integers in the same range. Byte fields and byte limits are capped at `2^47 - 1` so an occupied-plus-new charge cannot exceed Bend’s immediate Nat range; a prepared unit list has at most 16 entries. That means one preparation result can report the measured sizes of up to 16 review units; it does **not** mean 16 bytes or 16 source files. The initial contract also limits simultaneous charges across all advicees to 256, active rounds to 256, and simultaneous charges for one advicee partition to 16. These are first-slice model and adapter bounds, not new installed product limits. They should be revisited with #120/#122 capacity and #138 review fan-out. The current product constants remain 64 global items/8 MiB and 16 partition items/2 MiB until those tasks change them.

## Event and command envelopes

| Event | Native fact supplied | Bend-owned result |
| --- | --- | --- |
| `OpenRound` | Exact advicee and resident lifetime | Allocate unique round ID, refuse a second active round for that partition |
| `BeginPreparation` | Attributed round and measured workspace bytes | Reserve global and partition capacity, issue preparation operation and reservation or refuse capacity |
| `PreparationCompleted` | Exact operation and ordered measured unit bytes | Release workspace, partially admit units in order, issue review operations and reservations |
| `ReviewCompleted` | Exact review operation and one of Finding/Clear/Unavailable | Release reservation once and report outcome; unavailable remains distinct from clear |
| `StopPolled` | Exact round and a native deadline fact | Wait while work/output is pending, or mark the decision fence, release charges, request exact cancellations, and emit `FinishReady` or `ReofferAtStop` |
| `OutputStarted` | Exact round at the background writer barrier | Issue one output operation token; a second in-flight write is rejected |
| `OutputTerminal` | Exact output token and Acknowledged/Failed/Unknown fact | Consume the token once; Unknown preserves reoffer eligibility for Stop |
| `RetirePartition` | Exact partition, lifetime, and round at the final finish or shutdown barrier | Release remaining logical charges, request exact cancellations, remove the old round, and reject late callbacks |

`FinishReady` is a decision point for later finding selection and continuation rules, **not** permission to send an allow response. `ReofferAtStop` says an uncertain background write did not establish delivery. It does not duplicate a submission automatically; the later Handoff/Delivery slices must validate the finding, reserve a continuation slot, and cross the native writer barrier. A write in flight causes `WaitForOutput` before deadline. The deadline event can move the round to decision-pending even when output is in flight; its later callback is stale. `RetirePartition` is the explicit terminal cleanup event; later slices must place it after the final output or shutdown barrier. This first slice does not claim to model permits, evidence capture, review scheduling, finding selection, IPC acknowledgements, or the complete installed finish sequence.

The eventual installed sequence joins the current paths in this order: native hook and attribution facts; Bend admission and round/work reservation; native source capture and Jev effects; Bend outcome and logical release; Stop's Bend wait/cutoff fence; native cancellation and final evidence/writer checks; Bend selection/continuation reservation; native output attempt; Bend acknowledgement/unknown disposition. Today, `Lifecycle.finish_gate` supplies part of the Stop fence, `CapacityLedger.replace` supplies ordered replacement, and `Handoff`/`Delivery` supply separate output decisions. Later slices must replace those calls with `Canonical.step` events without making aggregate model events production-ready by assumption.

## Checked TypeScript boundary

`canonical-adapter.ts` is the only TypeScript entry for this model. It maps semantic event tags to compiled Bend constructors, validates positive numeric bounds, limits list length, and rejects unknown event and outcome tags. It checks every returned constructor and field set, state list, ledger charge, round, work kind, command, and rejection tag. An opaque state returned by `initialCanonical` or `stepCanonical` is required; a forged state is rejected. The build script verifies the compiled `Canonical.initial` and `Canonical.step` symbols before writing `canonical.generated.js`.

The projection reads shared and per-advicee usage from compiled `Ledger.total`
and `Ledger.partition_usage`. TypeScript checks these results against the
returned charge list for a malformed-output guard; it does not use a
TypeScript sum as the displayed capacity total. The planned dashboard layout
and still-needed per-unit Bend outputs are in the
[capacity dashboard plan](capacity-dashboard-plan.md).

The adapter validates shape, not native truth: the caller still has to measure bytes, authenticate advicee attribution, compute deadlines, and bind exact runtime IDs. Native effects execute only emitted commands. A malformed input throws before calling Bend; an unknown or malformed compiled output throws before a native effect may be run. Rejected Bend events return their unchanged state with no commands. The fixture at `conformance/canonical-v1.json` was written from the accepted contract, independent of the old TypeScript reducer; `scripts/check-canonical.mjs` compares exact command order, rejections, and global ledger totals. The four added laws in `LAWS.bend` are checked by `PROOF.bend`; they are focused facts, not a universal proof of the whole transition system.
