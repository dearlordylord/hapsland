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
| Real Source composition | 56 cases, 6348 requests, 31 independent whole native comparisons | Ordered physical effects, inputs/identities, activity publication and pre-teardown custody; full error/cancellation correspondence remains open. |
| Real Preparation → Post composition | 73 cases, 15702 requests, 855 Post requests | Native result differential, parent cancellation/late replies, retained advice, post-admission barriers and cleanup; whole proof and public adoption remain open. |
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

1. Close the original attachment transaction and whole correspondence obligations:
   arbitrary retained Worlds/replies, completion and Cause/custody. Original
   materialization for arbitrary optional fingerprint and node_replacement_exact
   are closed under hard five seconds with unchanged premises.
   The original parent_attachment_exact now checks in full: all eight original
   conjuncts, unchanged statement and premises, actual owner root verdict
   ALL PROOFS CHECK, exit 0, 2.236 seconds wall / 2.033 user on CPU10 under the
   hard five-second deadline (/tmp/astra-parent-linear.log). Exact appended and
   replaced projection, semantic frame validity, registration, next-node count
   and density witnesses are assembled through linear proof elimination; no
   success or validity premise was added. Earlier failed/time-limited attempts
   remain failures, not qualification. Next original root is
   ATTACHMENT_TRANSACTION_LAWS.attachment_transaction_exact: nine equalities
   for one witness, actual/reference EncodeProduct, staged frame, arbitrary
   Reply boundary and unchanged World. Actual-ready inversion and the ninth
   unchanged-World claim now pass with the full definition prefix at 4.330
   seconds under hard five seconds on CPU10, for arbitrary replies and
   validation outcomes. Actual frame-view inversion also supplies exact
   P.project and frame_forest premises for the closed parent/materialization
   laws (/tmp/astra-transaction-parent-premises.log). The first eight
   transaction claims and its full original body remain open. The next checked
   prefix derives child readiness/freshness and selected maps from actual_ready,
   and constructs the measured request witness with its first three exact
   observations (4.334 seconds, /tmp/astra-transaction-request.log). Product
   existence still must be derived from the same original premises. Adding the
   planned Parent/Materialization imports exceeded the unchanged hard-five-second
   deadline; a Parent-only diagnostic also timed out. These joined closures are
   unqualified; scheduling versus added normalization cost is not yet resolved.
   Both planned imports are retained as WIP, not claimed checked proof.
   A same-prefix diagnostic distinguishes import cost: without the two imports
   4.070 seconds wall / 3.675 CPU passes; with both, 5.023 wall / 4.730 CPU times
   out. ExpansionDriverState.bend now solely owns the 39 existing state,
   attachment and completion definitions needed by that closure (339 lines).
   All moved definition bodies are byte-identical, removed from the full driver;
   its discovery/language interpreter consumes the same lower owner. The original
   transaction law/body changes only its D import. Lower-owner and full-driver
   verdicts pass in 1.847 and 2.269 seconds under hard five seconds. Combined
   transaction prefix after this cut still times out: exit 124, 5.026 seconds
   wall / 4.612 user / .402 system (/tmp/astra-transaction-lower-joined.log).
   Imports-only diagnostics isolate the remaining cost: combined imports alone
   time out at 5.030 seconds, and Parent+Materialization alone at 5.026; the
   boundary closure without those imports passes in 3.095 seconds. The full
   prefix also times out at 5.024. Removing local provisional proof bodies
   cannot close this baseline dependency cost. Original premises are unchanged.
   A single-authority Patricia proof cut moves 24 existing membership-only
   definitions out of the canonical insertion owner into PATRICIA_MEMBERSHIP_PROOF;
   VISITED, INTERPRETER_INSERT_INVENTORY and CHILD_INVENTORY import the membership
   owner for those facts. Canonical insertion and the original laws remain in
   their owners. Both proof owners and all three affected original roots pass
   under hard five seconds (3.211/3.082/2.727/2.478/2.819 seconds). The combined
   transaction prefix still times out at 5.025 seconds: this cut preserves proof
   consumers but does not close the whole deadline barrier.
   A second single-authority cut moves 13 existing lower remap facts to
   AttachmentRemapFacts; original complete remap/pending laws remain in
   AttachmentRemapProjectionProof, with three real importers using the lower
   owner. Moved statements/bodies match modulo whitespace. Lower/original
   remap roots pass in 1.567/1.719s; Parent/Materialization pass in 2.779/4.094s.
   Union still times out in 5.022s and full prefix in 5.047s, so the barrier is
   not closed. The formatter rejects both split declaration headers; untouched
   original HEAD reproduces the same limitation. No formatter exemption is
   claimed. Subsequent timing reversal (Parent header-only 4.232s vs prior
   full Parent 2.779s) prevents reliable body-cost attribution from this batch;
   pair identical closures with CPU measurements before further cuts.
   No faster complete proof is claimed. Physical probes also require updating constructor
   namespaces and the four reference fixtures' existing mandatory python=None
   field; the first incomplete-fixture failure is retained.
   The same full transaction falsifier now passes 221184 reply/boundary cases,
   6912 staged transitions and 34560 post-reply frames through the actual Node
   capability runner (/tmp/hapsland-driver-state-transaction-consumer-v2.log).
   This is finite synthetic phase evidence, not universal correspondence or
   source-to-child-plan reachability. Other changed probe and whole entry
   consumers still require current qualification.
   The partial-transaction probe passes 442368 replies and 13824 staged
   transitions after the same fixture correction. Completion initially fails
   at final result acceptance: actual Machine already issues a final deadline
   read, while non-Python reference terminal_product incorrectly returned early.
   Native resolveGraphUnit checks expired after validateAuthority and before
   returning its unit (graph-resolver.ts), so the reference now retains that
   final clock transition. The existing boundary observation adds its already
   retained capsule/product at CheckingCompletion, allowing the whole consumer
   to compare the required pre-acceptance stage instead of dropping the clock.
   Driver, actual/reference projectors and completion probe verdicts pass under
   hard five seconds (2.142/1.548/1.350/4.344 seconds). The full completion
   consumer now passes all its original 16 tree cases, 13824 reply boundaries,
   288 completion cases and 768 final-deadline cases (expiry, wrong owner and
   wrong correlation) through the Node capability runner
   (/tmp/hapsland-final-deadline-completion-full.log). Universal completion
   correspondence and production adoption remain open.
   The first whole-entry run catches an extra Go clock effect (12 versus native
   11): Entry's Go authority-validation owner already owns its final deadline.
   terminal_without_python therefore preserves that Go handoff and adds the
   generic final clock only where the generic driver owns acceptance. The
   go-root-type focused real entry now passes its complete native chronology
   with 11 clocks on both sides (/tmp/hapsland-final-deadline-go-entry-focus.log).
   The next whole-entry run exposed an incomplete native boundary for ordinary
   languages: its harness stopped at graphIteration and omitted resolveGraphUnit's
   final deadline and acceptance. All language fixtures now invoke the complete
   native resolveGraphUnit entry; exact ordered effect assertions remain intact.
   The full Node capability consumer passes all 78 cases and 55 native comparisons
   (/tmp/hapsland-full-native-entry-all.log); explicit runner lint and syntax pass.
   The earlier failed runs are not qualification. This finite entry evidence does
   not close universal correspondence or qualify production adoption. Publication-map passes its original 16 tree cases with 288
   publication-hole refusals and 144 budget counterexamples; its zero reply
   counters are outside that probe's admission-focused scope, not reply coverage.
   Parent-law closure does not close this
   transaction or whole flow correspondence and does not qualify adoption.
   No new or weakened acceptance premise is authorized.
   Current proof-support WIP derives ready visited observation membership to a
   True map lookup, then needs the reverse unique-order/cardinality direction
   to establish actual/reference lookup equality for Included/Expanded. It adds
   no law or premise and leaves attachment_transaction_exact unchanged. The
   dependent elimination was fixed using existing witness eliminators. The
   exact semantic support/dependency slice passes hard5 in 4.272s
   (/tmp/astra-transaction-visited-focused.log): listed identities have equal
   actual/reference lookup results. A subsequent exact absent-identity support
   slice passes hard5 in 2.770s (/tmp/astra-visited-absent-cardinality.log),
   using only the original uniqueness/key-count guards and proof-local Nat
   pair counts over existing lists. The complete semantic lookup support,
   including direct Bool/Maybe elimination and arbitrary-query actual/reference
   equality, checks hard5 in 4.048s. The next coherent support batch adds
   ready_frame_lookup_exact: two original successful actual/reference projections
   into the same view/history now imply equality for every query. Unique/key-count
   guards are extracted from existing ActualFrame.coverage rather than added
   as premises. The full focused support checks hard5 in 2.942s
   (/tmp/astra-transaction-visited-focused.log). The full original theorem
   remains open; no new runtime representation, law or premise.

