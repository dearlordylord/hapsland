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

1. Complete the compiled source-analysis resolver/session and public-input
   boundaries, then the typed resident binding. Preparation already has one
   ordinary compiled package entry with private machine/dispatcher/finalization
   cores and terminal codec. Its external commands exclude RenderUnits; the
   supplied lease matches invocation/request and source decodes only after actual
   Canonical acceptance. GraphLimits, transport failure, product values and
   preparation contracts retain their unique lower owners.
   Source-analysis frontend facts, TOML encoding and Python syntax projection now
   compile as ordinary TypeScript with source-local adapters. Old MJS copies are
   deleted. The pinned traversal constructor prefix is traversal/core.*, confirmed
   by absolute/relative emission; corrected codec and mechanical composition
   rebase restore native local Child expansion. The unfiltered machine check now
   reaches go-root-type and fails because Bend returns no Go unit. Go/session
   behavior remains mandatory; that fixture is not filtered out.
   The resolver factory requires the Canonical drive, invocation allocator and
   construction-failure callback; standalone drivers/counters belong only to its
   verification owner. Construction now attempts close and cancel independently,
   preserves original/falsy and distinct cleanup occurrences, and keeps exact
   session or invocation obligations in the existing registry. Composed cleanup
   remembers completed operations. Retry finishes actual cancellation actions and
   pending outputs without another Canonical cancel or acceptance; delivery retry
   does not assert exactly-once behavior for arbitrary sinks. Astra reviewed this
   boundary without a new blocking finding.
   Current qualification: workspace build 46/46, 23 receipts, six construction
   tests through the protocol suite (6/6 files, including Canonical 393 assertions),
   actual resident 13 and whole source 50 cases. Nonempty lint selected five changed
   authored files. check:fast passed 109 tests and source TypeScript/package graph,
   then failed five unresolved, 47 undeclared and 215 private cross-owner imports.
   These finite checks qualify this host boundary, not whole production adoption.
   Resolver consumer/session and their closed service contracts now compile as
   ordinary TypeScript; superseded MJS files are removed and callers use the new
   paths. Current focused qualification: source-analysis typecheck, nonempty lint
   of three TS files, 158 real service requests and workspace build 46/46
   (4 cached, 42.604 seconds), 23 receipts with the producer environment and
   protocol suite 6/6. check:fast passed 109 tests/source typecheck/package graph
   but failed development-import checks; explicit nonempty lint covers the new TS
   files. This does not qualify whole production adoption.
   Owning drive now projects ForeignProviderFailure/RuntimeFailure before
   finish/registry.close clears ExceptionToken resources. Both terminal edges
   retain original falsy values/error identity through existing cleanup receipts.
   Astra found no blocking correction in this diff. Actual emitted Canonical
   driver check passed 832 assertions including actual service token storage;
   affected whole source/resident/owned-root
   consumers passed 50/64/13 cases. Controlled terminal-token cases and actual session storage are both covered;
   these finite cases do not prove universal correspondence. Generic
   protocol-failure policy and missing Go frontend remain adoption blockers.
   Resolver factories now have one declared source-analysis package entry, used
   by resident composition. Mechanical pureReply remains private in frontend-codec;
   the session constructor is not exported. Astra reviewed this interface and
   dependency direction without blocking findings. Qualification: ordinary build
   46/46 (48.581 seconds), source-analysis typecheck, nonempty lint and actual
   Source/resident/owned-root consumers 50/64/13 through the package export.
   check:fast passed 109 tests/typecheck/package graph, then failed development
   imports. The entry is a candidate binding, not whole native replacement.
   Remaining work here: fixture/default/native comparisons outside resident's
   production binding, ordinary typed binding and
   public native PreparationInput encoding. Preserve full ordered effects, original
   errors, cancellation and custody. The public entry remains prepareObservation;
   connected whole production preparation and removed native TS algorithms remain
   zero until that entry is replaced and qualified.

   The agreed complete Go path is preparation/session through package-qualified
   facts, including goGraphFacts cross-file resolution and discoveryWork. Reuse
   existing path/clock/access/capture/cache/membership commands; add raw directory
   observation with close/overflow, single-file parser facts and mechanical hash
   observations. Bend owns inventory filtering/sorting, module/package discovery,
   build membership, bindings/constant demands, fingerprint payload/order and
   remaining budgets. This is faster to whole hookup than a partial Go frontend
   because those decisions currently make up prepareGoGraph's native session.
   Preserve selection before cache lookup, refusal cache, exhausted exists=true,
   reserved root work, captured inactive-file costs, workspace checks above module,
   unknown build facts, chronological identities and sorted dependencies. Do not
   add terminal revalidation absent from native Go. The first complete consumer
   compares actual prepareGoGraph then native resolver across siblings/build tags,
   nested modules/workspaces/internal imports/constants/budgets/cancellation.
   Astra's implementation path is one full `go-module/Package.bend` for
   native goGraphFacts, followed by `PreparationMachine.bend` for the complete
   prepareGoGraph session and a Go artifact through the existing Canonical
   composition. Package inference retains positions (file, group, member),
   insertion order, the final unchanged fixed-point pass, exact work charges,
   and file-scoped qualified provenance. Its whole consumer compares actual
   goGraphFacts ordered declarations, constantTypes, refusal and discoveryWork.
   The agreed mechanical Unicode boundary observes letter/number/uppercaseLetter
   per JS code point using actual ECMAScript Unicode property expressions;
   Bend decides qualified grammar, underscore, dots and uppercase eligibility.
   Lone surrogates retain their bytes and observe three false flags. This avoids
   a second Unicode database and preserves the current engine's behavior.
   Qualified inference uses a distinct {name, source_path} constructor, with
   both fields compared and native insertion order preserved; decoded output
   remains the same. No production callback may call native goGraphFacts,
   goFileMembership or prepareGoGraph. No helper-law acceptance series is planned.
   Whole correspondence and exact Canonical invocation/request/generation/lease
   with directory/capture/session cleanup are the two agreed proof obligations.

   Raw ReadDirectoryEntries is now implemented in the ordinary service boundary:
   host returns raw iterator names, first limit+1 entries and actual EOF; early
   return awaits iterator cleanup. Open/read/close failure discards partial data,
   while an aborted error stays in the existing opaque provider failure path.
   Both production Protocol.matching and independent envelope specification cover
   observed/unavailable outcomes. Emitted service tests passed 169 requests,
   including 11 physical/injected directory cases and seven actual protocol
   owner/correlation/matching cases. Source-analysis typecheck/nonempty lint and
   the envelope compile passed. After the production Protocol correction,
   workspace build passed 46/46 (15 cached, 18.242 seconds), all 23 receipts
   validated, and actual consumers passed 50/64/13 cases. check:fast again passed 109 tests/typecheck
   and package graph, then failed development imports. This command only closes
   the raw inventory IO prerequisite; no Go workflow or native TS deletion is
   claimed.
   InspectGoFile now carries the explicitly retained single-file Hapsland
   extraction boundary into a closed GoFileSyntax: ordered raw type/constant
   declarations, locations, imports, aliases, members, bindings and expression
   rows including unnamed operators. Arrays are not collapsed into maps; member
   position stays distinct from shared inherited expression identity. Defined-type
   and constant-group artifacts retain their native kinds in the shared artifact
   contract and renderer projections. Seven extraction cases passed through the
   emitted service/protocol including locations and nested numeric computation.
   Current workspace build passed 46/46; whole consumers and check:fast on this
   candidate remain pending. No host goGraphFacts
   callback, package inference or discoveryWork computation was introduced.


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
   parity on the connected candidate. Latest frozen pair at `e02ce809` began
   2026-10-11 11:24:07/11:27:52 UTC, before the 11:29:59/11:33:07
   cadence deadlines: build qualified but failed **1.0250620627**; execution
   qualified and passed **0.6248663067**. All 34 build runs used 23/46 cached
   tasks; HEAD, source hashes and artifact trees stayed unchanged. Records are
   in ignored `.test-runs/bend-migration/performance/2026-10-11T11-24-07.170166+00-00/`
   and `2026-10-11T11-27-52.011965+00-00/`. Current workspace preparation passed
   46/46, then the unchanged warm repeat used 23/46 cached tasks. Next start
   deadlines are 11:54:07/11:57:52 UTC. Strict build parity remains open; these
   measurements concern existing production, not unadopted whole preparation.
   The previous frozen pair at `15cfabed` began
   2026-10-11 10:59:59/11:03:07 UTC: build qualified but failed **1.0486182727**;
   execution qualified and passed **0.7409846759**. All 34 build runs used 23/46
   cached tasks; HEAD, source hashes and artifact trees stayed unchanged.
   Qualification records are in ignored
   `.test-runs/bend-migration/performance/2026-10-11T10-59-59.651982+00-00/`
   and `2026-10-11T11-03-07.080868+00-00/`. This late pair does not erase
   the previous cadence breaches. Next start deadlines are 11:29:59/11:33:07
   UTC. Strict build parity remains an acceptance blocker. These measure existing
   production, not the unadopted whole preparation.
   The previous frozen pair at `28f55dbf` began
   2026-10-11 10:19:44/10:23:09 UTC: build qualified but failed **1.1047183573**;
   execution qualified and passed **0.6649378095**. All 34 build runs used 23/46
   cached tasks; HEAD, sources and artifact trees stayed unchanged. Qualification
   records are in ignored
   `.test-runs/bend-migration/performance/2026-10-11T10-19-44.676326+00-00/`
   and `2026-10-11T10-23-09.055002+00-00/`. These measure existing production,
   not unadopted whole preparation. The build/execution starts missed the
   10:19:34/10:22:53 cadence deadlines during compilation qualification and
   sequential frozen measurement. This breach remains observed; build failure
   still blocks strict overall parity. The next 10:49:44 build start deadline
   was missed while qualifying Go extraction and correcting ABI kinds/locations;
   the 10:53:09 execution start deadline was also missed during Go ABI
   qualification. The next frozen pair is still required.
   The previous pair at 1a61bacc measured 1.0181202463/0.7812988998. Its
   09:20:57 build and 09:26:41 execution
   cadence deadlines were missed during physical qualification and diagnostic
   output cleanup; the late pair does not satisfy that cadence requirement.
   Ordinary unpinned workspace build passed all 46 tasks with both preparation
   cores under their unchanged five-second emission deadlines. Source (50),
   resident (64), finalization (66 plus 10 runtime cases), transport, and 23
   compiler-receipt checks passed through the ordinary compiled capability.
   These finite checks do not establish whole production adoption or build parity.
   Earlier affinity-limited cold builds exceeded five seconds; isolated actual
   precompile emitted both roots in 4.82s combined. Relative/absolute direct
   diagnostics were 2.56s/timeout. Relative rooted inputs are now used; no deadline
   was raised and no CPU affinity was added to the production emitter.
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

