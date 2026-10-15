# TypeScript to Bend migration

**Purpose:** Guide complete subsystem migration into the Canonical-owned product flow and the placement of external engine calls.
**Audience:** Contributors, including coding agents implementing and reviewing migrations.
**Status:** Active migration guidance.
**Authority:** Repository migration guidance reflecting the owner's direction; the accepted Canonical flow architecture in docs/architecture.md owns the target composition, and linked product contracts continue to own observable behavior.
**Expected use:** Read before choosing a migration unit, moving orchestration, or wrapping an external engine.
**Lifecycle:** Update with accepted migration-boundary, flow-ownership and toolchain decisions; review when the Canonical composition, foreign interface, supported runtime lanes, or acceptance workflow changes.

## Migration objective

In a worktree from master, systematically migrate Hapsland from TypeScript to
Bend through strangler fig, completing whole subsystems. The target is
[Canonical ownership of the product flow](architecture.md#canonical-ownership-of-the-product-flow):
specialized Bend machines participate through its commands and events, while
the host retains external effects, resource lifetime and ABI conversion.

For each migration unit, first agree a short path to production with Astra:
the implementation, its connection to Canonical, remaining proofs, the full
consumer and acceptance checks. Every action must close a concrete obstacle on
that path. Before introducing a new representation or a chain of supporting
laws, explain why it reaches the connected subsystem sooner.

Preserve the original guarantees and require at least performance parity;
measure build and execution every 30 minutes. Remove the superseded TypeScript
algorithms and product orchestration. Completion means connected Bend, deleted
superseded TypeScript and passing local checks of the composed flow. Counts of
migrated decisions, helpers or proofs are intermediate evidence.

After two diagnostic attempts without a distinguishing result, stop the current
experiment. Continue only with a new testable hypothesis that closes a named
production obstacle; otherwise return to implementation. Renaming the experiment
or changing its executor does not reset this limit.

## Bend check and emission deadline

The owner raised the per-process migration Bend proof/check and emission deadline
to ten seconds on 2026-10-12. A later run does not retroactively qualify an earlier timeout.
The performance-parity requirement is unchanged.

## Preserve the candidate on the remote branch

Keep all retained migration sources, tests, specifications, proofs, runners and
documentation tracked in the working branch, including unfinished work. Commit
and push stable work batches frequently, and verify that the local commit SHA
matches the remote branch SHA. A local commit alone does not protect against
loss of the workstation disk. Backup checkpoints do not constitute migration
acceptance; report their validation limits explicitly.

## Connect subsystems through Canonical

Canonical owns the launch, lifecycle, cancellation, result acceptance and
progression between product stages. A subsystem may remain a separate Bend
module or child machine with its own internal state; a single flow authority
does not require one reducer function or one file. For graph resolution, the
resolver machine may retain ImportGraph as its internal budget reducer.

The host executes requested foreign operations and returns responses. It must
not retain product orchestration that selects the next subsystem or makes
continuation decisions. Preserve existing source-free/source-bearing boundaries
and identity, revision, cancellation and error guarantees in the composition.

Qualify both the subsystem's internal implementation and its integration into
Canonical. Internal qualification alone does not complete the flow migration.

## Choose a complete subsystem

Use strangler fig to replace a complete subsystem: its algorithm, state, data
structures, result construction and error handling. Supporting helpers and
proofs are intermediate work within that unit. Keep its accepted observable
behavior while connecting the Bend implementation to its real consumers.

For graph expansion, the unit includes traversal, cycles, visited state,
budgets, ordered results and pending dependencies. A language parser is a
separate engine boundary.

## Reuse large external engines through Bend

Use Bend's foreign-effect interface for substantial existing engines such as
tree-sitter and language grammars. Reuse their implementations instead of
rewriting a language parser in Bend as part of migrating application logic.
Bend should orchestrate the migrated subsystem and request external engine
work through that interface. The foreign binding performs engine calls and
data conversion; application traversal, policy and state transitions belong
in Bend.

For source analysis, the intended boundary is:

```text
Bend orchestration -> foreign parser call -> typed syntax facts
                   -> Bend graph traversal and result construction
```

Large application-owned algorithms and their orchestration remain whole
migration units; external calls reuse independently maintained engines.

Before implementing a binding, inspect `bend guide` from the repository's pinned
toolchain. Its foreign effects use `IO` declarations with C or JS implementation
imports. Implement and exercise the lanes required by the accepted target;
one lane's working binding does not establish another lane's support.

## Keep the proof boundary explicit

Put foreign calls in the runtime shell and pass typed results into the pure
core. Keep foreign implementations outside the proof import closure. State
and prove the core's validation and domain behavior over those inputs; a core
proof does not prove tree-sitter or its language grammar correct.

The boundary contract must define returned facts, errors, text and byte
encoding, and resource ownership or lifetime where relevant. Exercise the
actual binding and its failures separately from pure-core proofs. Retain
existing deadlines, file-access restrictions and product error semantics.

## Accept the whole migration unit

Agree the laws with the designated reviewer before proving them; Astra is the
reviewer for the current migration. Select checks through [CHECKS.md](../CHECKS.md)
and the [testing matrix](testing-matrix.md). The
[Bend package guide](../packages/agent-flow-bend/README.md) owns current compiler,
ABI and proof entry points.

Qualify the complete observable result against the previous implementation and
measure the real connected consumer, including external calls and conversion.
For the current migration, measure build and execution every 30 minutes and
require at least parity. Report existing production measurements separately
from measurements of an unadopted candidate.

Complete the unit by connecting the qualified implementation through Canonical
commands and events, removing the superseded production TypeScript algorithms
and product orchestration, and passing the required local checks for the composed
flow and real consumer. Check parent/child identity and revision fencing,
cancellation, errors and result acceptance at the actual integration boundary.
Proof counts, helper benchmarks and prototype results alone do not establish
that a subsystem has migrated.

## Current whole preparation acceptance path

**Scope:** accept the complete Preparation flow: graph/source preparation,
finalization, Post and Advice through the production Canonical owner.
**Accepted whole migration units: 0.** Local proofs and module checks are not
acceptance of this unit.

### Selected implementation

Production Source/Post/Advice already use the common Canonical Effect owner.
Preserve its caller-fiber, lifecycle, cancellation, resource-custody and result
acceptance guarantees. Native identity, clock, settings, hash/reuse authority,
IEEE operations, serialization engines and atomic resource operations remain
with their native owners.

The current performance candidate replaces the JSON stage's repeated primitive
crossings with a Bend-selected serialization plan:

1. The [mechanical codec](../packages/review-execution/src/direct-event/preparation/canonical-json-plan-codec.ts)
   converts an already materialized `ProductValue` into postorder operations.
   It preserves field order and Binary64 bits; it neither sorts nor serializes.
2. Bend [validates the stream](../packages/review-execution/src/direct-event/preparation/CanonicalJsonPlanValidation.bend)
   against the exact exported tree, including primitive payloads, Binary64 bits,
   original keys and child order. A different valid tree is refused before planning.
3. The [Bend planner](../packages/review-execution/src/direct-event/preparation/CanonicalJsonPlan.bend)
   folds that stream over a stack, preserves key/value pairing, sorts with the
   existing UTF16 comparator and produces exact literal/primitive pieces.
   Underflow and a nonsingleton final stack are explicit refusals.
4. The existing Canonical checkpointed ForeignGroup executes the selected
   primitive commands individually. Preserve signal checks, post-effect liveness,
   raw token identity, failure ordering and immediate cancellation.
5. Bend accepts the replies and owns assembly/progression. Store raw tokens in
   `resume`; perform the original `String.concat` in the next ordinary `advance`,
   preserving its existing late-coercion/error boundary.

The batch protocol is connected through FrozenInput and Finalization in the
production dispatch path. The superseded per-primitive FrozenInput request path
is removed. The whole Preparation migration is still **not accepted**: original attachment gates and whole-path parity remain open.
The planner and validator decrease operation lists, without opaque handles or
arbitrary fuel.

### Remaining obstacles and acceptance evidence

| Obstacle | Required change or evidence |
| --- | --- |
| Original attachment proof | The complete pinned verdict for [the original law](../packages/source-analysis/src/direct-event/graph-resolution/attachment/ATTACHMENT_TRANSACTION_LAWS.bend) must finish within 10 seconds on CPU10. Preserve arbitrary World/reply, all seven branches and original premises/binding/main. Separate emission and kernel passes are diagnostic only. |
| Original proof formatting | The complete attachment law must pass the pinned formatter. Its remaining deep block/list layouts still fail; prefix or isolated-definition checks are insufficient. |
| Connected consumer qualification | [FrozenInput](../packages/review-execution/src/direct-event/preparation/FrozenInput.bend), [Finalization](../packages/review-execution/src/direct-event/preparation/PreparationFinalization.bend) and their native binding use the batch. Post-cut compiled Source/resident, Finalization and public Preparation pass; repeat on the final candidate. Individual module checks are insufficient. |
| Whole-path parity | Measure the complete connected Preparation consumer against the current native reference, including conversion, effects and process costs. Require ratio ≤ 1; analyzer/build parity alone does not satisfy this gate. |
| Final consumers and deletion | Requalify Source/resident/Post/Advice, fencing, cancellation, failures and result acceptance on the final candidate. Then remove [the native TS verification oracle](../packages/review-execution/src/direct-event/preparation/verification/native-preparation.ts) and its superseded consumers/performance reference. Audit remaining host branches for product policy. |

Each action must close one row. Before adding a representation or proof chain,
explain how it shortens this path; prefer equivalent laws to generic machinery
that only bridges helper names.

### Current qualification limits

- The JSON planner has seven local and eight compound laws, approved by Astra
  and proved with the pinned kernel. The independent `comparison_exact` law is
  mandatory alongside object layout. Named mutations cover primitive loss,
  pop loss, single-root refusal, wrong comparison and rejecting all compounds.
- The actual codec-to-emitted-planner consumer checks 79 trees / 2117 exact
  pieces, malformed streams, 361 fold splits and arbitrary compound stacks.
  These finite checks complement the universal tree/trace and actual-machine
  counter laws.
- Eight batch protocol laws and eighteen actual-machine laws pass the pinned verdict.
  The actual-machine laws/proof also pass formatting; composition mutants reject
  a shifted first request ID and removed Export header guard.
  Protocol named mutations cover selection
  offsets, invocation checking, outer IDs and literal preservation. Actual machine
  consumers cover headers/counters, 606 FrozenInput refusals and 9615 Finalization
  refusals; runtime cases cover prefix throw/abort and late token coercion.
- The stream validator's emitted consumer checks 79 trees, 1344 refusals and two
  reverse continuations. The real FrozenInput consumer refuses a structurally
  valid stream for a different exported tree. Four universal correspondence laws pass the pinned kernel and formatting. Four
  semantic validator mutants are rejected within the proof closure; this does not
  claim that each first error isolates a named universal law.
- Post candidate `660bde05` removes all three host algorithms: offer disposition,
  retained-advice observation and bounded Internal progression. Its 27 laws pass
  the standard runner; four mutants fail their named laws. Build (46 workspaces),
  fast gate (5 files), Post 23360 cases, compiled resident 67 and Source 59 cases
  (34 whole-native comparisons), Finalization 66/52 runtime cases, and all 13
  public Preparation tests pass. These scopes do not establish universal
  correspondence, parity or whole acceptance.
- Workspace candidate `73d8c75d` removes both production TS formulas. Its Bend
  recipe serves Source admission, resize and handoff synchronously, preserving
  IEEE/coercion order. Astra approved 18 laws and structure. Kernel, four named
  mutants, 6930 differential cases, build, fast gate (8 files), 4 public workspace
  tests, 6 server scenarios and compiled Source/resident consumers pass. Original
  formulas remain only in the independent verification oracle.
- Primary analyzer/build on `73d8c75d` pass at 0.6585 / 0.7946.
  Public current-native Preparation on that candidate **fails parity at 1.8979**.
  All 30 workspace dependencies resolve inside the measured checkout.

### Check and source owners

Use [CHECKS.md](../CHECKS.md) and the [testing matrix](testing-matrix.md) for check
selection and deadlines. The existing
[capability runner](../scripts/run-bend-capability-check.mjs) discovers ordinary
preparation-owned Bend roots and checkers; qualify affected roots/consumers rather
than rerunning a suite with a known unrelated prerequisite failure.

Primary cadence uses [production-cadence.py](../scripts/performance/production-cadence.py):
fixed baseline `8948343b46f8426abebe675a39ac4039997b0d5b`, 17 alternating pairs,
frozen HEAD/authored inputs/artifacts, checkout-local workspace resolution and
23/46 cached tasks in every build sample.
Start build and execution measurements at least every 30 minutes. Run complete
Preparation parity separately; diagnostics and instrumented timings are not parity.

Keep retained code, tests, specifications, proofs and necessary runners in their
ordinary domain owners under [source organization](source-organization.md), with
one maintained source authority. An unfinished candidate still belongs there.
Results belong in ignored `.test-runs`; evidence/prototypes, source snapshots,
`.txt` copies and source-restoration inventories are not migration source owners.

This document contains the current acceptance path and constraints. Replace
superseded status in place. Experiment chronology, past candidates and historical
measurements remain in Git history; do not append them here or create an archive
copy. Existing executable qualification reports own detailed local run output.