2. Qualify the remaining complete consumer boundaries and supported input scope.
   The existing frontend codec now preserves literal constructor, Maybe,
   artifact/field and reference-kind tags in its inferred source-facts ABI.
   This narrows the real records already emitted; it adds no runtime policy or
   synthetic opaque argument. Root and preparation ABI typechecks, check:fast
   (including one changed authored source in lint), and the full independent
   entry consumer (78 cases/55 native comparisons) pass on these inputs
   (/tmp/hapsland-frontend-literal-{fast,entry}.log). Remaining composition ABI
   declarations and normal build recipes are still required before packaging.
   Cargo/TOML's existing recursive ABI is now closed over all seven actual
   Types.bend constructors (including nested arrays/ordered records), rather
   than arbitrary string tags. Encoder behavior is unchanged. Full independent
   entry again passes 78/55; explicit lint, root types and check:fast pass
   (/tmp/hapsland-closed-toml-{entry,types,fast}.log).
   Python's complete parser-syntax projection now also exposes literal field,
   node and root record tags with a named PythonSyntax result type, preserving
   the existing projection. Root types, explicit lint and check:fast pass; full
   independent entry passes all 78 cases/55 native comparisons on these inputs
   (/tmp/hapsland-python-closed-abi-{types,fast,entry}.log).
   Frontend inputs now also expose the complete closed language-context union,
   literal Type/Function branch and RustContext records. Runtime language tags
   and parser dispatch remain the same. Explicit lint, root types, check:fast
   and full entry 78 cases/55 native comparisons pass
   (/tmp/hapsland-frontend-context-{types,fast,entry}.log).
   Existing ResolverInput, ResolverFailure and ResolverOutcome transport types
   now have one exported authority in service-contract.ts instead of being
   private to consumer.ts. Field definitions are unchanged; the consumer uses
   type-only imports. Root typecheck and explicit lint pass; check:fast passes
   with both changed authored sources selected
   (/tmp/hapsland-resolver-contract-{types,fast}.log). This enables real machine
   declarations to reuse the contract; their packaging is still open.
   Existing source-analysis graph-resolver package entrypoint now exports the
   six transport types (input/failure/outcome/request/reply/service outcome).
   Generated graph-resolver.d.ts contains these exports after a real 46/46
   workspace build (15 cached, 53.454s); explicit lint and check:fast pass with
   the changed entrypoint selected. Resident declarations can consume this
   existing package interface rather than source-analysis implementation paths.
   Logs: /tmp/hapsland-resolver-public-contract-{types,fast,build}.log.
   GenericArtifact's authored declaration now covers all 13 ParentAction
   variants, exact source/cache/capture payloads, pending edges and resolver
   input/reply/cancellation. Only retained Bend state/continuation/frame are
   opaque; command payloads remain explicit. The existing strict preparation
   ABI config selects this declaration. Explicit lint, strict ABI and check:fast
   pass; real emission passes in 3.143s under hard five seconds and its declared
   initial/resume/execute methods exist in the emitted core. Logs:
   /tmp/hapsland-generic-artifact-abi-{types,fast,emission}.log.
   This declaration is in the normal resident build recipe; the full packaged
   resident consumer passes. Production adoption remains open.
   The resident recipe is now owned by review-work/build-recipe.json, with
   preparation and composition paths retaining their local source/declaration
   owners. Reader accepts nested safe paths only, requires matching capability
   directories and preserves symlink/private-output checks. Three reader tests
   pass, including traversal/mismatched-owner/symlink refusals; explicit lint
   and check:fast pass with three authored sources selected. Full resident runner
   now loads packaged GenericArtifact and removes its temporary emission and
   unused source-name map. PythonArtifact and GoArtifact now also load packaged
   cores; ArtifactComposition now loads packaged output. CanonicalResolverOwner
   also now loads its normal agent-flow-bend export; this full resident consumer
   has no remaining temporary core emission.
   Two earlier real workspace builds failed before GenericArtifact at the existing
   PreparationFinalization hard-five-second emission. Isolated CPU11/direct
   emission passes in 3.798s; it does not qualify workspace packaging. Logs:
   /tmp/hapsland-packaged-generic-{fast,build,build-v2,finalization-focus}.log.
   These failures required a distinguishing matched-producer diagnostic at the
   actual precompile stage/toolchain/ABI boundary rather than only bend CLI.
   That matched isolated producer now passes review-execution and resident
   recipes (4.427/4.190s total, each emission still hard five seconds), including
   all three resident cores. A controlled complete Turbo graph at concurrency 1
   passes 46/46 in 53.024s with authored-input verification; the subsequent
   standard concurrency-2 workspace build passes 46/46, 23 cached, 4.081s.
   This diagnostic establishes packaging; the subsequent full resident consumer
   qualification is recorded in obstacle 5. It does
   not prove a complete timeout cause. No deadline or default concurrency changed.
   Logs: /tmp/hapsland-{matched-precompile-producer,serial-producer-graph,post-serial-normal-warm}.log.
   Execution cadence deadline 00:34:26.226502 UTC was missed while resolving
   the failed build prerequisite. Record this as a cadence violation; the next
   measurement is delayed, not an on-time claim.
   A fresh origin/master fetch confirms no commits missing from this branch.
   Full independent entry passes 78 cases/55 native comparisons; full Go passes
   58 entry, 55 artifact and 58 Canonical-owned cases. The physical whole Source
   consumer now passes 56 cases/6348 commands and 31 native comparisons across
   all five languages, including configuration fingerprint/semantic identity.
   Current Go boundary qualification passes direct 55 cases / 1659 requests /
   3474 transitions, artifact 55 / 1713 / 3528, full Entry 58 / 2017 / 6304
   and Canonical-owned 58 / 2075 requests after the sole-declaration move.
   Entry uses separate compiled temporary outputs while physical fixtures stay
   in /tmp; all emissions retain five seconds. Its earlier preparation timeouts
   remain failures, not fixture verdicts (current pass:
   /tmp/hapsland-go-boundary-entry-current-v4.log).
   Full physical cancellation/late cleanup and universal correspondence remain
   distinct. The accepted Go profile domain is the existing positive-integer
   configuration contract (docs/configuration.md, graphLimits field table and
   invalid-profile-before-egress requirement). Production pipeline obtains
   effectiveGraphLimits from the resolved policy or built-in ceilings; the
   former invokes validateGraphLimits before candidate capture/Go preparation.
   All seven fields use the same Schema.Int/range boundary. Real public decoder,
   configuration resolver and frozen effective-profile checks reject 42 invalid
   negative/zero/fractional/over-ceiling profiles and accept 14 boundary profiles.
   Existing configuration/Canonical consumers pass 66 tests. Logs:
   /tmp/hapsland-go-profile-{public-decoder,configuration-tests}.log. No new
   validation or Bend premise was added. Negative/fractional raw internal
   prepareGoGraph helper correspondence remains unmeasured; it is outside the
   accepted product profile domain, not a whole-production acceptance requirement.
   Existing broader Nat fixtures, including zero boundaries, remain unchanged.
   Complete valid-profile/native Go flow correspondence is still required.
