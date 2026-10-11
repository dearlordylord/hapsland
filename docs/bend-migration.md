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

The working candidate is not accepted production. Astra agreed the shortest
whole-unit route: graph resolution/parser facts belong to source-analysis;
preparation progression to review-execution; source/post preparation, advice tail
and resource bindings to resident-runtime; child lifecycle to agent-flow-bend.
Backend facts belong to runtime-environment, configuration selection to
runtime-inputs, and provider/rule semantics to review-definition. All retained
sources, tests, specifications, proofs and runners are ordinary tracked files at
these owners. Evidence contains results only. Commit and push source checkpoints
to `migration/bend-direct-login-resumed`, verifying the remote SHA, throughout work.

`PreparationFinalization.bend` now replaces the candidate's complete RenderUnits
native child. Bend controls ordered units, required root-location short-circuit
before traversal, fingerprints/partial capabilities, language selection, per-unit
current rules reads, Canonical admission, frozen input and semantic identity.
The real composition bridge executes closed requests under the existing
RenderUnits owner lease. Rule gates use the same resident Canonical transaction;
`Invocation{owner, command}` carries its actual issued request identity, with one
monotonic engine request namespace across units/stages. Provider facts are read
after nonempty rule selection, rather than before the unit loop. Host bindings execute
ECMAScript extname/lowercase, no-flags RegExp, URI/JSON primitives, SHA-256,
mechanical deep freezing and optional observation effects. They do not choose
next units/stages or select rules/provider/input. Full OtherContract values remain
intact. URI engine exceptions retain their original object; other host failures
propagate, while synchronous omission observer throws alone are swallowed.

The production-binding `native-preparation-children.mjs` is removed. The renamed
`native-preparation-reference.mjs` reads the current TS owner only for verification;
it is never a product engine. Delete it with the replaced TS implementation on
whole acceptance, preserving the independent correspondence contract at its owner.
Public production `pipeline.ts` still runs TS preparation. New production Bend
connected for this whole candidate: **0**; replaced production TS removed: **0**.

Current finite evidence, with commands at the testing matrix:

| Boundary | Observed coverage | Limit |
| --- | --- | --- |
| Whole finalization machine | 66 ordered scenarios and five actual binding vectors, 9947 requests, 194 real Canonical gates, 93 omissions, 127 current-rule reads, 75190 wrong replies | Actual native ready consumer, full JSON outcomes and chronology; universal proof remains open. |
| Real Source composition | 50 cases, 5554 requests, 25 independent whole native comparisons | Ordered physical effects, inputs/identities, activity publication and pre-teardown custody; full error/cancellation correspondence remains open. |
| Real Preparation → Post composition | 64 cases, 14395 requests, 807 Post requests | Native result differential, parent cancellation/late replies, retained advice, post-admission barriers and cleanup; whole proof and public adoption remain open. |
| Frozen input/identity | 60 cases, 5960 engine requests, 17880 wrong replies | All five languages, partial units, three providers; full field order and ordinary JSON checked. |
| Configuration/provider | 91 cases, including 44 through actual settings decoder; 62 URI requests, 2385 wrong replies | Other 47 cases are explicitly raw-shape extensions, not validated producer claims. |
| Ordered rule block | 1200 contexts, 60960 regex and 38400 real Canonical requests | Exact original rule order/freezing; arbitrary engine responses are fenced but are not correctness premises. |
| Glob owner | 12771 native validation/single/any comparisons | Full UTF-16 dialect, brace/class interactions and ordered validation; finite, not universal. |
| Rule snapshot owner | 360 contexts, 8640 snapshot rules | Real authored compiler; duplicate-input extension is outside its decoder domain. |
| Unit evidence/metadata | 59 cases, 365 node steps | Provenance, first declaration location, sorted capture fingerprints; immutable unique-key/path producer premises required. |
| Canonical JSON owner | 96 cases, 596 primitive requests | UTF-16 keys, binary64 specials, lone surrogates and nesting; exact mechanical JSON reply premise required. |

The current-source stages and real consumers above are not whole acceptance.
New provider/input/whole machine files pass source, runner lint and pinned format.
The pinned formatter still rejects UnitEvidence and Glob with `Unsupported block
expression in list`; this is an open gate, not an exemption.

