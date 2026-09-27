# Sidecar sunset audit for issue #115

This audit follows the separate UI checkpoint `6539be3`. The Hapsland page now
uses compiled `Flow.bend` for acceptance, rejection, state, changes, route
discovery, and history replay. `Flow.bend` remains an abstract one-agent model
with one review item per edit; the production resident uses other generated
Bend policies and ledgers plus TypeScript orchestration. The page does not show
a production resident trace.

## Decision on the TypeScript oracle

Retain `reference-flow.ts` only for the offline differential runner. It is no
longer imported by the page. The runner compares the generated Bend flow with
an independently written TypeScript transition implementation on nine editorial
scenarios, four focused traces, and 100 seeded traces. It compares acceptance,
rejection reason, projected state, ordered changes, and finish details. Its
candidate selection uses the TypeScript oracle, so the 5,048 accepted generated
steps in the checkpoint are useful finite differential evidence, not exhaustive
coverage or proof of production equivalence. Removing it now would lose a
cross-implementation signal that the Foldkit and Bend-only checks cannot supply.

The reference reducer is transitional assurance for epic #116. Retire it only
after a separate independent contract or production event-ledger check covers
the behaviors the differential runner uniquely compares. The contract check
added here covers structural properties and selected outcomes, but does not
replace broad ordered-change and rejection parity. No oracle or fixture was
deleted in the audit phase.

## Structural assertions and replacement seam

The reference reducer's accepted-step assertions in `reference-flow.ts` protect:

| Assertion | Protected behavior | Audit result |
| --- | --- | --- |
| Distinct primary item IDs | No item occupies multiple primary locations | Rechecked after each generated Bend step by `check-flow-contract.mjs`. |
| Lease count and leased ID | Exactly one advice-policy copy matches an active lease; no copy without one | Rechecked after each generated Bend step. |
| Closed-round emptiness | Closed round has no live packets, background wait, or finish wait | Rechecked after each generated Bend step. |
| Accepted-step item conservation | Edits add an item; clear, unavailable, Stop output, and finish remove only the expected primary items | Rechecked after each accepted generated Bend step. |

The new check also asserts that a rejected Bend action keeps state unchanged and
emits no changes. These are executable general properties over 100 deterministic,
bounded 60-step traces, plus fixed cases. They are not Bend proofs over every
reachable state. The properties use the public compiled Bend step and projected
state, so they remain executable if the TypeScript reference is removed later.

## Regression families

| Family | Distinct coverage | Decision |
| --- | --- | --- |
| `LAWS.bend` and `PROOF.bend` Flow laws | Mechanically checked equalities for closed-round rejection, initial edit, invalid capacity, finding/clear, and four-continuation examples | Retain; they are selected examples rather than general structural invariant proofs. |
| `FlowExamples.bend` | Three Bend-authored executable traces | Retain as source-level smoke evidence. |
| `check-sidecar-parity.mjs` | Independent cross-language acceptance, rejection, state, decision, and ordered-change comparison | Retain until equivalent independent coverage exists. |
| `check-flow-contract.mjs` | Fixed expected admission, rejection, continue, and allow results, plus structural checks over Bend generated traces | Add and retain; does not consult the reference reducer. |
| Visualization `check-projection.mjs` | Nine guided paths, Foldkit scene wiring, mixed manual/guided input, capacity, finish, rewind/replay, timeline source links | Retain; it verifies the displayed projection and UI, not independent domain equivalence. |
| Visualization `test:browser` | Real headless Chromium interaction with guided/manual controls, disabled rejection feedback, capacity, finish, rewind, and redo | Retain as the focused browser gate; it requires Playwright browser and system libraries. |
| `check-lifecycle.mjs` | Generated aggregate lifecycle trace | Retain; production-related aggregate scope differs from `Flow.bend`. |

The old browser-side TypeScript-versus-Bend comparison was removed at the UI
checkpoint because the page now has one action authority. Its useful
cross-language evidence remains in the offline parity runner. There is no
evidence that the other regression families are redundant, so none were
removed merely to shorten the suite.

## Remaining boundary

This completes issue #115's bounded UI migration and assurance audit. Epic
#116 still needs to decide the single production Bend transition backbone and
whether a future page should visualize actual resident decision traces. That
design is separate from this simplified `Flow.bend` page.