3. Complete remaining ordinary Bend/source gates. The six current driver and
   completion boundary/probe files pass the pinned formatter after whitespace-only
   formatting of ExpansionDriverSpecification and AttachmentCompletionProbe;
   non-whitespace bytes match their pre-format versions. This closes their local
   format drift, not the unsupported formatter roots or original proof gate. Development imports now pass
   with zero violations after owner moves, existing public capability wiring and
   tooling-owned fixture assembly. check:fast passes 109 tests, assets, source
   typing and package/import graph. Its post-commit lint selects zero files;
   actual changed-source lint and physical new-path consumers qualify the edits
   separately. Source-owned graph Entry/expansion/Rust/SPEC consumers and local
   resident Source (56/6348/31), preparation (73/15702/855), owned root
   (46/2049) and composed Canonical root (18/1425/7125 fences/18 accepted)
   pass. The old full graph loop in the standalone machine checker is replaced by
   the resident-owned composition consumer, retaining all 58 original fixtures.
   Complete request/reply streams and full accepted terminal frames now compare
   the existing split dispatcher's verification await/resume loop with actual
   Canonical-owned execution, with no field normalization (fresh invocation 1
   on both sides). All 105 cases pass, including 59 exact IO/terminal comparisons
   (log: /tmp/hapsland-whole-fixtures-owned-io-v2.log). This qualifies scheduler
   and transport correspondence; native results/effects remain the independent
   algorithm oracle. Standalone generic machine/real foreign Bend IO checks
   pass four roots including physical cross-file capture, bounded pure-chain
   (maximum 1), exact fuel refusal, terminal frame, cancellation/late reply and
   original Cause identity (log: /tmp/hapsland-generic-machine-crossfile-chain.log).
   No language fixtures are filtered; no native language policy fallback is added.
   The resident-owned root consumer now includes all 58 original graph fixture
   facts through a source-owned verification CLI and the existing runner's
   subprocess input boundary (V8 preserves Maps/order). It retains the previous
   46 physical/lifecycle cases and adds final-publication expiry. The full
   consumer now passes 105 cases / 4252 requests, comparing full results,
   errors, ordered effects, cache and resource cleanup (log:
   /tmp/hapsland-whole-fixtures-owned-consumer-v8.log). Earlier failures found
   a missing dirname import; a later run exposed
   incomplete fixture StableCapture facts, now supplied equally to both sides;
   the full run then found a missing generic final deadline read. Native
   resolveGraphUnit checks frame.expired before returning every unit, while
   Machine previously performed final checks only for Python/Go. Generic
   completion now requests ReadClock using the existing saved product/frame;
   Machine source checking and both changed Bend formats pass. Negative graph
   work now uses the existing public readNat error boundary and both fixture
   sides use the public Effect resolver boundary. Emission preparation retains
   its hard five-second limit: two reversed output-storage pairs passed at
   3.260/3.888 seconds in /dev/shm versus 4.388/4.668 in /tmp. Only compiled
   temporary artifacts moved; physical fixtures remain in /tmp. This is not
   production parity evidence. The original no-omission/reference-count, Unicode dependency order and
   tree-refusal encoding-count assertions are now retained in this consumer;
   their current qualification passes all 105 cases / 4252 requests (log:
   /tmp/hapsland-whole-fixtures-owned-consumer-v11.log). The first run stopped before cases
   at PythonArtifact emission. Isolated emission also timed out (5.110 wall /
   4.349 CPU); removing its unused common ArtifactProtocol import reduced the
   same emission to 2.870 seconds under the unchanged limit. Reference-count
   assertions remain specific to the two original large fixtures; requireUnit
   and no omissions apply to all requiring fixtures, including Go. Astra
   agreed the shortest IO/trace path: compare the existing split dispatcher
   in a verification await/resume loop against Canonical-owned execution,
   complete request payload/order/IDs and accepted full terminal frame. This
   qualifies scheduler/transport correspondence, not an independent algorithm
   oracle; native outcomes/effects and generic pure-chain/Cause checks remain.
   The replacement IO boundary is qualified as above; whole resident progression
   and universal correspondence remain open.
   Unsupported formatter roots remain failures, including
   attachment declaration headers and UnitEvidence/Glob/list blocks.
   Astra's structural review found no blocking ownership/dependency issue in
   the composed-consumer move and tooling fixture boundary. Its two cleanups
   remove obsolete emission paths and ignored resolver ports; changed-source
   lint selects one file and the actual composed consumer again passes
   18/1425/7125 fences/36 terminal suffixes/18 Canonical accepted results.
   A full gate remains blocked; placement is not production adoption.
4. Complete and qualify compiled preparation → Source → Post in the actual public
   resident lifecycle, preserving source/parent/child revision and identity
   fencing, original exception/Cause identity, resource custody, accepted result
   publication and independent dispatcher/advice scopes. The new multilingual
   physical consumer closes its former language fixture gap; it is not public
   adoption or proof of every lifecycle case. The real resident preparation
   consumer now includes Go/Rust/Bend roots through the same Canonical-owned
   preparation → nested resolver → Post/retention path, adding the existing Go
   artifact. Focused Go passes 1 case / 61 requests / 16 Post requests with native
   whole differential and cleanup (/tmp/hapsland-resident-go-whole-flow-v2.log).
   The complete 73-case set now passes 15702 preparation requests and 855 Post
   requests, including all five languages, original cancellation/late replies,
   retention/advice and fault-cleanup cases
   (/tmp/hapsland-resident-boundary-current-v2.log). Earlier full runs stopped
   at ArtifactComposition emission before scenarios, including one after the
   boundary move; those failures remain recorded. No emission limit was raised.
   An isolated declared-environment CPU10 reproduction passes at 1.626 seconds
   (1.336 user / 0.268 system); the cause of timing variability is not established.
   The composition's current authored closure is 21 files / 8732 lines and
   excludes Go PreparationModel and BuildContext. Three unchanged Go boundary
   records now have sole declarations in existing ArtifactProtocol; fields,
   types and order remain exact, with constructor references updated atomically.
   Direct/artifact/full Entry and Canonical-owned Go qualify this boundary move.
   The full graph consumer also passes current inputs: 105 cases / 4252 requests,
   all 58 original fixtures and 59 exact IO/accepted-terminal comparisons
   (/tmp/hapsland-owned-105-boundary-current.log). Pinned formatting selected
   seven changed Bend sources and passes after correcting five files with
   whitespace-only changes, preserving exact non-whitespace tokens. Actual changed-runner lint selected
   one file and passed. These finite checks do not establish the original
   universal theorem or public production adoption. No representation or
   original premise changed.