One current obstacle list, in execution order:

1. Qualify ordinary compiled capability boundaries and the unique shared ABI:
   source-analysis resolver/session, review-execution preparation, and
   resident-runtime Canonical workflow. Keep private stages hidden. Relocated
   sources must enter compiler/declaration receipts; authored MJS is currently
   outside ordinary TS emission. The graph-resolution Types dependency still
   needs a narrow single owner; never duplicate ProductValue. Last standard
   development-import census reported 5 unresolved paths, 47 undeclared
   dependencies and 223 private cross-owner imports; current qualification is
   still required. Do not expose every helper or bypass that gate.
2. Finish all retained source/proof and ordinary quality gates. The source gate
   uses current import closures, nonempty checking roots and a five-second limit;
   foreign Runtime IO roots compile to temporary JS, pure roots use `--verdict`.
   Its last full run passed 38 selected files before the unproved
   `ATTACHMENT_TRANSACTION_LAWS.bend`. That law remains selected. One shared
   AttachmentTransactionContract and one complete LiteralCuts replace 18 duplicate
   literal/control/copied-Attach files. Full Cuts/Contract/construction checks hit
   five seconds; the mutation runner refuses a result without a passing pristine
   control. Native/core empty `sourceDependencies` is preserved in the corrected
   Forest spec; Forest and universal AttachmentUnitProductProof passed. Formatting
   of Cuts/UnitProductProof dependent headers remains incomplete. Scheduler's two
   original proof roots and four original-law mutant rejections passed, with 2212
   runtime comparisons and 1806 cancellation suffix comparisons; these do not
   qualify the remaining roots. Address UnitEvidence/Glob formatter diagnostics.
3. Agree and prove exact whole finalization joined to Preparation trace/custody:
   ordered outcomes and omission arguments, short-circuit/error chronology,
   producer-derived facts and mechanical-engine correspondence, identity bytes,
   optional fields/order/freezing, scoped replay rejection and structural
   termination. Preserve partial-unit `complete:true` with restricted capabilities;
   UTF-16/JSON behavior; exclusion of rootLocation/sourceFingerprints from identity;
   per-unit currentRules reads; synchronous observer throws only. Existing
   constructor+cleanup Cause evidence preserves both errors and registered retry
   before acceptance/release. Precommit, round-bound retained inspection and whole
   universal custody/Cause remain open. Connected runtime bindings now preserve original rules/gate/URI exceptions,
   skip unused fallback and read provider after a rules callback update. Cancellation
   during the actual resident Canonical gate rejects terminal publication and
   discharges all resources. Whole failure/cancellation correspondence is still
   required; transport failures must not become omissions or InvalidReply.
4. Complete supported Go/session, extraction, classification and rendering scope
   and discharge the agreed whole-unit laws/proofs. The finalization language
   registration includes Go and explicitly guards all five supported IDs; this
   does not complete the resolver/session language scope.
5. Connect launch, lifecycle, cancellation, result acceptance and progression
   through the single production Canonical authority. Replace public TS preparation
   algorithms/orchestration and delete superseded maintained paths. Qualify actual
   native prepareObservation against the ordinary compiled API, including ordered
   inputs, identities, omissions, failures and ownership. Candidate RenderUnits
   replacement alone does not qualify public production adoption.
6. Pass all selected local acceptance checks and strict paired build/execution
   parity on the connected candidate. Latest cadence at `c6ff0a9d` began
   2026-10-11 05:56:48/06:01:24 UTC: build qualified but failed parity **1.1603**;
   execution qualified and passed **0.8325**. All 17 build pairs used 23/46 cached
   tasks; HEAD, sources and artifact trees stayed unchanged; execution matched
   both callers on seven fixtures. These cover existing production, not unadopted
   whole preparation. A prior owned-lock failure was recovered by ordinary fresh
   build custody without manually deleting records; no failed build is qualified
   by a later execution run. The earlier 03:36→04:07 cadence breach remains
   recorded. Keep new measurements within 30 minutes and freeze their inputs.

Keep this obstacle list current by removing closed work and naming specific
remaining failures. Source backup, relocation and finite candidate qualification
do not count as connected production Bend or removed replacement TypeScript.
