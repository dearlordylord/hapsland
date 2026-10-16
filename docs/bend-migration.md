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

Preserve the original guarantees; apply the owner’s 2026-10-16 whole
Preparation exception (≤3×) below; otherwise require performance parity;
measure build and execution every 30 minutes. Remove the superseded TypeScript
algorithms and product orchestration. Completion means connected Bend, deleted
superseded TypeScript and passing local checks of the composed flow. Counts of
migrated decisions, helpers or proofs are intermediate evidence.

After two diagnostic attempts without a distinguishing result, stop the current
experiment. Continue only with a new testable hypothesis that closes a named
production obstacle; otherwise return to implementation. Renaming the experiment
or changing its executor does not reset this limit.

## Bend check and emission deadline

Default migration Bend proof/check/emission deadline: ten seconds. Owner exception
2026-10-16: complete attachment transaction proof may take 20 seconds; measured
checker+kernel PASS in 11.35s wall/11.04s CPU. All other limits stay unchanged.
Historical ten-second timeouts remain failures under their original deadline.

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
is removed. Preparation is **not accepted**: final acceptance and cleanup remain open.
`migration/bend-abi-2037` uses Bend 2.0.37 with numeric Nat/shared records.
Compiler cohort: [43097ad4](https://github.com/dearlordylord/bend/commit/43097ad479b8dea99ddd1ba4610c7b32cdaf7084).
Its producers/full consumers pass; attachment kernel passes in 11.35s; whole performance meets the new limit.
Preparation/Finalization and Graph Effect forward Bend trees directly; public
native projection/freeze and lifecycle boundaries remain. Full consumers pass.

### Remaining obstacles and acceptance evidence

| Obstacle | Required change or evidence |
| --- | --- |
| Local analyzer physical acceptance | Public Trees/Preflight and Source Outcomes now use packaged Core in the existing Canonical lease. Production analyzer.ts DFS, sets/limit/first-failure and preflight equations removed; host retains slots/materialization/postfix effects. 30 laws/45 mutants and 78 packaged modes pass. Retained checks use explicit fixtures and the independent Bend specification; whole performance qualifies separately. |
| Attachment proof | Owner raised this root’s deadline on 2026-10-16. Original complete law passes checker+kernel: ALL PROOFS CHECK, 11.35s wall/11.04s CPU, unchanged source SHA073e9514. Ordinary capability runner now permits 20s for this root only; other roots keep 10s. No guarantee or premise changed. |
| Combined preflight | Production Core owns callable policy/Go fallback in Canonical Preflight. After five laws/kernel controls and ten proof mutants passed, removed the eight temporary Bend/spec/proof/runner files under the owner’s deletion condition. 21 physical regressions, build46/46, 23 receipts and compiled Source pass after deletion. The old TS preflight oracle and its whole-Preparation caller chain are deleted. |
| Whole-path performance | Owner accepts ≤3×. Fixed TS master `a0773f79` public whole comparison at 2026-10-16 18:59 UTC qualifies **1.4044×**: 17 frozen pairs, exact results/controls, seven fixtures/five languages. Strict parity false. Earlier current-native runs are historical; their oracle/profiling paths are removed. |
| Final consumers and deletion | Deleted TS Source/Post, analyzer/preflight, plan/sizing, native Graph/local/Go/Python/Rust preparation and reference drivers. Full consumers: Preparation13, Post23360/enrollment793/sizing131, Source59/6687+34, resident52/11316+893Post, Graph120/5200, Python composition18/7125. Build46/46, fast, receipts23, GoBuild4958/GoPackage247/unit41/public75 pass. Python roots67/alternatives21/parents17/target21/import26 use authored plans; session9/owned120/composed18 pass. Rust search6/cache32/UTF1/Cargo56 pass; native workflow deleted. Bounded host review found no new production policy blocker. Deletion closed; final whole acceptance remains open. |

Engine grouping preserves observation boundaries: 1484 instructions, 127 group
Acks/three observations. One-callable CPU ratio 1.3570 is diagnostic only. Whole
1.4448 failed strict parity; unchanged retries closed. Astra finds no justified next perf mechanism.

Each action closes a row. Before adding a representation or proof chain,
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
- `57e4081d` execution at 2026-10-16 19:23 UTC qualifies **0.6987×**.
  Prepared build at 19:26 qualifies **0.9039×**: 17 frozen pairs, all samples 23/46 cached.
  First 19:23 build was not comparable: candidate cache15/46 on sample0; ratio1.1535, warm gate failed. Both prepared23/46 before rerun.
  New build series retains ordinary scheduler/parallelism in both lanes; earlier
  CPU11 series is not directly comparable.
  First 17:31 build refused a leaked candidate producer in baseline; corrected environment passed. The 04:54 CPU11 baseline admission-lock
  failure and unchanged retries remain unqualified.
  Prior 21:01 execution failed 1.1571; grouped preflight whole at 23:20 UTC
  failed parity at 1.4448 (equal outputs, 17 pairs, seven fixtures/five languages).
  Later passes do not erase either failure.
  Unchanged capture, rope, shared-extraction, empty-root and connected preflight trials are closed.
- Attachment factorization and renderer/compiler/rope performance trials are
  closed; renaming does not reset them. Full attachment now qualifies under its
  owner-approved 20s deadline (11.35s); other roots retain 10s.

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
Build uses ordinary scheduler/parallelism in both lanes; execution stays CPU11.
Start build and execution measurements at least every 30 minutes. Run whole Preparation parity separately; diagnostics are not parity.
Whole Preparation baseline is TS `a0773f79` (origin/master): all five languages
and original TS orchestration. Primary analyzer/build stays `8948343b`, which
lacks Go. Public runner: exact result/control equality, 17 pairs, parity ≤1,
owner-approved acceptance ≤3. Current-native/profiling paths are removed;
earlier results remain historical.
2026-10-16 16:21 UTC: 17 frozen pairs pass exact equality, ratio **1.4334**;
performance accepted (≤3), strict parity false.

Retained sources/tests/proofs/runners belong to ordinary domain owners under
[source organization](source-organization.md), with one tracked authority, never
evidence/prototypes, snapshots, `.txt` copies or restoration inventories.
Only results belong in ignored `.test-runs`.
