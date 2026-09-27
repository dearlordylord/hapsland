# Hapsland agent flow in Bend

**Advicing** names the whole flow from an agent-runtime hook toward advice for
the agent. **Jeview** names only the part in which Jev evaluates one item. This
first slice starts with an item at Jev and ends with the pending advice produced
when Jev returns a finding. It does not yet model queues, scheduling, clear
results, background output, or finish-hook decisions.

The first law says that a finding for any item in Jeview produces pending advice
for that same item in one transition. The second law models two Jeview values:
processing a finding for the first preserves the second unchanged. `Jeview`
and `PendingAdvice` are different types, and the model has no intermediate
stored-result type. The second law does not yet assert that the two item IDs
are distinct or model a collection of arbitrary size.

Run the installed Bend 2 checker from this directory:

```sh
bend PROOF.bend
```

The proof covers `Advicing.bend`. It does not prove equivalence with the
TypeScript sidecar in `../agent-flow-viz` or with production Hapsland code.