Current Go ABI boundary qualification: the ordinary numeric canary and actual
service-session consumer pass after a payload-preserving projection from
`Types.*` to the probe's loading-relative `../Types.*` constructor namespace
under Bend 2.0.36. Seven Go fixtures exercise nested numeric computation inside
emitted Bend; the service suite completed 176 requests. The canary checking root
and the existing `AttachmentArtifactProductTransport.bend` proof root both
reported `ALL PROOFS CHECK` within the unchanged five-second limit. This is
boundary and existing artifact-kind proof evidence, not complete Go package
inference, whole preparation correspondence, production adoption or parity.

Current ordinary candidate qualification at `2be20276`: the preparation
consumer suite passed 50 source, 64 resident and 13 owned-root cases; all 23
compiler receipts validated. check:fast passed 109 unit tests, repository assets,
TypeScript and package graph before failing development imports. Three relocated
credential cold runners then switched five stale relative imports to existing
workspace exports; all six available/locked runs passed, with nonempty lint.
The focused import gate now reports zero unresolved paths, 1 undeclared
dependencies and 137 cross-owner private-file violations. Those remain an
acceptance blocker; fix ownership and declared interfaces before asserting a
green ordinary gate.

The service-session check now lives beside its graph-resolution owner at
`packages/source-analysis/src/direct-event/graph-resolution/checks/service-session-check.mjs`.
Private implementation imports are owner-local; compiled neighboring frontend
calls use existing workspace exports. The old verification-tree copy is deleted.
The new path passed all 176 actual service requests and nonempty lint; the
ordinary source-closure gate includes it by owner-tree discovery. This removes
seven private-file import violations and one undeclared dependency without
adding public test helpers or weakening the development-import gate.

