# Development-time balance laboratory

<!--
**Purpose:** Run finite, reproducible comparisons of editable game abilities over the shared Monkey Business engine.
**Audience:** Prototype contributors and evaluators; Product and specification owners.
**Status:** Offline foundation implemented and locally qualified for the declared scope of [#203](https://github.com/dearlordylord/hapsland/issues/203) on 2026-10-05. The experimental roster remains provisional; this status does not claim tracker closure or human learning validation.
**Authority:** Maintained usage guidance and implementation evidence. The issue and accepted business contracts own requirements; experiments do not accept a tower roster or a balance patch.
**Expected use:** Declare a catalogue, scenario, investment budget and action schedule; compare outcomes and inspect business observations before proposing design changes.
**Lifecycle:** Update with changes to the laboratory API, game translation, generated artifacts or checks. Review when a mechanism is replaced, an environment capability changes, or #203 reaches acceptance; consolidate accepted decisions into this guide and the [optional game guide](../README.md).
-->

## Tower development workflow

Start with the [Tower Defense playability framework](PLAYABILITY.md) before changing towers, movement, targeting, previews or upgrades. It defines the player-visible acceptance sequence, the baseline/fix/replay procedure, and required counterexamples. Playability and teaching clarity come before balance. Keep this workflow inside the laboratory; it is not a repository-wide development policy.

## Run and check

Run commands from the repository root with its installed dependencies and Bend:

```sh
node scripts/build-game-lab.mjs --check
npm run test:focused -- scripts/game-balance-lab.test.mts
node_modules/.bin/tsc -p prototypes/canonical-defense/lab/tsconfig.json --noEmit
npm run check:fast
```

The actual-game mode follows the current interactive default: four rule checks per request at 100% Finding, with explicit forced Clear scenarios preserved. Multiplicity updates each existing retained result through `FindingCountUpdated`; it does not create additional requests. The bounded tick ingests the same rule receipts as the interactive Host. Multiplicity follow-ups consume only the remaining experiment event budget; a follow-up that cannot run remains queued for a later tick. The independent public replay declares this profile and checks the complete observations and queue.

The [master integration receipt](../validation-evidence/2026-10-05-balance-lab/master-integration.json) preserves the emitted/public checks and native timeouts observed at integration. The later [native qualification](../validation-evidence/2026-10-05-balance-lab/native-conformance.json) supersedes its full-trace limitation: a fresh Linux arm64 build passed all 280 native/emitted states in 288 seconds. The optional lab compiler transport uses a source-pinned CPU register bank local to each work loop, avoiding hundreds of uniform C function arguments. Unknown generated layouts are rejected. Game and simulator rules are unchanged.

The direct studies are control-only probes using supported public environment controls. They are not identical tower strategies: purchases directly change environment profiles without placement or targeting. The ordinary application and dashboard do not import this laboratory. `node scripts/build-game-lab.mjs --check` checks the separate actual-game emitted boundary.

The focused test includes independently expected direct-control timing, restoration, budget and replay cases. Changes to the native Host also require `node scripts/run-game-consumer.mjs`, which compares the full optional game consumer. That check has a 380-second deadline. These checks establish their offline boundaries; they do not exercise a graphics window or establish new formal proofs.

Future changes retain the [laboratory regression contract](../../../docs/testing-matrix.md#laboratory-regression-contract). Recheck game-absent independence when dependency edges change. Participant studies and live backend execution are separate from qualification of the offline laboratory foundation.

`node --experimental-strip-types scripts/compare-game-lab-native.mjs` independently compares sixteen actual-Lab scenarios over 40 ticks each, including complete before/intervention/after Worlds, frames and physical deliveries. The historical [qualification receipt](../validation-evidence/2026-10-05-balance-lab/native-conformance.json) records the earlier seven-scenario 280 matching rows and source/tool identities. The direct fixture command allows 30 seconds for C emission. For the current full-world integration, use `node scripts/run-game-consumer.mjs --lab`: C emission uses the remaining authenticated 380-second supervisor deadline. JavaScript emission also uses the remaining authenticated supervisor deadline; direct unsupervised emission retains its 30-second bound. Clang preparation uses the existing full-game consumer allowance of 120 seconds, while each scenario execution remains bounded by five seconds. The dense Finish and automatic eight-review cases have a512-event ceiling; the fourteen other cases retain128. The two automatic cases call the main Host tick rather than the controlled Lab tick. This native/emitted comparison is separate from the ordinary public business and replay checks in spatial experiments. The [optional trace profile](../lab-native-prefix-profile.json) generates its full owner codec without importing legacy campaign fixtures.

`node scripts/verify-game-lab-native-tests.mjs` selects 26 independently expected actual-Lab behavioral predicates in native and emitted JavaScript. The historical, branch-source-bound [predicate receipt](../validation-evidence/2026-10-05-balance-lab/native-predicates.json) retains all expected outputs, exact mechanically selected owner definitions, source/tool identities and artifact hashes. The current verifier compiles one shared fixture and executes all26 predicates separately, retaining source5/native5/emitted5-second bounds. Its authenticated overall deadline is380 seconds, with clang limited to120 seconds. This replaces repeated per-root compilation after the old30-second C-emission bound timed out; it does not relabel those earlier attempts as passes. Exact predicate bodies, independent expected outputs, and finite runtime inputs remain unchanged. Source checking excludes only the five existing foreign numeric-IO declarations; all other errors and timeouts fail qualification. These are bounded behavioral examples, not new universal mathematical proofs. `node --test scripts/verify-game-lab-native-tests.test.mjs scripts/game-consumer-deadline.test.mjs` checks false-predicate rejection, foreign-boundary rejection and finite execution/identity handling.

Execute the [example study](example.ts) directly with Node:

```sh
node --experimental-strip-types --input-type=module -e 'import {summarizeExampleStudy} from "./prototypes/canonical-defense/lab/example.ts"; console.log(JSON.stringify(summarizeExampleStudy(),null,2));'
```

The runnable study declares five tuning contexts: slow Jev, slow finding delivery, all-clear reviews, unreadable source and unavailable credentials. Plans include no investment, each single mechanism, each pair, and late timing purchases. Its global search budget runs 44 of 45 declared tuning combinations and reports the final unsearched plan. Separate four-arm comparisons examine service/relay and relay/repair; two late-intervention comparisons examine captured request/output timing. The predeclared relay candidate is then evaluated in two held-out contexts. These are authored deterministic fixtures, not population estimates.

Observed in the current executable fixtures: JevService alone adds one confirmed output in `slowJev`, and DeliveryRelay alone adds one in `slowFindingDelivery`. In both access-blocked contexts, relay plus repair adds one confirmed output while each alone adds zero by the horizon. Payload cleanup follows the shared acknowledgement rules. The two late purchases add no business-metric benefit. Held-out finding delivery gains one confirmed output for 55 investment; held-out all-clear spends the same 55 with no additional output. These context-specific observations do not establish a best general plan.

Compact measured data can be regenerated with `summarizeExampleStudy`; complete observations and ordinary business replay remain in `runExampleStudy` results. No retained result snapshot is required: rerun the executable study when mechanism/configuration/engine identity changes. Outputs are evidence for the exact declared inputs, not roster acceptance or a balance patch.

## Spatial game balance study

The original [balance research](../../../../hapsland-research/PRODUCT-RESEARCH-ADVISORY-2026-10-02-game-balance.md) remains advisory. Its useful method is matched context/policy comparisons, marginal effects, A/B/A+B, declared investment, and held-out contexts. Its historical tower roster is not the current playable roster. The temporary synchronized-worlds viewer and separate tower-choice worktree have been deleted; the reusable original research APIs remain here.

The [spatial study](game-example.ts) declares advisory candidates for the two automatic native towers. Its educational qualification is **unqualified** after restoring physical journeys: the unchanged 20–200 tick horizons do not establish completed tower benefits or held-out balance. It declares nine plans across nine contexts before measuring: no tower, each tower, both, upgraded versus two basic towers, and a preparation placement. Contexts include slow review/output/preparation, Clear, fast sparse work, unreadable source, Stop cutoff, and two held-out maps. Each uses 160 resources, at most 200 ticks and 2000 business events. Placement is checked by actual Host, not a second geometry model.

```sh
timeout 900s node --experimental-strip-types --input-type=module -e 'import {runGameExampleStudy,checkGameExampleStudy} from "./prototypes/canonical-defense/lab/game-example.ts"; const study=runGameExampleStudy(); console.log(JSON.stringify({checks:checkGameExampleStudy(study),study},null,2));'
```

Summaries retain exact automatic shot targets/ticks, settled and delivered business times, health, investment, retained entries, ledger exposure and source/configuration identities. The checks require all 81 declared rows without omissions or duplicates, legal authored plans, event ceilings, investment accounting, the Clear courier counterexample, and the early Stop horizon with no completed delivery. A structural pass explicitly reports `educationalQualification: "unqualified"`; it does not certify the teaching or balance of these candidates. The maintained game laboratory tests separately cover complete useful tower journeys and partial Stop delivery. They do not establish universal balance or human learning. The retained 2026-10-05 spatial-study receipt describes the replaced building-profile roster and is historical evidence only.

### Current teaching interpretation

The playable roster has four automatic roles; see the [roster experiment](PLAYABILITY.md#four-tower-roster-experiment). Work Finisher targets the shortest current work; Work Pulse targets up to three distinct current bodies at half the base frequency. Work Accelerator shortens one visible preparation/review monster's remaining journey; Result Courier shortens one authorized delivery packet's journey. Each shot halves the remaining delay with a 100ms floor, preserves the current position and retains the existing outcome and ownership. Subsequent hits use the updated delay. This replaces the earlier immediate-completion, phase-center experiment: its numerical results are not current balance evidence and must be rerun before making balance claims.

The local [playability framework](PLAYABILITY.md) owns the development procedure and counterexamples. `playability.test.mjs` checks actual movement, precise recipients, automatic firing, pause, phase continuity, distinct outcomes and visible stacked hits. `preview-render.test.mjs` checks numeric preview, coverage, upgrades and actual scene integration. These are finite behavior witnesses, separate from native window checks and from human learning.

The intended lessons remain testable predictions: accelerating one sibling need not complete a family; delivery requires authorization; uncertain acknowledgement retains ownership; accepted certain individual delivery releases its payload; Stop can select ready A and exclude late B. Every demonstration must show its counterexample. No new global balance or learning-confidence claim follows from the current repair.

Construction uses a fixed 160 resources and deliveries create no resources. Accelerator costs50, with upgrades40/60; Courier costs40, with upgrades32/48. Default radius is72/84/96 and shot gap20/10/6 ticks. Wider coverage and faster repeat shots are observable; they do not guarantee a better final outcome in every placement or workload. Longest-remaining-delay targeting is a deterministic heuristic, not an optimal scheduler.

## Control-only probe inputs and outputs

The control-only [API](index.ts) accepts a source-free public `RunConfig`, context identity, fixed budget, enabled mechanism identities, catalogue and finite `untilTime`/`maxEvents` bounds. It creates an ordinary shared Run; it does not maintain another business scheduler or patch Canonical.

Catalogue entries own display names, lessons, intervention targets, applicability conditions, the business observation used to demonstrate an effect, prices and effect parameters. These metadata fields must contain nonempty text; they state an intended lesson, not evidence of learning. Policy actions select only the mechanism and its business-boundary time. Prices and effect parameters in actions are rejected. The default catalogue enables JevService (60), DeliveryRelay (55) and AccessRepair (45). JevService and DeliveryRelay accept an optional integer `baseDelayMs` in [0, 1,000,000,000]; omitted values use the initial shared scenario profile. Purchase level one uses `floor(base / 2)`, level two `floor(base / 3)`, and later levels continue from the original base. JevService preserves the original explicit outcome or sampled weights. DeliveryRelay preserves output outcome and lease. The direct AccessRepair policy permits source/credential restoration once per experiment; repeated attempts return `inapplicable` with zero charge, including aliases in a custom catalogue. This is a control-only probe restriction; AccessRepair is no longer a playable tower. An explicit catalogue replaces the whole default catalogue: removed identities cannot remain selectable through an implicit merge. Changing an ability or price requires no business-policy change.

Results contain each action's refusal or application and actual charge, initial/spent/remaining investment budget, streamed observations, business metrics, ordinary business replay and a version-one experiment recording. `execution` reports the requested bounds and actual endpoint. `termination` distinguishes idle, time-limited and event-limited execution.

Business metrics keep requests started, confirmed output bundles, retained finding entries and owned bytes separate. `pendingFindings` counts projection entries, not individual finding items. Uncertain delivery can retain a finding; inspect canonical ownership separately from submission counts. Frame counts describe observations and are not a throughput score.

Timed controls apply at reached business observation boundaries. The Run clock remains at its last actual transition; it does not advance through empty time merely to apply a purchase. An unreached time yields `notReached` and costs zero. Refused and disabled actions also cost zero. Equal-time actions preserve declared order.

Replay verifies the engine replay identities, actual direct laboratory source, and experiment inputs, including game-only investment configuration. Changed code or inputs require a new experiment; there are no replay migration shims. Keep recordings as JSON data and use `replayExperiment` to reconstruct results.

## Comparisons and bounded search

`compareExperiments` runs two declared policies against identical scenario, catalogue, budget and limits. It returns both results and separate game/business deltas. The outcome-coupling field distinguishes a fixed scenario override from sampled outcomes: the same seed alone cannot guarantee the same outcome for each issued operation after an intervention changes issuance order.

`compareInteraction` runs no-action, A, B and ordered A+B under those same bounds. At equal times, A's actions precede B's. The contextual study examines distinct service/delivery/access interventions. Costs and separate business observations expose expensive combinations without automatically selecting or applying a winner.

`searchExperiments` enumerates only declared plans. `searchContexts` shares one attempt budget across tuning contexts, including invalid plans, and reports unsearched plans. Invalid game plans are recorded; errors from the shared engine propagate as failures. No optimizer, universal dominance claim or automatic patch application is included.

Contexts are explicitly `tuning` or `heldOut` and have unique identities. Search executes tuning contexts only. `evaluateHeldOut` receives an already selected baseline and candidate; it does not choose a winner from validation results. All scenarios and search lists are finite and offline.

## Actual-game ability boundary

The provisional teaching priority is causal clarity over the number of abilities. The following selection remains editable; measurements do not establish human learning or a permanent roster.

Optimization and ability replacement preserve ownership, permits, freshness, authorization and committed output membership. Reject unsupported interventions explicitly; preserving a tower name does not justify extending the shared core. Delete replaced game-owned configuration, action and comparison paths when their replacement becomes the current owner; deletion of earlier prototypes follows their existing separate cleanup trigger. Difficulty targets and numerical thresholds belong to each declared study, while architectural constraints remain fixed.

| Priority | Ability | Intended observation | Countercase |
| --- | --- | --- | --- |
| Active | Work Finisher | Shortest remaining work first; earlier short completion can release pressure. | A long sibling can still delay family completion. |
| Active | Work Pulse | Up to three exact visible recipients per slow volley. | On isolated work, it fires less often for the same50 investment. |
| Active | Work Accelerator | Complete selected current work; reveal sibling bottlenecks and cooldown/cost trade-offs. | One faster sibling can leave family output unchanged; no live target consumes no cooldown. |
| Active | Result Courier | Earlier authorized individual or Finish delivery, without bypassing ownership rules. | Clear and expired authority have no target; earlier cycles can increase pressure. |


The headless [game action seam](../DefenseLab.bend) reuses Host construction, placement validation, upgrades and observed ticks. It returns explicit illegal-placement, unknown-tower, unaffordable and maximum-level refusals with zero charge. Its tick retains automatic exact-target volleys and health damage with the same fixed construction budget as the interactive teaching mode. The [actual-game API](game.ts) connects that seam to deterministic build/upgrade/fire schedules, separate game/business observations, finite comparisons/search and JSON experiment replay. `node scripts/build-game-lab.mjs` emits the optional game module; its checker hashes every transitive repository Bend dependency and checks exact emitted bytes.

`runGameExperiment` retains the `continuousGame` label and accepts explicit scenario settings: request/output/source delays, readable source, credential readiness, sampled/clear/finding outcomes, initial burst and arrival interval. Defaults are 3200/800/800ms, ready/readable access, sampled outcomes, burst 1 and 30000ms arrival interval. The creation seed also configures the advicee workload seed. Supply layout, fixed initial budget, enabled catalogue identities, deterministic build/upgrade/fire actions, `untilTicks` and `maxEvents`. One tick requests a 20ms business endpoint and at most 256 events, additionally limited by the remaining global event budget. Business time remains the engine's actual endpoint and is reported separately from the game tick. Coordinates and one-based upgrade indices are recorded; the newest tower comes first in the tower list. Rejected actions spend zero.

Each creation, action and bounded tick compares the complete emitted NativeRun representation against the ordinary public business runtime, product/graph frames and physical callback deliveries through the maintained shared conformance comparator. The ordinary public Run receives the original workload inputs and supported controls, including exact callback rescheduling at the current game endpoint; native frames are not rescheduled as product commands. Results and recordings include an ordinary version-one business replay, exported and restored at the endpoint. `replayGameExperiment` validates that replay, reruns the actual Host, and compares the exact regenerated business replay and game trace identity. Stale generated source/module identities and mutated recordings are explicitly refused. These checks establish the emitted game/public business seam; native game checks and graphics-window evidence remain separate.

Control-only probe purchases apply public controls at reached observation boundaries. They measure future request latency, future output timing and access restoration without spatial placement. They preserve original sampled outcome weights, explicit outcomes, output certainty, leases and already issued/authorized facts. They do not implement dependency-targeted acceleration, batching or launch pacing.

The direct study and actual-game mode have different current evidence boundaries. Control-only probes accept arbitrary source-free public scenarios and editable mechanism descriptors. Their profile/access probes are not playable towers; the two modes do not claim identical catalogue or strategy semantics. Actual-game mode measures the current four native abilities with configurable catalogue prices/assignments, supported placement/upgrades and separate health observations. The main game and experiments both use fixed construction investment. The spatial runs compare the emitted NativeRun representation with ordinary public business traces and replay. Native executable and graphics-window evidence remain separately owned checks. Numerical examples do not demonstrate human learning, enjoyment, global balance or interactive platform support.

The actual-game API accepts an optional experiment-owned catalogue containing identity, cost, one of the four supported abilities, display name and intended lesson. It replaces the complete default catalogue; removed identities are rejected. Prices and mappings are bound to replay. Accelerator upgrades cost40 then60; Courier upgrades cost32 then48 and stop at level3. Optional strength is1–16 and base radius20–240; defaults are1 and60. Effective radius is base plus12 per level; strength/level reduce the automatic cooldown. The playable defaults cost50 for Work Accelerator and40 for Result Courier. Neither changes future request profiles, outcomes, access, ownership or Finish membership.

Set `automaticTowers:true` for gameplay comparisons. The default false is a controlled experimental seam for explicit fire schedules; the interactive game always fires automatically. The timestamp of a shot is max(last business event time, game tick×20ms). Exact callback rescheduling rejects timestamps before the business clock, cancels the previous physical delivery and preserves its payload. It does not manufacture a Canonical event or advance an idle clock.

## Proposed human prediction and explanation checks

These are proposed checks for a later teaching session; no participant results have been collected. Record answers separately from numerical experiment outcomes and ask for a prediction before revealing the trace:

- Predict whether accelerating A changes a family’s completion while sibling B remains unfinished. Inspect both callbacks and the actual captured output members.
- Predict whether a courier helps a Clear review, unreadable source or unauthorized output. Explain why no target means no shot.
- Compare an upgraded tower with two basic towers: first simultaneous shots, later cadence, coverage and total investment are different.
- Predict what an upgrade does during cooldown. The current ready time stays fixed; the next cooldown uses the upgraded cadence.
- Given confirmed output and a retained finding, predict whether ownership disappears. Delivery alone is not retirement authority.
- At a Stop cutoff, identify ready A, late B and the exact committed Finish packet. A courier can move that packet’s delivery; it cannot add B after capture.

Keep prediction accuracy and explanations distinct from enjoyment or preference. A successful numerical intervention supplies a trace for these questions, not evidence that a learner understands it.
