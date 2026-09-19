# Effect TypeScript practices across Dalph and D&D

**Status:** advisory research; not the normative product specification  
**Date:** 2026-09-19  
**Canonical path for this scoped pass:**
`/workspace/typescript/jev/PRODUCT-EFFECT-PRACTICES-RESEARCH-2026-09-19.md`

> **Adoption update (2026-09-19):** Effect 4 is no longer a conditional candidate for
> version one. The implementation baseline is the latest matched RC cohort, currently
> `effect@4.0.0-rc.116` and `@effect/ai-typesafe@4.0.0-rc.116`, using
> `Decision` / `DecisionModel` for the Jev boundary. The cross-repository practices below
> remain advisory; their older prerelease APIs are not copy sources.

## 1. Research brief

### Question

Which recurring Effect TypeScript practices in the local Dalph and D&D repositories
should inform the unnamed host-neutral realtime review product, and which practices are
specific to those repositories' domains?

This pass compares repository source, tests, manifests, and architecture documents at:

- Dalph commit `beb3c9bb68c7a8b56f1b9e5ee999cfa1b43603ad`.
- D&D commit `478648d493981b03137657ac4698f8fdb86fce17`.

The product assumptions follow the current implementation plan: provisional TypeScript v1
uses Effect behind a product-owned boundary; Codex is the first host; a successful write is
reviewed synchronously and strictly advisory; all applicable Jev Noul questions for one file
produce one exact `Assessment` map; and the public outcome distinguishes `reviewed`,
`skipped`, and `unavailable`. V1 has no daemon, debounce, or persistent queue. Cancellation,
remote failure, duplicate events, bounded multi-file concurrency, and stale snapshots are
relevant now. Queues and additional host adapters are future design targets, not v1 claims.
Model providers remain secondary unless they change host behavior, authentication/egress,
cost, or Jev configuration.

### Scope and method

The two repositories were selected as local, primary-source examples of Effect 4 TypeScript
systems with different shapes. Dalph is an Effect-heavy orchestration application. D&D is a
mostly pure reducer/schema system with selected Effect adapter boundaries. That contrast is
more useful here than treating either repository as a product competitor.

Evidence labels follow `PRODUCT-RESEARCH-METHODOLOGY.md`:

- `DOC/DOCUMENTED` means a repository architecture or practice document states the claim.
- `SRC/SOURCE-INSPECTED` means source, tests, or manifests visibly support it.
- `RUN/RUNTIME-TESTED` is not used: this pass did not execute either repository.
- `INFERRED` marks a recommendation derived from cited evidence.

The search covered types, boundary decoding, errors, services/layers, configuration,
scheduling/retry, concurrency/state, tests/property-based tests, compiler/lint settings,
and module/package organization. It stopped after targeted searches in both repositories
and inspection of representative implementations produced no new practice category.
This is not an ecosystem-completeness claim.

### Existing-solution baseline and disconfirmation

Neither repository supplies the requested host-neutral review integration. Depending on a
whole local application would import its domain and lifecycle rather than solve the review
boundary. The baseline therefore remains a small product implementation using selected
Effect primitives, not reuse of either application.

Evidence that would overturn this preference would be an existing, maintained component
that already provides a host-neutral event contract, multiple real host adapters, bounded
Jev invocation, configurable advisory/blocking aggregation, and defined timeout/crash
behavior with lower replacement cost than the proposed core.

### Change log

- Initial scoped pass. It does not supersede another Effect-practices report.

## 2. Candidate inventory

| Candidate | Class | Included use | Excluded use | Primary disposition |
| --- | --- | --- | --- | --- |
| Dalph | orchestration application and adapter set | practices for services, layers, errors, scheduling, scoped concurrency, deterministic tests | runtime dependency or copied journal/authority protocol | `BORROW` selected practices; `REJECT` whole-application dependency |
| D&D | schema/reducer application with MCP and HTTP adapters | practices for branded domain values, strict boundary schemas, explicit outcome algebras, pure reducers, PBT | runtime dependency or copied game/formal-model architecture | `BORROW` selected practices; `REJECT` whole-application dependency |
| Effect 4 | application runtime/library | candidate foundation for effects, services, layers, schemas, concurrency, schedules, and tests | unpinned mixture of beta/RC APIs | conditional `DEPEND ON` |
| `fast-check` | property-testing library | candidate for algebraic and replay/deduplication properties | copying either repository's generated domains | conditional `DEPEND ON`; tests and generators are `BORROW` patterns |

No serious local candidate was excluded. Formal Quint assets were inspected only through
the architecture descriptions because the research question is Effect practice, not
formal-model design.

## 3. Evidence ledger

Absolute paths make the local snapshot replayable. Line references apply to the commits
named in the brief.

