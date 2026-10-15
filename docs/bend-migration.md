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

Production Source/Post/Advice use the common Canonical Effect owner.
Source calls packaged local Bend Core in Outcomes mode; public Trees and
Preflight use the same core. Whole Preparation acceptance remains open.
Preserve its caller-fiber, lifecycle, cancellation, resource-custody and result
acceptance guarantees. Native identity, clock, settings, hash/reuse authority,
IEEE operations, serialization engines and atomic resource operations remain
with their native owners.

The connected JSON stage uses the [mechanical postorder codec](../packages/review-execution/src/direct-event/preparation/canonical-json-plan-codec.ts),
[Bend exact-tree validation](../packages/review-execution/src/direct-event/preparation/CanonicalJsonPlanValidation.bend)
and [Bend planner](../packages/review-execution/src/direct-event/preparation/CanonicalJsonPlan.bend).
It preserves ordered keys, Binary64 bits, UTF16 sorting, malformed-stream refusal
and exact literal/primitive pieces. The existing checkpointed ForeignGroup
executes primitive commands separately, preserving signal/liveness checks,
raw token identity, failure order and immediate cancellation. Bend stores replies
in resume and assembles in the next ordinary advance, retaining the original
late String.concat coercion/error boundary. No host retag/reboxing pass remains.

