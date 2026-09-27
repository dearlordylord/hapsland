# Bend visualization and production-use audit

The visualization now runs the TypeScript sidecar reducer and generated
`Flow.bend` JavaScript on the same event history. It draws both sets of state,
routes, emissions, and finish decisions side by side. It compares initial state,
all displayed routes, acceptance and rejection reasons, ordered changes, and
every projected state field after each replayed step.

This is a comparison of **overlapping flow behavior**. The sidecar models one
review item per edit and omits much of the production lifecycle. A matching
pair of diagrams cannot establish that the wider resident matches the sidecar.
The page therefore lists the additional Bend policy areas and links their
source modules to resident call sites. Those links are a coverage map, not an
interactive simulation of the full resident.

## Which Bend code runs where

- Production imports generated Bend policy and ledger functions for material
  pure decisions. The resident still performs runtime I/O, Jev Effect calls,
  exact identity and time measurement, state orchestration, and application of
  decisions in TypeScript.
- `Flow.bend` is an executable parity model used by the visualization and
  package checks. Production does not call its `bendStep` reducer.
- The aggregate `Lifecycle.apply` model is executed by the lifecycle check.
  Production calls selected generated lifecycle gates alongside its native
  state, rather than using one aggregate lifecycle reducer instance.
- The generated policy artifact exports 114 `bend*` wrappers. A static search
  of non-test `src/resident` files found production references to 106. The
  eight exports without a production reference are
  `bendWorkFinishWait`, `bendLeaseReserve`, `bendLeaseRelease`,
  `bendLeaseReoffer`, `bendLeaseClose`, `bendRoundBeginDecision`,
  `bendRoundReserveOutput`, and `bendRoundReleaseOutput`. The search does
  not establish why each is retained or prove that every referenced wrapper
  is dynamically reachable.

The broader migration audit found no remaining concrete material pure
review-flow decision owned by TypeScript at the chosen policy boundary.
That is an ownership claim, not a claim that every Bend definition executes
in production or that every runtime behavior is formally proved.

## Verification

- `npm test` in `packages/agent-flow-bend` passed: Bend proofs and model checks,
  plus 113 sidecar parity traces with 5,048 accepted generated steps.
- `npm run build` in `packages/agent-flow-viz` passed: TypeScript check, the nine
  guided comparisons, capacity and rejection comparisons, and Vite build.

The comparison uses the compiled Bend reducer, with separate route discovery
from Bend's emitted changes. Box placement and wording remain shared
presentation code. Future sidecar or Bend changes will appear as a visible
route or replay difference when exercised; paths outside the compared model
remain outside this claim.
