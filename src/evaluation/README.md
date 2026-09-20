# Offline evaluation substrate

`src/evaluation/` is the host-independent model and bounded execution seam for the
rule-meaning milestone. `runner.ts` invokes the production `ReviewBackend` service,
which is backed by the same provider-neutral `DecisionModel` path as ordinary review.
`command.ts` exposes offline `plan`, `run`, and `report` operations; the regular test
command never invokes a provider.

The construction helpers in `digest.ts` compute SHA-256 identities from canonical,
recursively key-sorted JSON. Fixture content and rule question/criteria are therefore
part of reproducibility even when a name or version is reused. Scenario identities also
include the ordered rule set, fixture content/path references, effective configuration,
backend mode, input-contract identity, renderer/adapter identity, and lifecycle actions.

`planEvaluation` computes logical requests and the worst case including the declared
retry ceiling before any request is authorized. `enforceCallBudget` checks observed
attempts without truncating or reordering results. `compareObservation` and
`compareObservationPair` keep exact deterministic equality, semantic bands, and named
batch changes distinct. Every configured repetition receives its own semantic and
cross-batch comparison; repeatability checks compare each later repetition with the
first, so no budgeted observation is omitted from acceptance. Missing expectations
produce `unchecked`; ambiguous fixtures produce `ambiguous` and never become a clear
result.

`buildEvaluationReport` retains only sanitized aggregate counts, identities, digests,
comparison summaries, coverage, and aggregate timing percentiles (sample count, total,
mean, minimum, maximum, p50, and p95 duration). It does not persist fixture source,
raw provider responses, individual live probabilities, credentials, or advice text.
Ordinary tests for this module are deterministic and offline. Live execution requires
the evaluation opt-in flag, a non-empty credential environment variable, and a declared
remaining authorization within the project's cumulative 1,000-call milestone; no
command or test silently upgrades a controlled run to paid execution.
