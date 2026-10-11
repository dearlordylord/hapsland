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

The working candidate is not accepted production. Astra reviewed the ownership
route on 2026-10-10: graph resolution and parser facts belong to source-analysis;
preparation progression to review-execution; resident source/post preparation,
advice tail and resource bindings to resident-runtime; the source-free child
lifecycle to agent-flow-bend. Actual source files, including unfinished proofs
and verification runners, must be tracked directly at these owners and pushed.
Evidence directories retain results only. Captures and restoration inventories
are not source owners.

One current obstacle list, in execution order:

1. Finish relocation dependency and nominal ABI qualification; remove obsolete
   representations and historical runners after identifying the retained closure.
   Actual sources are secured on the remote working branch at `8b67a18a`;
   subsequent source changes require another pushed checkpoint. Three obsolete
   scheduler compiler-control roots and their dead runner map entries were
   removed after Astra review; canonical scheduler proof roots remain required.
   The relocated compiled scheduler runner now imports the current source owner
   and stores diagnostic results in `.test-runs/bend-migration`; its actual run
   passed 2,212 scheduler comparisons and 1,806 cancellation suffix comparisons.
2. Qualify new named `check:bend-preparation:sources`, `:protocol` and
   `:consumer` gates against current paths. Ordinary lint and root TypeScript
   coverage remain required; root typechecking includes the relocated TS reference
   sources. Source closure checks do not imply JS typing or production emission.
   Named protocol and physical consumer suites passed (four and three real
   consumers respectively); consumer summaries must report nonzero cases.
   Source checking remains blocked: retained scheduler closure was repaired and
   its two roots plus four original-law mutant rejections passed, but all remaining
   checking roots need qualification. Before the current cleanup, the source gate
   selected a 370-file Bend closure through 115 roots and 163 authored files. Runtime foreign IO
   shells are compiled to temporary JS under the same five-second deadline;
   pure roots retain `--verdict`. The repaired gate passed 38 selected files
   before rejecting the unproved `ATTACHMENT_TRANSACTION_LAWS.bend`; this draft
   remains a real proof blocker and is not excluded. Astra approved consolidation
   of its existing predicates into `AttachmentTransactionContract.bend`: one
   complete `AttachmentTransactionLiteralCuts` remains, and 18 duplicate literal,
   control and copied-Attach files are deleted. Its current-source mutation runner
   uses an isolated temporary import closure and never edits repository sources.
   Full Cuts, Contract and construction qualification currently hit the five-second
   limit; the runner correctly refuses to qualify a mutant without a passing
   control. No old literal qualification transfers. The native resolver and actual
   core always include empty `sourceDependencies`; the independent Forest spec
   and sole literal witness were corrected to preserve that field. Forest checking
   and the universal `AttachmentUnitProductProof` passed. The formatter accepted
   Forest, Law and Contract, but cannot parse the dependent declaration headers in
   Cuts/UnitProductProof; formatting qualification remains incomplete. Root graph
   verification sources now also enter the named source syntax/closure selection. Standard development imports still report
   5 unresolved paths, 47 undeclared dependencies and 223 private cross-owner
   imports from the relocation. Use declared capability/testing entrypoints;
   do not expose every internal helper or bypass the development import gate.
3. Close whole error/custody correspondence: precommit failures, constructor
   failures, round-bound retained inspection and multi-unit finalization. Constructor
   plus cleanup failure is covered by an actual Canonical AdviceTail fixture:
   both errors survive, acceptance/release waits for its registered retry, and
   retry discharges every retained resource. The relocated full Source consumer
   passed 50 cases (5,554 requests), including 25 native whole comparisons.
   Whole universal custody/Cause proofs and other finalization cases remain open.
4. Complete supported Go/session, extraction, classification and rendering scope;
   discharge the agreed whole-unit laws and proofs.
5. Connect launch, lifecycle, cancellation, acceptance and progression through
   the single production Canonical authority; remove replaced TypeScript
   algorithms and orchestration, then qualify the full composed consumer.
   Astra's shortest compiled boundary: source-analysis resolver/session API,
   review-execution preparation API and resident-runtime Canonical workflow API;
   private stages remain hidden. The current `native-preparation-children.mjs`
   reads TypeScript and extracts `prepareReadyUnits` through `new Function`.
   Replace that whole application finalization child rather than exporting the
   extracted native implementation; compiled consumers must use emitted exports.
   Retained host bindings must enter normal compiler/declaration receipts.
   Astra reviewed the whole finalization replacement on 2026-10-11: reuse
   `ProductValue`, captures and ordered units/declarations; Bend selects root
   evidence, validates/sorts dependency fingerprints, computes omissions and
   capabilities, selects ordered rules and their first matching frozen target,
   and constructs the complete input and identity bytes. Host may perform
   SHA-256 and mechanical freezing, but not Hapsland glob policy or input/identity
   selection. Preserve partial-unit `complete:true` rule selection, restricted
   capabilities, UTF-16/JSON canonical semantics, identity exclusion of locations
   and fingerprints, and best-effort omission diagnostics. The acceptance
   comparison must exercise native `prepareObservation` against the compiled
   preparation API, including ordered inputs, identities, omissions and failures;
   finalization correspondence joins the whole Preparation trace/custody law.
   The internal `CanonicalJson.bend` stage now traverses complete ProductValue
   objects/arrays and sorts keys by UTF-16, with primitive-only JSON engine
   requests retaining binary64 bits. Its actual compiled consumer matches native
   `canonicalValue` for 96 cases and 596 primitive requests, including nonfinite
   numbers, negative zero, supplementary/lone-surrogate keys and nested values.
   This stage has no whole correspondence proof or production connection yet;
   input validity, identity field projection and reply protocol fencing remain
   obligations of the whole finalization machine.
6. Pass required local gates and paired build/execution parity on that connected
   candidate. Previous measurements qualify only their original source paths and
   inputs; source moves do not inherit their qualification. Current relocated
   production cadence at `78f90e82`: build qualified but failed parity
   (`1.0615929024291164`); execution qualified and passed parity
   (`0.7115734281937276`). Inputs, HEAD and artifact trees remained unchanged;
   all build samples used 23/46 cached tasks and all execution outputs matched.
   Current build/execution began at 04:29:25/04:34:39 UTC on 2026-10-11,
   both within 30 minutes of their preceding starts. The earlier build at
   04:07:53 exceeded the interval from 03:36:19; that breach remains recorded. These measurements
   cover the existing production analyzer, not adoption of the preparation candidate.

Relocation and source backup do not increase the amount of connected production
Bend or deleted production TypeScript. Keep this list current by removing closed
obstacles and recording specific remaining failures here.