5. Connect the whole section through production Canonical launch, lifecycle,
   cancellation, acceptance and progression. Delete replaced TS preparation,
   graph/language package policy and orchestration only with their qualified
   complete Bend replacement. Public preparation still uses TS: connected whole
   preparation Bend **0**, removed replaced production TS **0**.
   Production artifact assembly now ships Source/Post/GenericArtifact/PythonArtifact/GoArtifact/ArtifactComposition through
   the resident review-work private recipe and closed authored ABIs. The normal precompile
   runner validates each core's declared entry methods, rather than imposing
   initial/advance/resume. Generated Turbo inputs include the recipe closure.
   Actual frozen workspace build passes 46/46 tasks (15 cached, 46.206 seconds);
   all 23 compiler receipts pass under the same declared producer environment.
   The full Source consumer loads both packaged cores with no temporary-emission
   fallback: 56 cases, 6348 requests and 31 independent native comparisons pass
   through the normal Node capability runner. Node is required by the physical
   fs observer: its builtin-export probe sees one intercepted call, while Bun
   sees zero; the failed Bun run is not qualification. check:fast passes 109
   unit tests, typing and dependency checks. The normal typecheck:source now
   includes a resident-owned strict ABI config with skipLibCheck=false; its
   actual check and the revised check:fast pass. Explicit lint covers both authored
   declarations and the changed consumer, independently of zero-file changed
   lint. At frozen 2239af77, the full resident consumer also loads packaged
   PostPreparation without temporary emission: all 73 cases, 15702 preparation
   requests and 855 Post requests pass through the Node capability runner
   (/tmp/hapsland-2239-packaged-resident-full.log). Its actual workspace build
   passes 46/46 tasks, 15 cached, 48.518 seconds; explicit lint selects and
   passes the changed runner. The current full resident consumer with packaged
   Source/Post/GenericArtifact passes all 73 cases, 15702 requests and 855 Post
   requests (/tmp/hapsland-packaged-generic-resident-full.log), retaining full
   native differential and cancellation/cleanup branches. No source fixture is
   filtered. At frozen 51ad491d, the workspace build passes 46/46 tasks
   (18 cached, 32.713 seconds), and the full resident consumer loads packaged
   PythonArtifact with no temporary-emission fallback: all 73 cases, 15702
   requests and 855 Post requests pass
   (/tmp/hapsland-packaged-python-resident-full.log). Strict ABI typing,
   explicit declaration/runner lint, recipe tests and check:fast pass.
   Generic and Python declarations share the exact existing dispatcher namespace
   relocation; no runtime command or policy changes. Remaining temporary
   emission at that stage was the agent-flow-owned CanonicalResolverOwner, now
   resolved by the normal owner export below. Their transport inputs must retain
   exact raw Bend payloads: semantic frontend types are not interchangeable with
   raw SourceFacts, and opaque command inputs would conceal this boundary.
   GoArtifact now also ships through the normal recipe, with explicit Prepare/
   Inspect commands and all four view variants. Strict ABI, addressed lint,
   three recipe tests and check:fast pass. Workspace build passes 46/46
   (18 cached, 38.981s); the full resident consumer passes all 73 cases,
   15702 requests and 855 Post requests without temporary Go emission
   (/tmp/hapsland-packaged-go-resident-full.log). Retained Prepared/Step values
   are Bend-created; input/configuration/reply payloads reuse actual contracts.
   ArtifactComposition now also ships through this recipe. Its declaration covers
   all five dispatch states, three closed command families, four await owners
   and the actual receive/view methods. Bend-retained return/census values are
   opaque; host-built handles and command payloads remain explicit. Strict ABI,
   addressed lint, recipe tests and check:fast pass. Workspace build passes
   46/46 tasks (18 cached, 43.211s); full resident consumer passes 73 cases,
   15702 preparation requests and 855 Post requests without temporary composition
   emission (/tmp/hapsland-packaged-composition-resident-full.log).
   The remaining CanonicalResolverOwner artifact belongs to agent-flow-bend,
   whose normal producer has an exact output/ABI inventory and receipts. It must
   be exported there, not added as an external resident recipe source. Its
   resident_step/resident_reconcile/assembled boundary consumes existing
   Canonical state and events plus local custody. The Canonical event input is
   now closed; existing source-free state/results retain their previous boundary.
   The owner scope/action and custody declaration remains an actual ABI gap:
   do not conceal its event input with an opaque command, or import consumer-owned
   canonical-policy types back into the Bend producer. Before wiring the export,
   establish the source-free raw Canonical transport at its existing declaration
   owner, preserve local scope/action contracts and exact ../ namespace/Nat
   conversion, then extend the normal producer inventory/receipt and package
   interface. Qualify its actual resident transaction and complete consumer;
   no further temporary resident compilation or alternate Canonical authority.
   The raw event transport is now authored under agent-flow-bend/abi as
   raw-canonical-event.d.ts: complete CanonicalEvent and its reachable payloads,
   18 types/187 constructors, ordered List/Maybe and existing immediate Nat.
   Strict owner ABI checking (skipLibCheck=false) and explicit lint pass;
   typecheck:source/check:fast now select all authored Bend ABI declarations and
   pass. The public canonical declaration now exports the raw transport and
   bendCanonicalStep requires RawCanonicalEvent. Every event encoder and its
   nested payload returns the closed owner types. Runtime AST after TS erasure
   is identical to HEAD before this change; the immediate Nat/read/validation
   behavior is unchanged. Normal Canonical generator copies the declaration,
   and the exact producer inventory/receipt binds all 41 files. All 77 producer
   tests pass; explicit lint and strict ABI pass. Real canonical-policy typing
   first used the authored interface as a diagnostic, then the real workspace
   producer/compiler. A post-build root check found an outdated unknown mock;
   its type now follows the public producer signature. Revised check:fast
   passes with six actual authored sources selected. Three real Canonical
   boundary/schema/Engine consumers pass 42 tests on the final typed candidate.
   Standard workspace build failed at existing PreparationFinalization hard5;
   controlled full concurrency-1 graph passes 46/46 (14 cached, 75.107s), then
   unchanged standard concurrency-2 build passes 46/46 (23 cached, 3.132s).
   No deadline/default concurrency changed; this does not establish timeout
   cause or build parity. Logs: /tmp/hapsland-raw-canonical-{wire-build,
   serial-graph,normal-warm,boundary-tests-v2,wire-fast-v2}.log. Complete
   CanonicalResolverOwner now has a complete closed declaration (34 public
   lifecycle methods, 15 local types), plus source-free raw Canonical state/output
   transport (51 types reusing existing event payload owners). OwnerTransport
   declares the existing bigint and ../ namespace conversion; it creates no
   runtime representation. The normal agent-flow producer exports the library,
   enforces hard5 emission, checks all declared methods and zero foreign loaders,
   and binds 44 exact outputs/declarations in receipts. All 80 producer tests
   pass, including omissions of the three new outputs. Strict ABI and addressed
   lint pass. The full resident consumer imports the package export and deletes
   its final temporary emission loop/directory. Its direct development dependency
   is declared in resident-runtime and bun.lock. On the final declared candidate,
   standard workspace build passes 46/46 tasks (18 cached, 41.553s), check:fast
   passes with six actual authored files selected, and the complete physical
   consumer passes all 73 cases, 15702 preparation requests and 855 Post requests.
   Initial build input drift was rejected while proof edits were live; after
   freeze an existing PreparationFinalization hard5 timeout was reproduced
   separately as a passing isolated emission. Controlled serial graph passes
   46/46 (14 cached, 69.132s), followed by the standard warm graph (23 cached,
   3.663s). No deadline or default concurrency changed. Logs:
   /tmp/hapsland-canonical-owner-{declared-build,fast-v2,serial-graph,normal-warm}.log
   and /tmp/hapsland-packaged-canonical-owner-resident-full-v2.log.
   Canonical owner packaging/loading is qualified; whole production wiring
   remains open. Whole preparation connected: 0; replaced production TS removed: 0.
   Resolver artifact shipping and the complete production entrypoint
   remain open. No whole preparation adoption or TS deletion is claimed.

