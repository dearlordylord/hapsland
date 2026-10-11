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

1. Finish full Go preparation/resolver qualification through the actual Canonical
   artifact owner. The full PreparationMachine and GoArtifact are implemented;
   the typed resolver carries one shared raw Configuration declaration, and the
   composition installs returned limits/dependencies/fingerprint before root
   admission. Fingerprint is first in every root, previous/candidate attachment
   and final unit size calculation. The actual owned driver passes 46 cases and
   2049 requests across Python, default/configured Go, two roots, exact treeBytes
   boundaries, cancellation, retirement, late replies and injected faults, with
   zero retained invocation resources/descriptors. The complete physical Go
   corpus now passes through this driver: 58 cases and 2075 owned requests,
   comparing full JSON/order, observation chronology, cache, publication deadline,
   depth-zero RangeError and original capture exceptions. The separate native
   preparation comparison passes 55 fixtures, 1659 requests and 3474 transitions. Go configuration and final configuration identity are now lazy foreign
   observations selected by Bend; eager general-input projection is removed.
   Function/non-Go throwing-getter vectors pass the affected 46-case consumer.
   The full owned corpus detected a missing final publication clock, now routed
   through existing final-await; the deadline-at-publication vector passes.
   It also detected depth-zero profile validation missing at graph initialization.
   The candidate now requests the exact native RangeError at that phase using
   canonical GraphLimits policy; source check and ordinary format pass.
   The 58-case full owned consumer passes on the current source candidate;
   this finite comparison does not establish universal guarantees or adoption. Negative/fractional raw-profile ABI is not qualified by the Nat policy.
