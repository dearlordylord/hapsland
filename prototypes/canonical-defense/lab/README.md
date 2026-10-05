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

## Spatial game balance study

The separate [spatial study](game-example.ts) exercises actual Host construction, connectivity, upgrades, health and game-owned ability mapping. After rebuilding the integrated game laboratory, run its declared expectations and compact structured results:

```sh
timeout 120s node --experimental-strip-types --input-type=module -e 'import {runGameExampleStudy,checkGameExampleStudy,summarizeGameExampleStudy} from "./prototypes/canonical-defense/lab/game-example.ts"; const study=runGameExampleStudy(); console.log(JSON.stringify({checks:checkGameExampleStudy(study),study:summarizeGameExampleStudy(study)},null,2));'
```

The study ran against the integrated game module on 2026-10-05 and passed its independently declared expectations. It declares five tuning contexts (slow Jev, slow delivery, unreadable source, unavailable credentials and clear reviews), matched 160-resource construction budgets, separate health/business observations, service/relay and relay/repair four-arm comparisons, late timing countercases and a legally placed disconnected service investment. Search runs 49 of 50 declared placement/timing combinations and exposes the final unsearched placement plan. Two held-out contexts evaluate a relay candidate declared before observing their results. Each timing-context run is bounded by 16 game ticks and 128 business events; the separate two-arm pressure comparison has the limits below. These are authored fixtures; no probability, universal balance or learning claim follows from their outcomes.

Measured in these fixtures: the authored edit has two review units. In `slowJev`, service changes both settlements from 200ms to 100ms and both certain individual submissions from 220ms to 120ms, costing 60. In `slowDelivery`, relay changes both individual submissions from 220ms to 120ms, costing 55. Repair restores two findings under either access blockage; relay plus repair shortens their delivery to 120ms for 100 investment. Late purchases preserve captured timing. A disconnected service costs 60 without accelerating requests; healthy repair costs 45 without a business benefit. Held-out finding submissions change from 280ms to 160ms with relay, while held-out clear reviews spend 55 with no finding output. Health stays 100 in these short contexts; no combat difficulty or health-balance effect was demonstrated.

A separate pressure comparison uses an initial burst of seven edits, source delay 0, explicit clear outcomes, Jev delay 3200ms, arrival interval 60000ms, 200 game ticks and a 2000-event ceiling. Both arms have 160 resources; the connected service purchase costs 60. The observed baseline ends at 99 health and the candidate at 100. Eight admitted request settlements move from 3200ms to 1600ms, while both arms retain the same three preparation refusals. Peak ledger occupancy stays 120 bytes and peak requests at Jev stays 8; sampled permit waiting is 0. Ledger exposure across game ticks falls from 19080 to 9480 byte-ticks. Both finish with no retained findings. This measures one workload-pressure consequence of shorter future latency; it does not establish desired difficulty, universal health dominance or an accepted price.

The parameter comparison declares baseline plus four configurations at the same legal service placement. With100ms request latency, strength1 is expected to yield50ms, strength3 to yield25ms, and upgrading strength3 to level2 to yield14ms. A narrow base radius20 leaves that placement disconnected, preserving100ms. This comparison is prepared for the tuned native seam; its execution remains unvalidated until that seam is merged and regenerated.

Full study results retain recorded configuration/source identities, action receipts, frames and replayable game inputs. Summaries distinguish individual submission terminal events from bundle output terminal events rather than counting every successful-looking frame as confirmed delivery. Rerun the executable study when engine, game, scenario or catalogue configuration changes; retain a structured snapshot only when a current review needs its immutable provenance.

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

The headless [game action seam](../DefenseLab.bend) reuses Host construction, placement validation, upgrades and observed ticks. It returns explicit illegal-placement, unknown-tower, unaffordable and maximum-level refusals with zero charge. Its tick retains actual connectivity, profile effects and health damage while discarding output rewards to keep a fixed investment budget. The [actual-game API](game.ts) connects that seam to deterministic build/upgrade schedules, separate game/business observations, finite comparisons/search and JSON experiment replay. `node scripts/build-game-lab.mjs` emits the optional game module; its checker hashes every transitive repository Bend dependency and checks exact emitted bytes.