| ID | Proposition | Evidence | Label | Limitations |
| --- | --- | --- | --- | --- |
| E01 | Dalph pins Effect and `@effect/vitest` `4.0.0-beta.106`, `@effect/tsgo` `0.24.3`, `fast-check` `4.9.0`, TypeScript `5.9.3`, and native TS `7.0.2`. | `/workspace/typescript/dalph/package.json:84-108` | `SRC/SOURCE-INSPECTED` | Pinning does not prove compatibility or fitness for this product. |
| E02 | D&D pins Effect, platform-node, and `@effect/vitest` `4.0.0-rc.112`, `fast-check` `3.23.2`, TypeScript `5.9.3`, and native TS `^7.0.2`. | `/workspace/typescript/dnd/package.json:115-146` | `SRC/SOURCE-INSPECTED` | Root pins coexist with package-local dependency declarations. |
| E03 | Dalph models boundary observations as tagged schemas, expected failures as typed tagged errors, and authority seams as `Context.Service`; its test layer supplies production and test tags from one stateful implementation. | `/workspace/typescript/dalph/packages/orchestrator/src/authorities/git/worktree.ts:8-27`, `:30-101`, `:103-152` | `SRC/SOURCE-INSPECTED` | This is one representative authority module, not a census result. |
| E04 | Dalph decodes unknown input inside a named service operation before applying a journaled policy change. | `/workspace/typescript/dalph/packages/orchestrator/src/control/task-work-capacity.ts:23-60`, `:85-134` | `SRC/SOURCE-INSPECTED` | The journal protocol is Dalph-specific. |
| E05 | Dalph uses constrained branded path/configuration values, a strict aggregate configuration schema, redacted secrets, and `decodeUnknownEffect` with excess-property rejection. | `/workspace/typescript/dalph/packages/dalph/src/application/production-configuration.ts:37-59`, `:139-167`, `:187-225` | `SRC/SOURCE-INSPECTED` | This aggregate is decoded from a caller-owned raw object; it is not solely an Effect `Config` recipe. |
| E06 | Dalph also uses Effect `Config` for secrets and schema-decoded environment entries. | `/workspace/typescript/dalph/packages/orchestrator/src/authorities/task-tracker/github/graphql-client.ts:431-436`; `/workspace/typescript/dalph/packages/orchestrator/src/workflow-journal/adapters/sqlite-store.ts:341` | `SRC/SOURCE-INSPECTED` | Configuration style is mixed at composition boundaries. |
| E07 | Dalph bounds claim acquisition with `Schedule.recurs`, retries only a private typed repeat signal, reconciles ambiguous mutations with fresh reads, and exposes non-convergence. | `/workspace/typescript/dalph/packages/orchestrator/src/workflow/protocols/task-claim-acquisition/protocol.ts:15-29`, `:40-99` | `SRC/SOURCE-INSPECTED` | The exact read-before/write/read protocol is authority-specific; the bounded/idempotent principle generalizes. |
| E08 | Dalph coordinates mutable runtime ownership through `Ref` plus a semaphore-protected admission pass, uses named effects, and makes ownership conflicts typed failures. | `/workspace/typescript/dalph/packages/orchestrator/src/coordination/delivery/delivery-runtime-admission-loop.ts:28-53`, `:81-117`, `:180-228` | `SRC/SOURCE-INSPECTED` | A review integration may not need this graph's complexity. |
| E09 | Dalph tests time and concurrency with `it.effect`, `TestClock`, `Deferred`, and `Ref` rather than wall-clock sleeps. | `/workspace/typescript/dalph/packages/orchestrator/src/coordination/run/run-reactivation-owner.test.ts:235-275`, `:277-290` | `SRC/SOURCE-INSPECTED` | No tests were executed in this pass. |
| E10 | Dalph combines Effect tests and fast-check to test mutation-resistant content-addressed storage across arbitrary byte arrays. | `/workspace/typescript/dalph/packages/orchestrator/src/workflow/protocols/evidence-store.property.test.ts:1-26` | `SRC/SOURCE-INSPECTED` | The nested `Effect.runPromise` shape need not be copied verbatim. |
| E11 | Dalph enables strict TypeScript, exact optional properties, unchecked-index protection, Effect language-service diagnostics, and floating-Effect errors in production sources. | `/workspace/typescript/dalph/tsconfig.base.json:2-55` | `SRC/SOURCE-INSPECTED` | Compiler/plugin behavior was not executed. |
| E12 | Dalph's lint policy adds immutability and no-throw rules for production, with explicit script/test exceptions and unused-export checks. | `/workspace/typescript/dalph/eslint.compat.config.mjs:27-77` | `SRC/SOURCE-INSPECTED` | Some rules are costly during an early prototype. |
| E13 | Dalph's architecture explicitly separates description, planning, reconciliation, action, runtime, establishment, and stabilization, selecting adapters through services/layers. | `/workspace/typescript/dalph/docs/ARCHITECTURE.md:76-122` | `DOC/DOCUMENTED` | Architectural intent is not runtime proof. |
| E14 | D&D uses constrained Schema brands for identifiers and bounded numerical values. | `/workspace/typescript/dnd/packages/shared/src/types.ts:225-245`, `:259-280`, `:287-320`, `:357-379` | `SRC/SOURCE-INSPECTED` | Some convenience constructors clamp inputs; that is not appropriate for all external boundaries. |
| E15 | D&D publishes strict, annotated wire schemas and a complete evaluated/rejected response algebra, with separate transport-defect shape. | `/workspace/typescript/dnd/packages/opaque-oracle/src/oracle-process-contract.ts:10-79`, `:104-160` | `SRC/SOURCE-INSPECTED` | Uses `tag` and plain schema unions rather than Effect error classes. |
| E16 | D&D converts unknown decoder failures into a small, canonical public issue vocabulary and rejects excess properties. | `/workspace/typescript/dnd/packages/opaque-oracle/src/oracle-decode.ts:6-30`, `:55-113` | `SRC/SOURCE-INSPECTED` | It catches decoder defects because the cleanroom boundary promises total decoding; this is context-specific. |
| E17 | D&D's saved-session authorization adapter is a scoped Effect service/layer with acquisition/release, a semaphore, named handling effect, and typed issue channel. | `/workspace/typescript/dnd/packages/mcp/src/saved-session-authorization/service.ts:34-60`, `:61-104`, `:208-217` | `SRC/SOURCE-INSPECTED` | The issue is a plain tagged object rather than a schema error class. This is the exception, not the core package style. |
| E18 | D&D's repository port is mostly synchronous/pure `Result`, with explicit success/conflict/rate-limit algebras and schema decoding of persisted rows. | `/workspace/typescript/dnd/packages/mcp/src/play-session-repository.ts:43-60`, `:75-154`, `:156-199` | `SRC/SOURCE-INSPECTED` | It demonstrates that not every domain function needs an Effect service. |
| E19 | D&D decodes environment-derived startup configuration at its entry point, but reads `process.env` directly there. | `/workspace/typescript/dnd/packages/mcp/src/public-index.ts:19-58` | `SRC/SOURCE-INSPECTED` | Boundary-local direct env access is contained, but less overrideable than Config providers. |
| E20 | D&D property-tests branded constructor laws and deterministic replay from serialized seed plus command prefix. | `/workspace/typescript/dnd/packages/shared/src/domain-primitives.property.test.ts:51-100`; `/workspace/typescript/dnd/packages/mcp/src/recoverable-play-session.property.test.ts:98-180` | `SRC/SOURCE-INSPECTED` | Tests were not run; generated domains are product-specific. |
| E21 | D&D package configs use strict TypeScript and exact optional properties; MCP limits production source files to 420 nonblank/noncomment lines. | `/workspace/typescript/dnd/packages/mcp/tsconfig.json:1-18`; `/workspace/typescript/dnd/packages/mcp/eslint.config.mjs:4-27` | `SRC/SOURCE-INSPECTED` | Other packages have local variations, including unused-local policy. |
| E22 | D&D exposes narrow package subpaths in shared, while larger runtime entry points use explicit barrels; package boundaries own tests/typecheck. | `/workspace/typescript/dnd/packages/shared/package.json:1-31`; `/workspace/typescript/dnd/packages/mcp/package.json:1-22`; `/workspace/typescript/dnd/packages/opaque-oracle/package.json:1-26` | `SRC/SOURCE-INSPECTED` | Some runtime barrels are very large, so barrel existence alone is not a recommendation. |
| E23 | D&D's architecture keeps authored data, character runtimes, battle runtime, composition, and oracle boundaries in separate packages; shared packages sit below them. | `/workspace/typescript/dnd/ARCHITECTURE.md:28-72` | `DOC/DOCUMENTED` | Domain package names and formal proof layout are game-specific. |