6. Pass all selected local acceptance gates and strict paired performance on the
   connected candidate. Latest existing-production c102a2fc measurements are
   qualified with unchanged heads/sources/artifacts and all 17 pairs: execution
   passes at 0.7622585795793573 (2026-10-12 01:55:29.041425 UTC); build fails at
   1.141850255771185 (01:56:15.936963 UTC). Both starts are within their
   preceding cadence deadlines. Results do not qualify unadopted whole
   preparation; build parity remains an acceptance obstacle.
   Normal warm build passes 46/46, 23 cached, 4.530s. Next starts due on
   2026-10-12 UTC: execution 02:25:29.041425, build 02:26:15.936963.
   Logs: /tmp/hapsland-c102a2-{execution,build}-pair.log.
   Previous 59838815 qualified execution .5198552 passed and build1.1118466
   failed; both began within their cadence deadlines.
   Previous 89ff0da2 execution .7281511 passed and build1.1747319 failed;
   both qualified runs started on time. Timing changes are not causal evidence
   for the type-only ABI change, whose erased runtime AST is unchanged.
   Previous 0ab17560 execution .8222442 passed and build1.1940596 failed;
   those starts missed their deadlines after two failed packaging builds and
   matched-producer/serial diagnosis. Those cadence violations remain recorded.
   Prior 8ca20f5e results were execution .8073524 and build1.1261360; its
   phase diagnostics below describe those earlier inputs, not the current run.
   All 34 paired builds have 23/46 cached tasks and successful exit. Preserved
   logs localize the measured difference: baseline total/Turbo/outside-Turbo
   means are 5.863/2.578/3.285 seconds; candidate means are 6.602/3.163/3.439.
   Most of this gap is inside Turbo. This is phase localization, not a causal
   diagnosis or parity claim. Next diagnostic is per-task timing of the actual
   uncached clean tasks while retaining the same baseline, commands and gates.
   A real --summarize build passes 46/46 with 23 cached (Turbo 2.863s), showing
   that cached restoration also contributes: administration HIT 291ms and
   resident-runtime HIT 242ms exceed the largest observed clean MISS (220ms).
   Candidate/baseline dist inventories differ: administration 582/302 files,
   resident-runtime 487/82, source-analysis 135/87. None of the inspected
   administration/resident outputs are .bend or verification-path files.
   These are diagnostic observations, not a cause or parity claim. Inspect
   product artifact contents/receipt ownership before optimizing cleanup;
   do not omit required outputs or weaken the build gates.
   Extra administration/resident files are normal product JS/declarations/maps,
   including modules introduced by current owner organization; no removable
   verification/Bend output surplus was established. Preserve these outputs.
   Log: /tmp/hapsland-clean-task-summary.log; Turbo summary:
   .turbo/runs/3KZT88YNRFrYVigu1gGcO36nTe9.json.
   The previous 6aad1787 warm-up first failed because PreparationFinalization emission exceeded hard
   five seconds. A same-CPU11/environment isolated emission passed at 2.846
   seconds, then the real frozen retry passed 46/46 tasks, 17 cached, 48.689
   seconds. The failed warm-up remains failure; isolation distinguishes workload
   conditions but does not establish the timeout cause.
   The preceding f9ea5f3a measurement’s 34 preserved build logs distinguish Turbo's reported time from total
   wrapper time: baseline total/Turbo/outside-Turbo means are 6.042/2.457/3.585
   seconds; candidate means are 6.628/3.145/3.483 seconds. That measurement’s gap is
   inside Turbo, not increased outside-Turbo time; this is phase localization,
   not a causal or parity claim (build-phase-diagnostic.json beside the build
   qualification). Both lanes still perform 23 uncached cleanup tasks and restore
   23 cached builds. Resident source has 120 authored TS files in both current
   master and candidate, versus 20 in the fixed baseline. Candidate compiled
   dist totals 1934 files / 17589692 bytes versus baseline 1059 / 15162497.
   These are possible restoration-cost contributors, not established causes;
   preserve master structure and product/build custody contracts. Next diagnostic
   must distinguish uncached cleanup, cache restoration and Turbo hashing without
   removing validation or changing the fixed baseline/acceptance threshold.
   The existing workspace runner now accepts optional --summarize; ordinary
   builds retain their previous command. Syntax and one-file lint pass, and
   actual summary builds pass 46/46 tasks: first 15 cached / 39.951 seconds,
   then warm 23 cached / 2.577 Turbo seconds. The warm summary records 23
   cleanup tasks with 2.789 summed seconds and 23 cached restores with 1.458
   summed seconds; their intervals overlap, so these are not additive wall-time
   shares. Current diagnostic: .test-runs/bend-migration/build-summary-diagnostic.json.
   A separate locked baseline Turbo phase passes 46/46 tasks, 23 cached,
   at 3.117 Turbo seconds with authored inputs unchanged. Its overlapping
   cleanup/restore sums are 4.665/1.026 seconds. These separate phases do not
   establish causality or paired whole-build parity.
   This is diagnostic localization, not another paired parity result.


Keep this list current by removing closed work and naming specific remaining
failures. Every implementation checkpoint must include all retained sources,
tests, specifications, proofs, runners and documents in the working remote
branch migration/bend-direct-login-resumed, with local/remote SHA equality
verified. Local files or commits alone do not satisfy disk-loss preservation;
backup commits are not acceptance claims.

Current Go candidate evidence: the full package consumer passes 163 comparisons
across 28 packages; BuildContext passes 4933 comparisons (61 configuration, 2079
expression, 329 filename, 2464 header). Whole preparation and artifact consumers
pass the same 55 physical fixtures: direct 1659 requests / 3474 transitions
and artifact 1713 requests / 3528 transitions, with
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

The next agreed whole-section step with Astra is the existing physical Source →
Preparation → Post consumer across all five supported languages. It previously
loaded only Generic/Python artifacts and used Python roots (plus a TypeScript
comment case). The retained checker now loads GoArtifact and adds complete
TypeScript, Go, Bend and Rust source modes with two physical candidates, keeping
the same actual native makeResidentPreparation comparison, ordered effects,
prepared inputs, semantic identities and pre-teardown owner snapshots.
The first full Go mode reached resident result comparison and found a real
configuration transport gap: preparation-foreign omitted resolved analysis
configuration/identity from resolver context. The resulting Go fingerprint and
semantic input identity differed from native. The main foreign binding now
passes the same resolved settings fields as native graphResolutionOptions;
verification remains open. The next run stopped before fixtures because
GenericArtifact emission exceeded hard five seconds; its standalone canary also
exited 124. Diagnose this unchanged artifact's compilation cost without raising
the deadline before repeating the full resident comparison. Ordinary lint
selected and passed both changed MJS files. Existing parent append projection,
address append lookup and reference append definitions check in 2.235 seconds;
the original parent law and transaction remain open. These retained WIP sources
are backed up regardless of qualification; public adoption/TS removal remain 0/0.

The complete expanded Source consumer now passes 56 cases/6338 commands and
31 actual native makeResidentPreparation comparisons on the unchanged full set.
Go's configuration transport fix passes its physical 218-command case, including
fingerprint, semantic identity and owner snapshots. Supported TypeScript type
imports pass 132 commands. The originally added ordinary value import remains
as a native refusal case; the supported-profile scenario uses import type.
Likewise Bend's unresolved String without import Base remains a native refusal
case, while the successful supporting-file fixture imports Base explicitly.
Rust and Bend successful modes, all previous full error/Cause/cleanup modes,
full prepared inputs/effects and pre-teardown transferred ownership compare.
These fixture corrections preserve the refusal inputs and do not change product
support policy. Last two parent slot-filter definitions remain retained WIP.

Current frozen 1f932eab cadence evidence: matched warm build completed at
17:20:57.826521 UTC with 17 pairs (23/46 cached throughout), qualified inputs,
and ratio 1.117880785151437: parity failed. Execution began at
17:21:49.488758 UTC and qualified at ratio 0.89727052782812: parity passed.
Evidence lives in ignored `.test-runs/bend-migration/performance/` under the
respective start timestamps. These measurements cover existing production,
not adoption of whole preparation. The earlier 3bb097ce build/execution passes
0.9810143780417804 / 0.7674854651331289 and recorded late starts remain historical
evidence; they do not override this candidate's failed build threshold.

