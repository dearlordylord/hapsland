# Shared Monkey Business engine and runner

**Purpose:** Explain the shared source-free simulation core and its checks.
**Audience:** Contributors, including coding agents maintaining this package and its consumers.
**Status:** Maintained implementation guidance.
**Authority:** Implementation and validation evidence; #176/#179/#180, [#234](https://github.com/dearlordylord/hapsland/issues/234), and the accepted advice/handoff contract own behavior. Candidate laws remain proposals.
**Expected use:** Extend the common scenario driver or validate its JavaScript/native boundary.
**Lifecycle:** Update with state, driver, ABI or check changes; review when runner ownership changes or a candidate law receives an owner decision.

Generation and optional native/proof checks require the same exact **Bend 2.0.36**
compiler declared by `packages/agent-flow-bend/package.json`. Install it with
`node scripts/install-bend-toolchain.mjs` and add the printed Bend/Lean directories
to `PATH`. The Engine receipt records the compiler version; older artifacts cannot
be reused across compiler versions. For native checks, put the system C compiler directory before the Lean directory
in `PATH` (for example, Bend/bin, the working clang directory, then Lean/bin). The Lean
installation also contains a clang executable intended for its own toolchain.

[`NativeRun.bend`](NativeRun.bend) owns the complete event → command → scheduled-result
loop used by the public TypeScript `Run` and native/game consumers. It combines
Canonical and bounded ImportGraph transitions with virtual-time queue takes,
metadata, generated sessions, captured callbacks, controls, Stop, sharing,
collectors, writers, notices, expiry and quiet normalization. `Engine.bend` and
the scenario modules provide its reducer and scheduling operations.
`NativeRunControls.bend` applies validated factual controls, and
`NativeGenerated.bend` interns generated evaluation/freshness identities.

The emitted [`RunExports.bend`](RunExports.bend) boundary exposes the same runner.
TypeScript's [`NativeRunHost`](../monkey-business/src/native-run-host.ts) encodes
facts and decodes immutable observations. The public [`Run`](../monkey-business/src/index.ts)
keeps replay action/checkpoint ordering and delivers subscriptions synchronously.
The runner yields physical callback deliveries before their logical events.
The host notifies structural listeners at that checkpoint, then asks the runner
whether to resume. Listener controls therefore affect the pending logical event;
replay can stop at the physical checkpoint without another queue take or product
observation. Bend supplies resumable advance decisions and
normalization rather than a separate TypeScript scheduling policy.

Run `node packages/monkey-business-bend/build.mjs` from the repository root to
regenerate the compiler-emitted JavaScript module. `--check` rejects stale core,
transitively imported production policy, declaration, build wrapper or module
content. Run `node packages/monkey-business-bend/build-run.mjs` to regenerate
the common runner boundary, and use its `--check` mode to verify the runner's
transitive Bend sources, declaration, host adapters and emitted module.
The wrapper follows the production immediate-Nat ABI: exact u48 Nats,
u47 bytes and explicit U32 probability words. It threads original trusted states
without copying the entire graph at each queue operation. No handwritten policy
is substituted for compiler output. The common runner artifact's source digest is the ordinary replay's logic
identity; incompatible recorded identities are refused in format 1.

`npx vitest run packages/monkey-business/src/complete-minimal-path.test.ts --maxWorkers=1`
checks literal expectations for graph progress, finding/clear results, request
lifecycle, final authorization refusals, exact clocks and ordinary replay. Its
native fixture starts with original source-free edit/configuration/control
facts, uses the shared driver/scheduler, and compares ordered intermediate events,
categorized canonical outputs, graph commands, identities, relevant effect facts and graph accounting with the public
Run API. These checks are deterministic, finite and offline. They establish
selected execution-lane agreement, not correctness of the compiler or native
agent integration.

The sharing original-input gate is
`npm run test:focused -- packages/monkey-business/src/sharing-native.test.ts`.
It requires all seven original cases: baseline, joined departure, owner departure,
another partition, last-member departure, joining live advice, and a superseded
joined member. Every case starts with its original configuration and edits;
native and emitted JavaScript retain the full typed owner envelope, then compare
Canonical/Graph events, states, canonical outputs, graph commands, rejection, scopes, receipts, controls,
advance endpoints and ordinary replay with the independent public scenarios.
The mandatory aggregate `conformance/sharing-native.bend` compiles once per
backend and retains all seven original envelopes in order. Callback originals
similarly use `conformance/callback-original-scenarios.bend` for all six cases. These aggregate families explicitly allow C emission60, clang90, native execution15,
and separate fresh JavaScript emission30/execution5 seconds, with a 215-second
watchdog. Other fixtures retain their default bounds.
An earlier checker pass does not establish any of those execution results.

