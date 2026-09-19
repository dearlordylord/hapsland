## Problem Statement

The product has research, an implementation plan, and a working Effect 4 Jev decision
prototype, but it does not yet have an evidence-backed Codex adapter or an end-to-end path
from a completed edit to advice visible to the agent. Codex lifecycle behavior, event
envelopes, output delivery, failure behavior, and coexistence with other hooks must be
distinguished between documented claims, source observations, and runtime evidence before
the product can claim support.

The next work must prove a deliberately narrow version-one path: after Codex successfully
edits an eligible file, the product synchronously reviews the resulting snapshot, obtains
one Jev Noul probability per configured rule in one request for that file, derives advisory
feedback locally, returns that feedback before Codex's next action, and never rejects or
reverses the completed edit. Synchronous describes when Codex waits for advice; it does not
turn the probabilities into allow or deny decisions.

## Solution

Deliver phases 2–5 of the product implementation plan as one evidence-driven vertical
slice:

1. Derive and publish a versioned Codex adapter contract from official documentation,
   pinned Codex source, and existing adapters, labeling every behavioral claim by evidence
   level.
2. Run a narrow, reproducible probe against the locally available Codex CLI to settle only
   behavior that requires a live host, recording sanitized fixtures and the exact Codex
   version.
3. Implement the complete post-write-to-advice flow behind a versioned JSON stdin/stdout
   process contract, using a controllable Effect DecisionModel so scheduling, validation,
   snapshot, policy, and failure behavior are deterministic.
4. Replace the controllable backend with the exact-pinned Effect 4 ai-typesafe layer, first
   validating one representative Noul rule and then the full configured Noul set, while
   preserving the same product-owned assessment and review-result contracts.

The primary acceptance seam is the product's JSON subprocess boundary: a test submits a
representative successful-edit event and repository fixture, runs the real review command
with a controllable backend, and asserts the emitted protocol response, advice, snapshot
identity, and unchanged completed edit. A separate isolated live-Codex probe validates
behavior owned by Codex itself, such as invocation order and whether output is presented
before the next agent action.

## User Stories

