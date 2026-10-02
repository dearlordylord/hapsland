# monkey-business

**Purpose:** Explain the supported source-free deterministic simulator API.
**Status:** Maintained package guidance.
**Authority:** Implementation guidance and validation scope; issues #152–#157 own requirements, and accepted Hapsland contracts own product behavior.
**Expected use:** Run headless experiments or consume checked frames in a dashboard.
**Lifecycle:** Keep current with public API and tests; review whenever supported simulation boundaries or replay identity change.

```ts
import { createRun, replayRun } from './src/index.ts';
const run = createRun({ seed: 42 });
run.subscribe(frame => console.log(frame.time, frame.event.kind));
run.advance({ maxEvents: 100 });
const replay = replayRun(run.exportReplay());
while (replay.step()) {}
```

Run `node --experimental-strip-types packages/monkey-business/src/example.ts` from the repository root. Run `npm run typecheck --prefix packages/monkey-business` and `npx vitest run packages/monkey-business/src` for package checks. The core has no UI dependency, credentials, private source, real transport or wall-clock timers.

Preparation generates a seeded source-free import tree for every synthetic
review artifact. `fileTrees` configures candidate file count, branching, depth,
path permissions and source/evidence byte ranges. The defaults generate 3–8
files, up to 3 imports per file, depth up to 3 (root depth 0), 15% denied import
targets, 512–4096 source bytes and 256–2048 evidence bytes per file. The root is
always allowed. Requested file counts must fit branching/depth capacity;
invalid or reversed ranges fail validation. The bounded generator permits
pressure inputs above the checked graph caps, without changing those caps.

Each artifact has a dedicated stream derived from the run seed, preparation
operation and artifact index. It does not consume Jev outcome draws. Native
facts respond to compiled ImportGraph commands until checked completion or
incompleteness; generated shape does not bypass permission or budget decisions.
`Observation.event.kind === "preparationGraph"` identifies an inner step;
`preparation` contains its checked graph before/after projections and command.
Canonical before/after projections stay unchanged at those steps. Generated
metadata names candidate files and depth; the graph displays reached files.
All graph steps fit within the declared preparation interval, including
zero-delay intervals. `{kind:"fileTrees",profile}` atomically changes future
preparations; already started preparations retain their captured facts.
Configuration and recorded controls reproduce exact replay, including endpoints
inside preparation. Replay format stays at 1 and requires `preparationIdentity`
covering the import reducer, composition and tree generator.

`fileTrees` also accepts optional `missingPercent`, `unreadablePercent`,
`repeatedEdgePercent`, and `cyclicEdgePercent` (integer percentages), plus
`deadlineStep` (0 disables; otherwise the fact index at which a synthetic native
`deadlineReached` fact is supplied). Missing resolution and unreadable capture
follow checked skip commands. Repeated and cyclic edges terminate without
recapturing visited targets. Omitted fields preserve the original tree stream.
`localWork` optionally supplies a nonnegative synthetic analysis-work count per
capture. Source and tree ranges can supply exact inclusive caps and the adjacent byte;
`maxImports` permits pressure profiles up to the adapter bound of 128 edges;
checked Bend determines acceptance against its lower active cap. These are synthetic facts, not measured
filesystem failures or elapsed native deadlines.