## Stop observation scope

The agreed Stop fixture projection is a bounded `BusinessState` containing
`Canonical.State` and the relevant `StopScenario.Finish` records. Its
implementation captures ordered facts from actual transitions; the observation
layer does not implement a second Stop policy. It does not recursively serialize
the private Stop-driver `Runtime`, full `Types.State`, or `Driver.Context` trees
merely to compare execution lanes.

The original eleven Stop roots and twelve output Stop roots retain their exact
input declarations, including the original waiting inputs and boundary controls.
Keep ordered intermediate events and outputs, relevant identities and scopes,
effects, membership and continuation facts, independent expectations, and the
ordinary public replay. Native and emitted JavaScript must still produce equal
complete encodings: equality covers every field and word in the replacement
projection. Public behavior is asserted independently from those encoded
vectors.

This is an observation-representation change, not a production policy, ABI, or
law change. The existing production immediate-Nat engine ABI remains its own
owner, and candidate `StopScenarioLAWS.bend` statements remain proposals. A
smaller projection does not establish lower native compilation cost or qualify
the new source. Report a Stop lane as passed only after its exact changed-source
checks and complete native/JavaScript comparison finish successfully.


## Other observed family owners

Expiry's twelve original cases use `expiry-observed-native.bend` and the
`expiry_scenarios` family. `expiry-observed-wire.BusinessState` and `Snapshot`
carry actual Canonical accounting, notice state/clocks, collection and Stop
ownership, lifecycle facts, pending business actions and physical receipts.
The exported `PublicTrace` replaces recursive private runtime serialization;
`compareExpiryBusinessTrace` compares those facts with the independent public
controls, boundaries and ordinary replay. Native and emitted JavaScript still
compare every word of the complete encoding.

Writer's thirteen original cases use one `writer-original-scenarios.bend`
fixture and one `writer_scenarios` vector. `writer-native.test.ts` checks every
configuration and independent public expectation, with fresh native/JavaScript
whole-vector equality and public/replay comparison for all thirteen entries.
Compilation runs once per backend for the family, rather than once per case.

Python 3 and the pinned `bend-format` 0.1.19 are development prerequisites for
the one shared private prefix codec. The generator uses the formatter's PATH
executable or the `BEND_FORMAT_BIN`, `BEND_FORMAT_JAR` and `BEND_FORMAT_JAVA`
selection described in the testing matrix, so generated Bend conforms before
its source identity is captured.
Run `python3 packages/monkey-business-bend/conformance/generate-callback-native-prefix.py`
after changing a serialized owner declaration, and add `--check` to reject stale
typed encoders, descriptors or owner source hashes. The six original callback
cases retain their default envelope and assertions. Sharing extends the same
generator and descriptor decoder; it does not maintain a copied schema or policy.
For the optional game profile, use the same command with
`--optional-profile prototypes/canonical-defense/native-prefix-profile.json`;
add `--check` for freshness without generation.

`LAWS.bend` proposes four exact primitive statements for arbitrary Nat identities,
times and finite queue tails: empty insertion retains the selected identity/time;
a take consumes exactly the head and preserves its tail; NeverSent emits exactly
one unstarted settlement; duration controls preserve the stream and emit no arrival.
These statements do not prove full-resident safety,
unbounded progress or host authenticity. Owner review determines acceptance.

Run `node packages/monkey-business-bend/verify-proposals.mjs` for literal
falsification, the general proofs through the kernel verdict, and four false
mutants. Every checker invocation has a five-second deadline. Each selected
mutant must fail in its own law's proof section; a shared-helper failure is not
accepted as law-specific sensitivity. The checker confirms these proposed
statements; executable native/JavaScript checks independently validate their ABI.

The #180 workload owner stores each advicee's Session settings/stream and future
PRE duration alongside the actual business state. Next/task/finish/advice,
pace, bursts, sizes and suspension all execute in `Workload.bend`. Suspension
invalidates recurring arrivals only; issued finite work, repairs and bursts keep
their committed facts. `PermitScenario.bend` owns captured PRE facts through
`permit_issue`, `permit_issued` and `permit_consumed`, preserving the original
clock, duration, permit deadline and early/equality/late POST schedule between
the public host and native scenarios. The scheduler owns absolute time;
metadata-only task transitions can advance it without another business frame.