## 4. Shared versus context-specific practices

| Area | Shared/convergent evidence | Dalph-specific emphasis | D&D-specific emphasis | Product reading |
| --- | --- | --- | --- | --- |
| Types | Both constrain and brand identities/values (E05, E14). | Brands also encode authority locators and configuration paths. | Dense numeric/game-domain brands and some clamping constructors. | `BORROW` brands for review IDs, host IDs, normalized paths, revisions, and bounded durations; reject silent clamping of hostile input. |
| Boundaries | Both schema-decode unknown configuration, persistence, or wire values (E04, E05, E15, E18, E19). | Unknown input enters named Effect operations; errors remain in the Effect channel. | Pure `Result` decoding and canonical public issue conversion dominate. | `BORROW` strict decoding and explicit mapping. Choose Effect or pure Result according to whether the boundary is effectful. |
| Errors/results | Both use discriminated, enumerable failure/outcome sets (E03, E15, E17, E18). | `Schema.TaggedError` per operational/domain failure is pervasive. | Plain tagged unions separate domain rejection, conflict, and transport defect. | `BORROW` the algebra. Use typed Effect errors for effectful operations and schema unions for public wire findings/decisions. |
| Services/layers | Both use services/layers at external or lifecycle-owned seams (E03, E17). | Broad dependency graph with first-class test services and Layer wiring. | Rare; core reducers and repositories usually remain plain values/functions. | Use services only for host adapters, Jev client, clock/IDs if needed, config, and persistence. Keep classification/aggregation pure. |
| Configuration | Both validate startup configuration (E05, E06, E19). | Effect `Config` appears for secrets and schema values, alongside aggregate schema decoding. | Direct `process.env` is isolated at composition roots and then schema-decoded. | Prefer `Config`/`ConfigProvider` for overrideable runtime config; allow raw environment reads only in a tiny executable boundary. |
| Retry/scheduling | Only Dalph provides a strong reusable Effect example (E07). | Retry is bounded, typed, and joined to reconciliation of ambiguous authority changes. | No material `Schedule`/retry convention found in production packages. | `INFERRED`: adopt bounded Schedule policies only for classified transient, idempotent Jev calls; no retry for host decisions or ambiguous mutations. |
| Concurrency/state | Both protect mutable adapter state when needed (E08, E17). | Refs, subscription state, admission gates, reactive relations, and ownership maps. | A semaphore serializes one SQLite-backed auth adapter; core is mostly pure/replayable. | Start with the D&D-like small boundary. Add `Ref`, `Queue`, or `Semaphore` only for a named ownership/backpressure invariant. |
| Testing/PBT | Both use Vitest and fast-check (E01, E02, E10, E20). | Effect-aware tests, deterministic clock and fiber synchronization (E09). | Pure laws and replay determinism; many reducer/MBT tests. | Combine both: pure PBT for decisions/deduplication and `it.effect` for cancellation, timeout, layers, and adapter concurrency. |
| Compiler/lint | Both use strict TS, exact optional properties, unused/fallthrough controls (E11, E21). | Effect diagnostics, immutability, no-throw, unused exports. | Simpler ESLint plus file-size policy in MCP. | Adopt strict TS immediately; stage Effect diagnostics and stronger lint once the prototype shape stabilizes. |
| Modules | Both establish package-owned public surfaces rather than importing every implementation path (E22, E23). | Large explicit root export surface and many domain-named leaf modules. | Subpath exports for shared utilities; some very large barrels. | Prefer small domain modules and explicit exports. Do not copy a giant barrel or namespace convention before consumer pressure exists. |