2. Extend the original complete materialization/attachment guarantees to present
   fingerprint, plus whole preparation/native correspondence and Cause/custody.
   Neutral None literals do not qualify changed Some behavior. The original
   traversal PROOF, CONTINUATION_PROOF and CONTINUATION_FUEL_PROOF pass after
   extending BoundNamed cases; qualified lookup, display symbol, explicit target
   priority and inventory/rank/completion guarantees remain distinct. No new
   representation or auxiliary-law chain is accepted merely for easy proofs.
   Astra's actual-source review found the metadata-blind attachment relation
   false for paired Some fingerprint inputs: reference measurement omits a real
   field. Reference X.Frame, reference entry metadata and the existing phase
   capsule now carry the same optional fingerprint, preserving it through all
   frame transitions and request allocation. Independent F.prepared_unit is
   used for reference root/attachment/completion measurement, with first-field
   JSON order and unchanged Invalid/Exhausted. Seven actual/reference projection
   and forest roots check within five seconds; three reference cores checked
   before formatting. No terminal frame evidence is invented. Changed finite
   consumers remain partially open: real expansion-specification consumer passes
   61 cases and 28 attachment comparisons, including actual Go Some full JSON
   and independent prepared materialization. Completion's prior neutral corpus
   passes 13824 boundary cases and 288 completion cases with both None and
   Some fingerprints (including empty/Unicode text). The exact driver consumer
   remains red: GoImportLocalModule loses the declaration artifact's source path
   on local recursion. Native buildLocal uses local.artifact.path before the
   current frame path; local Declaration currently erases it in both runtime
   Traversal and independent SPEC. Empty targetsByPath membership differs and
   outgoingEdges charging can differ across files. Preserve this source path on
   both sides and rerun the original traversal guarantees and whole consumers;
   do not filter empty entries. The runtime now carries Declaration.source_path
   and Frame.path, charges the parent path before successful child entry, uses
   Some empty paths without fallback and restores parent siblings through the
   saved frame. Independent recursive SPEC changes only successful child
   requests; root path remains supplied. Machine closure and recursive SPEC
   source checks pass. The original PROOF, CONTINUATION_PROOF and CONTINUATION_FUEL_PROOF
   roots now pass under the unchanged five-second limit, including arbitrary
   declaration/frame paths. The local differential now uses the actual compiled
   native buildLocal instead of a frozen source copy: 657 cases pass, including
   five explicit source-path/budget/sibling/cycle cases. Fixtures use the full
   accepted version-one graph profile and its depth ceiling; the frozen copy
   previously accepted an invalid depth of 32. Native full tree, visited, pending
   and budget observations are compared without filtering empty path entries.
   The unchanged full expansion driver now passes the prior Go source-path
   comparison, then fails at Python imported Child: native expands other.py,
   while the candidate/reference returns omitted unavailable. Repair that Python
   import-session behavior without dropping the case or weakening observations.
   Existing DriverSpecification candidates explicitly return no Python paths,
   and its configuration omits the prepared Python.Session. The actual Canonical
   composition already uses ResolveImportMachine. Agreed path with Astra: carry
   that prepared session and census/effective-cache custody in the independent
   driver, with a typed child continuation over the existing Request/Reply and
   Resolution protocol. Preserve packages/reexports, root policy, budgets,
   revalidation, dependencies and combined usage. Seed the session from
   preparation; do not substitute a host-resolved target callback or a .py-only
   candidate shortcut. This representation closes whole-consumer correspondence
   directly; original transport obligations and guarantees remain required.
   The driver may share the existing specialized Python child while defining
   orchestration/accounting independently; this does not establish a second
   independent Python-policy implementation. No named original law requires
   duplicating that policy as a new acceptance prerequisite. Both the direct
   child import canary (2.696 seconds) and the raw-root PythonModule emission
   pass within the unchanged five-second limit. Runner raw capture now drives
   prepare/inspect and compares root facts exactly. The full driver now passes
   its unchanged included corpus: 43 cases, 37 exact native comparisons,
   including Python imports and no retained child continuation at completion.
   Source-bearing Python command/result/view and Resolution now have one
   declaration owner at source-analysis/python-module/ArtifactProtocol.bend;
   resident lifecycle StateHandle/ProviderLease stay with the resident owner.
   Driver mechanically relays a separately emitted PythonArtifact using the
   exact saved request identity/payload; all continuation/accounting decisions
   stay in Bend. Architectural review by Astra confirms dependency direction
   and lifecycle separation. This split follows two measured five-second full
   wrapper timeouts; direct machine import fitted alone, but not the specialized
   consumer/proof closure. The attempted fixed String table lookup did not fix
   it and was reverted. With the split, Driver definitions pass in 2.016 seconds,
   attachment boundary in 1.915, and contract definitions in 3.257. These are
   definition checks, not the still-open universal attachment proof. The actual
   Canonical-owned consumer initially returned pass for 46 cases/2049 requests
   after the protocol move while two source format edits overlapped that run;
   that result remains diagnostic only. The unchanged rerun now passes the same
   46 cases/2049 requests on stable inputs: complete authored-source SHA-256 is
   identical before/after. It exercises actual Canonical admission/Prepare,
   physical services, two roots, cancellation, retirement, late-result rejection,
   provisional refusal and throw cleanup. Whole resident progression and
   universal guarantees remain open. Original projected_unit_total for arbitrary
   optional fingerprint and node_replacement_exact are now proved under hard
   five seconds with unchanged premises. Next agreed proof work is the existing
   parent_attachment_exact and original attachment transaction obligation.
   This finite traversal pass does not qualify the full expansion driver, all
   fixture ABI consumers or the remaining universal guarantees. No new law or weakened
   premise is claimed. Full materialization/transaction guarantees
   remain open. The
   reference entry's Go preparation bridge is now drafted, but the full consumer
   is not connected or qualified. EntrySpecification now recognizes .go, starts
   the existing Go child, validates request owner/id/next continuity, installs
   returned limits/dependencies/fingerprint before root construction, projects
   cancellation and performs the publication clock. Definitions check after
   formatting in 4.775 seconds under the unchanged five-second limit; this is
   not a universal whole-flow proof. Initial full check timed out after concrete
   parse/quantity errors were fixed; baseline Entry at 30982d50 with identical
   dependencies passed in 4.278 seconds. Replacing large Bool.pick Progress
   terms with explicit Bool transitions brought the new source within budget.
   The existing full entry runner still needs mechanical Go begin/advance/resume
   and exact native whole-product/effect/cache/clock correspondence; source
   checking alone does not qualify this bridge. Astra agreed the full entry
   path: independent entry owns lazy type-only configuration ordering, root
   admission, returned limits/dependencies/fingerprint installation and final
   publication clock; existing specialized Go policy is shared through commands
   and results. Its exact three command/result/view declarations now have one
   source-analysis/go-module/ArtifactProtocol owner, consumed by the resident
   artifacts; resident handles/leases remain unchanged. Structural review found
   no reversed dependency or host policy. Actual affected consumers pass after
   formatting and codec changes: Go artifact 55 physical fixtures/1713 requests/
   3528 transitions, whole Canonical-owned Go 58 cases/2075 requests, and general
   Canonical-owned resolver 46 cases/2049 requests. These close protocol move
   qualification, not the missing Go Entry or public adoption. Original optional
   fingerprint materialization theorem is extended without changed premises:
   existing unit-product witness equations check in 1.283 seconds. Metadata now
   lifts the final existential witness once; intermediate completion proofs keep
   their raw witness. The unused prepared_completed experiment was removed.
   This earlier timeout is closed: full original materialization checks in
   4.299 seconds, and full original node replacement checks in 2.154 seconds,
   under the unchanged hard-five limit. Parent append and the original complete
   transaction remain open. Exact formatter rejects this proof owner
   with Incomplete declaration header; no formatting pass or exclusion is
   claimed. Neither deadline nor original premise was changed. Missing Go cases in actual context/reference
   branch projections are added and formatted. Both projection roots check
   within five seconds after the explicit reference Go candidates row returns
   [] as native does; no filesystem scan is introduced. No new proof or
   universal correspondence is claimed.
   Obtain review of the complete amended declarations before proof work.
