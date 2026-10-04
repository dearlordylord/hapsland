# Shared Monkey Business engine

**Purpose:** Explain the shared source-free simulation core and its checks.
**Status:** Maintained implementation guidance.
**Authority:** Implementation and validation evidence; #176/#179/#180 and the accepted advice/handoff contract own behavior. Candidate laws remain proposals.
**Expected use:** Extend the common scenario driver or validate its JavaScript/native boundary.
**Lifecycle:** Update with state, driver, ABI or check changes; review when a dependent scenario replaces remaining host orchestration or a candidate law receives an owner decision.

`Engine.bend` composes the actual Canonical and bounded ImportGraph reducers.
`Types.bend` owns their state and the scheduler. `Scheduler.bend` selects finite
virtual-time work by exact Nat time and insertion order. The host keeps validated
source-free facts keyed by those identities, rather than selecting queue order.
`Preparation.bend` owns artifact graph state and ordinal validation.
`Driver.bend` interprets the complete base edit/review/output path, generates
valid Jev lifecycle facts, fences generated callbacks against current facts,
revalidates findings after environment controls, and schedules certain output.
Basic retained-finding expiry is already scheduled by this shared driver.
`Postprocess.bend` generates parent-observation completion, physical dispatch
release and collection-readiness facts from actual reducer state.

TypeScript supplies synthetic boundary facts and presents projections. The remaining host adapters belong to the dependent slices: expanded permit admission and
round routing (#186), revision/reuse routing (#187–#189), notices (#190), failed or
uncertain output and lease expiry (#191), response-authority/collector profiles
(#192–#193), Stop and continuation orchestration (#194–#195), expanded finding/notice
retention and exact collection-boundary profiles (#196), and quiet cleanup (#197). They still use this same state owner and
scheduler. Continuous Session/outcome generation is integrated by #180. The optional game is not a dependency.

Run `node packages/monkey-business-bend/build.mjs` from the repository root to
regenerate the compiler-emitted JavaScript module. `--check` rejects stale core,
transitively imported production policy, declaration, build wrapper or module
content. The wrapper follows the production immediate-Nat ABI: exact u48 Nats,
u47 bytes and explicit U32 probability words. It threads original trusted states
without copying the entire graph at each queue operation. No handwritten policy
is substituted for compiler output. The source digest is the ordinary replay's
logic identity; incompatible recorded identities are refused in format 1.

`npx vitest run packages/monkey-business/src/complete-minimal-path.test.ts --maxWorkers=1`
checks literal expectations for graph progress, finding/clear results, request
lifecycle, final authorization refusals, exact clocks and ordinary replay. Its
native fixture starts with original source-free edit/configuration/control
facts, uses the shared driver/scheduler, and compares ordered intermediate events,
commands, identities, relevant effect facts and graph accounting with the public
Run API. These checks are deterministic, finite and offline. They establish
selected execution-lane agreement, not correctness of the compiler or native
agent integration.

The sharing original-input gate is
`npx vitest run packages/monkey-business/src/sharing-native.test.ts --maxWorkers=1`.
It requires all seven finite roots: baseline, joined departure, owner departure,
another partition, last-member departure, joining live advice, and a superseded
joined member. Every root starts with its original configuration and edits;
native and emitted JavaScript retain the full typed owner envelope, then compare
Canonical/Graph events, states, commands, rejection, scopes, receipts, controls,
advance endpoints and ordinary replay with the independent public scenarios.
The aggregate `conformance/sharing-native.bend` remains a convenience entrypoint;
the mandatory gate runs each original separately. Native phases retain fresh
thirty-second C emission, thirty-second clang and five-second execution bounds;
emitted JavaScript uses separate fresh fifteen-second emission and five-second execution phases.
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
Keep ordered intermediate events and commands, relevant identities and scopes,
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

Python 3 is a development prerequisite for the one shared private prefix codec.
Run `python3 packages/monkey-business-bend/conformance/generate-callback-native-prefix.py`
after changing a serialized owner declaration, and add `--check` to reject stale
typed encoders, descriptors or owner source hashes. The original six callback
roots retain their default envelope and assertions. Sharing extends the same
generator and descriptor decoder; it does not maintain a copied schema or policy.

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
is reserved independently for the later injected-fault slice; this slice does not
invent an injection API. Explicit outcomes consume no weighted-outcome draw.
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

Native validation budgets: fresh C emission and external clang compilation default to 30 seconds; emitted-JavaScript compilation, including the maintained Engine build, and source-only checks are bounded at 15 seconds. Native and JavaScript execution remain bounded at 5 seconds. Kernel/proof checks retain their separate 5-second deadline. A default fresh native/JavaScript comparison has a 100-second aggregate test watchdog for its 85 seconds of phase allowances and finite cleanup. The waiting fixture, original eleven Stop scenarios and twelve output Stop scenarios explicitly allow C emission 45 seconds, clang 90 seconds, native execution 5 seconds, and independent JavaScript emission 15/execution 5 seconds, with 175 seconds overall (160 seconds of phases plus 15 seconds cleanup). Other fixtures retain their default bounds. The fixed native preflight manifest rejects a nondefault compilation override. These allowances bound local validation processes; they do not change product deadlines, virtual clocks, original scenario inputs or assertions.

On 2026-10-03 the user authorized modest timeout increases and asked to be informed. Earlier C-only amendments moved the bound from 5 to 8, 10 and 12 seconds; the full diagnostic root had emitted in 10.75 seconds after its call-size errors were resolved. The later announced amendment sets source/JS compilation to 15 seconds and C/clang compilation to 30 seconds, preserving runtime and proof bounds. Previous failures remain failures; fresh validation under the amended allowances is required. This explicit user authorization overrides the skill's five-second source-check guidance for source-only validation, not the retained kernel/proof gate.