### Domain-shape examples for this product

These are advisory examples, not settled names or API contracts:

- `ReviewRequestId`, `HostSessionId`, `EditRevision`, and `NormalizedPath` as constrained
  brands at boundaries.
- A wire `ReviewResult` tagged union of `Reviewed`, `Skipped`, and `Unavailable`, with
  advice as data rather than exceptions. A future blocking decision must be a separately
  specified algebra, not an interpretation silently added to v1 probabilities.
- Typed operational failures such as `HostEventDecodeError`, `JevRequestError`,
  `JevTimeout`, and `ConfigurationError`; retain operation, host adapter, and safe cause
  metadata without source contents or secrets.
- Service ports only where authority or effects exist: `HostAdapter`, `ReviewBackend`,
  `ReviewStateStore`, and perhaps `ReviewClock`. Keep finding normalization, aggregation,
  precedence, and exclusion matching as pure modules.

### Compact recommended v1 module shape

Keep this as a small module graph inside one package until a second independently released
artifact creates a real package boundary:

```text
src/
  domain/
    identity.ts          # RuleId, SnapshotRef, content hash
    assessment.ts        # Probability and exact Noul Assessment map
    review-result.ts     # reviewed | skipped | unavailable
  policy/
    applicability.ts     # pure path/privacy/rule selection
    advice.ts            # pure threshold/band/message derivation
    findings-budget.ts   # pure stable ordering and truncation
  ports/
    review-backend.ts    # Effect service; backend-neutral request/result
    snapshot-reader.ts   # Effect service; bounded file read + hash
  adapters/
    codex/               # event decode and advisory-output encoding only
    jev/                 # SDK/HTTP mapping, response validation, typed failures
  runtime/
    config.ts            # Config recipes and validated application config
    layers.ts            # live composition; no business rules
    review-one-file.ts   # synchronous orchestration
  cli.ts                 # stdin/stdout protocol shell and exit mapping
test-support/
  backend.ts             # controllable fake using the production port
  codex-fixtures.ts
```

