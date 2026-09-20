# Review-unit vocabulary contract

This disposable design artifact records the vocabulary resolved by the Wayfinder ticket
“Name the semantic review unit and pipeline vocabulary.” It is not production code or an
implementation authorization.

`contract.ts` models the agreed pipeline boundaries:

- `ChangeObservation` produces either an `ObservationResult` without semantic work or a
  complete, stable `ChangeSet`;
- extraction produces immutable `ReviewUnit` values with one root `Artifact` and finite
  recursive `expanded`, `included`, or `omitted` references;
- `ReviewWorkItem` freezes the observation, rule-set, and input-contract context for one
  logical Jev evaluation;
- `ReviewInput` is the exact semantic input supplied to the decision model;
- `ReviewResult` exists only for an actual work item; and
- review results aggregate into an `AdviceBatch` for one host delivery.

The work and result queues are hard-bounded, in-memory, and nonpersistent. Their actual
hardcoded item and retained-byte limits belong to the later scheduling decision and are
not selected by this artifact. Source is transient; persisted reconciliation state remains
source-free.

## Verification

Typecheck:

```sh
node_modules/.bin/tsc --ignoreConfig --noEmit --skipLibCheck \
  --target ES2022 --moduleResolution bundler --module preserve \
  experiments/review-unit-vocabulary/contract.ts
```

On 2026-09-20, the complete synthetic contract was evaluated once through the product’s
Effect `DecisionModel` and `@effect/ai-typesafe` integration using the bundled nine-rule
Noul pack. The call completed in 602 ms with zero retries. Eight rules remained below the
configured advice threshold. The sole advice identified names whose plain string or number
types did not enforce their promised constraints. The retained contract addresses that
finding with distinct validated value types. No raw provider response, credential, source-
bearing response, or individual probability is retained, and no post-correction paid call
was made.
