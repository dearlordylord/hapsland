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
   parity on the connected candidate. Latest frozen pair at `6bfa702f` began
   2026-10-11 11:50:58/11:54:52 UTC, before the 11:54:07/11:57:52
   cadence deadlines: build qualified but failed **1.1465205330**; execution
   qualified and passed **0.7373228700**. All 34 build runs used 23/46 cached
   tasks; HEAD, source hashes and artifact trees stayed unchanged. Records are
   in ignored `.test-runs/bend-migration/performance/2026-10-11T11-50-58.394436+00-00/`
   and `2026-10-11T11-54-52.572889+00-00/`. Ordinary workspace preparation
   passed 46/46, the unchanged warm repeat used 23/46 cache hits, and all 23
   compiler receipts validated under the declared producer environment. A manual
   receipt probe without that environment refused toolchain context; it was not
   candidate qualification. Next start deadlines are 12:20:58/12:24:52 UTC.
   Strict build parity remains open. These measurements concern existing
   production, not unadopted whole preparation. Diagnose build timing before
   changing performance-sensitive code; an execution pass cannot qualify it.
   Earlier observed cadence breaches remain failures: the 09:20:57/09:26:41,
   10:19:34/10:22:53 and 10:49:44/10:53:09 starts were missed during
   qualification/measurement. Later timely pairs do not erase those breaches.
   The previous correctly frozen pair at `e02ce809` measured build/execution
   1.0250620627/0.6248663067; successful execution also did not establish build
   parity. No production emitter deadline was raised or affinity added.

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

Current source organization and gate blocker: zero unresolved imports, zero
undeclared dependencies and 97 cross-owner private-file imports. Resolve their
owner/interface boundaries without publishing test helpers or excluding source
from the ordinary gates. The latest compiled preparation qualification passed
50 source, 64 resident and 13 owned-root cases with all 23 compiler receipts;
these do not establish whole production adoption.

Retained verification runners now execute ordinary tracked owner sources:
service-session beside graph-resolution; attachment falsification beside
attachment with fresh temporary emission; fourteen Python checks beside
python-module; and Cargo, Rust, signed-local, result and stable-capture
cancellation beside graph-resolution. Superseded copies are deleted. All these
real relocated consumers passed. Cargo compared 21,003 cases; the physical
Linux cancellation consumer used freshly emitted current Runtime with its SHA,
checked native/Bend effect order, interruption, exact failure identity and
resource discharge. Owner-local clock-failure and foreign-effect embedding
checks also passed. The clock assertion now follows native preparation:
start/preparation defects precede root cache insertion, while a root-stage
clock defect retains the exact input capture. Error/cause identity, ordered
clock prefixes, zero registry custody and descriptor cleanup remain checked.
check:fast passed 109 unit tests, assets, TypeScript and package graph, then
failed the remaining 97 private-file imports; no full gate was attempted.
These finite checks retain their stated scope and are not
universal proof or Canonical production adoption. Diagnostics go to ignored
root .test-runs; normal temporary cleanup does not guarantee SIGKILL cleanup.
Nonempty lint checked the changed files. The hardcoded CPU10 affinity in some
existing verification runners remains a Linux qualification limitation.

Verification owns its catalog-pinned smol-toml and independent credential oracle;
credential measured runners live beside that oracle. Existing workspace exports
replace direct dist imports without new interfaces. Update-notice expected data
is tracked for exactly the original 144 inputs, independently obtained from
receipt-verified e31 output; all 180 assertions passed and Astra reviewed the
finite oracle replacement. No external baseline checkout is needed at runtime.

