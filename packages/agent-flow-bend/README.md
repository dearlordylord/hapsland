# Hapsland agent flow in Bend

**Purpose:** Explain the Bend package, production boundary, generated artifacts, and executable checks.
**Status:** Active package documentation.
**Authority:** Maintained guidance; linked specifications own accepted product behavior.
**Expected use:** Build, inspect, and change Bend models and their checked production adapters.
**Lifecycle:** Maintained alongside package source, build scripts, and adapter changes. Review whenever a transition owner, generated ABI, build command, or model/production boundary changes, including #137 authority reconciliation and #138 import-graph adoption.

`ImportGraph.bend` defines source-free supporting-reference traversal for one
review unit. Its compiled graph and checked TypeScript adapter support the
visualization's replay. Run `npm run test:import-graph` for its laws and
independent traces. `import-graph-proof/LAWS.bend` and
`import-graph-proof/PROOF.bend` contain the general budget and finite-event
termination theorems; this command checks their BendTT kernel verdict.
The model holds pending edges, visited declaration IDs, phase, counters, and
the complete or incomplete result. Native code supplies syntax and import
binding, path eligibility, and stable capture facts. Bend chooses the next
edge and whether the measured work fits its limits. Before each supporting
source read, native code checks the path against containment, protected paths,
Git ignore, and user file selection. A denied path is never read; the graph
records an omission and later rule selection checks whether that evidence is
required. The separate dashboard import
view replays this checked model; production review uses the shared checked
`Canonical.step` adapter for its decisions.
Supporting tree contributions that do not fit the remaining budget emit `SkipImport(TreeLimit)` while
later pending edges continue within the file, read, work, depth, and deadline
limits. The accepted tree remains within its effective configured cap (20 KiB
by default). A graph with a skipped import finishes incomplete; a rule that does
not need that import may still reach Jev with the omission marked.
Each unit holds one versioned limits value and an event budget of
`4 × work + 2`. Each delivered graph event spends one event; exhaustion
terminates incomplete even when a captured node reports zero bytes. This
conditional liveness result assumes each `ResolveEdge`, `CheckPath`, and
`ReadSource` command eventually receives its matching fact or the host
delivers `DeadlineReached`. A stalled external command supplies no event.
Terminal phases deliberately self-loop on subsequent events.
Denied import paths emit `SkipImport(Excluded)` before any source read and leave
later edges pending. Missing, ambiguous, and unsupported targets also emit
`SkipImport` and leave later edges pending. If both a denied path and a tree-budget
skip occur, the final graph reason is `TreeLimit`; otherwise a denied path finishes
`Excluded`. Other omitted imports finish `Omitted`.

`Canonical.bend` is the production transition model and drives the main
visualization through the checked TypeScript adapter.
The maintained [TypeScript decision boundary ledger](../../docs/typescript-decision-boundary-ledger.md)
records reviewed product choices intentionally made outside this reducer.
`Flow.bend` remains only as a shared capacity-type dependency of the existing
Work policy artifact; no page or production path invokes `Flow.step`.
The older `Advicing.bend` is a small proof slice retained for continuity.

`Admission.bend`, `Work.bend`, and `Handoff.bend` extend the model with
pre-edit permits, observation fan-out, per-finding handoff limits, finish
reservation, and exclusive delivery leases. `Lifecycle.bend` is a separate
tested model of admission, work callbacks, and finish closure for one advicee
partition and resident lifetime. Production uses `Canonical.step` for those
decisions. Every preparation and review callback must carry the
partition, lifetime, and round issued by admission. The adapter maps exact
native identities to unique numeric IDs and measures the encoded host output
before passing its byte count to Bend.

The resident enters `Canonical.step` through the shared adapter for admission permits, source and
review work, composed rounds, finding selection and leases, finish waiting,
ticket unit transitions and terminal outcomes, cancellation IDs, response
limits, logical capacity,
background-writer claims,
notice cooldown admission, collection order, readiness, expiry, output-token
phase transitions, and successful-review cache pressure. Internal Bend modules
provide the rules; the resident does not invoke their generated wrappers
independently. The generated artifacts are checked against source hashes and
their consumed constructors before the app builds or tests.
`Canonical.step` provides the resident's aggregate Stop wait and cutoff for an
explicit set of edit partitions, with exact dispatch cancellation IDs and a
decision fence. The wait gives unfinished reviews a chance to become advice
before the safe deadline; the cutoff requests cancellation of remaining work only when a finish
decision is made, as specified in the [accepted advicee contract](../../docs/advicing-target-contract.md).
`DeliveryState.bend` retains the exact selected Stop output
slot, authorization phase, terminal result, and continuation count.
`SubmissionState.bend` retains per finding leases and per output token batches;
it grants one same round Stop reoffer for terminal background advice.
`RevisionState.bend` retains source-free subject/input identities, the current
generation, and live same-input member counts. The resident uses its canonical
register, release, and supersession commands to fence older review callbacks
and retire their advice without changing another advicee's work.
`TicketState.bend` retains admission identities and a flat set of per-unit
review facts; every unit names its admission. It stores no reverse unit list
or aggregate outcome phase. The resident derives collection availability from
live work and advice, while canonical authority checks guard expiry and
credentials. Duplicate delivered marks and late results for unavailable units
are refused.
`ReuseState.bend` retains source-free evaluation claims and successful cache
LRU order. The resident follows canonical route, admission, eviction, and
partition expiry commands while keeping request handles and cached payloads
native.
The resident reserves the selected batch before the final IPC barrier and can
release an unwritten provisional slot.
Other aggregate events remain tested models.

Run `npm test` in this directory. It rebuilds the import-graph and canonical
artifacts from Bend, checks the laws in
`PROOF.bend` and the import graph kernel proofs, and replays their independent
source-free contract traces.
The existing policy and lifecycle artifacts are
still checked against their source hashes by the root build. The canonical
ledger owns reservation limits.

Generated JavaScript is an artifact, not an alternate implementation. The
resident maps exact native identities to numeric IDs, revalidates each offered
finding at the final handoff and writer barriers, and keeps source capture,
Jev Effect calls, IPC, and output formatting in TypeScript. The accepted
contract in `../../docs/advicing-target-contract.md` remains the target for
the aggregate lifecycle and installed runtime behavior.

`Canonical.bend` and [`src/canonical/adapter.ts`](../../src/canonical/adapter.ts)
define the resident's checked state/event/command interface. It composes a
global ledger across advicee partitions with round and operation identities,
Stop waiting and cutoff, and uncertain background output. The resident uses
this interface for its decision paths; TypeScript owns runtime orchestration
and effects.
Run `npm run test:canonical` for Bend proofs and independent source-free traces.

TypeScript may derive display, layout, and instrumentation projections only
when those values cannot affect a product decision. It supplies any
decision-affecting value as an explicit fact to Bend. TypeScript measures time
and supplies clock and deadline facts; pure Bend decisions do not read an
implicit host clock.
