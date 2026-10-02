# Shared Monkey Business engine

**Purpose:** Explain the shared source-free simulation core and its checks.
**Status:** Maintained implementation guidance.
**Authority:** Implementation and validation evidence; #176/#179 and the accepted advice/handoff contract own behavior. Candidate laws remain proposals.
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

TypeScript supplies synthetic boundary facts and presents projections. The remaining host adapters belong to the dependent slices: permit issuance and
consumption (#186), revision/reuse routing (#187–#189), notices (#190), failed or
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

`LAWS.bend` proposes three exact primitive statements for arbitrary Nat identities,
times and finite queue tails: empty insertion retains the selected identity/time;
a take consumes exactly the head and preserves its tail; NeverSent emits exactly
one unstarted settlement. These statements do not prove full-resident safety,
unbounded progress or host authenticity. Owner review determines acceptance.

Run `node packages/monkey-business-bend/verify-proposals.mjs` for literal
falsification, the general proofs through the kernel verdict, and three false
mutants. Every checker invocation has a five-second deadline. Each selected
mutant must fail in its own law's proof section; a shared-helper failure is not
accepted as law-specific sensitivity. The checker confirms these proposed
statements; executable native/JavaScript checks independently validate their ABI.