The full Go package candidate now lives in go-module/Package.bend with
Input.bend and its owner-local go-package-check.mjs. It implements native
ordered inference, positional member identity, qualified provenance, sequential
fixed-point, declaration/location assembly and exact discoveryWork/refusal.
Host Unicode observations are raw per-character L/N/Lu facts; Bend owns the
qualified spelling grammar. Missing required observations refuse the candidate.
The actual inspectGoFile/goGraphFacts consumer passed 163 comparisons across
28 packages, including below/at/above budgets, alias cycles, inherited/forward
constants, shadowed builtins, qualified file provenance, Unicode and `_`.
Nonempty ordinary lint and both Bend formats passed after formatting. These
finite cases and definition checking do not prove native correspondence for
all producer inputs. Whole-unit reviewed laws/proofs remain open.

The agreed next production path remains full Go PreparationMachine (module,
package discovery, membership, budgets, session, fingerprint and foreign
constant demands), GoArtifact through current Canonical commands/events, full
physical consumers and original guarantee/parity qualification. Delete native
goGraphFacts/prepareGoGraph and membership policy only when that complete
replacement is connected and qualified. Package code is currently a candidate;
production preparation adoption and native TypeScript removal remain zero.

The disk-loss checkpoint includes the ordinary tracked Go RawText and full
BuildContext candidate, its consumer, and the mechanical captured-text, Unicode
observation and JSON hash service operations. This checkpoint is not acceptance.
The service boundary now passes 193 requests with exact Runtime JSON number
and direct emitted Protocol bigint projections for declared RawText Nat fields.
The independent envelope specification covers these operations and existing
Python/membership operations; its literal check passes. The full Go package
consumer still passes 163 comparisons after the shared ABI changes.
Keep all implementation checkpoints pushed to the working remote branch; local
files or commits alone do not satisfy source preservation.


The full BuildContext consumer passes 4933 native comparisons (61 configuration,
2079 expression, 329 filename, 2464 file/header). Unicode and original byte,
token and depth boundaries are included. UTF8 encoding canaries use TextEncoder;
Bun 1.3.14 Buffer.byteLength reports two bytes for a lone surrogate whereas
TextEncoder and Node report three. Surrogate expressions remain unknown under
the actual native semantic oracle. After ordinary formatting the BuildContext
and service consumers passed again. No universal correspondence is claimed.
The next tracked PreparationModel, ModulePolicy and PreparationMachine files
are WIP: model/phase ABI and static module grammar are saved, transitions and
whole physical consumer remain open. They are not an adopted prepareGoGraph.
Current check:fast passed 109 tests, source TypeScript and package graph, then
failed the same 97 private cross-owner imports; full gate remains blocked.


Checkpoint after c9f3b324: frozen production pairs qualified with unchanged
HEAD/source/artifact trees. Build started 2026-10-11T12:17:54.923266Z and failed
parity at 1.133925825822867; execution started 12:21:51.456306Z and passed at
0.6290521755278518. Build parity remains a blocker; these pairs do not measure
unadopted Go preparation. Next cadence deadlines are 12:47:54 and 12:51:51 UTC.

The mechanical CreateRangeError operation preserves native configuration
messages, RangeError type and opaque error identity through existing correlated
ProviderRejected custody. The actual service consumer passed 195 requests.
BoundNamed{binding} extends the existing traversal reference kind: display name,
import lookup, target accounting and targetId remain separate. Root codec and
Go remap use this existing owner; no second traversal is introduced. The
independent recursive and signed specifications cover the same lookup. After
formatting, actual native buildLocal comparisons passed 4368 cases; 2184 of
those additionally compare production traversal's complete plan, pending,
visited and budget exactly with the independent specification. The original
universal CONTINUATION_DISPATCH_PROOF currently fails at the missing BoundNamed
branch of inventory transport. Extending the original whole laws/proofs is
required before adoption; no finite comparison replaces it. The formatter
still cannot process traversal/SPEC.bend (unsupported block expression in list);
this remains a tooling failure, not an exemption.
Current check:fast again passed 109 tests, source typing and package graph,
then failed 97 private cross-owner imports. Full gate remains blocked.
The saved whole PreparationMachine now includes source/cache/inventory/package
and metadata/discovery transitions as WIP; resume/advance, complete remap,
whole native consumer and universal guarantees remain unfinished.