3. Resolve the remaining ordinary source and consumer boundaries: zero unresolved
   imports, zero undeclared dependencies, 97 cross-owner private-file imports.
   Do not expose test helpers or exclude candidate sources. check:fast currently
   passes 109 tests, source TypeScript and package graph, then fails these imports;
   a full gate is blocked. Ordinary lint selected all five changed TS/MJS files. The fast gate and
   affected service/owned consumers pass after the lazy-observation changes:
   service boundary 195 requests, owned resolver 46 cases/2049 requests, full
   owned Go 58 cases/2075 requests. The current fast rerun passes 109 tests and
   source typing, then fails the same 97 private imports before lint.
   The formatter still cannot process AttachmentTransactionLiteralCuts, and
   previously unsupported traversal/UnitEvidence/Glob roots remain open tooling
   failures. Actual supported changed sources are formatted. Relocated runners
   execute tracked owner sources; snapshots/inventory restoration are removed.
4. Complete the compiled preparation → Source → Post resident connection and
   preserve full supported language/session, extraction and rendering scope.
   Actual native finalization, source and resident consumers currently qualify
   66, 50 and 64 finite cases respectively; these do not establish complete
   correspondence or public adoption. Retain parent/child revision and identity
   fencing, original exception identity, ordered cleanup obligations and accepted
   result publication throughout the actual resident lifecycle.
5. Connect the qualified whole section to public production Canonical progression
   and delete replaced TS algorithms/orchestration, including native Go package,
   preparation and membership policy when their complete replacement is accepted.
   Public pipeline still uses TS preparation. Whole preparation production Bend
   connected: **0**; replaced production TypeScript removed: **0**. A connected
   candidate resolver, source relocation or backup does not change those counts.
