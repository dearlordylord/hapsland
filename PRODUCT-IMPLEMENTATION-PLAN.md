# Product implementation plan

**Status:** staged execution plan after the research advisory. Issues #1 and #3 adopted
phases B–F as normative implementation specifications, and those phases are complete;
later phases remain proposed. The product is Hapsland; Jev is its initial review
backend, not the product name.

## 1. Goal

Build a composable realtime review tool for coding-agent hosts, starting with Codex CLI.
After a successful code edit, the tool reviews the resulting file with configured binary
questions and gives the agent advisory feedback before its next reasoning step.

Version one proves one narrow path well:

```text
successful Codex edit
  -> synchronous post-write hook
  -> read the resulting eligible file snapshot
  -> ask all configured Jev Noul questions in one request per file
  -> validate one probability per question/rule
  -> derive concise advice locally
  -> return advice to Codex
  -> Codex continues
```

## 2. Decisions already made

- The product is not named Jev. Jev is the initial external review backend.
- Version one is implemented in TypeScript on the latest matched Effect 4 RC cohort.
  Effect and companion packages are exact-pinned together; the current selected cohort
  is `4.0.0-rc.116`.
- Jev is integrated through `Decision` / `DecisionModel` from `effect/unstable/ai` and
  the `@effect/ai-typesafe` provider.
- Codex CLI is the first and only runtime-tested host in the initial environment.
- Version one is **strictly advisory**. It never rejects, cancels, approves, or asks
  permission for an edit.
- The first cadence is **post-write and synchronous**: the edit succeeds, then Codex waits
  for review before continuing.
- The earlier expected Jev call was roughly 100 ms. The 100-call live milestone instead
  measured backend p50/p95/p99 of 411/475/509 ms and full command p50/p95/p99 of
  650/723/808 ms, so these measurements replace the estimate for this environment.
- There is no debounce or persistent queue in version one.
- A later async mode may enqueue successful edits, debounce them, review a stable snapshot,
  and deliver advice later with explicit stale-result handling.
- Current review questions use only Jev Noul. Choice and Score are outside the product
  contract until a concrete feature requires them.
- All questions for one file are batched into one Jev request. A multi-file edit may require
  one request per eligible file because the proven questions evaluate one artifact at a
  time; calls may run with bounded concurrency.
- Source inspection of Codex and existing adapters comes before runtime probes. Prototype
  only behavior owned by the live host or left contradictory/unknown by source evidence.

## 3. Non-goals for version one

- Blocking or rolling back an edit.
- Treating a probability as permission to allow or deny an operation.
- Cross-host runtime compatibility claims.
- A daemon, background queue, debounce, or delayed notification system.
- Choice/Score/general arbitrary model-result normalization.
- Automatic localization below the reviewed file unless a rule already supplies it.
- A universal policy language, agent orchestrator, model router, or replacement agent host.
- Introducing Rust, Go, or a hybrid core without a measured failure of the TypeScript
  implementation's declared startup, memory, packaging, or deployment gates.

## 4. Minimal domain contract

The initial backend contract is deliberately narrower than Jev's complete API.

```ts
type Probability = number // finite and validated at the boundary: 0 <= value <= 1

type Assessment<RuleId extends string = string> =
  Readonly<Record<RuleId, Probability>>
```

`Assessment` is one map containing one probability for every configured binary question.
It does not contain messages, bands, severity, aggregate scores, permission decisions,
model identity, token usage, or transport failures.

The review layer requires separate concepts:

```ts
type SnapshotRef = {
  path: string
  contentHash: string
}

type Advice<RuleId extends string = string> = {
  ruleId: RuleId
  probability: Probability
  message: string
  snapshot: SnapshotRef
}

type ReviewResult<RuleId extends string = string> =
  | {
      status: "reviewed"
      assessment: Assessment<RuleId>
      advice: readonly Advice<RuleId>[]
      backend: {
        id: string
        model?: string
        durationMs: number
        retries: number
        usage: { inputTokens?: number; outputTokens?: number }
      }
    }
  | {
      status: "skipped"
      reason: string
    }
  | {
      status: "unavailable"
      reason: string
      retryable: boolean
    }
```

