# Rule evaluation and conformance model

Status: specification only. Defines the shared model for deterministic composition
tests and empirical rule-quality evaluations. No runtime, test runner, or Quint model
is implemented by this document. Formal checking with Quint and `quint-connect-ts` is
recorded as later work; tool compatibility and integration have not been established.

Related: [configuration](./PRODUCT-CONFIGURATION-SPEC-DRAFT.md) and
[combinatorics test specification](./PRODUCT-RULE-COMBINATORICS-TEST-SPEC.md).
This is a specification model, not an update to CONTEXT.md.
The implementation handoff is Phase F issue #3.
The separate input-contract comparison is tracked by
issue #16.

## Core distinction

A rule definition asks a binary question. An assessment records a backend's probability
for that question. A fixture expectation records an author's intended behavior for a
known example. None of those three substitutes for another. A test observation can
contradict the expectation without making the configuration resolver incorrect.

The deterministic system controls eligibility, batching, validation, policy, delivery,
and recording. The backend supplies uncertain judgments. Formal verification can check
the former while modeling backend outcomes nondeterministically; it cannot establish
that the backend understands a domain or that a fixture label is correct.

## Entities and identities

| Entity | Required meaning and identity |
|---|---|
| Rule definition | Qualified pack/rule ID; exact pack version; digest of the actual question and criteria; default message, threshold, and applicability. A version label alone does not prove unchanged content. |
| Fixture | Stable ID, synthetic source file, domain/path presented to the backend, and content hash. Path is part of semantic context and must not change accidentally between comparisons. |
| Expectation | Fixture ID + rule identity + intended result and explanation. This is authored test data, independent of an observed probability. Missing expectations mean unchecked, never clear. |
| Configuration case | Explicit built-in/user/project layers and consent state, with expected effective settings and provenance. |
| Evaluation scenario | Fixture(s), exact rule set and order, effective configuration, backend mode, and, when relevant, an event sequence. Defines an experiment independently of its result. |
| Observation | Actual request shape, backend outcome, validated assessment, selected findings, timing/attempt metadata, and resulting review status. Raw live observations are transient unless an explicitly approved retention policy permits more. |
| Comparison | A declared relationship between observations: exact deterministic equality, semantic-band acceptance, or measured change across batching/fixture transformations. |
| Evaluation run | A selected scenario set, suite/config/rule/fixture identities, backend identity, repeat count, declared call budget, and sanitized results. Transport success, semantic success, and coverage are separate fields. |

Configuration identity records the effective policy as well as pack identities. Rule
definition identity and fixture identity let a result be invalidated when meaning or
input changes, even if names are reused. Operational overrides such as a message change
must not be confused with edits to the question/criteria.

Evaluation identity also records the input-contract version and the renderer/adapter
identity that constructs backend context. The current single full-file fixture is a
prototype baseline, not a permanent restriction on product inputs. Full-file, diff,
task-relative, or multi-file evaluations must not be treated as equivalent merely because
they reuse a question. Phase F explicitly retains the current full-file-plus-path input
for this milestone; declaration extraction and richer context are deferred, non-blocking
work. No additional context egress is authorized by this note.

## Fixture expectations

Use positive and negative examples for each maintained rule, including controls that
look superficially similar but differ in the concept being tested. Each fixture states
why the rule should or should not report a problem. Include boundary/ambiguous examples
as observations where a stable hard expectation is not justified.

For existing Noul calibration conventions, a clear example may require p < 0.3 and a
violation example p > 0.7. These are empirical bands, not calibrated truth guarantees.
An expectation may instead name an explicitly justified finite interval. Band boundaries
and inclusive/exclusive endpoints must be explicit. Do not derive expected labels from
the current backend output or merely from the configurable reporting threshold.

Illustrative fixture family for the inferred-case rule:

| Fixture | Intended expectation | Purpose |
|---|---|---|
| Flat delivery record with optional email and phone, either choosing a different delivery operation | Violation | Positive example of implicit alternatives |
| Delivery union with an explicit case field and case-specific fields | Clear | Negative control expressing the alternatives |
| Customer profile with independently optional email and phone contact attributes | Clear | Prevent treating every optional-field record as alternative operations |

All examples need explicit source/domain text before becoming runnable fixtures; this
table alone is not an empirical result. Expected behavior is recorded per rule. A fixture
targeting one rule does not imply that every other rule should be clear.

## Combinations as scenarios

The model separates three forms of combination so coverage is explicit:

1. **Configuration combinations:** layer precedence, activation, file filters, consent,
   thresholds, and limits. Assert exact behavior with controlled backend answers.
2. **Rule-set combinations:** one rule alone, selected related pairs, and the full
   enabled batch against the identical fixture and rule definitions. Measure whether
   context changes judgments; validate keys and batching exactly.
3. **Lifecycle combinations:** concurrent files, retry/timeout, duplicate events,
   changed snapshots, backend failure, and status/notification transitions. Assert
   behavior through deterministic sequences.

