# Hapsland agent flow in Bend

`Flow.bend` now implements the one-advicee discussion reducer from
`../agent-flow-viz/src/flow.ts`. Its state holds all live review items, two
independent capacities, the virtual round, finish wait, one delivery lease,
and background submission history. The pure `step` function returns an accepted
state and finish choice or a precise rejection. `changes` derives the same
ordered transition, emission, capacity, and finish-decision records as the
sidecar. The older `Advicing.bend` is a small proof slice retained for continuity.

Run `npm test` in this directory. It builds `flow.generated.js` from Bend,
checks every law in `PROOF.bend`, executes three Bend traces, then compares
states, rejections, decisions, and ordered changes against the sidecar for its
nine guided scenarios, four focused traces, and 100 deterministic generated
traces. The generator exercises both accepted and rejected events. The sidecar
package's dependencies must be installed with `npm ci` for the parity check.

`flow.generated.js` is produced from `FlowRuntime.bend` by
`scripts/build-flow.mjs`; the script fails if the generated symbol layout
changes. The generated file is an artifact, not an alternate implementation.
The TypeScript runtime adapter and product migration are separate follow-up
steps. The accepted contract in `../../docs/advicing-target-contract.md` also
extends beyond sidecar parity, including multiple review units per edit,
bounded advice batches, and uncertainty-aware handoff.