The exact syntax may change with the implementation language. The semantic boundaries may
not be collapsed:

- a Noul value is the probability that the rule's binary proposition is true, not a generic
  “confidence” field;
- no advice and review unavailable are different outcomes;
- rule applicability, threshold/band, message, and ranking are local policy derived from an
  assessment;
- backend metadata is operational data, not an assessment;
- every item of advice names the exact reviewed snapshot so stale feedback is detectable.

## 5. Rule and extension boundary

Version one ships only Jev-backed rules, but rule configuration must remain independent of
the Codex adapter.

A Jev rule needs, conceptually:

- stable rule ID;
- Noul question and criteria;
- applicability predicate over the artifact or repository context;
- advisory threshold/band policy;
- message template;
- optional file/path selection;
- explicit enable/disable and failure behavior.

The core defines the selected questions with `Decision.make` and
`Decision.probability`; `DecisionModel.decide` batches them through
`@effect/ai-typesafe`. `DecisionModel` validates that every requested answer has the
expected kind and a probability in `[0, 1]`; the product maps only the configured named
rules into its exact `Assessment` and lets each rule interpret only its own probability. It
must not combine unrelated rules into a weighted quality score without calibration data.

The first implementation should expose a narrow extension seam without promising a mature
public plugin ABI. A later user-defined plugin may produce advice through another analyzer,
but it must not require the Codex adapter to understand that analyzer's raw response.

## 6. Synchronous Codex flow

For each successful edit event:

1. Parse the Codex event and identify affected paths.
2. Filter by configured paths/extensions, regular-file status, size, generated/vendor
   exclusions, and privacy rules.
3. Read the resulting file after the write and calculate its content hash.
4. Select applicable enabled rules.
5. If no rule applies, return a successful `skipped` result without calling Jev.
6. Send the file state and all selected Noul questions in one Jev call.
7. Validate that every expected answer exists and every probability is finite and in
   `[0, 1]`.
8. Convert reportable rule readings into concise advice using local configuration.
9. Attach the reviewed path/hash and emit advice through the Codex advisory channel.
10. Return successfully so the completed edit remains completed and Codex continues.

For a multi-file event, review eligible files independently with a concurrency bound of four,
then emit one combined report with a findings budget. The bound is part of the implemented
slice and avoids serializing one backend request per file.

## 7. Failure and privacy behavior

Because version one is advisory, backend and tool failures are fail-open with respect to the
agent's edit. They must still be observable and must never masquerade as a clean assessment.

- Missing credentials: `unavailable`, no probabilities synthesized.
- Timeout/network/429/5xx: bounded retry policy, then `unavailable`.
- Malformed or incomplete response: `unavailable`; do not interpret absent keys as zero.
- Hook panic/process error: preserve the edit and expose a bounded diagnostic where Codex's
  hook protocol safely permits it.
- File changed during review: mark the report stale and do not present it as advice about
  the newer snapshot.
- Sensitive/excluded/oversized/non-regular files: `skipped` with a reason and no source
  egress.

Configuration must disclose what leaves the machine: selected file content, configured
questions, rule criteria, and minimal artifact metadata. Secrets and excluded paths must be
filtered before constructing the request.

## 8. Composition requirements

The product must coexist with other Codex hooks and tools.

- Installation is additive and idempotent; it does not replace unrelated hook entries.
- Uninstallation removes only artifacts owned by this product.
- Hook output uses the documented Codex channel and keeps protocol stdout free of logs.
- Ordering and duplicate invocation are detected or documented.
- A stable event/snapshot fingerprint prevents duplicate advice for the same review.
- Project, user, and managed configuration precedence is surfaced rather than silently
  guessed.
- A diagnostic command reports installed hook, configuration source, credentials presence,
  supported cadence, and actual evidence level.

## 9. Development practices and staged guarantees