1. As a Codex user, I want feedback immediately after a successful edit, so that the agent can consider it before taking its next action.
2. As a Codex user, I want the completed edit to remain completed regardless of the review result, so that advisory review cannot silently become an edit gate.
3. As a Codex user, I want review latency to delay only the next agent action and never decide whether an edit is allowed, so that timing and policy semantics remain distinct.
4. As a Codex user, I want feedback to identify the exact file snapshot it reviewed, so that I can detect advice about stale content.
5. As a Codex user, I want no finding to be distinguishable from review unavailability, so that backend failure is never presented as clean code.
6. As a Codex user, I want malformed or incomplete backend responses to fail open with a bounded diagnostic, so that my work continues without false reassurance.
7. As a Codex user, I want missing Jev credentials to preserve my edit and report review unavailability, so that local development is not broken by configuration gaps.
8. As a Codex user, I want excluded, sensitive, generated, vendored, oversized, and non-regular files skipped before source egress, so that review respects privacy and repository boundaries.
9. As a Codex user, I want shell-mediated writes to have an explicitly tested or explicitly unsupported status, so that the product does not overstate interception coverage.
10. As a Codex user, I want native patches, file creation, and multi-file patches covered by host evidence, so that supported edit forms are precise.
11. As a Codex user, I want failed edits not to trigger review of nonexistent results, so that advice corresponds only to completed writes.
12. As a Codex user, I want a multi-file edit reviewed per eligible file with bounded concurrency, so that total delay does not grow through unnecessary serialization.
13. As a Codex user, I want one concise combined response for a multi-file edit, so that useful feedback is not drowned in repetitive output.
14. As a Codex user, I want a findings budget with deterministic ordering, so that the most relevant advice remains stable and readable.
15. As a Codex user, I want repeated delivery of the same event and snapshot not to duplicate advice, so that retries or host quirks do not create noise.
16. As a Codex user, I want the product to coexist with another configured hook during the live probe, so that the adapter design does not assume exclusive ownership.
17. As a Codex user, I want malformed output, timeout, crash, and killed-process behavior characterized against the real host, so that operational failure is predictable.
18. As a Codex user, I want interactive and headless Codex behavior compared where both are available, so that support claims name the tested execution mode.
19. As a product maintainer, I want the Codex contract tied to an exact tested CLI version, so that future host changes can be evaluated intentionally.
20. As a product maintainer, I want each Codex behavior marked documented, source-inspected, runtime-tested, inferred, or unknown, so that evidence quality is not conflated.
21. As a product maintainer, I want sanitized real event and output fixtures, so that adapter regressions can be tested without repeatedly invoking Codex.
22. As a product maintainer, I want official documentation and pinned source inspected before runtime experiments, so that probes answer only unresolved host-owned questions.
23. As a product maintainer, I want unknown Codex fields decoded at the boundary rather than cast into domain types, so that protocol drift fails visibly.
24. As a product maintainer, I want protocol stdout reserved for machine-readable output and diagnostics sent through a safe separate channel, so that logs cannot corrupt host communication.
25. As a product maintainer, I want a versioned JSON process contract around the product core, so that future agent-host adapters and implementation-language changes do not alter review semantics.
26. As a product maintainer, I want host event parsing isolated from snapshot reading, review evaluation, and advice policy, so that Codex-specific details do not leak into the core.
27. As a product maintainer, I want file content read only after the successful write and hashed before evaluation, so that advice names the actual reviewed artifact.
28. As a product maintainer, I want a changed-during-review file detected before advice is emitted, so that stale feedback is not presented as current.
29. As a product maintainer, I want a stable rule identifier for every configured question, so that assessment keys and advice remain traceable across runs.
30. As a product maintainer, I want all applicable Noul questions for one file sent in one Jev request, so that the product preserves the proven batching contract.
31. As a product maintainer, I want the assessment to contain exactly one finite probability in the inclusive range zero to one for every requested rule, so that partial or ambiguous results cannot enter policy logic.
32. As a product maintainer, I want probabilities to mean that each binary proposition is true, so that they are not mislabeled as generic confidence or severity.
33. As a product maintainer, I want applicability, thresholds, messages, ranking, and findings limits derived locally from the assessment, so that Jev transport results remain separate from product policy.
34. As a product maintainer, I want reviewed, skipped, and unavailable outcomes represented explicitly, so that empty maps and errors cannot collapse into the same state.
35. As a product maintainer, I want backend identity, model metadata, duration, and usage kept outside the probability map, so that operational data does not contaminate the domain assessment.
36. As a product maintainer, I want controlled backend cases at zero, threshold boundaries, and one, so that advice policy is correct at every important boundary.
37. As a product maintainer, I want controlled backend durations of 0, 100, 500, and 2,000 milliseconds, so that synchronous waiting behavior and timeouts can be measured deterministically.
38. As a product maintainer, I want incomplete, out-of-range, non-finite, wrong-kind, failed, and timed-out backend results covered, so that validation and fail-open behavior are exhaustive.
39. As a product maintainer, I want the controllable backend to use the same DecisionModel authority seam as the live provider, so that deterministic tests exercise the real orchestration path.
40. As a product maintainer, I want all Effect companion packages pinned to the same exact RC cohort, so that prerelease incompatibilities cannot enter through open ranges.
41. As a product maintainer, I want the live integration to use Effect's provider-neutral Decision and DecisionModel API with ai-typesafe, so that the historical vendored wrapper remains evidence rather than a production dependency.
42. As a product maintainer, I want one representative Noul rule compared with the recorded pre-migration behavior before enabling the full rule set, so that migration differences are isolated.
43. As a product maintainer, I want the full enabled Noul set checked for exact answer keys and single-call batching, so that adding rules does not change transport semantics.
44. As a product maintainer, I want live Jev evaluation to be an explicit, credential-gated integration test, so that ordinary tests are deterministic and do not create paid network calls.
45. As a product maintainer, I want end-to-end p50, p95, and p99 hook timing, payload size, retries, and Codex-visible delivery timing recorded, so that the synchronous design is evaluated with evidence rather than the expected 100 ms call time.
46. As a product maintainer, I want source content omitted from routine logs and sanitized from captured fixtures, so that diagnostics do not create a second data-egress path.
47. As a future host-adapter author, I want the canonical event, assessment, and review-result contracts independent of Codex, so that OpenCode, Claude Code, Kimi Code, Pi, and other hosts can later adapt without changing Jev rules.
48. As a future backend author, I want the review backend behind a product-owned port, so that a later non-Jev analyzer can return canonical assessments or advice without teaching the Codex adapter its wire format.
49. As a product owner, I want unsupported or contradictory Codex behavior recorded as a capability gap rather than papered over, so that a failed probe can refine the specification without creating a false support claim.
50. As a product owner, I want phase outputs committed with provenance and linked from this issue, so that research advisory evidence remains separate from normative implementation decisions.

## Implementation Decisions

- Scope maps to phases B–E in the existing implementation plan: Codex adapter
  specification, targeted Codex runtime probe, deterministic vertical slice, and real Jev
  vertical slice.
- The implementation language is TypeScript. Product code uses the exact Effect 4 RC cohort
  currently selected by project policy: effect and Effect companion packages at
  4.0.0-rc.116.
- The initial runtime target is the locally available codex-cli 0.155.1. The adapter
  contract records the exact source revision or published artifact inspected and the exact
  runtime version tested.
