# Development-time balance laboratory

**Purpose:** Run finite, reproducible comparisons of editable game abilities over the shared Monkey Business engine.
**Status:** Implementation in progress under [#203](https://github.com/dearlordylord/hapsland/issues/203); current examples establish the boundaries described below, not completion of the issue.
**Authority:** Maintained usage guidance and implementation evidence. The issue and accepted business contracts own requirements; experiments do not accept a tower roster or a balance patch.
**Expected use:** Declare a catalogue, scenario, investment budget and action schedule; compare outcomes and inspect business observations before proposing design changes.
**Lifecycle:** Update with changes to the laboratory API, game translation, generated artifacts or checks. Review when a mechanism is replaced, an environment capability changes, or #203 reaches acceptance; consolidate accepted decisions into this guide and the game-design owner.

## Run and check

Run commands from the repository root with its installed dependencies and Bend:

```sh
node scripts/build-game-lab.mjs --check
npm run test:focused -- scripts/game-balance-lab.test.mts
node_modules/.bin/tsc -p prototypes/canonical-defense/lab/tsconfig.json --noEmit
npm run check:fast
```

The direct studies are control-only probes using supported public environment controls. They are not identical tower strategies: purchases directly change environment profiles without placement or targeting. The ordinary application and dashboard do not import this laboratory. `node scripts/build-game-lab.mjs --check` checks the separate actual-game emitted boundary.

The focused test includes independently expected direct-control timing, restoration, budget and replay cases. Changes to the native Host also require `node scripts/run-game-consumer.mjs`, which compares the full optional game consumer. That check has a 380-second deadline. These checks establish their offline boundaries; they do not exercise a graphics window or establish new formal proofs.

Execute the [example study](example.ts) directly with Node:

```sh
node --experimental-strip-types --input-type=module -e 'import {summarizeExampleStudy} from "./prototypes/canonical-defense/lab/example.ts"; console.log(JSON.stringify(summarizeExampleStudy(),null,2));'
```

The runnable study declares five tuning contexts: slow Jev, slow finding delivery, all-clear reviews, unreadable source and unavailable credentials. Plans include no investment, each single mechanism, each pair, and late timing purchases. Its global search budget runs 44 of 45 declared tuning combinations and reports the final unsearched plan. Separate four-arm comparisons examine service/relay and relay/repair; two late-intervention comparisons examine captured request/output timing. The predeclared relay candidate is then evaluated in two held-out contexts. These are authored deterministic fixtures, not population estimates.

Observed in the current executable fixtures: JevService alone adds one confirmed output in `slowJev`, and DeliveryRelay alone adds one in `slowFindingDelivery`. In both access-blocked contexts, relay plus repair adds one confirmed output while each alone adds zero by the horizon. Confirmed output retains the finding entry. The two late purchases add no business-metric benefit. Held-out finding delivery gains one confirmed output for 55 investment; held-out all-clear spends the same 55 with no additional output. These context-specific observations do not establish a best general plan.

Compact measured data can be regenerated with `summarizeExampleStudy`; complete observations and ordinary business replay remain in `runExampleStudy` results. No retained result snapshot is required: rerun the executable study when mechanism/configuration/engine identity changes. Outputs are evidence for the exact declared inputs, not roster acceptance or a balance patch.

## Control-only probe inputs and outputs

The control-only [API](index.ts) accepts a source-free public `RunConfig`, context identity, fixed budget, enabled mechanism identities, catalogue and finite `untilTime`/`maxEvents` bounds. It creates an ordinary shared Run; it does not maintain another business scheduler or patch Canonical.

Catalogue entries own display names, lessons, intervention targets, applicability conditions, the business observation used to demonstrate an effect, prices and effect parameters. These metadata fields must contain nonempty text; they state an intended lesson, not evidence of learning. Policy actions select only the mechanism and its business-boundary time. Prices and effect parameters in actions are rejected. The default catalogue enables JevService (60), DeliveryRelay (55) and AccessRepair (45). JevService and DeliveryRelay accept an optional integer `baseDelayMs` in [0, 1,000,000,000]; omitted values use the initial shared scenario profile. Purchase level one uses `floor(base / 2)`, level two `floor(base / 3)`, and later levels continue from the original base. JevService preserves the original explicit outcome or sampled weights. DeliveryRelay preserves output outcome and lease. The direct AccessRepair policy permits source/credential restoration once per experiment; repeated attempts return `inapplicable` with zero charge, including aliases in a custom catalogue. This is a probe policy restriction: actual-game repair is one shot per connected purchase, and a healthy repair purchase can cost 45 while adding no business benefit. An explicit catalogue replaces the whole default catalogue: removed identities cannot remain selectable through an implicit merge. Changing an ability or price requires no business-policy change.

Results contain each action's refusal or application and actual charge, initial/spent/remaining investment budget, streamed observations, business metrics, ordinary business replay and a version-one experiment recording. `execution` reports the requested bounds and actual endpoint. `termination` distinguishes idle, time-limited and event-limited execution.

Business metrics keep requests started, confirmed output bundles, retained finding entries and owned bytes separate. `pendingFindings` counts projection entries, not individual finding items. Confirmed delivery can retain a finding: output certainty is not permission to retire ownership. Frame counts describe observations and are not a throughput score.

Timed controls apply at reached business observation boundaries. The Run clock remains at its last actual transition; it does not advance through empty time merely to apply a purchase. An unreached time yields `notReached` and costs zero. Refused and disabled actions also cost zero. Equal-time actions preserve declared order.

Replay verifies the engine replay identities, actual direct laboratory source, and experiment inputs, including game-only investment configuration. Changed code or inputs require a new experiment; there are no replay migration shims. Keep recordings as JSON data and use `replayExperiment` to reconstruct results.

## Comparisons and bounded search

`compareExperiments` runs two declared policies against identical scenario, catalogue, budget and limits. It returns both results and separate game/business deltas. The outcome-coupling field distinguishes a fixed scenario override from sampled outcomes: the same seed alone cannot guarantee the same outcome for each issued operation after an intervention changes issuance order.

`compareInteraction` runs no-action, A, B and ordered A+B under those same bounds. At equal times, A's actions precede B's. The contextual study examines distinct service/delivery/access interventions. Costs and separate business observations expose expensive combinations without automatically selecting or applying a winner.

`searchExperiments` enumerates only declared plans. `searchContexts` shares one attempt budget across tuning contexts, including invalid plans, and reports unsearched plans. Invalid game plans are recorded; errors from the shared engine propagate as failures. No optimizer, universal dominance claim or automatic patch application is included.

Contexts are explicitly `tuning` or `heldOut` and have unique identities. Search executes tuning contexts only. `evaluateHeldOut` receives an already selected baseline and candidate; it does not choose a winner from validation results. All scenarios and search lists are finite and offline.

## Current ability boundary and remaining work

The headless [game action seam](../DefenseLab.bend) reuses Host construction, placement validation, upgrades and observed ticks. It returns explicit illegal-placement, unknown-tower, unaffordable and maximum-level refusals with zero charge. Its tick retains actual targeting, firing and health damage while discarding output rewards to keep a fixed investment budget. The [actual-game API](game.ts) connects that seam to deterministic build/upgrade schedules, separate game/business observations, finite comparisons/search and JSON experiment replay. `node scripts/build-game-lab.mjs` emits the optional game module; its checker hashes every transitive repository Bend dependency and checks exact emitted bytes.

`runGameExperiment` uses the explicitly named `continuousGame` preset from the interactive consumer. Supply a creation seed, layout, initial budget, enabled tower identities, actions at game ticks, `untilTicks` and `maxEvents`. One tick requests a 20ms business endpoint and at most 256 events, additionally limited by the remaining global event budget. Business time remains the engine's actual endpoint and is reported separately from the game tick. The preset's advicee workload seed remains 152; the creation seed does not replace every configured workload seed. This mode currently uses the Host's prices and abilities. Its coordinates and one-based upgrade indices are recorded; an upgrade index refers to the current tower list, whose newest construction comes first. Rejected construction and upgrades spend zero. The recording verifies source, configuration, complete returned frame/physical traces, action receipts and the final observation. Search enumerates declared placement/upgrade schedules and reports invalid or unsearched plans.

Control-only probe purchases apply public controls at reached observation boundaries. They measure future request latency, future output timing and access restoration without spatial placement. They preserve original sampled outcome weights, explicit outcomes, output certainty, leases and already issued/authorized facts. They do not implement dependency-targeted acceleration, batching or launch pacing.

The direct study and actual-game mode have different current evidence boundaries. Control-only probes accept arbitrary source-free public scenarios and editable mechanism descriptors. Their repair policy differs from actual-game purchases, so the two modes do not claim identical catalogue or strategy semantics. Actual-game mode retains its existing placement, upgrades and health seam; aligning its roster and configuration with the three direct mechanisms remains required before claiming one complete game balance boundary. Game rewards remain excluded from fixed experiment investments. Applicable native/emitted business-trace conformance and actual firing scenarios remain part of the #203 completion audit. Numerical examples do not demonstrate human learning, enjoyment, global balance or interactive platform support.

The actual-game API accepts an optional experiment-owned catalogue containing identity, cost, one of the three supported abilities, display name and intended lesson. A custom catalogue replaces the complete default catalogue. Plans select identities; catalogue prices and mappings are recorded and bound to replay. Construction uses the native game placement and ability mapping with fixed experiment investment accounting. Upgrades retain actual prices 40 then 60 and maximum level three; repair remains maximum level one. Catalogue configuration supports price changes and replacing an identity's ability. Radius and strength formulas remain the current game's fixed rules; scenario latency settings change workload assumptions, not arbitrary tower parameters.

## Proposed human prediction and explanation checks

These are proposed checks for a later teaching session; no participant results have been collected. Record answers separately from numerical experiment outcomes and ask for a prediction before revealing the trace:

- Given an already authorized output attempt, predict whether a later DeliveryRelay purchase changes its delivery time. Explain which facts were captured at authorization, then inspect the original deadline.
- Given a review request issued before a JevService purchase, predict its outcome and settlement deadline. Explain why changing the future profile preserves issued facts; compare the early and late synthetic cases.
- Given a confirmed output and a retained finding entry, predict whether the entry disappears. Identify the ownership rule that distinguishes delivery from retirement.
- Given unreadable source and unavailable credentials, predict which observations an AccessRepair purchase can change. Explain why a second repair is refused and why restored access does not change current-work authorization or erase retained findings.
- Given the tuning and held-out clear fixtures, predict where the output purchase adds value. Explain why a benefit in one declared context does not establish a globally preferable policy.

Keep prediction accuracy and explanations distinct from enjoyment or preference. A successful numerical intervention supplies a trace for these questions, not evidence that a learner understands it.