Source verification ownership checkpoint: six graph checks and the sole shared
fixture source moved from root verification to the graph-resolution capability's
`verification/` owner. Three attribution/worker consumers use that sole source.
Astra reviewed the owner closure; no verification helper was published as a
production export. Ordinary lint selected ten actual changed files and passed.
The import gate still fails, with 84 violations remaining (previously 97).
The first relocated Entry run caught an erroneous replacement of the ABI label
separator during path rewriting; the separator was restored, and the full repeat
passed 78 cases/55 independent native comparisons. Other relocated consumers
remain unqualified until their actual runs complete. Parent-context proof prefix
passes 4.315 seconds under hard five seconds; original parent theorem remains WIP.

Relocated graph consumer qualification: complete Entry passes 78 cases/55 native
comparisons; expansion specification passes 61/28; expansion driver passes 43/37;
Rust preparation passes all 17 physical cases after correcting generated-wrapper
Binary64/ProductValue imports to their sole source-artifacts Value owner. Its
wrappers remain at the capability root for identical relative Bend imports and
are removed after execution; results now go to ignored `.test-runs`. Ordinary
lint passes on the changed runners. The local SPEC checker first exposed an
obsolete emitted ImportGraph tag; after that mechanical fix its exact product
assertion exposes missing Go bindingFingerprint. Machine checker exposes a
specialized PrepareGo continuation which its generic driver cannot consume.
Neither failure was filtered out or weakened. They must be resolved against the
whole compiled entry before this verification group is accepted. Astra's next
coherent parent projection prefix passes hard five seconds at 2.432 seconds;
original parent_attachment_exact remains unfinished with unchanged premises.

SPEC metadata gap closed by existing owner interfaces: physical
language.prepareGraph provides optional bindingFingerprint; ForestSpecification
prepared_unit preserves that Maybe exactly and emits its ordered metadata.
The independent runner's direct tree projection now preserves the always-present
sourceDependencies field, matching native rootReviewUnit (including []). No Bend
policy, product format or law changed. Full relocated SPEC consumer passes
51 native root comparisons and 11 forest guards, with refusal/pre-frame outcomes
recorded but not independently compared. Its scope remains root/local projection,
not the whole entry lifecycle. Ordinary runner lint passes. The generic Machine
consumer still requires its real specialized command/event binding. Astra's child
address-prefix proof prefix passes at 3.085 seconds under the unchanged hard five
seconds; the original parent theorem and whole transaction remain unfinished.

Whole resident preparation verification ownership: all twelve retained runners,
oracles and mutant checker are now ordinary tracked files under resident-runtime
review-work/preparation/verification. Their sole old root copies were removed;
suite commands, source selection, imports, generated-wrapper paths and testing
matrix now refer to the capability owner. Astra approved the structural placement.
The obsolete resident-request-falsification runner was deleted: it restored a
historical server source via git show while falsely describing it as current
native code. The retained current laws/proofs, mutation checker and actual full
lifecycle consumers do not depend on that restoration mechanism.

A gate gap was found and corrected: development imports previously scanned only
auxiliary workspaces, so moving verification into production owners hid checks.
It now also scans every capability-local verification directory inside production
owners. Eleven gate tests pass, including an actual production-owner verification
file and undeclared dependency rejection; ordinary lint selected fourteen changed
files and passed. The real import gate still fails with 25 private edges after
same-owner closure repairs (the intermediate 7 result omitted moved inputs and is
not qualification). The moved whole Source consumer passes 56 cases/6338 commands/
31 native whole comparisons; the moved construction cleanup passes all 6 cases.
Remaining specialized Machine and source-owner private capability seams stay
open; production whole preparation adoption/removal remains 0/0.

Real workspace warm-up after 21f84c37 failed before compilation: UI source preflight
classified the verification runner's expansion.choose invocation as unregistered
interactive input. The same emitted Bend export is now bound as selectExpansion,
which states the domain operation explicitly; no scanner exclusion or registry
exception was added. Ordinary lint and UI preflight pass, and the real expansion
consumer repeats 61 cases/28 comparisons successfully. Warm-up is repeated only
after this focused failure reproduction/fix; the earlier failed warm-up is not
measurement qualification. The next paired start deadlines remain 17:46:50.561436
and 17:51:49.488758 UTC.

Graph service capability seam: the existing source-analysis graph-resolution
package interface now exports createGraphServiceRegistry. It is the same registry
implementation, retaining register/remove/runOutcome receipts, construction
cleanup (including absent session), exception access and pending cleanup. Its
perform operation finds an existing invocation through the existing hostNatural
conversion, calls that session and encodes the reply through the owning Nat ABI
codec. Unknown invocation throws; it never invents an unowned provider token.
Canonical still allocates invocations and owns continuation, cancellation, result
acceptance and progression. Frontend/parser helpers remain private. Astra reviewed
this interface scope; no state representation, product format or law changed.

Five resident verification consumers now use the ordinary compiled package export;
three graph request paths use registry.perform instead of importing private reply
encoding. The initial cleanup attempt hit stale dist before tests; the first
workspace compiler exposed an inaccurate host Reply return type for encoded Nat
fields. The method now declares the exact existing encoder result type, without
casting. The repeat actual workspace build passes 46/46. Actual package-export
cleanup passes 6/6; full Source passes 56 cases/6338 commands/31 native comparisons;
resident preparation passes 64 cases/14395 requests/807 post requests, including
parent cancellation, late success/rejection and cleanup. Ordinary lint passes.
Required check:fast passes 109 tests, source typing/package graph, then fails 17
remaining import violations; its final lint stage was not reached. No full quality
run or whole-production acceptance is claimed.

The frozen aeca742c build/execution measurements remain qualified but build parity
failed 1.1405082116423289 while execution passed 0.7839269033645367. Measurement
artifacts are ignored results under their start timestamps; both start deadlines
were met. They do not qualify the later graph-service candidate or whole adoption.

Astra's exact ordered appended_nodes assembly is checked under hard five seconds
(exit 0, 3.257 seconds); original parent_attachment_exact premises and conclusion
are unchanged and its body remains unfinished. This prefix is saved with the
whole service-capability WIP, not counted as whole-law or production acceptance.

The two remaining root resolver verification consumers now use the same public
Graph service registry and its encoded perform operation, including the in-flight
cancellation branch. Ordinary lint selects both changed files and passes; the
real development-import gate reports 13 remaining violations (previously 17).
No import exclusion or helper export was added. The actual owned-root run stops
before fixtures because unchanged ArtifactComposition emission exceeds hard five
seconds; its independent emission canary also exits 124. Consumer qualification
remains open and the deadline is unchanged. Astra's three retained freshness-count
proof additions remain WIP: both their prefix and the formerly passing baseline
time out at five seconds, with baseline CPU usage only 2.435 seconds. Original
parent law/premises remain unchanged; no whole-law acceptance is claimed.

At frozen 7a50681d, warm workspace build passes 46/46 (15 cached, 105.373
seconds). The matched build starts 18:07:56.401492 UTC, qualifies all 17 pairs
with 23/46 cached and unchanged inputs, but fails parity at 1.026582818174469.
Execution starts 18:16:30.103103 UTC and qualifies at 0.7518420930663802. Both
starts are timely; next start deadlines are 18:37:56.401492 and 18:46:30.103103
UTC. These measure existing production, not unadopted whole preparation.

The preparation foreign binding no longer imports fixture configuredRules or
supplies fixture settings by default. Both current verification callers pass
their previous exact settings explicitly; full Source modes retain actual job
settings. Configuration read timing is unchanged. This source change passes the complete Source consumer (56 cases, 6338
requests, 31 native comparisons) and resident preparation (64 cases, 14395
requests, 807 post requests). The remaining native oracle/fault modes and path/capture
assertions must still leave the product binding or implement the original full
provider contract before production connection; this cleanup does not adopt it.

