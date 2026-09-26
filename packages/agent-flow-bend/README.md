# Hapsland agent flow in Bend

This package starts a Bend model of the sidecar's review flow. Its first slice
contains one item being evaluated by Jev and the pending advice produced when
Jev returns a finding. It does not yet model queues, scheduling, clear results,
background output, or finish-hook decisions.

The first law says that a finding for any reviewed item produces pending advice
for that same item in one transition. `JevReview` and `PendingAdvice` are
different types, and the model has no intermediate stored-result type.

Run the installed Bend 2 checker from this directory:

```sh
bend PROOF.bend
```

The proof covers `Review.bend`. It does not prove equivalence with the
TypeScript sidecar in `../agent-flow-viz` or with production Hapsland code.