The semantic core can remain plain TypeScript even when its boundary schemas are Effect
Schema. The following example preserves the current plan's distinctions; exact schema syntax
should be selected only after the Effect-version spike:

```ts
type Probability = number // boundary-validated: finite and 0 <= value <= 1
type RuleId = string       // non-empty stable ID; branded at the schema boundary

type Assessment<R extends RuleId = RuleId> =
  Readonly<Record<R, Probability>>

type SnapshotRef = Readonly<{
  path: string             // normalized, repository-relative path
  contentHash: string      // hash of the exact bytes sent for review
}>

type ReviewResult<R extends RuleId = RuleId> =
  | Readonly<{
      status: "reviewed"
      snapshot: SnapshotRef
      assessment: Assessment<R>
      advice: ReadonlyArray<Advice<R>>
    }>
  | Readonly<{
      status: "skipped"
      reason: "excluded" | "oversized" | "unsupported" | "noApplicableRules"
    }>
  | Readonly<{
      status: "unavailable"
      reason: "notConfigured" | "timeout" | "transport" | "invalidResponse"
      retryable: boolean
    }>
```

The Jev adapter must validate that returned keys equal the requested rule-ID set exactly and
that every value is a valid `Probability`. Missing keys, extra keys, `NaN`, infinities, and
out-of-range values produce `unavailable`, never an empty or partial `reviewed` assessment.

## 5. Capability and decision matrices

### Capability evidence

| Capability | Dalph | D&D |
| --- | --- | --- |
| Schema boundary validation | `SOURCE-INSPECTED` E04-E06 | `SOURCE-INSPECTED` E15-E19 |
| Branded domain values | `SOURCE-INSPECTED` E05 | `SOURCE-INSPECTED` E14-E15 |
| Typed error/result algebra | `SOURCE-INSPECTED` E03-E04, E07 | `SOURCE-INSPECTED` E15, E17-E18 |
| Service/layer adapter seam | `SOURCE-INSPECTED` E03-E04 | `SOURCE-INSPECTED` E17 |
| Bounded typed Schedule retry | `SOURCE-INSPECTED` E07 | `UNKNOWN` |
| Deterministic Effect time/concurrency tests | `SOURCE-INSPECTED` E09 | `UNKNOWN` |
| Property-based laws | `SOURCE-INSPECTED` E10 | `SOURCE-INSPECTED` E20 |
| Strict compiler/lint posture | `SOURCE-INSPECTED` E11-E12 | `SOURCE-INSPECTED` E21 |

`UNKNOWN` means this pass found no safely established representative convention; it does
not claim that the repository never uses the capability.

### Borrow/depend/integrate/reject decisions

| Component/pattern and intended use | Classification | Rationale |
| --- | --- | --- |
| Schema-first external boundaries and branded identifiers | `BORROW` | Independently recurring and directly relevant (E04-E05, E14-E19). |
| Explicit decision/rejection/failure algebras | `BORROW` | Both systems make outcome categories enumerable (E03, E15, E17-E18). |
| Ports with Layer-selected live/test adapters | `BORROW` | Strong in Dalph and independently present at D&D's lifecycle boundary (E03, E17). |
| Bounded retry with typed eligibility and visible exhaustion | `BORROW` | Dalph supports the pattern (E07); product use is narrower and must prove idempotency. |
| Deterministic Effect concurrency tests plus pure PBT | `BORROW` | Complementary evidence across the repositories (E09-E10, E20). |
| Effect 4 runtime | conditional `DEPEND ON` | Cohesively supplies the needed primitives, but the repositories use materially different prerelease pins (E01-E02). Gates below remain unresolved. |
| `@effect/vitest` | conditional `DEPEND ON` | Appropriate if Effect is selected; exact API/version must follow the selected Effect release. |
| `fast-check` | conditional `DEPEND ON` | Both repositories use it, but major versions differ (E01-E02); select after a focused generator/shrinking spike. |
| Agent hosts | `OPTIONAL INTEGRATION` per adapter | Codex is the selected v1 adapter. Other hosts remain future integrations whose capabilities and failure semantics must not leak into the review core. |
| External Jev backend | `OPTIONAL INTEGRATION` at a named backend port | V1 selects Jev as its first backend, but Jev remains external and does not become the product identity or domain core. |
| Dalph journal/reconstruction/authority runtime | `REJECT` for reuse | It solves durable orchestration and ambiguous mutation recovery, substantially beyond the initial review boundary (E07, E13). |
| D&D reducer, corpus, formal-model, or game packages | `REJECT` for reuse | Their domain contracts do not implement host review; only practices transfer (E23). |
| Giant catch-all barrel or one service per pure function | `REJECT` | D&D shows that pure ports/results remain useful (E18); large surfaces increase accidental coupling. |