- The adapter research artifact is contract-focused. Every assertion is labeled
  documented, source-inspected, runtime-tested, inferred, or unknown; documentation records
  a project claim, not runtime proof.
- The live probe is isolated from normal user configuration and restores its temporary
  configuration. It uses disposable fixtures, performs no Jev calls, and captures only
  sanitized evidence.
- If Codex does not expose the required synchronous post-write feedback capability, the work
  records the precise gap and must not claim Codex support. The host-neutral process
  contract and deterministic slice may still be completed, but no undocumented interception
  mechanism is silently substituted.
- Version one is strictly advisory. A successful edit is never rejected, rolled back,
  converted to a permission request, or assigned an allow or deny result.
- Version one is post-write and synchronous: review begins after successful mutation and
  Codex waits for the result before its next reasoning or action step. Backend wait time is
  not a policy block.
- The highest stable product seam is a versioned JSON stdin/stdout command contract. Host
  adapters translate native events into that contract and translate its response into the
  host-supported advisory channel.
- Protocol input and configuration are decoded from unknown values with Effect Schema.
  Excess or malformed data receives an explicit bounded protocol error; unsafe casts do not
  establish trust.
- Machine-readable protocol output owns stdout. Operational logs and diagnostics use a
  separate bounded channel and never include source text or credentials.
- The core keeps host adaptation, snapshot acquisition, rule selection, backend evaluation,
  advice derivation, and orchestration as separate responsibilities while remaining in one
  package until a separately released artifact creates a real package boundary.
- Effect services and layers are used at effectful authority boundaries: host adapter,
  filesystem snapshot reader, review backend, configuration, clock, and live provider
  wiring. Applicability, advice derivation, ordering, and findings budgeting remain pure.
- Public and non-trivial Effect workflows use named Effect.fn boundaries and translate SDK,
  filesystem, subprocess, and host failures into product-owned typed errors.
- The product-owned assessment contract remains one exact map from configured rule ID to
  validated probability. It contains neither aggregate score nor advice text, severity,
  transport status, model metadata, or usage.
- The review result remains an exhaustive distinction between reviewed, skipped, and
  unavailable. No finding after a successful review is not represented the same way as
  failure to review.
- Every reviewed result carries path and content hash identity for the snapshot. Before
  emission, the runtime checks whether the file still matches that identity; changed content
  yields stale handling rather than current advice.
- Eligibility filtering occurs before constructing a backend request. The first slice
  covers configured paths and extensions, regular-file checks, size limits, and generated,
  vendor, and privacy exclusions.
- Each eligible file is evaluated independently. All applicable rules for that file are
  batched into one DecisionModel.decide operation. Multi-file evaluation uses a small
  explicit concurrency bound and produces one deterministic, budgeted response.
- The deterministic evaluator implements the same Effect DecisionModel authority used by
  the live TypeSafe provider. It returns controlled Jev-shaped probability answers, delays,
  typed failures, and malformed-result cases without adding a fake-only orchestration path.
- Boundary validation requires the exact requested rule-key set, the Probability decision
  kind for every answer, and a finite value in the inclusive range zero to one. Missing
  answers are not synthesized as zero.
- Applicability, advisory thresholds or bands, message templates, stable ordering, and
  findings budget are local rule policy. There is no weighted cross-rule quality score.
- Backend and tool failures are fail-open with respect to the completed edit and visible as
  unavailable. Retries apply only to classified transient, idempotent Jev requests with an
  explicit bound.
- Timeouts, retry schedules, and controlled delays use Effect clock and scheduling
  capabilities. Version one introduces no persistent queue, background worker, or debounce.
- The live Jev layer uses Decision.probability, DecisionModel.decide, and ai-typesafe. The
  vendored historical wrapper remains a migration oracle and fixture source, not an active
  dependency.
- Live validation proceeds in two gates: one representative Noul rule compared with
  recorded prototype evidence, then all enabled Noul rules in a single request per file.
- Live network evaluation requires explicit credentials and opt-in. It records timings and
  response shape without committing secrets, raw source payloads, or paid-call outputs that
  expose user content.
- Phase completion updates the product's evidence and compatibility declaration. Claims are
  limited to event types, Codex modes, operating environment, and versions actually tested.

## Testing Decisions

- Good tests assert externally observable behavior: accepted protocol input, emitted
  protocol response, preserved file contents, visible advice, snapshot identity, timing
  class, and explicit failure outcome. Tests do not assert internal layer construction,
  private helper calls, or incidental Effect execution order.
- The principal test seam is one subprocess-level JSON contract. A representative
  successful-edit event is written to stdin, the real command reviews a fixture through a
  controllable DecisionModel, and the test asserts stdout, exit behavior, advice, reviewed
  hash, and the fact that the already-completed edit was not modified.
- Contract fixture tests cover valid and invalid Codex-derived events, unknown or excess
  fields according to the chosen schema policy, unsupported event forms, multi-path input,
  failed edits, and protocol-version mismatch.
