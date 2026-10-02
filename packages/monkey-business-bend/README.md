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
their committed facts. `pre_issue` and `permit_actions` share the captured PRE
clock, duration, original permit deadline and early/equality/late POST schedule
between the public host and native scenarios. The scheduler owns absolute time;
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

The sole `session-bend/Session.bend` implementation remains an imported dependency
until #199 transfers `DefenseAuto.bend` and the retained `RoadAuto.bend` consumer.
`session.mjs` is now a thin projection bridge to this generated engine, not a
second emitted scheduler. That transfer permits relocating the source and
removing the remaining package; preserve these game imports until then.