Do not automatically expand to every subset of every rule. Use the exhaustive bounded
Boolean matrix for gating; all single-rule semantic baselines; the full configured
batch; and explicitly named interaction pairs. If a pairwise or other covering-array
suite is introduced, report its covered axes and strength, not an exhaustive claim.
The existing nine-rule set alone has 512 subsets; live enumeration is not a default.

An isolated run and batched run need not return identical probabilities. Record changes
and semantic-band crossings for the same fixture/rule. Define repetition counts and
acceptance tolerance before running a release gate. A transport failure yields an
unavailable observation, not a semantic false negative or a synthesized probability.

A source transformation comparison must explain the expected relation. For example,
making implicit delivery alternatives explicit should improve the inferred-case result
on a curated fixture; arbitrary renaming is not assumed semantically invariant because
names and domain/path can carry meaning for these rules.

## Shared conformance scenario

A deterministic scenario contains an initial state, actions, expected observations,
and named properties. It does not expose Effect layers, provider transport classes, or
test-only orchestration as domain concepts. The same scenario can later be interpreted
by an independent small reference model and by the real subprocess boundary.

Suggested abstract state:

- Effective configuration and its validity/provenance.
- Repository/backend grants and source snapshot identities.
- Observed edit events and per-file review state.
- Selected rule IDs, attempt counts, available concurrency, and logical deadlines.
- Validated assessments or explicit unavailability.
- Candidate/delivered findings and delivery fingerprints.
- Session diagnostic state and receipt observations.

Suggested observable actions:

- Observe a completed edit; resolve configuration; check consent/eligibility.
- Capture a snapshot and select rules; start a backend attempt.
- Receive a valid answer, invalid answer, or transient/permanent failure.
- Advance logical time; mutate/delete a file; update consent/configuration.
- Check the current snapshot before delivery; publish advice/status; record a receipt.

Actions that change files represent the host/environment, not an edit permission
decision by the review integration. The implementation must document when configuration
and consent are sampled; a model must not silently assume continuous enforcement for
already-sent requests.

## Properties suitable for later formal checking

- No backend attempt without valid configuration, matching consent, an eligible snapshot,
  and at least one selected rule at the dispatch authorization checkpoint.
- Rule-level selection never expands global eligibility.
- A successful assessment has exactly the selected rule keys with valid probabilities.
- Every delivered finding identifies a reviewed snapshot; a mismatch at the pre-delivery
  check suppresses it. No claim is made that files cannot change after that checkpoint.
- At most the configured concurrency bound is active; attempts and logical deadlines
  obey configured limits.
- Duplicate delivery fingerprints do not emit repeat advice under a functioning store;
  explicitly model storage failure and the implementation's degraded behavior separately.
- Advice selection is deterministic for a fixed validated assessment and configuration.
- No review action changes or rolls back the host's completed edit.
- Receipt success requires observed completion; no observation is not success.
- A detected operational problem does not become a clean assessment merely because its
  repeated warning was suppressed.

Liveness claims must state assumptions about provider termination, cancellation, storage,
and scheduling. Bounded timeouts are a product mechanism; fairness assumptions are not
evidence that the live host provides a delivery guarantee.

## Boundary for future Quint work

Start with bounded sets of repositories, files, rules, events, and workers. Abstract
probabilities to the distinctions needed for deterministic policy: valid values below,
at, and above the threshold, plus invalid/missing responses. Preserve ties and ordering
when verifying ranking; threshold classes alone cannot prove the complete sort order.
The TypeScript boundary tests retain finite-number and exact-boundary coverage.

Quint would describe allowed transitions and properties. A later `quint-connect-ts`
investigation should determine how abstract actions and observations can be mapped to
the implementation and how failing traces become replayable tests. This document does
not assume a particular API, package version, or existing compatibility. Keep the
independent model from delegating expected answers to the implementation under test.

Both tools are deferred. They are not Phase F acceptance gates unless separately adopted.
Current test design should preserve explicit states, actions, identities, and observations
so later model-based checks can reuse the scenarios.

## Execution and reporting policy

Ordinary tests use controlled answers and remain offline. Semantic evaluation is a
separate explicit milestone operation using local synthetic fixtures and the same live
DecisionModel integration. Its selected scenario/repeat plan must expose the expected
request count and a bounded maximum including retries before execution.

The user's cumulative authorization of 1,000 paid calls for the ongoing project work is
an external execution constraint, not a default product allowance. Account for calls
already spent before any new live milestone. No paid run is requested by this document.

Retain fixture/rule/version identifiers, scenario coverage, availability counts, semantic
pass/fail summaries, band-crossing counts, and timing/usage aggregates. Do not persist
credentials, source-bearing paid responses, or individual paid probability snapshots.
Human-authored synthetic fixture source and expectations may be versioned independently.

Report transport availability, conformance correctness, semantic expectations, and tested
combination coverage separately. A suite with unobserved or unavailable cases is not
fully passed, and passing deterministic tests does not certify rule judgment quality.