- Snapshot tests cover regular files, creation, deletion or race, changed-during-review
  content, symlinks and non-regular files, size limits, generated and vendor exclusions,
  privacy exclusions, and stable content hashing.
- Domain tests cover exact assessment keys; finite probabilities at zero, each configured
  threshold boundary, and one; missing or extra keys; wrong decision kinds; and non-finite
  or out-of-range values.
- Pure policy tests cover applicability, deterministic advice text, stable ranking, findings
  budgeting, multi-file aggregation, and the semantic distinction among clean reviewed
  output, skipped review, and unavailable review.
- Effect tests use effect-vitest and controllable clocks and services. Timeout, retry,
  interruption, and concurrency cases do not use wall-clock sleeps.
- Controlled-duration cases cover 0, 100, 500, and 2,000 milliseconds, including completion
  before timeout, timeout at the defined boundary, and classified retry exhaustion.
- Backend contract tests reuse the existing prior-art test that proves structured Noul
  wording, one-call batching, and typed probability answers. The deterministic layer and
  live TypeSafe layer satisfy the same product-owned conformance cases.
- Multi-file tests assert one request per eligible file, one batch of all applicable
  questions within each file request, the configured concurrency ceiling, deterministic
  combined ordering, and a bounded number of emitted findings.
- Deduplication tests assert that the same event and snapshot fingerprint cannot emit the
  same advice twice while a new content hash is reviewable.
- Diagnostic tests assert bounded messages, no source content or credential leakage, and no
  pollution of protocol stdout.
- The Codex probe is a separate runtime test suite because invocation timing and feedback
  delivery are host-owned behavior that a fake event cannot prove. It records sanitized
  fixtures for native patch, file creation, multi-file patch, failed edit, shell-mediated
  write, two configured hooks, repeated setup, timeout, malformed output, crash, and killed
  process.
- Where available, the Codex probe runs both an interactive session and codex exec;
  unsupported modes are recorded rather than simulated.
- The live Jev suite is credential-gated and excluded from ordinary test runs. It first
  evaluates one representative rule against recorded migration evidence, then verifies the
  full configured rule-key set and one-call-per-file batching.
- Performance measurement records end-to-end p50, p95, and p99 duration, provider duration,
  payload size, retries, and the time at which feedback becomes visible to Codex. The report
  separates local processing from network inference.
- Repository gates for these phases are strict TypeScript with exact optional property
  types and unchecked indexed access enabled, focused deterministic tests, boundary
  decoding, exact Effect cohort pins, a frozen lockfile, and a clean subprocess smoke test.
- Tests run without live credentials by default and leave both repository fixtures and
  user-level Codex configuration unchanged.

## Out of Scope

- Blocking, denying, approving, asking permission for, or rolling back edits.
- Pre-write policy enforcement or interpreting a probability as authorization.
- An asynchronous queue, daemon, debounce, delayed delivery, persistence, replay, or
  cross-session worker.
- Runtime support claims for Claude Code, OpenCode, Kimi Code, Pi, or any agent host other
  than the pinned Codex version tested here.
- A stable public plugin ABI or arbitrary user-authored analyzers; these phases preserve an
  extension seam but do not standardize it.
- Full project or user configuration and rule-package UX beyond the minimal configuration
  needed for the slice.
- Production install, doctor, uninstall, release packaging, and complete coexistence
  certification with Probity; those belong to later configuration and composition
  hardening.
- Choice, Score, arbitrary model outputs, weighted aggregate quality scores, or automatic
  localization below a file.
- Rust, Go, a native sidecar, or a hybrid implementation unless the TypeScript slice fails a
  previously declared measurable gate.
- Universal interception of writes Codex does not expose through a supported lifecycle
  mechanism.
- Automatic retries for non-transient failures or any retry that could make a non-idempotent
  host mutation repeat.
- A universal policy language, agent orchestrator, model router, or replacement coding-agent
  host.

## Further Notes

- The product remains unnamed. Jev is TypeSafe's external realtime review backend, not the
  product name.
- This issue turns advisory research into an implementation specification only for phases
  2–5. Research reports remain evidence and trade-off material rather than normative
  requirements unless repeated here.
- The local environment currently provides Codex CLI only, at codex-cli 0.155.1;
  additional hosts cannot be runtime-certified in this issue.
- The existing Effect 4 prototype already demonstrates provider-neutral DecisionModel use,
  Decision.probability, TypeSafe provider wiring, structured Noul wording, typed answers,
  and one request containing multiple questions.
- The historical vendored repository is retained as a Git submodule for migration evidence.
  It must not re-enter the active workspace dependency graph.
- Relevant repository context: the product implementation plan, domain glossary, research
  methodology, Effect practices advisory, and Codex extensions research.