## 6. Conditional dependency gates

Mandatory gates for Effect are license compatibility, one coherent stable-enough version,
required host workflow conformance, defined interruption/timeout behavior, and an exit path
through product-owned interfaces.

| Gate | Evidence | Status | Resolving experiment |
| --- | --- | --- | --- |
| License compatibility | Not inspected in this local pass. | `UNRESOLVED` | Record the selected release's license and transitive production dependency policy. |
| API/version guarantee | Beta `.106` versus RC `.112` is visible (E01-E02). | `UNRESOLVED` | Pin one release in a spike; compile schemas, services, config, schedule, queue/semaphore, and tests without compatibility patches. |
| Real-host conformance | Neither candidate is this product. | `UNRESOLVED` | Run the post-write fixture through a pinned Codex version and prove event decoding, synchronous feedback timing, and fail-open behavior. Repeat per future host before claiming its support. |
| Trust, egress, credentials | Schema redaction/config patterns exist (E05-E06), but product egress is untested. | `UNRESOLVED` | Prove path/content exclusions and secret-safe diagnostics against a recording fake backend. |
| Timeout, interruption, degradation | Dalph tests deterministic concurrency (E09); product semantics are unset. | `UNRESOLVED` | Test timeout, cancellation, hung backend, process termination, and advisory/blocking fail modes. |
| Maintenance/release health | Two prerelease snapshots only (E01-E02). | `UNRESOLVED` | Review selected release notes/support policy and define upgrade ownership. |
| Integration/adapter cost | No product prototype. | `UNRESOLVED` | Implement one thin host adapter and one fake backend with measured code/test surface. |
| Replacement/exit cost | Product-owned ports are proposed but absent. | `UNRESOLVED` | Demonstrate a pure decision core and replace the Effect-backed live adapter in a test harness. |

Until mandatory gates pass, `DEPEND ON` is advisory, not adoption authorization.

## 7. Staged recommendations

### Immediate candidate baseline

1. Define a small domain package with strict schemas for normalized host events, review
   requests, findings, decisions, and public failures. Brand identity, revision, duration,
   and normalized path values where accidental interchange would be harmful.
2. Decode all unknown host, configuration, Jev, and persisted values once at their owning
   boundary. Keep transport shapes distinct from normalized domain shapes.
3. Use pure functions for exclusion, finding normalization, deduplication, aggregation,
   precedence, and advisory/blocking decisions. Use Effect services/layers for host,
   backend, persistence, and lifecycle seams only.
4. Preserve expected failures in typed error channels. Convert them into public decision or
   diagnostic values only at the host-facing boundary; do not turn remote unavailability
   into an empty successful review.
5. Read secrets through redacted configuration and validate the full startup configuration
   before constructing live layers. Make user/project precedence explicit; v1 configuration
   cannot turn advisory review into blocking behavior.
6. Add strict TypeScript, `exactOptionalPropertyTypes`, `noUncheckedIndexedAccess`, no
   fallthrough, unused checks, and a single pinned toolchain. Establish package-boundary and
   circular-dependency checks early.
7. Test pure decision laws with fast-check and live seams with `it.effect`, explicit test
   layers, deterministic IDs/clocks, `Deferred`/`Queue`, and no wall-clock sleeps.

### Prototype before specification commitment

- Prove the normalized event contract against the pinned Codex runtime, including native
  patch, creation, multi-file patch, failed edit, and shell-mediated write fixtures. Repeat
  the contract exercise separately when a second host adapter is proposed.
- Exercise advisory output, headless execution, multiple installed tools,
  duplicate/reordered events, re-entry after a feedback-induced edit, stale snapshots, and
  backend timeout/unavailability. Blocking and `ask` are future specification questions,
  not v1 prototype behavior.
- Prototype a bounded queue or stream only if measured host bursts require backpressure.
  State whether overload suspends, drops, coalesces, or fails the request.
- Prove cancellation and scope ownership: disconnecting a session must interrupt owned work
  without killing unrelated reviews.
- Define retry eligibility by operation and error tag. Use bounded exponential/jittered
  schedules only for idempotent requests; expose exhaustion.
- Compare `fast-check` on the selected version for shrinking duplicate-event, precedence,
  replay, and configuration invariants.