FrozenInput and Finalization connect the batch in production. The superseded per-primitive FrozenInput request path
is removed. Preparation is **not accepted**: attachment hard10, pinned formatting and whole parity remain open.
`migration/bend-abi-2037` uses Bend 2.0.37 with numeric Nat/shared records.
Compiler cohort: [43097ad4](https://github.com/dearlordylord/bend/commit/43097ad479b8dea99ddd1ba4610c7b32cdaf7084).
Its producers/full consumers pass; current attachment hard10 and whole parity fail.
Preparation/Finalization and Graph Effect forward Bend trees directly; public
native projection/freeze and lifecycle boundaries remain. Full consumers pass.

### Remaining obstacles and acceptance evidence

| Obstacle | Required change or evidence |
| --- | --- |
| Local analyzer physical acceptance | Public Trees/Preflight and Source Outcomes now use packaged Core in the existing Canonical lease. Production analyzer.ts DFS, sets/limit/first-failure and preflight equations removed; native host retains artifact slots/materialization/postfix effects. 30 laws/42 mutants pass. Connected consumer: 64 roots/five languages/114 artifact identities/18 measurement/17 fault cases, 72 packaged modes. Source59/6687, resident67/14323+868Post and FrozenInput60/606 refusals pass. Independent verification-only TS oracle now backs all comparisons. Rebuild/23 receipts, repeated Source/resident/FrozenInput, 254 public tests and check:fast pass; whole parity remains. |
| Attachment hard10 | Reply proof dispatch now factors 37 incompatible applications through one exhaustive 39-constructor eliminator; Astra source review approves unchanged guarantee. Frontend/full TT emission pass, no OOS (7,431,252 bytes). Original law/premises/binding/main remain byte-identical. Current full verdict still times out at CPU10/hard10; no acceptance and no unchanged retry. Need a different source-supported proof-shape hypothesis. |
| Original proof formatting | Pinned 0.1.19 block-list limitation also affects local analyzer proofs; alias/hoist route closed. 0.1.23 (`d1e5aa7`): 653 tests + one skip, IDE/signature/full-law PASS. Release/pin require explicit authorization. |
| Connected consumer qualification | Local analyzer connection requalified against independent TS: Source/resident/FrozenInput and 254 public tests pass, including failure/measurement ordering. |
| Shared extraction | Connected all five adapters through one Source Analysis entry inside ExtractSource. Astra structural review found no blocker. Matching 46/46 build/23 receipts and 42 differential cases pass, including imports/limits/duplicates/graph refusal with local fallback. TS/Python/Go/Rust main source parses once per invocation; no cross-command cache. Deterministic parser facts are the boundary, not transient monkeypatch behavior. Physical/public consumers, fast gate and independent whole parity pending. No local Core representation/law change. |
| Whole-path parity | Connected local candidate whole current-native ratio is 1.2650; ≤ 1 remains required including conversion/effects/process costs. Collect/sort/dedup closed: unsupported payoff/UTF16 proofs. Binary64 scratch: encode 1.3228, encode/decode 1.4240; 17 frozen equal-output pairs each. Both failed; allocation trial closed, production codec restored, 20 cases retained. Object.fromEntries rejected: getter/error order. |
| Final consumers and deletion | Requalify Source/resident/Post/Advice, fencing, cancellation, failures and result acceptance on the final candidate. Then remove the local analyzer verification oracle and [the native TS verification oracle](../packages/review-execution/src/direct-event/preparation/verification/native-preparation.ts) and its superseded consumers/performance reference. Audit remaining host branches for product policy. |

Each action must close one row. Before adding a representation or proof chain,
explain how it shortens this path; prefer equivalent laws to generic machinery
that only bridges helper names.

### Current qualification limits

- Rope planner: unconditional compile/stack/count/flatten/stable-sort equivalence
  and original tree laws pass kernel without caller budgets or validity premises.
  Owner runners cover actual codec streams, malformed stacks, duplicate keys,
  deep trees and semantic mutants. Production imports no proof/spec owner.
- Eight batch protocol/eighteen actual-machine laws pass. Existing consumers
  cover correlated headers/counters, 606 FrozenInput and 9615 Finalization
  refusals, prefix throw/abort and late raw-token coercion. Whole acceptance stays open.
- UnitEvidence query: five arbitrary-input laws, 1940 cases/five mutants,
  pinned format and compiled consumers pass. Post removes three TS algorithms
  (27 laws/four mutants/23360 cases). Workspace removes both TS sizing formulas
  (18 laws/four mutants/6930 cases), preserving IEEE/coercion order.
- Primary `f8ce2efe`: function-analyzer/build 0.8212 / 0.8415
  (19:49:16 / 19:50:37 UTC, 17 pairs, frozen inputs, cache 23/46).
  Cadence starts exceeded 30 minutes by 10s / 48s; parity does not qualify cadence.
  Function execution does not measure the local type analyzer.
  Connected local candidate whole Preparation at 19:25 UTC **fails parity at 1.2650**:
  equal outputs, 17 frozen pairs, seven fixtures/five languages, independent TS
  oracle and 30 local workspaces. Build/23 receipts, independent Source/resident/
  FrozenInput and 254 public tests pass; check:fast selects nine lint files.
  Imported type regressions pass the compiled gate.
  The prior capture trial was 1.3804; separate runs establish no causal comparison.
  Unchanged capture, rope and connected-local timing retries are closed.
- Original attachment law/premises/binding/main remain byte-identical. Shared-witness
  and reply-dispatch factorization do not yet pass current hard10 qualification.
  Build, 23 receipts and compiled Source (59/6687, 34 physical cases) pass.
  Pinned formatting remains open. Renderer/pending-key, runtime attribution,
  attachment formatter alias/hoist, fused validate/plan and compiler sequence
  and unchanged rope performance trials are closed; renaming does not reset them.

### Check and source owners

Use [CHECKS.md](../CHECKS.md) and the [testing matrix](testing-matrix.md) for check
selection and deadlines. The existing
[capability runner](../scripts/run-bend-capability-check.mjs) discovers ordinary
preparation-owned Bend roots and checkers; qualify affected roots/consumers rather
than rerunning a suite with a known unrelated prerequisite failure.

Primary [cadence](../scripts/performance/production-cadence.py): baseline
`8948343b46f8426abebe675a39dc4039997b0d5b`, 17 pairs, 23/46 cached tasks, local
workspaces, frozen HEAD/sources/artifacts/receipts/environment files. Build:
`--environment` for candidate; `--baseline-environment` for baseline only.
Start build and execution measurements at least every 30 minutes. Run whole Preparation parity separately; diagnostics are not parity.

Retained sources/tests/proofs/runners belong to ordinary domain owners under
[source organization](source-organization.md), with one tracked authority, never
evidence/prototypes, snapshots, `.txt` copies or restoration inventories.
Only results belong in ignored `.test-runs`.
