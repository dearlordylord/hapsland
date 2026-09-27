# Hapsland agent flow in Bend

`Flow.bend` now implements the one-advicee discussion reducer from
`../agent-flow-viz/src/flow.ts`. Its state holds all live review items, two
independent capacities, the virtual round, finish wait, one delivery lease,
and background submission history. The pure `step` function returns an accepted
state and finish choice or a precise rejection. `changes` derives the same
ordered transition, emission, capacity, and finish-decision records as the
sidecar. The older `Advicing.bend` is a small proof slice retained for continuity.

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
cancellation IDs, response limits, logical capacity, background-writer claims,
and notice cooldown admission. The generated files
are checked against source hashes before the app builds or tests.
`Lifecycle.bend` remains a tested aggregate model; the resident composes its
generated admission, work, round, and handoff modules at their effect barriers.

Run `npm test` in this directory. It builds `flow.generated.js` and
`lifecycle.generated.js` and the resident policy/ledger artifacts from Bend,
checks every law in `PROOF.bend`, runs a
generated lifecycle trace, executes three Bend flow traces, then compares
states, rejections, decisions, and ordered changes against the sidecar for its
nine guided scenarios, four focused traces, and 100 deterministic generated
traces. The generator exercises both accepted and rejected events. The sidecar
package's dependencies must be installed with `npm ci` for the parity check.

Generated JavaScript is an artifact, not an alternate implementation. The
resident maps exact native identities to numeric IDs, revalidates each offered
finding at the final handoff and writer barriers, and keeps source capture,
Jev Effect calls, IPC, and output formatting in TypeScript. The accepted
contract in `../../docs/advicing-target-contract.md` remains the target for
the aggregate lifecycle and installed runtime behavior.