- Turn on Effect language-service diagnostics in warning mode, resolve findings, then decide
  which diagnostics become errors.

### Defer until evidence demands it

- Durable event sourcing, reconstruction, intent-before-effect protocols, or a workflow
  journal. Adopt only if review state must survive process loss and ambiguous external
  mutations cannot be recomputed.
- A reactive relation graph, `SubscriptionRef`-driven projections, keyed fiber scheduler,
  or custom admission controller. A review request is initially a bounded call, not a
  general orchestrator.
- Formal Quint models. Revisit when aggregation, re-entry, blocking precedence, or
  concurrency invariants are stable enough to model and failures would be costly.
- Broad lint policies such as universal immutability/no-throw and aggressive unused-export
  enforcement. These are good hardening candidates after module boundaries settle.
- A monolithic public barrel or framework-specific module namespace idiom.
- Queue, debounce, delayed delivery, and persistent worker state. Revisit only after the
  synchronous Codex baseline measures a concrete latency or burst problem.

### Test strategy and staged enforcement policy

| Stage | Required checks | Deliberately not a gate yet |
| --- | --- | --- |
| Inner loop | strict `tsc --noEmit`; focused Vitest; formatter/lint for changed files | coverage floor, formal model, broad functional lint |
| Deterministic vertical slice | Codex fixture decode/encode; fake backend; exact Assessment key/value validation; every `ReviewResult` branch; timeout and stale-snapshot tests | live Jev accuracy, second-host conformance, queue behavior |
| Jev slice | bounded live contract tests with sanitized fixtures; credential/egress assertions; measured p50/p95/p99 and retry count | probabilistic score treated as a deterministic correctness gate |
| Release candidate | frozen lockfile; full typecheck/lint/test; package smoke test; pinned Codex smoke; install/coexist/uninstall fixture; secret scan | Dalph's 95% coverage policy, Quint/MBT, custom scheduler checks unless adopted |

High-value properties, capped to the domain rather than scattered across CRUD, are:

1. schema encode/decode round-trip for the versioned host/backend process contracts;
2. advice derivation is deterministic and never invents a rule absent from the Assessment;
3. response validation succeeds iff key sets match exactly and every probability is valid;
4. duplicate event/snapshot fingerprints are idempotent within the documented v1 scope;
5. findings-budget output is bounded, stable, and a subset of applicable advice; and
6. any backend/config/decoder failure yields `unavailable`, while exclusions and no
   applicable rules yield `skipped`.

Use examples for protocol fixtures and each error tag; use fast-check for the six laws above.
Use `TestClock` only where timeout/retry semantics exist, and `Deferred`/`Queue` for fiber
synchronization. Do not add sleeps, real network calls, or unbounded generated collections to
the ordinary unit-test lane.

## 8. Risks, counterexamples, and strongest case against the recommendation

- **Version-skew risk:** Dalph and D&D demonstrate concepts across beta and RC Effect APIs,
  not a shared production pin (E01-E02). Copying syntax mechanically may fail or lock the
  product to prerelease behavior.
- **Architecture-transfer risk:** Dalph's service density reflects external authorities,
  durable history, and long-lived orchestration. Applying it to pure finding transforms
  would obscure straightforward code (E13, E18).
- **Error-style conflict:** Dalph favors Effect tagged error classes; D&D often uses plain
  tagged values and `Result` (E03, E15, E17-E18). The right split follows the boundary, not
  repository popularity.
- **Configuration counterexample:** both repositories mix styles (E05-E06, E19). The
  recommendation for `ConfigProvider` is an inference for testability, not a demonstrated
  universal local convention.
- **Retry evidence asymmetry:** only Dalph materially supports the scheduling recommendation
  (E07). The prototype must validate Jev idempotency and deadlines before retry exists.
- **Security risk:** typed schemas do not by themselves prevent source or secret egress.
  Redaction, path exclusions, payload budgets, and safe logging need dedicated tests.

The strongest case against Effect is that the initial product might be only a small adapter
plus pure decision functions. D&D shows that schemas, tagged `Result` values, dependency
injection by ordinary parameters, and focused adapters can remain clear without a pervasive
service graph (E17-E19). If the prototype has no long-lived streams, scoped resources,
concurrent ownership, retry scheduling, or meaningful environment polymorphism, a smaller
runtime may reduce API/version risk. Conversely, real multi-host lifecycle and cancellation
evidence would strengthen Effect's case.

## 9. Specification/prototype handoff