The cross-repository study in
[`PRODUCT-EFFECT-PRACTICES-RESEARCH-2026-09-19.md`](https://github.com/dearlordylord/hapsland-research/blob/master/PRODUCT-EFFECT-PRACTICES-RESEARCH-2026-09-19.md)
compares Dalph's Effect-heavy orchestration style with D&D's mostly pure reducer/schema
style. Borrow the guarantees they share without copying either application's scale or
domain machinery.

### Use during prototype development

- Decode every unknown external value once at its boundary with Effect Schema: Codex hook
  input, configuration, Jev response, persisted state if introduced, and subprocess output.
- Reject excess/malformed boundary data deliberately. Do not cast unknown input into domain
  types.
- Brand values whose accidental interchange would be harmful: `RuleId`, event/session ID,
  normalized path, snapshot/content hash, bounded duration, and `Probability`.
- Represent `reviewed`, `skipped`, and `unavailable` as an exhaustive tagged outcome. Model
  expected operational failures as typed errors; do not encode failure as an empty
  Assessment or throw ordinary expected cases.
- Keep applicability, advice derivation, stable ordering, and findings budgeting as pure
  functions. Use Effect services/layers only at effectful authority or lifecycle seams:
  Codex adapter, snapshot reader, review backend, configuration, and later persistence.
- Name public and non-trivial effectful operations with `Effect.fn` and translate SDK,
  HTTP, filesystem, and host errors at their owning adapter boundaries.
- Read credentials through redacted configuration and inject decoded configuration inward.
- Retry only classified transient, idempotent Jev calls with an explicit bound. Exhaustion
  stays visible as `unavailable`.
- Put `Ref`, `Semaphore`, `Queue`, fibers, or other concurrency primitives only in the
  module that owns a stated concurrency invariant. The synchronous prototype should not
  acquire queue/worker architecture pre-emptively.
- Use deterministic Effect tests for timeout, interruption, and concurrency; use
  property-based tests selectively for boundary and algebraic laws.
- Keep one package with small explicit modules until a second independently released
  artifact creates a real package boundary. Organize by domain/boundary responsibility,
  not by Effect primitive.

The initial module shape should remain close to:

```text
src/
  domain/      # identities, probability/assessment, review outcome
  policy/      # pure applicability, advice, ordering, budget
  ports/       # review backend and snapshot reader services
  adapters/    # codex input/output and Effect TypeSafe provider wiring
  runtime/     # config, live layers, synchronous orchestration
  cli.ts       # JSON stdin/stdout shell
test-support/  # controllable backend and host fixtures
```

### Prototype enforcement posture

These practices guide implementation immediately, but the prototype should keep gates
light:

- Gate on strict TypeScript, `exactOptionalPropertyTypes`, `noUncheckedIndexedAccess`,
  focused tests, and exact boundary decoding.
- Treat unsafe assertions, `any`, non-exhaustive matches, floating Effects, ambient
  capabilities, and large public surfaces as review findings first. Promote them to lint or
  Effect-diagnostic errors after the module shape stabilizes.
- Add example tests for each outcome/error tag and focused properties for:
  exact Assessment keys and `[0,1]` values, deterministic advice, idempotent duplicate
  fingerprints, bounded/stable findings, and `unavailable` versus `skipped`.
- Do not yet gate prototypes on a coverage percentage, universal immutability/no-throw
  policy, unused-export census, formal Quint/MBT models, cross-host matrices, or durable
  journal/replay machinery.
- Keep `effect` and `@effect/ai-typesafe` on one exact RC cohort, enable the full selected
  diagnostics before a release candidate, freeze the lockfile, and add package plus
  pinned-Codex smoke tests.

The selected baseline is the latest matched Effect 4 RC cohort, currently
`effect@4.0.0-rc.116` plus `@effect/ai-typesafe@4.0.0-rc.116`. Both packages must be
exact-pinned and upgraded deliberately as one cohort; npm's unqualified
`@effect/ai-typesafe` `latest` tag is not the Effect 4 RC line. Dalph and D&D demonstrate
transferable design practices but use different prerelease versions and therefore are not
API-copy sources.

## 10. Work plan

### Phase A — validate the selected implementation language

Compare TypeScript, Rust, and credible hybrid/process-boundary designs against Codex and
future host integration, user-defined extensions, distribution, startup/runtime cost,
security, testing, and maintenance. Treat perceived credibility as a product-positioning
consideration, not a substitute for engineering evidence.

Output: a dated advisory language report, the recorded TypeScript decision, and measured
falsifiers that would justify reopening it.

**Research status:** completed in
[`PRODUCT-LANGUAGE-RESEARCH-2026-09-19.md`](https://github.com/dearlordylord/hapsland-research/blob/master/PRODUCT-LANGUAGE-RESEARCH-2026-09-19.md).
Its recommendation of TypeScript for version one behind a versioned JSON process contract
is now adopted. The native Effect 4 Decision/TypeSafe provider strengthens that decision.
Cold-start and deterministic-slice measurements remain falsification tests; reconsider Rust
or Go only if TypeScript fails a declared startup, memory, packaging, runtime-availability,
or enterprise-deployment gate. Node versus a Bun standalone artifact remains a packaging
experiment, not a settled choice.

### Phase B — derive the Codex adapter specification

**Status: completed for Codex CLI 0.155.1.** The versioned contract is
[`CODEX-ADAPTER-CONTRACT-v1.md`](https://github.com/dearlordylord/hapsland-research/blob/master/CODEX-ADAPTER-CONTRACT-v1.md).

Extract current Codex hook schemas, lifecycle behavior, output channels, sync/async
semantics, configuration precedence, and failure rules from official sources and existing
adapters. Reuse their fixtures and edge cases where licenses permit.

Output: a Codex adapter contract with each behavior labeled documented, source-inspected,
runtime-tested, inferred, or unknown.

### Phase C — targeted Codex runtime probe

**Status: completed for Linux Codex CLI 0.155.1.** Sanitized, reproducible evidence is under
[`evidence/codex/0.155.1`](https://github.com/dearlordylord/hapsland-research/blob/master/evidence/codex/0.155.1/README.md).

Test only propositions the live Codex process must establish:

- actual post-write event envelope and delivery order;
- native patch, file creation, multi-file patch, failed edit, and shell-mediated write;
- whether synchronous hook output reaches Codex before its next action;
- two installed hooks and repeated installation;
- timeout, malformed output, crash, and killed-process behavior;
- interactive session versus headless `codex exec` where available.

The probe records sanitized fixtures and exact Codex version. It does not call Jev.

### Phase D — deterministic vertical slice

**Status: completed.** The version-1 JSON subprocess, controlled `DecisionModel`, snapshot
identity, eligibility, exact assessment validation, timeout/stale behavior, bounded
multi-file concurrency, findings budget, and process-level deduplication are covered by the
offline suite.

Implement the full Codex-to-advice path using a test evaluator that returns controlled
Jev-shaped assessment maps. Exercise:

- empty and populated assessment maps;
- probabilities at 0, threshold boundaries, and 1;
- 0, 100, 500, and 2,000 ms response times;
- incomplete, invalid, failed, and timed-out responses;
- a file changing while evaluation is in flight;
- multiple applicable rules and findings-budget behavior.

This evaluator tests scheduling and failure semantics; it does not invent allow/block
decisions.

### Phase E — real Jev vertical slice

**Effect integration:** the runnable implementation uses the exact-pinned Effect 4 RC
cohort. The proven local questions use `Decision.probability`, calls go through
`DecisionModel.decide`, and `TypeSafeDecisionModel` from `@effect/ai-typesafe` supplies the
Jev provider. A deterministic test verifies one-call batching, wording
rendering, and typed probability answers.

**Vertical-slice validation status (completed 2026-09-19):** after explicit milestone
authorization, the credential-gated Effect integration passed the recorded representative
r6 migration gate and returned the exact full nine-rule key set in one live `decide`
operation. A 100-call full product-process milestone then completed with 100 reviewed
results, no unavailable or malformed result, and no retry. It recorded backend and command
p50/p95/p99, source and process-contract byte sizes, and provider usage. Provider-wire byte
size is not exposed by the Effect provider and remains explicitly unknown.

Headless and interactive Codex probes both established that advice for the reviewed hash
arrives before the next action. Codex's stable event stream does not expose the instant at
which hook context enters model context, so an exact model-visibility timestamp is not
claimed; command latency is the measured synchronous wait and delivery ordering is the host
evidence. Paid probabilities, source-bearing responses, and credentials were not committed.
The paid suite remains excluded from ordinary test runs.

Acceptance requires that Codex sees advice for the reviewed snapshot before its next action,
the completed edit is never rejected, and unavailable review is distinguishable from no
finding.

### Phase F — configuration and rule packaging

**Completed 2026-09-20:** issue #3,
implemented through issues #9–#15, with the consolidated local specification in
[`PRODUCT-PHASE-F-SPEC.md`](./PRODUCT-PHASE-F-SPEC.md). This includes the agreed
configuration explanation, session receipt, and rule-conformance test requirements.
Directory-scoped consent is deferred to
issue #2.

Phase F provides project/user configuration, file selection, thresholds, messages,
enable/disable consent, privacy exclusions, timeouts, credential references, local
declarative rule packs, diagnostics, and session receipts without rule-specific Codex
adapter changes. Deterministic tests cover configuration and rule composition at the real
process boundary. The explicit live milestone completed all 44 planned transport and
conformance requests; its preregistered semantic release gate did not pass. Sanitized
failed, ambiguous, and unchecked semantic results remain recorded in
[`evidence/evaluation/live-report-2026-09-20.json`](./evidence/evaluation/live-report-2026-09-20.json)
without weakening expectations. That result limits release claims but does not leave the
Phase F implementation unfinished.

### Phase G — composition and release hardening

The detailed [onboarding specification](./PRODUCT-ONBOARDING-SPEC.md)
now covers installation, activation, diagnostics, distribution, update/removal, and
release gates. Decisions are settled and the
implementation handoff (issue #62) is ready;
platform and native-storage validation remain implementation gates. Its runtime
baseline is the current asynchronous
[direct-event supported profile](./docs/direct-event-v1-supported-profile.md), not
the historical synchronous assumptions elsewhere in this plan.

Test coexistence with a second dummy hook and, if practical, an existing tool such as
Probity. Add install/doctor/uninstall flows, bounded logs, data-flow documentation, fixture
tests, and a versioned compatibility declaration for the tested Codex release.

### Phase H — later asynchronous cadence

Only after the synchronous baseline is measured, evaluate an async producer/worker design:

```text
post-write events -> queue -> debounce -> stable snapshot -> review -> delayed advice
```

Specify persistence, queue bounds, cancellation, snapshot identity, deduplication, delivery
while Codex is idle or active, session shutdown, and stale-result policy. Compare saved wait
time against later/staler advice before making async the default.

### Phase I — additional agent hosts

Add a host only when its adapter can be tested in a real runtime. Until then, Claude Code,
OpenCode, Kimi Code, Pi, and others remain documented design targets, not supported-host
claims. Every adapter declares its cadence, payload fidelity, delivery semantics, and failure
evidence separately.

## 11. Version-one completion criteria

Version one is complete when:

- a documented, idempotent install activates the hook on a pinned Codex CLI version;
- successful supported edits are reviewed synchronously after writing;
- all applicable Noul questions for one file are issued in one Jev request;
- the Jev request uses the exact-pinned Effect 4 `DecisionModel` and
  `@effect/ai-typesafe` cohort;
- the assessment is validated as `Record<RuleId, Probability>`;
- advice identifies the rule, probability, message, file, and reviewed content hash;
- no code path rejects or reverses an edit;
- review failure is visible but fail-open;
- secret/excluded/oversized files are never sent;
- another hook survives install, execution, and uninstall;
- fixtures and live Codex smoke tests cover the declared capabilities;
- documentation states exactly what is runtime-tested and what remains unknown.
