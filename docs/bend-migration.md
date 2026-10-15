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
   emits qualified postorder operations from `ProductValue`, preserving order
   and Binary64 identity. No second host retag/reboxing pass remains.
2. Bend [validates the stream](../packages/review-execution/src/direct-event/preparation/CanonicalJsonPlanValidation.bend)
   against the exact exported tree, including primitive payloads, Binary64 bits,
   original keys and child order. Different trees are refused before planning.
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

FrozenInput and Finalization connect the batch in production. The superseded per-primitive FrozenInput request path
is removed. Preparation is **not accepted**: original attachment gates and whole-path parity remain open.
`migration/bend-abi-2037` assesses Bend 2.0.37 (`4ff8545f`), numeric Nat/shared
records, preserving bounds/isolation. The assessed JS Map.bit/diff fork [48a21ae2](https://github.com/dearlordylord/bend/commit/48a21ae2bc00035cfffa100c062716bf5b7bf0a7) passes Astra review, independent Base equations,
two-key Map shapes/evaluation-order checks and unchanged C/TT bytes.
23 receipts, 99 producer tests and full consumers pass; whole parity fails.

### Remaining obstacles and acceptance evidence

| Obstacle | Required change or evidence |
| --- | --- |
| Original attachment proof | The complete pinned verdict for [the original law](../packages/source-analysis/src/direct-event/graph-resolution/attachment/ATTACHMENT_TRANSACTION_LAWS.bend) must finish within 10 seconds on CPU10. Preserve arbitrary World/reply, all seven branches and original premises/binding/main. Emission/kernel passes alone are diagnostic. |
| Original proof formatting | Formatter 0.1.23 (`d1e5aa7`) passes local release gates: 653 tests + one optional skip, IDE compatibility and signature. Full-law formatting passes; release/pin await authorization. |
| Connected consumer qualification | [FrozenInput](../packages/review-execution/src/direct-event/preparation/FrozenInput.bend), [Finalization](../packages/review-execution/src/direct-event/preparation/PreparationFinalization.bend) and their native binding use the batch. Source (59/6687), resident (67/14323, 868 Post) pass on the Map cohort. Finalization/public Preparation pass; repeat after production edits. |
| Whole-path parity | The assessed 2.0.37 Map cohort passes producers/consumers; connected Preparation still needs current-native ratio ≤ 1 including conversion/effects/process costs. |
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
  reverse continuations. FrozenInput refuses a valid stream for a different tree.
  Four correspondence laws pass kernel and formatting. Four semantic mutants fail
  in the proof closure; their first errors do not all isolate named laws.
  Query rewrite stops resolved field/catalog/path searches and failed predicates.
  Astra approved five arbitrary-input equivalence laws; kernel and 1940 emitted
  cases/five mutants and pinned 0.1.19 format pass; evidence/Finalization/compiled
  Source/resident/public consumers and fast pass.
- Post candidate `660bde05` removes all three host algorithms: offer disposition,
  retained-advice observation and bounded Internal progression. Its 27 laws pass
  the standard runner; four mutants fail their named laws. Build (46 workspaces),
  fast gate (5 files), 23360 Post cases and full consumers pass. These scopes do
  not establish universal correspondence, parity or whole acceptance.
- Workspace candidate `73d8c75d` removes both production TS formulas. Its Bend
  recipe serves Source admission, resize and handoff synchronously, preserving
  IEEE/coercion order. Astra approved 18 laws and structure. Kernel, four named
  mutants, 6930 differential cases, build, fast gate (8 files), 4 public workspace
  tests, 6 server scenarios and compiled Source/resident consumers pass. Original
  formulas remain only in the independent verification oracle.
- Primary actual `dbacc1cc` Map cohort analyzer/build: 0.7376 / 0.8397.
  Whole current-native Preparation **fails parity at 1.3293**: equal outputs,
  17 frozen pairs, 30 local workspaces; freezes pass, build cache 23/46.
  Fused validate/plan stopped after two checks: old/fused JS overflow at
  5000/25000 nodes; 100/1000 pass. No adoption.
- Attachment facts/consumers pass verdict/format. Full TT is 7,445,671 bytes;
  original law/premises/binding/main remain byte-identical. Full verdict times out.
  Renderer/pending-key trials preserve TT; no reliable gain. Both stopped.

### Check and source owners

Use [CHECKS.md](../CHECKS.md) and the [testing matrix](testing-matrix.md) for check
selection and deadlines. The existing
[capability runner](../scripts/run-bend-capability-check.mjs) discovers ordinary
preparation-owned Bend roots and checkers; qualify affected roots/consumers rather
than rerunning a suite with a known unrelated prerequisite failure.

Primary [cadence](../scripts/performance/production-cadence.py): baseline
`8948343b46f8426abebe675a39ac4039997b0d5b`, 17 pairs, 23/46 cached tasks, local
workspaces, frozen HEAD/sources/artifacts/receipts/environment files. Build:
`--environment` for candidate; `--baseline-environment` for baseline only.
Start build and execution measurements at least every 30 minutes. Run whole Preparation parity separately; diagnostics are not parity.

Retained sources/tests/proofs/runners belong to ordinary domain owners under
[source organization](source-organization.md), with one tracked authority, never
evidence/prototypes, snapshots, `.txt` copies or restoration inventories.
Only results belong in ignored `.test-runs`.