| ID | Advisory implication | Evidence / counterevidence | Workflow/hosts | Uncertainty and consequence | Handoff | Disposition |
| --- | --- | --- | --- | --- | --- | --- |
| I01 | Normalize every host event through a strict schema before review. | E04-E05, E15-E19 | Codex v1; future hosts separately | Host payload fidelity is unknown; a lossy contract could review the wrong snapshot. | Specify event algebra; prototype pinned Codex fixtures and malformed payloads. | both |
| I02 | Keep `reviewed`, `skipped`, and `unavailable` as an explicit tagged algebra separate from operational failures. | E03, E15, E17-E18 | synchronous advisory/headless | Exact reason vocabulary and diagnostic channel are unsettled. | Specify outcome mapping; PBT exhaustiveness and failure cases. | both |
| I03 | Use services/layers only at effectful authority/lifecycle seams. | E03-E04, E17 versus E18 | hosts, Jev, storage | Too few seams causes hard-coded adapters; too many hides pure logic. | Prototype replaceable fake/live ports; review dependency graph. | prototype |
| I04 | Retry only typed transient, idempotent Jev operations with a bound and visible exhaustion. | E07; D&D unknown | remote review failure | Jev idempotency and rate-limit contract are not established. | Specify failure policy after backend experiment; test attempt bound. | both |
| I05 | Make session ownership, cancellation, duplicate coalescing, and re-entry explicit. | E08-E09; D&D replay evidence E20 | concurrent edits/all hosts | Host lifecycle differences may invalidate one state model. | Run interleaving/conformance fixtures and PBT event sequences. | prototype |
| I06 | Use deterministic Effect tests plus pure PBT. | E09-E10, E20 | all | Selected library versions and generators differ. | Pin toolchain; prove shrinking/replay in CI. | both |
| I07 | Stage strict compiler/Effect diagnostics rather than importing either lint policy wholesale. | E11-E12, E21 | development/CI | Early strictness can expose prerelease diagnostic churn. | Specify mandatory TS flags; prototype diagnostics as warnings then errors. | both |
| I08 | Do not adopt durable journal/reconstruction until process-loss requirements demand it. | E07, E13; counterexample E18 | restart/ambiguous effects | Deferral could be wrong if blocking decisions must be audited durably. | Clarify audit/restart requirements; simulate process loss. | defer pending requirement |

## 10. Implementation-readiness checklist

Before implementation is treated as specification-complete:

- [ ] Select one Effect release and record resolved `effect`, platform, test, TypeScript,
  and package-manager pins.
- [ ] Close every mandatory Effect dependency gate or choose the simpler-runtime fallback.
- [ ] Name product-owned domain terms without calling the product Jev.
- [ ] Define canonical host event, review request, finding, decision, and failure schemas.
- [ ] Define which values are branded and which constructors reject rather than normalize.
- [ ] Map each unknown boundary to exactly one decoder and safe diagnostic policy.
- [ ] Separate pure review policy from `HostAdapter`, `ReviewBackend`, and state-store ports.
- [ ] Prove v1 is advisory-only; define headless behavior and multiple-tool composition.
- [ ] Define Jev timeout, retry eligibility, attempt bound, rate-limit handling, and exhausted
  failure behavior.
- [ ] Define session scope, interruption, backpressure, duplicate, ordering, and re-entry
  semantics.
- [ ] Provide fake/test layers from the same interfaces used by production code.
- [ ] Add example tests for each tagged failure and PBT for aggregation, idempotency,
  deduplication, replay, and decision precedence.
- [ ] Use deterministic synchronization and virtual time for concurrent/scheduled tests.
- [ ] Enable strict TypeScript and package-boundary/circular checks before growing adapters.
- [ ] Record source-egress, credential, path-exclusion, payload-budget, and log-redaction tests.
- [ ] Keep module exports explicit and small; review any barrel growth as an API decision.

## 11. Limitations and primary-source index

This was a source-inspection pass. It did not install dependencies, run tests, benchmark
latency, validate licenses, contact Jev, or exercise a real agent host. Counts and absence
claims were not promoted into behavior claims. Repository documentation establishes intent,
not execution. Local absolute paths are stable only for the named commits; a future report
should use immutable remote blob links if it becomes the long-lived canonical advisory.

Primary sources:

- Dalph: `/workspace/typescript/dalph/AGENTS.md`,
  `/workspace/typescript/dalph/docs/ARCHITECTURE.md`, source/tests under
  `/workspace/typescript/dalph/packages`, root `package.json`, `tsconfig.base.json`, and
  `eslint.compat.config.mjs` at commit
  `beb3c9bb68c7a8b56f1b9e5ee999cfa1b43603ad`.
- D&D: `/workspace/typescript/dnd/ARCHITECTURE.md`, source/tests under
  `/workspace/typescript/dnd/packages`, root and package manifests/configs at commit
  `478648d493981b03137657ac4698f8fdb86fce17`.
