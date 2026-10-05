# Development-time balance laboratory

**Purpose:** Run finite, reproducible comparisons of editable game abilities over the shared Monkey Business engine.
**Status:** Implementation in progress under [#203](https://github.com/dearlordylord/hapsland/issues/203); current examples establish the boundaries described below, not completion of the issue.
**Authority:** Maintained usage guidance and implementation evidence. The issue and accepted business contracts own requirements; experiments do not accept a tower roster or a balance patch.
**Expected use:** Declare a catalogue, scenario, investment budget and action schedule; compare outcomes and inspect business observations before proposing design changes.
**Lifecycle:** Update with changes to the laboratory API, game translation, generated artifacts or checks. Review when a mechanism is replaced, an environment capability changes, or #203 reaches acceptance; consolidate accepted decisions into this guide and the game-design owner.

## Run and check

Run commands from the repository root with its installed dependencies and Bend:

```sh
node scripts/build-game-mechanics.mjs --check
node scripts/build-game-lab.mjs --check
npm run test:focused -- scripts/game-balance-lab.test.mts
node_modules/.bin/tsc -p prototypes/canonical-defense/lab/tsconfig.json --noEmit
npm run check:fast
```

`node scripts/build-game-mechanics.mjs` regenerates the optional game's emitted translator and source metadata. The checker recompiles it and compares exact bytes and identities; it fails on stale output. The ordinary application and dashboard do not import this laboratory.

The focused test includes independently expected native Bend and emitted-JavaScript translation cases. Changes to the native Host also require `node scripts/run-game-consumer.mjs`, which compares the full optional game consumer. That check has a 380-second deadline. These checks establish their offline boundaries; they do not exercise a graphics window or establish new formal proofs.

Execute the [example study](example.ts) directly with Node:

```sh
node --experimental-strip-types --input-type=module -e 'import {runExampleStudy} from "./prototypes/canonical-defense/lab/example.ts"; const s=runExampleStudy(); console.log(JSON.stringify({tuning:s.search.tuning.map(c=>({context:c.context,runs:c.search.runs.map(r=>({name:r.name,spent:r.result.game.spent,certainOutputs:r.result.business.certainOutputs}))})),validation:s.validation.map(c=>({context:c.context,delta:c.comparison.delta}))},null,2));'
```

The authored finding fixture has no confirmed output by its 30ms horizon with the original 100ms output delay. The early output-profile purchase costs 60 and produces one confirmed output. In the separate clear-review fixture, the same purchase costs 60 and adds no confirmed output. These are deterministic examples, not population estimates. The three provisional abilities explicitly refuse and spend zero.

## Experiment inputs and outputs

The [API](index.ts) accepts a source-free public `RunConfig`, context identity, fixed budget, enabled mechanism identities, catalogue and finite `untilTime`/`maxEvents` bounds. It creates an ordinary shared Run; it does not maintain another business scheduler or patch Canonical.

Catalogue entries own display names, lessons, intervention targets, applicability conditions, the business observation used to demonstrate an effect, prices and effect parameters. These metadata fields must contain nonempty text; they state an intended lesson, not evidence of learning. Policy actions select only the mechanism and its business-boundary time. Prices and effect parameters in actions are rejected. An explicit catalogue replaces the whole default catalogue: removed identities cannot remain selectable through an implicit merge. Changing an ability or price requires no business-policy change.

Results contain each action's refusal or application and actual charge, initial/spent/remaining investment budget, streamed observations, business metrics, ordinary business replay and a version-one experiment recording. `execution` reports the requested bounds and actual endpoint. `termination` distinguishes idle, time-limited and event-limited execution.

Business metrics keep requests started, confirmed output bundles, retained finding entries and owned bytes separate. `pendingFindings` counts projection entries, not individual finding items. Confirmed delivery can retain a finding: output certainty is not permission to retire ownership. Frame counts describe observations and are not a throughput score.

Timed controls apply at reached business observation boundaries. The Run clock remains at its last actual transition; it does not advance through empty time merely to apply a purchase. An unreached time yields `notReached` and costs zero. Refused and disabled actions also cost zero. Equal-time actions preserve declared order.

Replay verifies the engine replay identities, actual laboratory/translator source and module bytes, and experiment inputs, including game-only investment configuration. Changed code or inputs require a new experiment; there are no replay migration shims. Keep recordings as JSON data and use `replayExperiment` to reconstruct results.

## Comparisons and bounded search

`compareExperiments` runs two declared policies against identical scenario, catalogue, budget and limits. It returns both results and separate game/business deltas. The outcome-coupling field distinguishes a fixed scenario override from sampled outcomes: the same seed alone cannot guarantee the same outcome for each issued operation after an intervention changes issuance order.

`compareInteraction` runs no-action, A, B and ordered A+B under those same bounds. At equal times, A's actions precede B's. The current output-profile example demonstrates replacement: B supersedes A's future profile, so a more expensive combination can match B's delivery result without improving it.

`searchExperiments` enumerates only declared plans. `searchContexts` shares one attempt budget across tuning contexts, including invalid plans, and reports unsearched plans. Invalid game plans are recorded; errors from the shared engine propagate as failures. No optimizer, universal dominance claim or automatic patch application is included.

Contexts are explicitly `tuning` or `heldOut` and have unique identities. Search executes tuning contexts only. `evaluateHeldOut` receives an already selected baseline and candidate; it does not choose a winner from validation results. All scenarios and search lists are finite and offline.

## Current ability boundary and remaining work

The headless [game action seam](../DefenseLab.bend) reuses Host construction, placement validation, upgrades and observed ticks. It returns explicit illegal-placement, unknown-tower, unaffordable and maximum-level refusals with zero charge. Its tick retains actual targeting, firing and health damage while discarding output rewards to keep a fixed investment budget. The [actual-game API](game.ts) connects that seam to deterministic build/upgrade schedules, separate game/business observations, finite comparisons/search and JSON experiment replay. `node scripts/build-game-lab.mjs` emits the optional game module; its checker hashes every transitive repository Bend dependency and checks exact emitted bytes.

`runGameExperiment` uses the explicitly named `continuousGame` preset from the interactive consumer. Supply a creation seed, layout, initial budget, enabled tower identities, actions at game ticks, `untilTicks` and `maxEvents`. One tick requests a 20ms business endpoint and at most 256 events, additionally limited by the remaining global event budget. Business time remains the engine's actual endpoint and is reported separately from the game tick. The preset's advicee workload seed remains 152; the creation seed does not replace every configured workload seed. This mode currently uses the Host's prices and abilities. Its coordinates and one-based upgrade indices are recorded; an upgrade index refers to the current tower list, whose newest construction comes first. Rejected construction and upgrades spend zero. The recording verifies source, configuration, complete returned frame/physical traces, action receipts and the final observation. Search enumerates declared placement/upgrade schedules and reports invalid or unsearched plans.

The [shared game translator](../DefenseMechanics.bend) is called by the native [Host](../DefenseHost.bend) and emitted for the laboratory. Native Refiner behavior and the laboratory `refiner` entry use its same future-review mapping: price 55, new request delay 3200ms, finding weight 0.5 and clear weight 1, with other weights zero. The causal fixture pins a seeded draw between 1/3 and 1/2: an early purchase changes the sampled result from finding to clear and increases its delay; a purchase after issuance preserves the original finding and deadline. This is a declared synthetic case, not an empirical prevention rate. Laboratory output timing uses its output mapping and preserves the scenario's declared output outcome. Already authorized attempts retain their captured profile and deadlines.

Coordinator targeted service acceleration, Packager future batching and Parallelizer launch pacing are unavailable in the current shared control API. Their default catalogue entries return explicit unsupported results. `outputLatency` is a separately named experimental replacement; it does not implement batching. The final roster and ability choice remain open.

The direct-control mode measures fixed investments and business observations without spatial placement. Actual-game mode measures existing placement, upgrades and health under the continuous preset; arbitrary public `RunConfig` scenarios are not translated into that mode. Game rewards remain excluded from fixed experiment investments. Positive business cases for the three provisional abilities remain unavailable. Numerical examples do not demonstrate human learning, enjoyment, global balance or interactive platform support. Applicable native/emitted business-trace conformance and actual firing scenarios remain part of the #203 completion audit.

## Proposed human prediction and explanation checks

These are proposed checks for a later teaching session; no participant results have been collected. Record answers separately from numerical experiment outcomes and ask for a prediction before revealing the trace:

- Given an already authorized output attempt, predict whether a later output-delay purchase changes its delivery time. Explain which facts were captured at authorization, then inspect the original deadline.
- Given a review request issued before a Refiner effect, predict its outcome and deadline. Explain why changing the future profile preserves issued facts; compare the early and late synthetic cases.
- Given a confirmed output and a retained finding entry, predict whether the entry disappears. Identify the ownership rule that distinguishes delivery from retirement.
- Given an unsupported Coordinator purchase, predict the charge and business trace. Explain which environment capability is missing and distinguish the intended lesson from an implemented effect.
- Given the tuning and held-out clear fixtures, predict where the output purchase adds value. Explain why a benefit in one declared context does not establish a globally preferable policy.

Keep prediction accuracy and explanations distinct from enjoyment or preference. A successful numerical intervention supplies a trace for these questions, not evidence that a learner understands it.