`Random.bend` owns u48 root-seed folding, named outcome/fault streams and outcome
selection. Each workload has its own Session stream; preparation retains its
captured per-artifact stream, independent of outcome draws. The named fault stream
is separate from outcome draws; the maintained public fault controls and seeded
campaigns exercise their named original identities without introducing another
outcome selector. Explicit outcomes consume no weighted-outcome draw.
`Numeric.bend` implements the **sampler's positive finite binary64 domain**:
weights in [0,100], totals up to 600, and normalized ratios in [0,1]. Host codecs
encode raw IEEE64 words; total, normalization, cumulative rounding and draw
comparison execute in Bend. Two base-2^28 limbs, bounded 55-bit division and
nearest-even guard/round/sticky handling preserve fractional and subnormal
weights. Infinity, NaN, signed arithmetic and general binary64 overflow are
outside this helper's domain. It is not a general floating-point library.

The duration-control candidate law universally quantifies over arbitrary
partition, settings, Session stream, old optional duration and new Nat duration.
It states that only the future duration field changes and no arrival is emitted;
it does not prove permit admission or whole-driver progress. Like the earlier
three candidates it remains unapproved. Its literal and profile-discarding mutant
are checked by the existing bounded proposal runner.

`Session.bend` is the sole shared workload scheduler in this core. Native game
consumers import that source directly; `session.mjs` delegates its standalone
projection to this same generated engine. Regenerate the projection with
`node packages/monkey-business-bend/build-session.mjs`; check seeded native/JS
projection agreement with `node packages/monkey-business-bend/verify-session-native.mjs`.
`SessionLaws.bend` retains the proposed, unapproved scheduler laws. Relative
session delays remain U32 while counters and byte facts preserve the u48 domain.


The #181/#183/#184 composition adds `Advicees` and `AdviceeScope` for opaque
registration and retained-identity attribution; `JevEffects`, `FaultTargets` and
`CredentialFacts` for exact request intervention and frozen issuance authority;
and `TreeFacts`/`PreparationScenario` for generated preparation through actual
ImportGraph commands. `AdmissionAttempts` owns pending round-opening facts and
`PendingEffects` coalesces internally issued retirement batches. Rejected product
facts preserve this provenance; external duplicate callbacks are never filtered by
that internal mechanism. `Engine.issue_actions` publishes the changed engine state
and the permitted simulated actions together.

The coalescing proposal quantifies over every pending Nat list, operation Nat and
internal Driver action list, assuming the supplied already-pending flag is true.
It proves that no second action batch is published and that the pending list is
unchanged. It does not prove the correctness of caller identity lookup or general
recovery. The bounded proposal runner checks a literal, the kernel verdict, and a
mutant that republishes the batch; the mutant fails in the proposal's own section.
This and the started-request NeverSent refusal law remain candidate proposals for
owner review under #176, not accepted new product requirements.

Native validation budgets: fresh C emission and external clang compilation default to 30 seconds; emitted-JavaScript compilation, including the maintained Engine build, and source-only checks are bounded at 15 seconds. Native and JavaScript execution remain bounded at 5 seconds. Kernel/proof checks retain their separate 5-second deadline. A default fresh native/JavaScript comparison has a 100-second aggregate test watchdog for its 85 seconds of phase allowances and finite cleanup. The waiting fixture, original eleven Stop scenarios and twelve output Stop scenarios explicitly allow C emission 45 seconds, clang 90 seconds, native execution 5 seconds, and independent JavaScript emission 15/execution 5 seconds, with 175 seconds overall (160 seconds of phases plus 15 seconds cleanup). The twelve expiry cases use 60/90/5/15/5-second phase bounds and a 190-second aggregate. The thirteen-case Writer family uses C emission 90 seconds, clang 120 seconds, native execution 15 seconds and JavaScript emission 30/execution 5 seconds, with 275 seconds overall (260 seconds of phases plus 15 seconds cleanup). Other fixtures retain their default bounds. The fixed native preflight manifest rejects a nondefault compilation override. These allowances bound local validation processes; they do not change product deadlines, virtual clocks, original scenario inputs or assertions.

On 2026-10-03 the user authorized modest timeout increases and asked to be informed. Earlier C-only amendments moved the bound from 5 to 8, 10 and 12 seconds; the full diagnostic root had emitted in 10.75 seconds after its call-size errors were resolved. The later announced amendment sets source/JS compilation to 15 seconds and C/clang compilation to 30 seconds, preserving runtime and proof bounds. Previous failures remain failures; fresh validation under the amended allowances is required. This explicit user authorization overrides the skill's five-second source-check guidance for source-only validation, not the retained kernel/proof gate.