Explicit-settings qualification: ordinary lint selected and passed
all three changed MJS files. The first selected Source protocol check passed its
21 cases but did not exercise the binding, so it is not qualification. The correct
full Source consumer stopped before fixtures when GenericArtifact emission exceeded
hard five seconds. No consumer result or timeout exemption is claimed.

With CPU10 reserved for one compiler, the same GenericArtifact standalone
emission passes in 3.024 seconds (3.011 CPU seconds). The unchanged full Source
repeat passes 56/6338/31; full resident preparation passes 64/14395/807, including
original cancellation/late reply/cleanup cases. The earlier timeout is retained
as preparation failure, not consumer rejection; hard five seconds is unchanged.
The next whole-binding step remains oracle/fault-mode extraction and the full
path/capture refusal contract; production adoption and replaced TS stay 0/0.

Native graph correspondence now belongs solely to preparation/verification's
preparation-foreign-reference wrapper. Product preparation-foreign no longer
imports or invokes native resolveGraphUnit for comparison or selects compareRoots.
The existing pre-launch onRoot observation receives exact call facts; zero-argument
observers retain their previous timing. Verification performs the unchanged native
comparison after the real capability reply and preserves the original first-refused
exception to that comparison. Ordinary lint selects four changed files and passes.
Full Source repeats 56 cases/6338 requests/31 native comparisons; resident preparation
repeats 64/14395/807 including cancellation, late responses and cleanup. Fixture fault
modes still require extraction; full path/capture refusals, universal attachment and
public production adoption remain open. Freshness-count proof prefix now passes
hard five seconds (3.532 wall, 3.094 user); original parent theorem is unfinished.

Product preparation-foreign now contains no fixture modes, root counters, native
oracle, compareRoots selection or configuredRules default. Fault stimuli belong
to its capability-local verification wrapper. first-refused preserves the original
pre-launch observer and exact captures snapshot; resize-refused performs the real
200000000-byte nativeScoped resize under the same owner lease, preserving status
and observer chronology. Ordinary lint selects both actual changed files and passes.
Full resident repeats 64/14395/807 and full Source repeats 56/6338/31. These results
qualify the extraction, not the still-open path/capture provider contract or public
adoption. Astra's exact appended node-count/shifted exclusion/parent-slot ownership
prefix passes hard five seconds in 2.775 seconds; full original parent law remains
open with unchanged premises. All retained source and proof work is backed up.

Frozen 6c390360 cadence: build starts 18:32:08.898371 UTC, qualifies all
17 pairs (23/46 cached, unchanged inputs) but fails parity 1.1255736659156603.
Execution starts 18:36:17.977722 UTC and qualifies at 0.7275642461714295. Both
starts are timely. Next deadlines: 19:02:08.898371 and 19:06:17.977722 UTC.
These qualify existing production measurements, not whole preparation adoption.

Astra reviewed the full path/capture port using existing ABI. InspectPath now
uses actual inspectNamedPath and request-time native policy precedence, preserving
normalized relative path and denial reason. Unique selection handles retain exact
admissions. CaptureSource forwards hooks/root identity/source cap, preserves throws
and returns typed SourceUnavailable diagnostics. One monotonic session capture
allocator maps exact StableCapture objects; all cache entries are registered during
snapshots, preserving cache iteration order and supporting/reused capture custody.
ResolveRoot reads current policy again; Bend retains cache/admission decisions.
Verification first-refused uses the same custody snapshot rather than invented
positional handles. Lint passes both changed files. Full existing Source passes
56/6338/31; full resident rerun and additional physical multi-candidate, dependency
as candidate, normalized-repeat, dynamic-policy and refusal/hook/cap fixtures remain
required. This retained port is not accepted production; adoption/removal stay 0/0.

Current path/capture port passes full resident preparation 64/14395/807. A new
physical dependency-then-candidate fixture uses root.py then its imported leaf.py
within one preparation invocation, compares complete native prepareObservation
output, and passes 249 requests with three selected/prepared units. This closes
that supporting-capture reuse vector; dynamic policy, normalization and exact
refusal/hooks/cap fixtures remain open. Runner lint passes actual changed source.

Additional physical path fixtures: normalized root.py/./root.py repeat passes full
native comparison (459 requests). Missing second absent.py has native incomplete
observation with exact path-observation-unavailable reason, retaining first-file
units. Full decoded result comparison passes after explicitly requiring that status;
the subsequent harness-only units projection incorrectly assumed changeSet on an
incomplete observation. Projection now follows the original discriminated union
(complete.changeSet.units or incomplete.units). Runner lint passes; the final refusal
repeat and complete expanded corpus remain unqualified until rerun. No refusal
case or full equality assertion was removed. These test sources are retained WIP.

The corrected incomplete-observation units projection passes the exact missing
second-file native comparison (233 requests). Astra's port review found missing
AbortSignal forwarding in InspectPath/CaptureSource and a policy callback receiver
mismatch. Both actual Effect operations now receive the invocation/lease signal;
policy uses native current(value) invocation without a receiver. Ordinary lint
passes. The expanded resident corpus passes 67 cases/15336 requests/807 post
requests, including dependency-as-candidate, normalized repeat and exact unavailable
path semantics. Physical betweenReads cancellation and full Source rerun after
signal changes remain open; configuration/digest read timing is a separate pending
port gap. Original guarantees and whole production adoption are not yet qualified.

Actual betweenReads cancellation now qualifies its physical port vector: the
resident consumer performs one native capture read, cancels the parent invocation
in CaptureHooks.betweenReads, and passes with no second read, cache entry, root
launch or accepted result. Existing terminal resource/FD cleanup assertions pass.
The two-request focused case and actual runner lint pass; full Source and the
expanded complete resident corpus still require repetition on the final candidate.
This closes the observed signal-forwarding failure vector, not whole adoption.

Current acbada4b full consumers qualify the path/capture regression set after
signal changes: Source passes 56 cases/6338 requests/31 native whole comparisons;
resident passes all 68 cases/15338 requests/807 post requests, including physical
betweenReads interruption and multi-candidate normalization/refusal/reuse. First
preparation attempt stopped at unchanged ArtifactComposition emission hard5; its
independent canary then passed 2.608 wall/2.205 CPU and the unchanged complete
repeat passed. The compiler deadline remains five seconds. Dynamic policy and
configuration/digest timing, original universal proofs and public Canonical
adoption/removal remain open; these finite full consumers do not close them.

Current port timing closure: ResolveRoot builds named graph options at command
time rather than eagerly spreading the context. Full Source passes 56/6338/31
on that change. Finalization now exposes lazy settings/rules/omission fields;
Astra confirms actual rules read timing and observer receiver/throw boundary.
Focused physical resident cases pass: unused throwing rules getter before resize
refusal (6 requests), and rules replaced after capture with complete native
comparison (232 requests). Actual changed-source lint passes. Full Source on
the lazy adapter stops before fixtures at GenericArtifact emission hard5; it
is unqualified and the deadline remains unchanged. Full regression, dynamic
policy, original universal proofs and production connection/deletion remain
open; whole preparation adoption/removal are still 0/0.

Frozen 5bb2a4e cadence: initial build measurement is unqualified because baseline
clean hits the owned-lock deadline. Baseline rewarm passes 46/46 (23 cached).
Unchanged repeated build starts 19:00:44.168485 UTC and qualifies 17 matched
pairs with unchanged inputs, but fails parity at 1.165256325159491. Execution
starts 19:06:40.029272 UTC, qualifies and passes parity at 0.6479680834468113;
its start misses the preceding deadline by 22.051550 seconds. Next deadlines
are build 19:30:44.168485 and execution 19:36:40.029272 UTC. These measurements
cover existing production, not unadopted whole preparation.

