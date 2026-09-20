# Offline evaluation substrate

`src/evaluation/` is the host-independent model for the rule-meaning milestone. It
does not invoke a backend and it does not add an execution command. A future runner
can use the same `EvaluationScenario` values for controlled, fake-HTTP, or explicitly
opted-in live DecisionModel execution.

The construction helpers in `digest.ts` compute SHA-256 identities from canonical,
recursively key-sorted JSON. Fixture content and rule question/criteria are therefore
part of reproducibility even when a name or version is reused. Scenario identities also
include the ordered rule set, fixture content/path references, effective configuration,
backend mode, input-contract identity, renderer/adapter identity, and lifecycle actions.

`planEvaluation` computes logical requests and the worst case including the declared
retry ceiling before any request is authorized. `enforceCallBudget` checks observed
attempts without truncating or reordering results. `compareObservation` and
`compareObservationPair` keep exact deterministic equality, semantic bands, and named
batch changes distinct. Missing expectations produce `unchecked`; ambiguous fixtures
produce `ambiguous` and never become a clear result.

`buildEvaluationReport` retains only sanitized aggregate counts, identities, digests,
comparison summaries, and coverage. It does not persist fixture source, raw provider
responses, individual live probabilities, credentials, or advice text. Ordinary tests
for this module are deterministic and offline; live evaluation remains an explicit
milestone operation outside the test command.
