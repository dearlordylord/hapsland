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

`createRun()` initializes one scripted synthetic edit, finding, advice submission and finish attempt. `inputs` accepts timed `{kind:"canonical",at,event}` facts, synthetic `edit` inputs with preparation reservation `bytes`, `unitBytes`, optional injected Jev `outcome`, and `finish` attempts. `session` enables an ongoing seeded single-agent workload instead. Configuration `limits` uses the checked canonical ledger fields; `preparationDelay` and `jevDelay` set integer synthetic durations. These illustrative defaults are not empirical usage measurements.

`step()` processes the next canonical transition, following workload metadata as necessary. `advance({untilTime,maxEvents})` advances the same ongoing run and returns `timeLimit`, `eventLimit` or `idle`, the number of canonical events and current virtual time. A bound never invents a finish attempt or closes a round. Time is one nonnegative integer clock; equal-time scheduled items follow insertion order, including effects added by transitions. Time bounds do not force the clock to a boundary with no activity. Driver playback speed and pauses do not enter the core.

`applyControl` validates built-in controls at a step boundary and records their time, canonical-event boundary and a shared sequence across controls and explicitly scheduled inputs. Edit pace and arrival suspension replace obsolete recurring arrivals; finite bursts and delayed repairs survive changes. `jevProfile` changes new requests; requests already scheduled keep their due time. Replay stores initial config/inputs, seed, random algorithm, consumed Bend source identity, explicit outcomes and the complete control timeline. `replayRun` reconstructs initial state and rejects incompatible identities; it does not hydrate opaque Bend state. Exported replay is input-oriented: advance the reconstructed run to the desired boundary.

Every observation has ordered `event`, `commands`, checked canonical `before`/`after` projections, optional product `rejection`, integer `time`, `sequence` and separate synthetic `effects`. Frames are compatible with the UI-independent semantic flow projection. Bend owns product decisions. The environment follows preparation, unit, Jev and submission identities; identity mismatches and missing required preparation inputs fail explicitly. Ordinary capacity or product refusals remain observations. Canonical facts supplied directly must correctly describe the synthetic scenario; this interface is not a native-host security boundary.

`subscribe` streams frames. Default retention keeps the last 1,000 observations; `retention:0` streams without history. Retention never changes outcomes or replay availability. Replay inputs and controls remain in memory for export and grow with explicitly scheduled inputs and controls. The internal workload generator retains its configuration rather than an unlimited generated trace. Consumers control their rendered history.

Size facts distinguish source bytes, evidence-tree bytes, preparation reservation bytes, review-unit bytes and encoded output bytes. `sizePreparationInput` maps only reservation/review-unit facts into canonical inputs. `runSizeGraph` separately runs supplied source-free graph events through the checked import-graph adapter and emits identified `model:'import-graph'` frames with replayable events/limits. Its tests cover exact source boundary, tree overflow, exclusion without a read, and deadline incompleteness. Reservation experiments alone do not validate capture or import traversal. Encoded output facts require an explicit `collectionFitCheck`; generated submission does not model actual serialization size.

Coverage excludes actual filesystem measurement, native capture, runtime hooks, real Jev, semantic repair quality and complete resident execution. The synthetic environment covers supported adapters, not empirical performance or a new proof of all product logic. Revisit native gaps at an explicitly bounded validation milestone or when an applicable deterministic adapter becomes available. The dashboard owns presentation and playback; graph observations remain separate from canonical frames.

An ongoing example is `createRun({seed:7,session:{editIntervalMs:100,variationMs:15,editsPerTask:5,taskPauseMs:500,adviceResponse:'delayedRepair',repairDelayMs:300}})`. Advance to a finite boundary, suspend arrivals with `{kind:'suspendArrivals',suspended:true}`, drain finite effects, then resume with `suspended:false`. Suspension emits no Stop and preserves started effects, bursts and repairs. Advice responses are `ignore`, `noAction`, `promptRepair` and `delayedRepair`; attempted repair carries a changed synthetic revision, and its Jev outcome remains a separate supplied fact. Session submissions use the background surface. `workload` metadata exposes revision and repair identity on preparation frames. Size changes affect newly generated arrivals; already scheduled arrival facts remain fixed.

Replay exports `endpoint:{eventCount,now}` for consumers that want to restore the recorded viewing boundary. Advance the reconstructed run with that event/time bound; playback thereafter continues the same experiment.

Synthetic edits use issued observation identities through admission, source start and observed preparation, so retained findings remain available to checked finish selection. A synthetic finish attempt owns a virtual `finishDeadline` (default 200). `waitForWork` suspends the task generator; relevant effect/output completion wakes the same attempt, while the deadline polls with its integer clock fact. `finishReady` supplies a checked finish reservation. Unsubmitted retained findings use Stop leases, submission authorization, acknowledged output and checked continuation consumption. Allowance ends Stop and retires the round before the next task. Continuation ends the output attempt and resumes the current round; later fresh work uses existing admission. A refusal grants no finish permission and remains an observed product outcome. Explicit canonical fixtures do not automatically acquire this synthetic finish driver.