`unitBytes` remains a separate synthetic native result, not a derived or measured
encoding size. The graph does not execute source parsing or rule selection.
The accepted [per-rule evidence contract](../../docs/type-function-review-proposal.md#branch-contracts)
allows incomplete graphs when omitted evidence is irrelevant to a selected rule.
A terminal graph reason therefore cannot alone determine whether supplied review
units exist. The simulator lacks rule capability/requirement facts and keeps this
boundary separate; coupling would require those source-free facts and the existing
checked rule decision, rather than treating every incomplete graph as unusable.

`createRun()` initializes one scripted synthetic edit and finish attempt; the sampled review outcome determines whether advice exists. `inputs` accepts timed `{kind:"canonical",at,event}` facts, synthetic `edit` inputs with preparation reservation `bytes`, `unitBytes`, optional injected Jev `outcome`, and `finish` attempts. `session` enables one ongoing seeded workload; `sessions` enables independent generators feeding one resident state. The two configuration fields are mutually exclusive. Configuration `limits` uses the checked canonical ledger fields; `preparationDelay` and `jevDelay` set integer synthetic durations. These illustrative defaults are not empirical usage measurements.

`step()` processes the next checked canonical or inner preparation transition, following workload metadata as necessary. `advance({untilTime,maxEvents})` advances the same ongoing run and returns `timeLimit`, `eventLimit` or `idle`, the number of canonical events and current virtual time. A bound never invents a finish attempt or closes a round. Time is one nonnegative integer clock; equal-time scheduled items follow insertion order, including effects added by transitions. Time bounds do not force the clock to a boundary with no activity. Driver playback speed and pauses do not enter the core.

`applyControl` validates built-in controls at a step boundary and records their time, canonical-event boundary and a shared sequence across controls and explicitly scheduled inputs. Edit pace and arrival suspension replace obsolete recurring arrivals; finite bursts and delayed repairs survive changes. `jevProfile` changes new requests; requests already scheduled keep their due time. Replay stores initial config/inputs, seed, random algorithms, outcome-stream identity and ordered distribution, consumed Bend source identity, explicit outcomes and the complete control timeline. `replayRun` reconstructs initial state and rejects incompatible identities; it does not hydrate opaque Bend state. Exported replay is input-oriented: advance the reconstructed run to the desired boundary.

Every observation has ordered `event`, `commands`, checked canonical `before`/`after` projections, optional product `rejection`, integer `time`, `sequence` and separate synthetic `effects`. Frames are compatible with the UI-independent semantic flow projection. Bend owns product decisions. The environment follows preparation, unit, Jev and submission identities; identity mismatches and missing required preparation inputs fail explicitly. Ordinary capacity or product refusals remain observations. Canonical facts supplied directly must correctly describe the synthetic scenario; this interface is not a native-host security boundary.

`subscribe` streams frames. Default retention keeps the last 1,000 observations; `retention:0` streams without history. Retention never changes outcomes or replay availability. Replay inputs and controls remain in memory for export and grow with explicitly scheduled inputs and controls. The internal workload generator retains its configuration rather than an unlimited generated trace. Consumers control their rendered history.

Size facts distinguish source bytes, evidence-tree bytes, preparation reservation bytes, review-unit bytes and encoded output bytes. `sizePreparationInput` maps only reservation/review-unit facts into canonical inputs. `runSizeGraph` separately runs supplied source-free graph events through the checked import-graph adapter and emits identified `model:'import-graph'` frames with replayable events/limits. Its tests cover exact source boundary, tree overflow, exclusion without a read, and deadline incompleteness. Reservation experiments alone do not validate capture or import traversal. Encoded output facts require an explicit `collectionFitCheck`; generated submission does not model actual serialization size.

Coverage excludes actual filesystem measurement, native capture, runtime hooks, real Jev, semantic repair quality and complete resident execution. The synthetic environment covers supported adapters, not empirical performance or a new proof of all product logic. Revisit native gaps at an explicitly bounded validation milestone or when an applicable deterministic adapter becomes available. The dashboard owns presentation and playback; graph observations remain separate from canonical frames.

A multi-agent example is `createRun({seed:7,sessions:[{agent:"alpha",seed:11},{agent:"beta",seed:29}]})`.
Each generator owns its variation, task/repair feedback and finish state, but all
inputs enter one virtual clock, queue and compiled canonical state. `agentScopes`
reports stable agent/partition/seed bindings; observations include `agent` and
`partition` metadata while their `before`/`after` remain complete resident snapshots.
Global capacity and the eight Jev request permits are shared across partitions.
A full permit pool supplies checked `jevRequestUnavailable`; it does not start
another request or automatically retry the denied unit. Later fresh work may
acquire released permits. Preparation dispatch has a separate eight-job bound.

Generator controls (`editPace`, `burst`, `sizes`, `suspendArrivals`) can carry
`agent` to target one generator. Without a target they apply to all generators.
Backend, environment, output and tree profiles are resident-wide and reject an
agent target. The version-one replay records the entire resident's generators,
controls, shared state history and endpoint. `projectAgent(snapshot, partition)`
filters checked records for one diagram plane, preserving shared global totals
and execution limits; it is a presentation lens, not a separate resident state.
Records without an ownership binding are omitted from that local lens.

An ongoing example is `createRun({seed:7,session:{editIntervalMs:100,variationMs:15,editsPerTask:5,taskPauseMs:500,adviceResponse:'delayedRepair',repairDelayMs:300}})`. Advance to a finite boundary, suspend arrivals with `{kind:'suspendArrivals',suspended:true}`, drain finite effects, then resume with `suspended:false`. Suspension emits no Stop and preserves started effects, bursts and repairs. Advice responses are `ignore`, `noAction`, `promptRepair` and `delayedRepair`; attempted repair carries a changed synthetic revision, and its Jev outcome remains a separate supplied fact. Session submissions use the background surface. `workload` metadata exposes revision and repair identity on preparation frames. Size changes affect newly generated arrivals; already scheduled arrival facts remain fixed.

Replay exports `endpoint:{eventCount,now}` for consumers that want to restore the recorded viewing boundary. `restoreReplay(replay)` reconstructs that exact viewing boundary, including metadata-only clock advancement and controls applied there, without emitting another canonical transition. `replayRun` continues to reconstruct initial inputs for independent stepping. Bounded `advance` still stops at its declared canonical-event limit; it does not restore later metadata automatically.

Synthetic edits use issued observation identities through admission, source start and observed preparation, so retained findings remain available to checked finish selection. A synthetic finish attempt owns a virtual `finishDeadline` (default 200). `waitForWork` suspends the task generator; relevant effect/output completion wakes the same attempt, while the deadline polls with its integer clock fact. `finishReady` supplies a checked finish reservation. Unsubmitted retained findings use Stop leases, submission authorization, acknowledged output and checked continuation consumption. Allowance ends Stop and retires the round before the next task. Continuation ends the output attempt and resumes the current round; later fresh work uses existing admission. A refusal grants no finish permission and remains an observed product outcome. Explicit canonical fixtures do not automatically acquire this synthetic finish driver.

Retained advice has a finite synthetic expiry clock. `adviceLifetime` defaults to the resident's 600,000 ms pending-advice lifetime and must be positive; shorter values support bounded retention experiments. At expiry equality the environment supplies `collectionExpiryCheck`, then follows `collectionExpired` with `collectionRetireAdvice`, `submissionForget` and, when the finding still exists, `retireReview`. This removes checked ready advice, submission suppression records, pending work and its charge. Suspended arrivals drain these finite timers too, so draining can advance virtual time by ten minutes. Expiry is scheduled proactively; the native resident checks elapsed age during collection/lifecycle operations. Successful composed submission remains retained during its open round and is suppressed at Stop. When an allow-finish closes that round, the synthetic environment mirrors resident `#closeRound`: retire its advice, forget submission records, release pending findings, then retire the partition. Continuations retain the open round. Round closure cancels obsolete advice expiry timers. Retention is therefore distinct from undelivered backlog. The accepted [handoff contract](../../docs/advicing-target-contract.md#handoff-reoffer-and-continuation-count) permits revalidation/reoffer only for uncertain output; the current generated workload supplies certain output exclusively.

The environment follows issued source admission, checked preparation and review dispatch through available slots, preparation completion/refusal, Jev request issuance/settlement, finding retention, final-candidate and suppression checks, submission reservation/authorization, finish waits/reservations/acknowledgement/continuation, and cancellation observations. Preparation and Jev requests each retain their checked eight-job execution limits. Failed/unavailable request admission ends that unit; a subsequent fresh synthetic edit can reattempt after credentials/capacity recover. There is no invented same-request retry policy. Synthetic `neverSent` settlements omit request start; `interrupted` settlements follow start and a recorded interruption. Every accepted settlement releases its request slot. Bounded recovery tests cover two failure/finding cycles for each failure outcome across three seeds: with ongoing edits, current/readable work, available credentials/capacity, finite request delay and certain output, findings must reach retained advice, ready collection and recorded submission within 2,000 virtual ms. Suspended sessions must drain request/dispatch slots, and exact replay must preserve the endpoint. These are executable bounded liveness checks under those assumptions, not a proof for arbitrary schedules. Decision/refusal/query commands remain observations; direct canonical fixtures can exercise other checked boundaries without acquiring native adapters automatically.

`environment` configuration and `{kind:'environment',currentWork,credentialReady,credentialGeneration?,sourceReadable?}` controls supply synthetic native facts. `credentialReady:false` models temporary authorization unavailability: retained advice can pass revalidation after recovery. `credentialGeneration` defaults to 1; changing it invalidates advice from an earlier generation. `currentWork:false` supplies staleness at generated request settlement and final handoff. `sourceReadable:false` supplies changed/unreadable final source freshness and retires that candidate. These controls apply to generated boundary checks, including queued final checks; explicitly supplied canonical fixture facts remain unchanged. The source fact is an assumed outcome of native validation, not filesystem capture or semantic repair validation. Root/configuration validity and physical native transport availability remain assumed. Restoring environment facts schedules another checked eligibility attempt for retained advice; accepted suppression prevents repeated successful output.

`outputProfile` configuration and `{kind:'outputProfile',outcome,delayMs,leaseMs}` controls set new output attempts. `outcome` is `certain`, `uncertain`, or `failed`; failure is a known preauthorization failure and releases its provisional reservation without a submission claim. Profile timing is captured at authorization. An attempt whose output delay reaches its lease lifetime supplies checked submission expiry and records uncertainty; the original delayed callback still occurs at its original due time as a checked expired acknowledgment, without authorizing a stale writer. Stop revalidates candidate source/credentials and checked suppression before reservation: uncertain background output can be reoffered once in its active round with the existing advice identity and no additional Jev call. Uncertain Stop output consumes that reoffer. Later fresh edits continue independently. These virtual host-output/lease facts model the accepted outcomes; no IPC writer, partial byte stream or model-visible acknowledgment is executed.

`lifecycles` enables additional checked generated orchestration. `permits` takes
`adviceeLimit`, `residentLimit`, optional `holdMs`, `lifetimeMs` and terminal
`consume`, `release` or `expire`. Prospective invocations acquire a checked permit
before synthetic admission; late invocations expire and release capacity, while
consumption at the inclusive deadline remains valid. `collectors` takes
`capacity` and optional `lifetimeMs`; generated background candidates acquire
resident writer claims and follow checked release/expiry. Shared limits are
resident-wide across agent partitions.

`reuse` takes `entryLimit` and `byteLimit`. Explicit edits may supply one exact
`evaluationInputs` identity per review unit plus `revisionSubject` and
`revisionInput`. Configured sessions generate paired identical and changed
source-free fixtures: prepared identities include unit bytes, fixed synthetic
rules, fixture, seed and captured tree profile. Paired graph facts use the same
fixture stream while retaining each emission's operation scope. Identities are
partition-scoped. Checked pending joins and cache hits avoid additional Jev
calls; findings still pass retention and collection. These generated routes
supply `liveAdvice:false`; joining an already-live advice record through
`reuseJoinAdvice` is not orchestrated by this fixture driver. Changed revisions fence
late owner and reused-member outcomes. Checked cache evictions release the
stored-result reservation through the common ledger. A fulfilled native result
remains available to pending/claimed joiners until checked ownership release;
unavailable owner results terminate joined work as well. Bounded two-agent timing
tests cover suspension draining work/dispatch/requests/reuse claims and exact
replay, including the default 1,000-frame retention. Explicit identity facts
are assumed native observations, not a validation of real source equivalence.

`quietWindowMs` enables inactivity ticks and checked round retirement after work
and ownership settle. Quiet closure requires active checked admission; configure
prospective permits alongside it for generated sessions. `encodedOutputBytes` supplies synthetic candidate bytes
for checked fit before lease/reservation and submission. `cancellation` defaults
to `lateCallback`, preserving the stale-result callback scenario; `suppressed`
supplies a cancellation terminal disposition and releases dispatch/request
ownership without executing the original result callback. Neither option executes
native cancellation. Duplicate settled callbacks still fail the environment
identity guard rather than establishing native duplicate-callback behavior.

`resourceScenarios` selects source-free notice and output-fit fixtures in
the same resident queue. `notices:true` supplies failure-count/cooldown/lease/registry-pressure
facts and follows checked storage reservation/release; it does not turn every
Jev failure into native notice output. `outputFit:true` exercises the exact
10,240-byte and oversized 10,241-byte fit boundaries and supplies a default
512-byte synthetic candidate for generated advice handoffs. `outputBytes`
overrides that candidate size. These selectable
fixtures and generated handoff tests reproduce ordered resident replay.

Every frame captures known active capacity metadata and later event-supplied
limits at that frame; absent limits remain unavailable. Per-advicee permit
limits are captured by partition, alongside any explicitly configured uniform
initial limit, so another partition's facts do not rewrite an earlier local cap. Actual capture/import
resolution, native IPC/encoding, credentials/transport and resident shutdown
remain outside this environment. Multiple generated agents share a checked
resident state; this does not execute native multi-runtime IPC. Ordinary tests
remain deterministic, offline and source-free. The simulator executes available
checked adapters and bounded scenarios, not full native resident orchestration.


`restoreReplay(replay, listener)` optionally streams every reconstructed frame to a consumer before restoring the endpoint, allowing dashboard summaries across histories larger than retained observations.

Unspecified review outcomes use `DEFAULT_OUTCOME_WEIGHTS`: finding 50, clear 50, all failures zero. `RunConfig.outcomeWeights` and `{kind:'jevProfile',delayMs,outcomeWeights}` accept six finite weights in [0,100]; their positive total is normalized for sampling. An all-zero mix is rejected before a control is recorded. An explicit edit/config/control `outcome` remains a deterministic single-outcome override and is mutually exclusive with weights at that boundary. Already issued requests keep their sampled result and due time. The dedicated `jev-outcomes` xorshift32 stream uses the run seed and is independent of workload variation/rendering; only sampled request issuance consumes a draw, explicit overrides do not. Replay persists the initial weights, all later raw weights, algorithm, stream and stable outcome order. The distribution describes synthetic inputs, not empirical Jev rates.

The ongoing session generator now delegates scheduling to the shared [Bend session core](../session-bend/README.md), compiled to an ES module. Its TypeScript adapter keeps the existing public API, validation and absolute clocks; the pre-port implementation survives only as an independent test fixture. Regenerate the module with `node packages/session-bend/build.mjs` after changing the Bend source.


Generated sessions may supply `editDurationMs` (0–1,000,000,000 virtual ms).
This is the supplied PRE-to-POST report delay, independent of edit cadence and
Jev delay; it does not serialize a native agent's tools or measure native work.
`applyControl({ kind: "editDuration", agent, durationMs })` changes future edits
for that agent; omitting `agent` targets all generators. The duration is captured
at PRE issuance, so in-flight POST timing and the original permit deadline stay
unchanged. Scripted edits retain the shared lifecycle `holdMs` default unless an
explicit edit duration is supplied. Bend still decides admission/expiry; a
late POST cannot revive an expired permit. Replay remains format 1 and records
session duration and targeted controls. The dashboard starts at 1 ms and places
this setting beside Edit interval; Start seeds all agents, Apply targets the
selected agent.
