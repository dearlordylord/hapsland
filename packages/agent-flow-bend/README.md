# Hapsland agent flow in Bend

`ImportGraph.bend` defines the #141 source-free supporting-reference traversal
for one review unit. Its compiled graph and checked TypeScript adapter drive a
separate dashboard state machine; production cross-file capture is still pending
#133/#138. Run `npm run test:import-graph` for its laws and independent traces.
Supporting tree contributions that do not fit the remaining budget emit `SkipImport(TreeLimit)` while
later pending edges continue within the file, read, work, depth, and deadline
limits. The accepted tree remains within 20 KiB, and a unit with any skipped
import finishes incomplete with no Jev request.
Denied import paths emit `SkipImport(Excluded)` before any source read and also leave
later edges pending. If both a denied path and a tree-budget skip occur, the final
incomplete reason is `TreeLimit`; otherwise a denied path finishes `Excluded`.

`Flow.bend` drives the abstract discussion visualization. Its state holds all live review items, two
independent capacities, the virtual round, finish wait, one delivery lease,
and background submission history. The pure `step` function returns an accepted
state and finish choice or a precise rejection. `changes` derives the same
ordered transition, emission, capacity, and finish-decision records as the
retained TypeScript reference reducer. The older `Advicing.bend` is a small proof slice retained for continuity.

`Admission.bend`, `Work.bend`, and `Handoff.bend` extend the model with
pre-edit permits, observation fan-out, per-finding handoff limits, finish
reservation, and exclusive delivery leases. `Lifecycle.bend` connects
admission, work callbacks, and finish closure for one advicee partition and
resident lifetime. Every preparation and review callback must carry the
partition, lifetime, and round issued by admission. The adapter maps exact
native identities to unique numeric IDs and measures the encoded host output
before passing its byte count to Bend.

The resident executes generated Bend code for admission permits, source and
review work, composed rounds, finding selection and leases, finish waiting,
ticket unit transitions and terminal outcomes, cancellation IDs, response
limits, logical capacity,
background-writer claims,
notice cooldown admission, collection order, readiness, expiry, output-token
phase transitions, and successful-review cache pressure. The generated files
are checked against source hashes before the app builds or tests.
`Canonical.step` provides the resident's aggregate Stop wait and cutoff for an
explicit set of edit partitions, with exact dispatch cancellation IDs and a
decision fence. `DeliveryState.bend` retains the exact selected Stop output
slot, authorization phase, terminal result, and continuation count.
`SubmissionState.bend` retains per finding leases and per output token batches;
it grants one same round Stop reoffer for terminal background advice.
`RevisionState.bend` retains source-free subject/input identities, the current
generation, and live same-input member counts. The resident uses its canonical
register, release, and supersession commands to fence older review callbacks
and retire their advice without changing another advicee's work.
The resident reserves the selected batch before the final IPC barrier and can
release an unwritten provisional slot.
Other
aggregate events remain tested models; the resident calls generated admission,
work, round, and handoff modules at their effect barriers.

Run `npm test` in this directory. It builds `flow.generated.js` and
`lifecycle.generated.js` and the resident policy/ledger artifacts from Bend,
checks every law in `PROOF.bend`, runs a
generated lifecycle trace, executes three Bend flow traces, checks fixed flow
expectations and structural properties over 100 bounded generated traces, then compares
states, rejections, decisions, and ordered changes against the sidecar for its
nine guided scenarios, four focused traces, and 100 deterministic generated
traces. The parity generator exercises both accepted and rejected events. The
reference reducer now lives in `../agent-flow-viz/src/reference-flow.ts` and is
used only by that offline parity runner. The visualization package's
dependencies must be installed with `npm ci` for the parity and contract checks.

Generated JavaScript is an artifact, not an alternate implementation. The
resident maps exact native identities to numeric IDs, revalidates each offered
finding at the final handoff and writer barriers, and keeps source capture,
Jev Effect calls, IPC, and output formatting in TypeScript. The accepted
contract in `../../docs/advicing-target-contract.md` remains the target for
the aggregate lifecycle and installed runtime behavior.

`Canonical.bend` and [`src/canonical/adapter.ts`](../../src/canonical/adapter.ts) define the canonical
state/event/command interface. It owns one global ledger across advicee
partitions, ordered partial replacement, exact logical release, round and
operation identities, Stop waiting/cutoff, and uncertain background output.
The resident's capacity reservations now use its checked transition; the other
resident decision paths move in later slices. See
[`docs/bend-canonical-transition-interface.md`](../../docs/bend-canonical-transition-interface.md).
Run `npm run test:canonical` for Bend proofs and independent source-free traces.