6. Pass selected local acceptance checks and strict paired build/execution parity
   on the connected candidate. Latest matched warm build at 12a2a197 started
   2026-10-11T14:55:48.475707Z: 17 pairs, all 23/46 cached, qualified with
   unchanged sources/artifacts, and build parity failed at
   **1.1400346823725842** (baseline mean 8.3214 seconds, candidate 9.4867).
   Execution at the same candidate started 2026-10-11T14:49:47.209133Z,
   qualified and passed at **0.7600354303045934**. Previous acf04659 matched
   warm build at 14:21:02 failed at 1.1241580601102825; execution at 14:20:06
   passed at 0.7711837402035618. Earlier build at 14:14:44 had a cold candidate first
   sample (15/46 cached, 64.844 seconds) and warmPreparationMatched=false;
   although its snapshot runner reported qualified=true, its ratio 1.6170620566
   does not establish matched warm parity. The unchanged retry repairs that
   measurement condition, not the failed threshold. Prior 7df6b8b warm build
   ratio was 1.2389400457 and execution 0.6661053170. The historical missed
   13:17:03 / 13:20:20 UTC start deadlines remain failures; later timely runs
   do not erase them. The 14:51:02 build start deadline was also missed: current
   candidate warm preparation began at 14:53 UTC and completed before the
   14:55:48 pair. Latest a05b91a3 execution at 15:19:10.733211 UTC passed at
   0.7333435932681925; matched warm build at 15:19:47.352608 UTC
   failed at 1.0644553189680463, with all 17 pairs at 23/46 cached.
   Both qualified with unchanged inputs. At e2b7e4cd execution started 15:47:18.957612 UTC, qualified and
   passed at 0.6689832928130847. Matched warm build started
   15:47:56.422456 UTC, qualified with all 17 pairs at 23/46 cached,
   and failed parity at 1.1109345084723954. At c5a64f9e matched warm build
   started 16:17:57.827565 UTC, qualified with all 17 pairs at 23/46 cached,
   and failed parity at 1.1118837956138083. Execution started
   16:22:28.915800 UTC, qualified and passed at 0.8174906207336415.
   The build start deadline was missed by 1.405109 seconds; the execution
   start deadline was missed by 5 minutes 9.958188 seconds. These cadence
   failures remain recorded. Next start deadlines are 16:47:57.827565 UTC
   for build and 16:52:28.915800 UTC for execution.
   Records remain ignored under .test-runs/bend-migration/performance. These
   measure existing production, not unadopted whole preparation. Warm the
   actual changed candidate before each pair; an earlier source revision's warm
   run does not establish current cache comparability. No production emitter
   deadline was raised or affinity added. Diagnose build costs before changing
   performance code.

Keep this list current by removing closed work and naming specific remaining
failures. Every implementation checkpoint must include all retained sources,
tests, specifications, proofs, runners and documents in the working remote
branch migration/bend-direct-login-resumed, with local/remote SHA equality
verified. Local files or commits alone do not satisfy disk-loss preservation;
backup commits are not acceptance claims.

Current Go candidate evidence: the full package consumer passes 163 comparisons
across 28 packages; BuildContext passes 4933 comparisons (61 configuration, 2079
expression, 329 filename, 2464 header). Whole preparation and artifact consumers
pass the same 55 physical fixtures, 1622 requests and 3437 transitions, with
complete declarations/location/bindings, dependencies, fingerprint, remaining
budgets, effect chronology and caller cache. Artifact checks also cover root/type
inspection, wrong-root/function refusal, next identity and ReplyAfterTerminal.
The service ABI consumer passes 195 requests, including exact RangeError message,
class and opaque identity. Native local traversal passes 4368 comparisons, 2184
also against independent complete runtime/spec plans and budgets. These finite
checks do not establish universal/native correspondence or public adoption.

Verification uses ordinary tracked domain owners and fresh temporary emission;
evidence holds only measurements/diagnostics. The retained Go numeric canary and
artifact transport root check within five seconds. Unicode configuration and
UTF16 ordering use mechanical character observations. UTF8 canaries use
TextEncoder: Bun 1.3.14 Buffer.byteLength differs on lone surrogates, while native
surrogate expressions remain unknown. Existing verification CPU affinity remains
a Linux qualification limitation. Normal cleanup does not guarantee SIGKILL
cleanup. Source retention, finite checks and structural review remain separate
from whole-unit acceptance.

