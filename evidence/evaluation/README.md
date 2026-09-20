# Rule-meaning milestone evidence

Status: deterministic offline validation complete; the live milestone is preregistered
and awaiting an explicitly available credential. No paid provider call was made while
landing or correcting the evaluation execution slice.

The live milestone plan is frozen in
[`live-plan-2026-09-20.json`](./live-plan-2026-09-20.json). It uses one repetition,
zero retries, and a hard ceiling of 44 paid calls. That ceiling fits within the
conservative 108-call lower bound remaining from the cumulative 1,000-call project
authorization. Its generated plan digest is recorded before execution, and its release
gates, authored bands, rationales, and cross-batch comparisons may not be weakened after
results are observed.

The controlled milestone uses four human-authored inferred-case fixtures (positive,
negative, superficially similar negative control, and ambiguous), the full bundled
nine-rule production pack, isolated single-rule scenarios, the full enabled batch,
and a named related-rule pair. The runner sends identical fixture domain/path/source
contexts through the production compiler and `ReviewBackend` service. Controlled
answers are test data, never labels or ground truth.

Acceptance evidence is executable in `src/evaluation/runner.test.ts` and the real
JSON subprocess boundary:

- two repetitions cover 88 logical observations and include deterministic repeat
  comparisons;
- transport and assessment conformance are reported independently from semantic
  bands and cross-batch changes;
- missing expectations are `unchecked`, ambiguous expectations remain `ambiguous`,
  and no result is synthesized as clear;
- plans expose 44 requests and 132 worst-case attempts for one repetition with two
  retries, before any backend layer is acquired;
- a live plan/run is rejected without explicit opt-in, credentials, and remaining
  cumulative authorization; the default command is controlled/offline;
- reports preserve run/plan/fixture/rule/expectation digests and input-contract and
  renderer/adapter identities while omitting source, credentials, raw responses,
  advice text, and individual probabilities.
- reports retain only aggregate timing evidence (sample count, total/mean/minimum/
  maximum duration, p50, and p95); individual request durations are not persisted.
- every configured repetition contributes semantic and cross-batch comparisons and
  release acceptance; repeatability checks cover each later repetition against the first.
- the run carries a predeclared release gate requiring transport, conformance, semantic
  bands, and no unchecked labels; this controlled sample therefore does not claim a
  semantic-quality release certification.

The sample is not a truth or confidence guarantee for the backend. It does not claim
exhaustive paid rule-subset enumeration, formal verification, declaration extraction,
additional input context, remote pack distribution, or release-installation coverage.