Current public-interface repair: 70 emitted-file imports in 31 verification
files now use already declared workspace exports. No source-to-dist import was
changed, no export or dependency direction was added, and actual module identity
was equal for all 11 distinct runtime modules. Nonempty lint passed all 31 files;
Astra's structural review found no blocking issue. The actual preparation
consumer suite passed 50/64/13 cases. check:fast passed unit/source typing and
package graph, then failed the remaining 46 undeclared dependencies and 137
private-file imports; zero unresolved paths remain. Fixed `/tmp` imports in
attachment falsification runners are part of that remaining source-execution
obstacle: reconnect their generated modules to tracked owner Bend sources;
do not treat the preexisting temporary outputs as retained source or exempt the
runners from the ordinary gate. Whole production adoption remains open.

Attachment falsification runners are now owner-local ordinary sources under
`graph-resolution/attachment/checks`; seven old verification-tree copies were
deleted. Their loader emits current tracked Bend into fresh temporary output
with the unchanged five-second deadline and cleans on normal process exit;
SIGKILL cleanup is not guaranteed. Diagnostics go to ignored root .test-runs.
All seven actual runners passed after updating the obsolete module namespaces,
including transaction, partial transaction, publication map and completion.
The checks retain their assertions and explicitly remain finite synthetic
relations; raw source-to-child-plan reachability, universal attachment proof and
production adoption remain open. Their sourceSha256 labels one projection file,
not a complete qualification receipt. Astra approved the structural change.
The focused import gate now reports zero unresolved paths, eight undeclared
dependencies and 137 cross-owner violations; the 38 removed violations were
fixed temporary-module dependencies, not gate exclusions.

