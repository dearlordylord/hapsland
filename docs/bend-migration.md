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
Disk-loss recovery must require only a Git clone of that remote branch for retained
migration sources, tests, proofs and runners; local temporary files are diagnostic
results, never the sole copy of an implementation. Push incomplete source work as
an explicitly unaccepted checkpoint rather than leaving it only on local storage.

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
| Whole finalization machine | 66 ordered scenarios and ten actual binding vectors, 9947 requests, 194 real Canonical gates, 93 omissions, 127 current-rule reads, 75190 wrong replies | Actual native ready consumer, full JSON outcomes and chronology; universal proof remains open. |
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
   The current authored entry is one typed driver-compatible preparation capability:
   machine/perform/decode, with both generated cores and typed dispatcher/finalization
   private. Its external command port excludes RenderUnits; finalization stays inside
   the owner. Source and resident verification bindings use this factory, and Source
   decodes only after actual Canonical handoff acceptance. These changed consumers
   still require physical qualification. The public pipeline remains native TS;
   connected production whole units and deleted replacement algorithms remain zero.
   Astra reviewed the ownership/lifecycle seam. GraphLimits uses its existing owner
   and perform checks invocation/request against the supplied driver lease; live
   fencing remains exclusively Canonical. The single TransportFailure class now
   belongs to runtime-environment/runtime/effect-transport, with direct consumers;
   no transport implementation or duplicate error class is exported from analysis.
   Fixture defaults and native comparisons in resident's composition binding,
   source-analysis session API, whole proofs and public input encoding remain open.
   The owner recipe now emits Preparation and PreparationFinalization as private
   library artifacts during ordinary review-execution compilation. Exact transitive
   inputs, authored closed declarations and pinned Bend identity enter compiler
   receipts. Hybrid Turbo tasks retain the declared producer environment; staging
   uses library emission before publishing package JS. Workspace build passed
   46/46 and 23 compiler receipts passed in the matching pinned environment.
   The Source consumer passed 50 physical cases using these dist cores. Resident
   qualification and the typed whole capability entry remain open. The 08:45 UTC
   paired-build deadline was missed while fixing environment and library-mode
   build failures; this evidence does not establish parity.
   source-analysis resolver/session, review-execution preparation, and
   resident-runtime Canonical workflow. Keep private stages hidden. Relocated
   sources must enter compiler/declaration receipts; authored MJS is currently
   outside ordinary TS emission. Artifact values now have their single lower
   owner; graph state/session contracts still need narrow compiled boundaries.
   Current development-import gate reported 5 unresolved paths, 47 undeclared
   dependencies and 213 private cross-owner imports; current qualification is
   still required. Do not expose every helper or bypass that gate.
   Astra's agreed first compiled change is one typed whole-preparation factory,
   using the production-reachable dispatcher, finalization binding and result
   codecs under ordinary TS compiler/declaration receipts. Resident consumes it
   through the existing Canonical transaction; Selection/Rules/Input remain private.
   The eventual public entry stays pipeline.prepareObservation, with no parallel
   public backend. An owner-scoped verification entry must exercise the same dist
   implementation before switching production. Source-analysis exposes an opaque
   resolver/session factory, not private Python helpers. Binary64, OrderedField
   and ProductValue declarations now live only in source-artifacts value/Value;
   the mechanical codec uses that same owner. Resolver state/session policy stays
   with source-analysis. Keep exact emitted-prefix conversion at artifact boundaries
   and never reintroduce resolver forwarding declarations. Compare the compiled
   package API with actual native prepareObservation for full ordered effects,
   identities, failures, cancellation and custody. This entry enables connection;
   it does not bypass whole proofs or the supported Go/session obligations.
   Astra confirmed the concrete coherent compiled slice: convert the private
   preparation-dispatcher, preparation-finalization and preparation-result-codec
   host bindings to typed TS, with one preparation/capability entry joining the
   whole machine, closed requests/replies and terminal PreparedObservation.
   Resident's preparation-foreign consumes the compiled entry through its actual
   transaction; move test defaults/native comparisons to its verification adapter.
   Generated artifacts stay private and participate in receipts. Actual resident
   verification must import dist, not bypass emission with source MJS.
   Artifact value ownership is now relocated: one Value.bend declaration owner,
   83 direct Bend consumer imports, one typed compiled codec, no resolver
   reexports or copied declarations. Eighteen unused resolver Types imports were
   removed, including whole finalization and its stages. Codec uses the exact
   four-depth emitted owner prefix; resident composition rebases it to the exact
   five-depth prefix. Fifteen compiled codec cases, 66 whole-finalization plus ten
   runtime cases, and the actual Source 50/resident 64 consumers passed. Those
   consumers passed again after supported formatting and import removal. Ordinary
   workspace build passed 46/46; host lint selects 34 changed files. Fast gate
   passed 109 unit tests, assets, source typing and package graph before failing
   the remaining development imports. Pinned Bend formatter now reports 66 conforming and 22 unavailable files,
   with no remaining supported format changes. Value itself conforms. Unsupported expression/header diagnostics remain gates,
   not exemptions. This closes shared declaration ownership, not compiled whole
   Preparation, universal correspondence or production acceptance.
   The first compiled preparation boundary now has one contract.ts owner for
   context/source/terminal types, with the existing pipeline type API retained.
   The complete terminal codec is ordinary typed TS; its source MJS copy is
   deleted. Source provider and both retained/resident verification consumers
   import its emitted dist JS. Producer-valid wire types preserve existing raw
   decoder behavior; they are not validation of arbitrary raw product schemas.
   Package typing, recorded compiler inputs/outputs and workspace build 46/46
   passed; actual Source 50 and resident 64 scenarios passed the compiled codec.
   Ordinary lint selects all six changed host files. Fast passed 109 tests,
   assets, source typing and package graph, then failed the same 5 unresolved,
   47 undeclared and 213 private development imports. The dispatcher/finalization
   bindings, private generated artifacts, single package capability entry and
   resident imports remain the coherent next compiled unit. Astra's structural
   review found no blocking extraction/codec chronology errors. The agreed build
   path is a declared review-execution precompile recipe for the two private
   generated JS/declaration pairs, using pinned five-second emissions in staging.
   Extend the TS owner's authored stamp and compiler receipt with exact Bend
   import closure, Base, generator/ABI and toolchain/environment identity; recheck
   before publication and on cache restore. Existing agent-flow producer inventory
   stays with that owner. Never generate into stamped src or clear package dist
   twice. The ordinary compiled capability must hide those artifacts. Neither type
   extraction nor terminal-codec emission closes that unit or adopts production.

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
   The resource audit reproduced a real opaque-failure defect: falsy provider
   rejection values reached engine Resume. Delivery now distinguishes error
   property presence from its value, including first-action/sink/abort/construction
   failures and AggregateError cause presence. The actual Canonical owner/driver
   check now passes 393 assertions, including all five falsy values with and
   without cleanup Error, task/close failures with identical values, and constructor
   plus cleanup failures with identical undefined or Error values. Failed cleanup
   retains an exact retry obligation. Ten runtime vectors compare original rules
   failures with native behavior and stop before the second unit. Registry
   `runOutcome` exposes tagged task success (including undefined), not-started or
   failure, ordered identity-distinct failure receipts and the actual overriding
   rejection. Ordinary `run` preserves existing operation order and rejection.
   Its focused check covers ten task/register/close/remove cases. Driver delivery
   consumes this outcome; known completion/task rethrow edges retain one receipt,
   while new cancel/finish/close/remove occurrences remain distinct, without
   comparing thrown values. Astra reviewed this forwarding route. Action/publication
   outcomes now retain ordered nested Resume, cleanup and sink receipts, continue
   required cleanup and preserve the original primary. Actual before-install and
   nested-output fixtures each retain three causes exactly once. Finalization
   attempts have separate accumulators: delayed registry retry never appends to a
   completed drive or consumes its forwarding slot. Successive retry failures,
   including undefined, remain isolated; the original obligation survives until
   success. Source's 50 and resident's 64 physical scenarios pass this candidate.
   CancelChild now retains invocation-owned cleanup suboperations after committed
   cancellation: revoke, disposal, pending launch release, owned lease abort and
   finished marking. A failed suboperation remains pending; retry skips completed
   operations before releasing handles even when the child is already inactive.
   A dispose failure plus sink failure preserves both causes; repeated failed retry
   retains resources, and successful retry performs disposal without repeating
   revoke. Live-provider success/error vectors ignore abort, preserve session
   lifetime until settlement, reject late Resume and discharge the provider lease
   before releasing resources. These are finite actual-driver checks; the map is
   cancellation cleanup, not a general retry protocol for all owner commands.
   Source's 50 physical scenarios passed. Resident's concurrent emission exceeded
   its five-second limit; the isolated run passed 64 scenarios at the same limit.
   Whole universal Cause/custody and resource correspondence remain open.
   Astra's agreed next draft is one independent native-loop specification and two
   whole declarations: observational correspondence and scope/interruption
   preservation. The specification must not call the actual Evidence/Rules/Input
   algorithms as its oracle. Its external responder supplies producer-valid reads
   and exact mechanical-engine answers; opaque failure tokens retain original
   identity, and only synchronous omission-observer failures are swallowed.
   The interruption boundary must reuse actual CanonicalResolverOwner state,
   `provider_live`, `provider_completed`, lease/generation/request and driver actions,
   with reachable owner/resource state derived from launch. RenderUnits is an
   intermediate reply payload: after committed cancel/invalidation, a late reply
   must not issue Resume for that child. AcceptResult concerns the whole child,
   including Preparation handoff, not direct acceptance of UnitsRendered. Internal
   stutters remain observable to cancellation; immutable resume replay is distinct
   from single consumption by the owning boundary. This fixed boundary closes the
   delivery obligation without a spec-only cancel flag or a new resource child.
   Initial definitions now live at resident-runtime composition's
   `PreparationFinalizationBoundary.bend`: exact provider credential, actual
   owner transitions, lossless post-state/refusal/ordered actions/outputs and
   issued ExecuteProvider projection. Astra reviewed these definitions; source
   checking passes within five seconds. An issued projection checks consistency
   with post-state, not actual emission; the composed relation must select the
   action from the committed transition at its ordered position. The remaining
   single resource relation must connect the saved engine Await, exact reply
   payload/original error identity, ordered action application and reachable
   launch/install/provider/Canonical-event prefixes. Cleanup failures retain
   exact retry obligations while already committed owner state stays committed.
   The boundary deliberately does not import specialized finalization algorithms:
   that unnecessary combined import exceeded five seconds. This is definitions
   evidence, not a proved whole delivery contract or production adoption.
   Exact executable declarations still require Astra review before proof work.
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
   parity on the connected candidate. Latest pair at `2668b9b5` began
   2026-10-11 08:50:57/08:56:41 UTC: build qualified but failed **1.1421**;
   execution qualified and passed **0.6860**. All 34 build runs used 23/46 cached
   tasks; HEAD, sources and artifact trees stayed unchanged. Qualification records
   are in ignored `.test-runs/bend-migration/performance/2026-10-11T08-50-57.686915+00-00/`
   and `2026-10-11T08-56-41.915288+00-00/`. These cover existing production,
   not unadopted whole preparation. The 08:45 build and 08:48 execution deadlines
   were missed while fixing hybrid environment/library emission and cold preparation.
   Cold Finalization still exceeded five seconds during affinity-limited parallel
   builds. Isolated actual precompile emitted and validated both roots in 4.82s
   combined; each invocation retained its five-second deadline. Relative/absolute
   direct diagnostics were 2.56s/timeout, with 2.47s/4.28s CPU. Relative rooted inputs
   are now used; this diagnostic does not establish supported build or parity.
   Current cold/physical qualification and a newly prepared frozen pair remain gates.
   Previous build/execution ratios were 1.5609/0.9944: the first candidate build
   used 13/46 cached tasks after the Value.bend EOF correction followed warm
   preparation; its remaining 16 runs and every baseline run used 23/46. That
   unmatched warm condition is fixed by preparing after all source/format edits;
   earlier cadence breaches remain observed. Correct warm preparation did not
   establish build parity. Subsequent isolated CPU profiles both used 23/46,
   baseline 9.09s and candidate 7.61s; candidate UI preflight sampled 2.20s versus
   baseline 3.05s. This diagnostic reversal cannot identify a stable regression
   or replace the failed paired result. Separate shared-CPU timing variation from
   authored-input/validation overhead before another performance implementation.
   A successful execution cannot qualify failed build parity. Keep new paired
   measurements within 30 minutes and freeze their inputs.

Keep this obstacle list current by removing closed work and naming specific
remaining failures. Source backup, relocation and finite candidate qualification
do not count as connected production Bend or removed replacement TypeScript.
