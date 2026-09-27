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

The resident now executes generated `Handoff.bend` code for finding selection
and response size decisions, and generated `Ledger.bend` code for logical
capacity reservations. The generated files are checked against source hashes
before the app builds or tests. `Lifecycle.bend` and delivery lease transitions
remain modeled and tested here but are not yet connected to the production
resident.

Run `npm test` in this directory. It builds `flow.generated.js` and
`lifecycle.generated.js` and the resident policy/ledger artifacts from Bend,
checks every law in `PROOF.bend`, runs a
generated lifecycle trace, executes three Bend flow traces, then compares
states, rejections, decisions, and ordered changes against the sidecar for its
nine guided scenarios, four focused traces, and 100 deterministic generated
traces. The generator exercises both accepted and rejected events. The sidecar
package's dependencies must be installed with `npm ci` for the parity check.

Generated JavaScript is an artifact, not an alternate implementation. The
resident still supplies placeholder selection identity metadata because its
round and lease migration is pending. Handoff selection and leases still need
to be connected to the lifecycle state; the TypeScript migration must enforce
exact identity mapping and fresh validation at the final writer barrier. The
accepted contract in
`../../docs/advicing-target-contract.md` remains the target for that work.