Verification dependency repair: declared the already catalog-pinned smol-toml
in the verification workspace. Bun regenerated the lock without changing
package versions; it also reconciled obsolete CLI dependency entries against
the current CLI manifest. The real Cargo consumer initially exposed a damaged
post-relocation path binding (`../` was compared with a source-tree path).
Restoring the native `../` boundary, without changing Bend policy or assertions,
passed all 21,003 actual native comparisons. Its diagnostic JSON now goes to
ignored root .test-runs; the final consumer passed again on that source.
check:fast passed 109 unit tests, source typing and package graph before failing
three undeclared dependencies and 137 private-file imports. The three remaining
undeclared cases are two tooling imports of the verification credential oracle
and one update-notice dependency on an external baseline checkout. Keep the
oracle independent while repairing ownership; substituting the current Bend
wrapper would be circular qualification. Whole Go and production adoption
remain open; current build/execution cadence deadlines are 11:54:07 and
11:57:52 UTC from the latest frozen pair.

Credential measurement runners now live with their independent verification
oracle under `src/credentials/bend-parity`; old tooling-owner copies are deleted.
Both actual runners passed from the new paths; nonempty lint checked both.
Their diagnostic JSON goes to ignored .test-runs. The isolated credential
planning median ratio was 0.5065184505; this is not the whole production parity
measurement. check:fast passed its unit/type/package stages and failed on one
undeclared external update-notice oracle and 137 cross-owner private imports.
The two tooling-to-verification dependency violations are removed by placing
execution with its owner, without publishing the frozen oracle as a product API.

Current source-organization blocker at `c4fc911f` plus the owner-local Python
checks: zero unresolved imports, zero undeclared dependencies and 109
cross-owner private-file imports. The update-notice checker now uses tracked
expected data for exactly the original 144 inputs, independently obtained from
receipt-verified e31 output; all 180 assertions passed. Astra reviewed the
finite oracle replacement. Fourteen Python checks now live in the
source-analysis `python-module/checks` capability; the old copies are deleted.
All fourteen actual consumers passed, including persistent GraphSession with
physical mutation and ordered-effect checks. Nonempty lint selected all 14.
check:fast passed 109 unit tests, assets, TypeScript and package graph, then
failed the remaining 109 private-file imports. No full gate was attempted on
that failed prerequisite; test:status contains only an older unrelated run.
These repairs preserve candidate checks and close 28 owner-boundary violations;
whole Go Package, PreparationMachine, Canonical adoption and native TypeScript
removal remain open. No production preparation adoption is claimed.