Current retained Go entry checkpoint: the actual reference entry and expansion
consumers pass all 58 owned cases, 2017 requests and 6304 transitions against
native complete results, cache and effect chronology. The same run passes
55 artifact cases (1713 requests, 3528 transitions) and 58 Canonical-owned
cases (2075 requests). All authored source hashes remained unchanged. Separate
entry and expansion emitters retain the existing progress/state representation;
Bend entry accepts expansion results and owns final publication clock. This is
finite consumer evidence, not public adoption. The original universal attachment
materialization transport now passes its complete proof within five seconds;
node replacement and transaction proofs remain open. Its formatter still rejects
the declaration header, so this checkpoint does not claim full formatting or
acceptance gates. All retained implementation, proof and runner changes belong
to the remote working branch; backup preserves WIP as well as validated code.

Next retained WIP closes the missing Python entry preparation/inspection bridge:
entry preserves existing D.PythonContext (session, private cache and census)
through root construction into expansion, with existing PythonProtocol commands
and validated continuous request/world exchange. Definitions and Go entry
emission checked within five seconds after factoring duplicate exchange logic.
Complete Python entry consumer qualification remains open; the existing finite
Python expansion checks do not qualify this new entry path. Node replacement
now has address lookup inversion and unique semantic-address lemmas checked,
but its original universal theorem still has no proof body. These retained
changes remain WIP, with production adoption and TS removal unchanged at 0/0.

The e2b7e4cd checkpoint formatted EntrySpecification and checked its complete
definitions in 4.017 seconds under the unchanged five-second deadline. After
the common Go/Python exchange change, the actual full Go consumer rerun passed
all 58 entry cases (2017 requests, 6304 transitions), 55 artifact cases
(1713 requests, 3528 transitions) and 58 Canonical-owned cases (2075 requests).
The 25.997-second run retained identical hashes of all authored tracked and
untracked inputs. Astra's Python bridge structural review found no concrete
custody defect in prepare/inspect, but the complete Python consumer remains
required, especially private cache, clock failures, root refusals and final
authority revalidation. Finite Go regression coverage does not establish it.

Common entry/expansion check facades and the mechanical child relay now have
one owner in graph-resolution, with their former Go-local copies removed.
They use the same EntrySpecification and ExpansionDriverSpecification and
existing Go/Python protocols; no policy or progress representation is copied.
The actual Go consumer at these new paths passes all 58 entry cases, 55
artifact cases and 58 Canonical-owned cases with unchanged authored inputs.
The complete Python/other-language entry fixtures remain the next consumer
qualification; source relocation does not count as adoption. Retained original
node replacement work proves numeric/semantic address-key transport and
unchanged-tail consequences, while its original universal zipper theorem
remains open.

The original universal node_replacement_exact now checks completely within
2.154 seconds (hard five-second limit, CPU10, ALL PROOFS CHECK and exit 0).
Its original law and premises are unchanged. Parent attachment and complete
transaction remain open; the formatter still rejects this declaration header.
The complete entry fixture owner now uses the common Entry/Expansion relay
and a separate existing Rust PreparationSpecification emitter (1.556-second
canary), retaining all TS/Rust/Bend/Python fixtures and full native comparisons.
Python semantic frontend results are observed from the actual Bend child return
with full facts and positions in the external effect chronology; pure returns
are separate from Environment provider deltas. External effects retain their
original complete checks. This harness adaptation is retained WIP pending its
actual full consumer run, not a new acceptance frontier or adoption claim.