`runGameExperiment` retains the `continuousGame` label and accepts explicit scenario settings: request/output/source delays, readable source, credential readiness, sampled/clear/finding outcomes, initial burst and arrival interval. Defaults are 3200/800/800ms, ready/readable access, sampled outcomes, burst 1 and 30000ms arrival interval. The creation seed also configures the advicee workload seed. Supply layout, fixed initial budget, enabled catalogue identities, deterministic build/upgrade actions, `untilTicks` and `maxEvents`. One tick requests a 20ms business endpoint and at most 256 events, additionally limited by the remaining global event budget. Business time remains the engine's actual endpoint and is reported separately from the game tick. Coordinates and one-based upgrade indices are recorded; the newest tower comes first in the tower list. Rejected actions spend zero.

Each creation, action and bounded tick compares complete native/public business runtime, product/graph frames and physical callback deliveries through the maintained shared conformance comparator. The ordinary public Run receives the original workload inputs and supported environment controls; native frames are not rescheduled as product commands. Results and recordings include an ordinary version-one business replay, exported and restored at the endpoint. `replayGameExperiment` validates that replay, reruns the actual Host, and compares the exact regenerated business replay and game trace identity. Stale generated source/module identities and mutated recordings are explicitly refused. These checks establish the emitted game/public business seam; native game checks and graphics-window evidence remain separate.

Control-only probe purchases apply public controls at reached observation boundaries. They measure future request latency, future output timing and access restoration without spatial placement. They preserve original sampled outcome weights, explicit outcomes, output certainty, leases and already issued/authorized facts. They do not implement dependency-targeted acceleration, batching or launch pacing.

The direct study and actual-game mode have different current evidence boundaries. Control-only probes accept arbitrary source-free public scenarios and editable mechanism descriptors. Their repair policy differs from actual-game purchases, so the two modes do not claim identical catalogue or strategy semantics. Actual-game mode measures the current three native abilities with configurable catalogue prices/assignments, supported placement/upgrades and separate health observations. Game rewards remain excluded from fixed experiment investments. The spatial runs compare emitted native/public business traces and replay. Native interpreter and graphics-window evidence remain separately owned checks. Numerical examples do not demonstrate human learning, enjoyment, global balance or interactive platform support.

The actual-game API accepts an optional experiment-owned catalogue containing identity, cost, one of the three supported abilities, display name and intended lesson. A custom catalogue replaces the complete default catalogue. Plans select identities; catalogue prices and mappings are recorded and bound to replay. Construction uses the native game placement and ability mapping with fixed experiment investment accounting. Upgrades retain actual prices 40 then 60 and maximum level three; repair remains maximum level one. Catalogue configuration supports price changes and replacing an identity's ability. Each supported ability owns fixed teaching metadata describing its target, applicability and business observation. Normalized catalogue entries and recording identities include that metadata; replacing an ability inherits its actual mapping description rather than a stale target from the replaced ability. Catalogue entries also accept optional integer `strength` in [1,16] and base `radius` in [20,240], defaulting to1 and100. AccessRepair rejects strengths other than1. The native Host computes each connected tower contribution as `level * strength` and connectivity radius as `radius + level * 12`; timing profiles derive from the original scenario delay divided by `1 + total connected contribution`. Upgrades retain the same configured parameters and multiply contribution through level. Scenario latency settings independently change workload assumptions. These are bounded configurations of the three actual abilities, not a universal mechanism language.

## Proposed human prediction and explanation checks

These are proposed checks for a later teaching session; no participant results have been collected. Record answers separately from numerical experiment outcomes and ask for a prediction before revealing the trace:

- Given an already authorized output attempt, predict whether a later DeliveryRelay purchase changes its delivery time. Explain which facts were captured at authorization, then inspect the original deadline.
- Given a review request issued before a JevService purchase, predict its outcome and settlement deadline. Explain why changing the future profile preserves issued facts; compare the early and late synthetic cases.
- Given a confirmed output and a retained finding entry, predict whether the entry disappears. Identify the ownership rule that distinguishes delivery from retirement.
- Given unreadable source and unavailable credentials, predict which observations an AccessRepair purchase can change. In the control-only probe, explain why a second repair is refused; in actual play, explain the one-shot effect of each connected purchase and the cost of a healthy repair. Explain why restored access does not change current-work authorization or erase retained findings.
- Given the tuning and held-out clear fixtures, predict where the output purchase adds value. Explain why a benefit in one declared context does not establish a globally preferable policy.

Keep prediction accuracy and explanations distinct from enjoyment or preference. A successful numerical intervention supplies a trace for these questions, not evidence that a learner understands it.
