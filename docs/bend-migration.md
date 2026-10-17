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

Preserve the original guarantees. The owner allows ≤3× performance loss during
migration; report strict parity separately and repair performance later.
Measure build and execution every 30 minutes. Remove the superseded TypeScript
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
checker PASS11.35s; latest focused PASS10.72s. Prior20s timeout remains a failure.
Other limits unchanged.
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
**Accepted whole migration units: 2 — Preparation; Collection through final handoff.**
Production Canonical owns their lifecycle; the global migration continues.

### Selected implementation

Production Source/Post/Advice use the common Canonical Effect owner.
Source calls packaged local Bend Core in Outcomes mode; public Trees and
Preflight use the same core.
Preserve its caller-fiber, lifecycle, cancellation, resource-custody and result
acceptance guarantees. Native identity, clock, settings, hash/reuse authority,
IEEE operations, serialization engines and atomic resource operations remain
with their native owners.

`migration/bend-abi-2037` uses Bend 2.0.37 with numeric Nat/shared records.
Compiler cohort: [43097ad4](https://github.com/dearlordylord/bend/commit/43097ad479b8dea99ddd1ba4610c7b32cdaf7084).

### Preparation acceptance evidence

| Obstacle | Required change or evidence |
| --- | --- |
| Analyzer/preflight | Bend owns Trees/Preflight/Outcomes through Canonical. Superseded TS traversal/preflight and native oracle chains are deleted; physical consumers, laws and mutation checks pass. |
| Whole-path performance | Owner accepts ≤3×. Fixed TS master `a0773f79` public whole comparison at 2026-10-16 20:56 UTC (`34b2e70b`) qualifies **1.3378×**: 17 frozen pairs, exact results/controls, seven fixtures/five languages. Strict parity false. Current-native oracle/profiling paths are removed. |
| Full consumers and deletion | TS Source/Post, traversal/preflight, plan/sizing and native Graph/local/Go/Python/Rust drivers are deleted. Accepted Preparation checks: public181/7 files, protocol19, source248/248 (473 Bend files/108 roots;14 exact mutant refusals), build46/46, fast41, receipts23 and Go75. |

Accepted Preparation candidate: `299e7894`; historical failed runs remain unqualified.

### Current qualification limits

Rope/tree, batch and UnitEvidence laws retain arbitrary-input scope; production
imports no proof/spec owner. Native engine and physical-effect correctness stay
outside those proofs.

2026-10-17: candidate `bcabe282`,21:36 UTC: execution **.7798×**;
build **.9286×**. Strict PASS/PASS,17 pairs; five freeze checks pass, build34/34
successful with23/46 cached. TS/Bend medians[ranges] s:
execution0.0647[0.0502,0.1021]/0.0543[0.0354,0.0643];
build3.5822[3.0837,5.1328]/3.3085[2.7988,4.7028]. Shared load; no causal claim.
Cache-mismatched runs are unqualified; qualifier now enforces warm preparation.
These lanes do not qualify whole evaluation performance. Historical failures
remain failures; later passes do not relabel them.

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
Scope: Linux offline physical consumers; native parser/Unicode/IEEE/hash/IO engines
remain trusted. No Darwin, live-provider, browser or cold-IPC qualification is claimed.

## Accepted unit: resident collection through final handoff

Accepted `016fce4d`: admitted request/direct/edit/status collection through
Prepare/Finalize, local and IPC. Canonical receipts own launch, cancellation,
result acceptance and C→P→D progression. Root owns G→C→R, polling, deadline
and status; TS polling/C runner/status scan and handoff algorithms are deleted.
Native owners retain capabilities/IO and masked atomic publication.
Non-collection administrative replies/pre-admission refusals retain their
separate host path; the whole resident is not migrated.

Six owner-approved Owner implementation laws pass full verdict2.03s/10s without
added State premise or public layout requirement. Fifteen unapproved trace/frame
drafts were withdrawn; independent specs/finite comparisons/mutants remain.
P/K/F/R/D/Root/C:992 tapes,4 mutants; owner60941 assertions including59523
independent comparisons. Matching build46/46,protocol9/9,fast44/1; unchanged
product e6928b73 physical187 PASS. Native24/41+80 metadata reads PASS.

Whole delivery requalification `2f5cfcfd`,2026-10-17 09:55 UTC:17 pairs,
exact results/cleanup, five freezes pass. **2.7812×**, owner≤3× PASS, strict parity
false. TS/Bend suite medians[ranges] s:
.0913[.0803,.1966]/.2542[.1786,.5163]. Scenario ratios: local-empty6.80×,
local-ready2.35×,IPC-empty2.66×,IPC-ready3.07×,edit-ready2.86×.
Shared-machine timings, no causal claim; budget applies to the whole suite.
Product IPC deadline remains4s. Per-call unchanged-graph retention has no
persistent cache.

## Current unit: resident evaluation through retained advice

Astra reviewed this whole path on 2026-10-17: reuse Canonical owner/driver/
registry and advice tail; native sessions retain IO values and original Causes.

Production cutover `9c42a671`: server evaluation invokes the whole Bend cursor
through Canonical. Bend owns admission, authorization, provider return,
settlement, retention and recovery. TS authorization/request/settlement/retention
modules are deleted; workflow is a facade. Native IO retains credentials,
provider values, capabilities and original Causes.

Canonical binds readiness/settlement to exact operation/reservation metadata.
Nested Dispatch preserves input validation, total-call deadline, credential
reread → budget → Canonical start → observation. Cleanup permits denial/accounting
only, after physical drain. Fresh findings transfer once to the independent
advice tail; cached/fresh enrollment and observation share evaluation-owned
helpers. Successful observation publishes normally; failed observation preserves
the committed tail and original Cause.

`de0fb23d`: sources281/281; protocol26/26; fast4.
Evidence:1718 tapes/49057 steps/585900 typed states/5 mutants; cached793;
Post23360. Production/IPC/collection233/12, dispatch/settings/analytics22/4, Source59, Delivery9,
`2d7067fa` build46/46, receipts23. Native cleanup6/73 and registry5 check drain/retry/Cause
with controlled authorization/observation ports. Expanded consumers found and
fixed cancelled Prepare lease cleanup and missing safe recovery diagnostics.

Whole evaluation `828c8d55`,2026-10-17 09:45 UTC, fixed TS `a0773f79`:
**2.0033×**, owner≤3× PASS, strict parity false.17 alternating pairs, five freezes,
exact outputs/request chronology/controls, zero retained resources. TS/Bend
suite medians[ranges] s: .2782[.2257,.3592]/.5411[.4570,.9249]. Public scenarios:
clear/finding/credential refusal/backend failure/cancellation. Source/provider
work is inside timers; cancellation includes physical drain, other Scope cleanup
and runtime construction are outside. Separate profiling points to CPU in
Canonical transactions/transport/driver; shared load permits no causal claim.

Three whole laws (Astra path), owner approved2026-10-17; proofs pending:
1. `EVALUATION_LAWS`: all public Evaluation/Auth/Dispatch steps proved.
2. `EVALUATION_OWNER_LAWS`: public ready/settle/provider install/complete proved; dispatch/cleanup, generic refusals + assembly open.
3. `EVALUATION_ADVICE_LAWS`: complete public transfer/cancellation proved.
Protocol gate28/28, fast pass; Canonical owner law and full source gate open.
Whole evaluation is not accepted.


Retained sources/tests/proofs/runners belong to ordinary domain owners under
[source organization](source-organization.md), with one tracked authority, never
evidence/prototypes, snapshots, `.txt` copies or restoration inventories.
Only results belong in ignored `.test-runs`.