The full all-language entry consumer is not yet qualified. Initial preparation
failed while hashing a gitlink as a file; hash collection now records the
submodule commit. The next actual run exposed native oracle contamination from
repeating Go preparation as a technical parser binding; Go/Python now use their
actual child frontend returns without a second preparation. A subsequent run
exposed previously unobserved native Go access operations, so the same native
Go module owner is now instrumented rather than dropping candidate effects.
The Go adapter imports and reexports the module owner; both edges are rebound
with an exact two-edge assertion. Full comparisons remain unchanged in scope
and the next same-fixture diagnostic remains required. Go nominal ABI conversion
has one Go-owned codec shared by the existing Go and common entry consumers.

The full entry checker now invokes actual native resolveGraphUnit for Go and
Python, retaining its frame through observation of the same invocation. The
former manual graphIteration loop omitted authority validation and the final
deadline. Its apparent extra Go clock was an incomplete oracle: all three Go
fixtures now compare full external chronology exactly (11/11, 11/11 and 16/16
clock reads), along with the existing product and retained-state assertions.
Fixture captures now contain every StableCapture field, including bytes and
contentHash; the previous partial fixture failed HashJsonProduct before Go
preparation completed. These are checker corrections, not relaxed comparisons.
The next Python fixture exposes private capture-cache publication missing from
the native observer. Instrumentation now observes actual Python root/child
cache writes, access and status operations. That correction is not qualified:
the next whole run stopped before fixtures because EntryDriverCheck emission
exceeded the unchanged five-second deadline. Diagnose the emission cost before
claiming full entry correspondence. The existing parent attachment transport
has two new internal definitions saved as unverified work; its original law
and premises remain unchanged. Public adoption and removed production TS
remain zero.

The next independent EntryDriverCheck emission passed in 2.634 seconds under
hard five seconds. Full entry diagnostics then isolated missing host bindings:
Python InspectSource incorrectly dereferenced the intentionally absent legacy
parserBinding; it now uses the existing inspectSourceFrontend. SelectContextPath
uses the existing selectedByDirectFilePolicy binding. Python cycle, diamond and
alias fixtures pass product/state/effect comparisons with 6/6 clock reads.
The existing imported-Child fixture now completes with 23/23 clocks and exact
external chronology, including actual Python cache writes and path membership.
Go native lstat is also observed, preserving its corresponding membership calls.
The next failure is retained target edge identity: looking up an ID in the final
pending map loses IDs after consumption. The checker now observes actual edge
registration and copies that diagnostic identity when native resolution renames
an edge. The rename observation remains unverified until the next full run.
ParentAppendTransport registered-fields/tentative-success definitions check;
its new append transport still has a syntax failure and the original parent
law remains open. None of these intermediate results establishes public adoption.

Latest qualified current consumers at 3bb097ce: the complete existing entry
fixture set passes 78 cases and 55 native comparisons in 29.177 seconds,
including Go/Python full resolveGraphUnit finalization. Its authored-source
hash assertion passes. The actual Go consumer also passes in 41.252 seconds:
58 reference entry cases/2017 requests/6304 transitions, 55 artifact cases/
1713 requests/3528 transitions and 58 Canonical-owned cases/2075 requests.
The observed renamed-edge registration fixes retained target identity without
relaxing full pending/target/forest comparisons. These finite comparisons close
the current entry fixture blockers; physical cancellation, universal guarantees,
ordinary source gates and whole public adoption remain acceptance obstacles.

At 3bb097ce the next matched build pair started 16:48:04.222878 UTC and passed
at 0.9810143780417804 with 17 complete pairs, all 23/46 cached. Execution started
16:53:34.691205 UTC and passed at 0.7674854651331289. Both qualify with unchanged
heads, authored sources and artifact trees. Build start missed its deadline by
6.395313 seconds; execution missed by 65.775405 seconds. These cadence failures
remain distinct from the passing performance thresholds. The actual current
warm build passed 46/46 tasks in 72.342 seconds before the pair. Start warm-up
well before the next deadlines, allowing for input hashing and the measured
five-minute build pair. Next build deadline: 17:18:04.222878 UTC; next execution
deadline: 17:23:34.691205 UTC. These measure existing production, not unadopted
whole preparation. Production preparation adoption and replaced TS removal
remain 0/0.