Organization gate now reports nine actual development-import violations, down
from fourteen: resident-runtime declares its real production source-artifacts
dependency, lockfile and generated project references match, and the unused
private native-finalization oracle import is deleted. Frozen offline Bun install
and package graph check pass. Production-to-tooling devDependencies are forbidden
by the existing graph; that attempted declaration was removed. Remaining fixture
imports need a permitted verification owner, not a graph exemption. Remaining
private root/retention edges and actual affected consumers remain required.
Astra's unchanged-law appended forest prefix checks combined slots ownership
(3.928 seconds) and exact forward/indexed preservation (3.839 seconds), both
under hard5. Full parent attachment law and whole adoption remain open.

Frozen 709f6dc1 workspace build passes 46/46 tasks (15 cached) after refreshing
the generated Turbo inputs for the added production dependency; the first
attempt correctly rejected stale task configuration before compilation. Build
measurement starts 19:20:43.645488 UTC, completes sixteen matched pairs
(23/46 cached) but the final baseline call times out at the fixed comparison
deadline. Qualification is false and no parity ratio is available. Execution
starts 19:31:10.146022 UTC, qualifies all pairs with unchanged sources/artifacts
and passes parity at 0.6730428109194586. Both starts meet the preceding cadence
deadlines. Next starts are due 19:50:43.645488 and 20:01:10.146022 UTC.

Retention verification now receives decode from its actual preparation capability
and uses it for both accepted preparation results, removing the private codec
import without exposing another stage. Two actual changed files pass lint;
retention-owned-joined-pending physical consumer is running, not yet qualified.
Whole adoption, original proofs and remaining owner/import gates stay open.

Public retention decode now qualifies retention-owned-joined-pending on actual
resident resources: 513 preparation requests and 51 post requests, including
second accepted preparation decode and terminal cleanup. The first two attempts
stop before fixtures at ArtifactComposition and then GenericArtifact emission
hard5. Separate unchanged canaries pass 4.349 seconds and 2.802 wall/2.787 CPU;
the unchanged third focused consumer passes. The five-second deadline remains.
Unused retention advicee fixture import is removed; actual changed-source lint
passes and development imports now report seven violations (three root private
edges and four tooling fixture edges). Full regression and adoption remain open.

Astra's original parent attachment prefix now proves complete appended
P.forward_nodes from parent/child facts and existing slot-owner separation;
hard5 CPU10 passes 4.329 wall/3.800 CPU. Original parent law remains unchanged
and open: semantic address alignment and replacement/frame-validity assembly
are still required.

Retention fixture identity now comes from its already-required supplied
observation.advicee, removing the tooling fixture dependency without a new
format or helper interface. Actual changed-source lint and physical
retention-owned-joined-pending pass (513 preparation/51 post requests),
including repeated accepted-result decoding and cleanup. The remaining
development-import gate must be rechecked; whole regression/adoption stay open.

Actual development-import gate after observation identity reports six violations.
The complete owned-root consumer is now relocated from root src to resident
preparation verification as artifact-owned-root-check.mjs; its private owned
driver is local and resolver is consumed through the existing public capability.
All native/cancellation fixtures remain, and preparation-consumer suite selects
the new owner path. Actual changed-file lint passes; development imports now
report five violations. First physical run stops before fixtures at GenericArtifact
emission hard5 while the separate imports gate runs. The unchanged consumer
is repeated after that gate becomes terminal; relocation remains unqualified
until this real consumer passes. No new production helper export or exclusion.

Astra's existing-list paired address-prefix no-shadow proof checks 4.781 seconds
under hard5, with original premises/law unchanged. Exact row/count transport
and full alignment remain required. Checked prefix and all owner move WIP
are retained for remote backup; whole adoption/removal remain 0/0.

Relocated artifact-owned-root-check now passes all 46 cases/2049 requests
on the new owner paths after the separate imports gate stops. Canonical
admission, split children, cancellation/retirement/refusal/throw and resource
cleanup assertions remain. This qualifies the owner move and suite route,
not whole resident preparation adoption or the original universal proofs.

Frozen f9b535ec warm build passes 46/46 tasks (15 cached), 79.88 seconds.
Matched build starts 19:43:56.413344 UTC and qualifies all seventeen pairs,
23/46 cached and unchanged HEAD/sources/artifacts, but fails parity at
1.1165650680940578. Execution starts 19:51:12.866359 UTC and qualifies
with parity 0.7465336756148849 and exact seven-fixture/two-caller preflight.
Both starts meet their preceding deadlines. Next starts are due build
20:13:56.413344 and execution 20:21:12.866359 UTC. Existing-production
execution passes; build parity and unadopted whole preparation remain open.

Astra's agreed next organization closure removes all three remaining tooling
fixture edges together: tooling assembles existing LoadedRule[]/DirectAdvicee
facts and supplies subprocess fixture data; local resident verification uses
the public rule compiler and supplied identity. This preserves the single
fixture owner, avoids serializing compiled Decision objects, reverse dependency
cycles and new production helper exports. Two composed-root private edges
remain separate; no gate exclusion or duplicate policy is permitted.

All three remaining tooling fixture edges now use the agreed subprocess data
boundary in the existing capability runner. Tooling retains bundledRules and
advicee construction; local preparation-fixtures compiles supplied raw rules
through the public compiler and clones supplied identity on each use. No
compiled Decision serialization, duplicated fixture factory or production helper
export. Actual five-source lint passes. check:fast passes prerequisites and
source typing/package graph, then fails only the two existing composed-root
private imports; overall fast gate remains red. Both full affected consumers
through the actual fixture-supplying runner still require qualification.
Astra's new aligned_append_fixed/cursor_address_lookup prefix is unqualified
WIP after hard5 timeout (5.186 wall/3.364 user/0.928 system), no verdict.
Previous checked proofs and original parent law remain unchanged.

The full fixture-boundary consumers now qualify through the actual tooling
runner: Source 56 cases/6338 requests/31 independent native whole comparisons;
resident 70 cases/15576 preparation requests/807 post requests. The initial
run exposed Source caller passing undefined identity after the earlier retention
context change; supplied rule facts and identity round-trip were independently
equal. Both Source and independent native oracle now supply fixture identity
before retention-context construction, removing late identity patching. All
retention-context callers were checked. Actual two changed-source lint passes.
The complete unchanged final repeat passes within original per-consumer120s.
All three tooling fixture import violations are closed; check:fast still fails
the two composed-root private edges, so whole quality/adoption remain open.
This full regression also qualifies request-time graph options and lazy
finalization reads across the current 56/70 case corpus; original universal
proofs, production Canonical connection and replaced TS deletion remain required.

Both final composed-root private edges are now closed by relocating the entire
consumer to resident preparation verification and using the existing public
resolver with the actual owned Canonical driver. Split/monolithic shadow
comparison, full native root units, per-Await wrong identity/correlation and
cancellation, and terminal suffix tests remain. The actual new-path runner
passes 18 cases/1425 requests/7125 fences/36 terminal suffixes and explicitly
18 Canonical accepted results, with matching provider cleanup and zero retained
resources. Split mode is always exercised; the obsolete standalone driver
import/path is deleted. Ordinary two-source lint and complete development-import
gate now pass with zero violations. The consumer suite selects five actual
consumers under unchanged120s each/360s total. check:fast repetition and whole
production wiring/deletion, original universal laws and build parity stay open.

Astra's previously unqualified aligned_append_fixed/cursor_address_lookup
prefix now checks in an isolated hard5 run (3.551 wall/3.153 CPU). Exact
projected row count transport also checks hard5 (2.818 wall/2.609 CPU).
Recursive count transport and full semantic alignment remain open under the
unchanged original parent law. All checked/WIP source remains at its owner.
