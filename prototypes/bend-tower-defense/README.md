# Bend architecture tower defense

**Purpose:** Explore a native Bend tower-defense game with safe queue roads, dangerous building arrivals, separate storage and worker permits, per-edit advice readiness, byte batches, bounded automatic Stop decisions, four automatic architectural support towers, optional automatic wave starts, and read-only placement stat and dynamic-effect previews.
**Status:** Throwaway gameplay prototype; see validation evidence for executed checks.
**Authority:** Implementation and validation evidence, not an accepted Hapsland product contract.
**Expected use:** Play the road/building tower-defense prototype locally on macOS or Linux, reproduce its mechanics checks, and use the retained queue-board and combat experiments as diagnostic comparisons.
**Lifecycle:** At the tower-defense direction decision milestone, consolidate useful mechanics and evidence into its owning game specification or issue, update inbound links, and delete rejected prototype code and temporary evidence. Preserve provenance in the isolated prototype worktree/branch or source bundle. Revisit these instructions when native controls or the tested Bend version change.

## Current direction: roads, buildings and construction

Run `./run-road.sh` for the native game. All authored mechanics, input, timing and drawing are Bend; the shell launcher only compiles and starts it. This increment incorporates master `8233b07`, including Hapsland's dispatch and per-edit readiness amendment. It is a teaching scenario, not a replay of the production reducer.

Approach roads are finite safe space belonging to the same queue as their building. Inside enemies cause recurring pressure while waiting, processing, blocked by sibling work, or reserved for output. A full ordinary building makes newcomers wait on its road; an immediate-refusal policy records a refusal. A full downstream road retains the source reservation. Construction, placement, upgrades and pacing are player decisions. Optional auto mode starts waves only; it never constructs or upgrades towers. Tower targeting, processing, output batching and Stop progression operate automatically; there is no tower activation action.

`RoadModel.bend` owns generic configuration and state. `RoadGame.bend` owns transitions and construction. `RoadScenario.bend` maps service/release rules to Capture, Review, Advice and Output. `RoadRender.bend` draws the map and semantic dashboard; `RoadMain.bend` drives native input and fixed twenty-millisecond ticks. `RoadAuto.bend` adapts the shared `../../packages/session-bend/Session.bend` task scheduler to wave starts; Monkey Business calls a JavaScript module compiled from that same source. The native window is 1024 by 768; construction retains the original map coordinates.

## Play architecture tower defense

With Bend and native compiler prerequisites installed, run `./run-road.sh` from this directory. The launcher builds for your computer; a Linux executable is not a macOS executable.

- **1 Rapid**, **2 Batch**, **3 Relay** choose an automatic processor. Construction costs are 35, 55 and 45 gold.
- **4 Parallelizer**, **5 Coordinator**, **6 Packager**, **7 Shield** choose an automatic support tower. Construction costs are 70, 35, 60 and 50 gold. Number keys select what to build; they never activate a tower.
- **Click ground** to construct; **click an existing tower** to select it; **U** upgrades the selection. The placement ghost and range circle use the mechanics' legality/range functions.
- **N / Enter** starts a wave manually. **A** toggles automatic wave starts, with a three-second preparation countdown. Construction and upgrades remain manual. **[ / ]** adjusts the arrival interval; the HUD shows milliseconds.
- **Space / P** pauses both gameplay and the auto-wave countdown. **R** restarts and switches auto off; **Tab** cycles scenario contexts, resets and switches auto off; **Escape** closes the window.

Six waves author 24, 30, 36, 42, 48 and 54 review-unit identities: 234 total. Groups of three units represent one edit; one unit is clear and two carry findings. Membership, outcomes and output sizes are fixed by identity, independently of pacing and placement. This increment represents related review units entering preparation individually; it does not yet simulate one source edit physically splitting into several units. Each finding-bearing unit represents one advice item here; production units may yield several findings.

## Shared session scheduling and auto waves

Auto mode consumes recurring task starts from `packages/session-bend/Session.bend`. Completing a wave asks the shared scheduler for its next task, using a three-second task pause. The initial activation and reactivation grace are provided by the game adapter; later intermission delays come from the shared task scheduler. A manual start consumes the pending task once. Switching auto off leaves the current wave running; switching it on provides preparation time. Victory and defeat remain terminal, and automatic scheduling never bypasses the engine’s Stop and retained-work checks.

The reuse is executable code: the native Bend game imports `Session.bend`, while Monkey Business uses its compiler-emitted JavaScript through a thin TypeScript boundary. The shared source owns seeded timing, task/edit/finish progression, generation invalidation and repair scheduling. The game uses the task timing portion only. Its finite wave sizes, unit identities, outcomes and within-wave arrivals remain scenario mechanics; auto waves do not claim to replay Monkey Business’s complete edit/review workload or the production reducer.

This is a scheduling convenience rather than an automated player. Architectural choices still come from your placements and upgrades. The auto indicator distinguishes waiting for preparation from an active wave, pause and terminal state. The teaching criterion is that automation changes when another task begins while preserving service, output ownership and Stop obligations.

For a portable source bundle, retain the repository-relative layout: `prototypes/bend-tower-defense` and `packages/session-bend` must remain at those paths. From the extracted bundle root, run `./prototypes/bend-tower-defense/run-road.sh`. No Node.js runtime is needed to play the native game. Run `sha256sum -c source-sha256.txt` from this game directory to verify packaged source; macOS provides `shasum -a 256 -c source-sha256.txt`.

## Placement stat previews

Choose a tower with **1–7**, then hover over a placement before clicking. Number keys return from tower inspection to build mode. The affected building and its architecture panel show the **current effective stat plus the proposed marginal change**, with the change drawn in a distinct color. Clicking uses the ordinary purchase; previewing spends no gold and changes no game state.

Parallelizer previews worker permits at its nearest eligible building. Existing bonuses and the two-extra-permit cap apply, so a saturated pool has no extra worker to promise. Packager previews the next batch’s per-item overhead reduction and target-size increase independently, including the zero-overhead floor and support-level cap. It does not change an existing committed reservation. The gold display shows the construction cost separately.

`RoadPreview.bend` obtains its numbers by comparing the engine’s supported configuration before and after a pure hypothetical legal purchase. Invalid ground, insufficient gold, existing-tower inspection, terminal runs and absent eligible targets suppress actionable building bonuses. A legal but saturated or ineffective purchase still has a real cost; the preview makes that visible. Road length, travel speed, road capacity and building storage remain unchanged by the current tower set.

These are exact capacity/policy deltas, not forecasts of future throughput or damage.

## Placement effect signal

The placement ghost and radius share a single effect assessment, with a nearby explanation rather than color alone:

- **Cyan:** a measured next-shot/protection effect or a positive worker/next-batch policy change.
- **Orange — NO EFFECT HERE / NO EXTRA EFFECT:** no eligible building in range, or the applicable support bonus is already capped.
- **Amber — NO EFFECT NOW:** the location has a relevant building, but the current snapshot has no eligible work or additional pressure protection. This is not a promise about future usefulness.
- **Red:** construction is blocked, including insufficient gold or invalid ground.

An overlapping Shield may spend charge while adding no protection; its warning distinguishes charge expenditure from extra protection. Packager can change future batch policy even with no eligible findings now, so an empty candidate does not cancel a real policy delta. A larger batch target can also increase waiting; cyan signals the policy change, not guaranteed benefit. Legal ineffective placements remain purchasable and retain their real gold cost; the signal informs the placement decision rather than changing mechanics.

[Effect classifier checks](validation-no-effect-tests.txt), [native input evidence](validation-no-effect-native.txt), and [Astra medium review](validation-no-effect-astra.txt) record this increment. Compare [no effect here](preview-no-effect-range.png), [no effect now](preview-no-effect-empty.png), and [empty batch with a real policy change](preview-no-effect-policy.png).

## Dynamic effect experiment

Hover previews also expose the current work and the state-dependent effects. These are labelled snapshots; current enemies are held fixed for the comparison. They do not simulate future arrivals or guarantee the same targets when the tower eventually fires.

| Preview | Visible state and comparison | Architecture distinction |
| --- | --- | --- |
| Rapid / Batch / Relay next shot | Enemy unit identity and remaining work, with the proposed work reduction and highlighted targets. | Only admitted active work receives tower effort; Batch can affect multiple active units. |
| Coordinator next shot | Target blocker and same-edit waiting findings, remaining work and readiness after the isolated shot. | Completing one sibling does not grant readiness while other or unoffered siblings remain. |
| Shield one pressure tick | Arrived pressure before and after protection, additional prevention, and the new shield's charge expenditure. | Pressure is a building occupancy cost; overlapping shields share a half-pressure ceiling. Charge expenditure can replace existing protection without adding protection. |
| Packager eligible now | Candidate unit IDs and encoded bytes before/after, flush wait and whether dispatch would start under current conditions. | Future batch policy changes packing and readiness to dispatch; committed writer membership and bytes remain owned and unchanged. |

Pressure counts are pressure units, not an immediate promise of lost health: the accumulated pressure threshold controls damage. Packager membership shows the currently eligible byte-bounded candidate, not future arrivals. If a writer is busy, its committed reservation is displayed separately from the candidate for a future batch.

These visuals are a gameplay experiment. Passing mechanics checks and inspecting screenshots do not establish human learning or engagement.

[Dynamic mechanics validation](validation-dynamic-headless.txt) records 16 passing native checks. [Dynamic desktop evidence](validation-dynamic-native.txt) and [Astra review](validation-dynamic-astra.txt) cover the rendered experiment. Processor, Coordinator and Shield screenshots use an ordinary live wave. The nonempty Packager screenshot uses a paused native test fixture through the same renderer: ordinary dispatch can reserve the candidate in the same transition, so the observed default wave did not expose an idle nonempty candidate for capture. Native execution is validated on Linux ARM64; macOS remains unvalidated. See the [Batch work preview](preview-dynamic-batch.png), [Coordinator dependencies](preview-dynamic-coordinator.png), [Shield pressure](preview-dynamic-shield.png), and [Packager candidate](preview-dynamic-packager.png).

For the fixed stat previews, [directed validation](validation-preview-headless.txt) records 18 passing checks against actual purchase results, caps, floors, placement gates and committed writer preservation. [Native input evidence](validation-preview-native.txt) records hover → purchase and inspection → build transitions. See [worker preview](preview-workers-before.png) and [Packager preview](preview-packager-before.png). [Astra review](validation-preview-astra.txt) evaluates the architecture teaching and rendered feedback. Native execution was validated on Linux ARM64; macOS execution remains unvalidated.

## Distinct queue rules

Storage capacity and active worker count are separate. Arrived packets may wait dangerously inside storage without owning a worker. Only admitted active work receives natural service or tower effort. Completing or cancelling work frees its permit. More storage does not grant more Jev parallelism.

Capture and Review are independent service pools. Clear review results exit at Review; findings keep their identity and continue. A processing tower cannot turn a finding into a clear result.

Advice keeps completed findings while any sibling preparation/review unit from that edit remains unfinished, including siblings not yet offered. A completed unrelated edit can become eligible independently. The latest product boundary is per-edit readiness, not a dispatch-cohort barrier or an elapsed-time readiness window. Output batches may combine eligible findings from several edits in the same modeled round.

Output uses variable authored byte sizes, a configured encoded-byte budget including envelope overhead, and one exclusive writer. A reservation owns its selected members until acknowledgment; they cannot be selected again. Selected packets transfer to a byte-reserved writer lane spanning their remaining roads and buildings. Pending storage/road limits exclude those IDs, while the single writer owns their modeled bytes; they retain normal travel, active-worker rules and inside-building pressure. This is a visualization abstraction for output ownership, not a production road bypass. Overflow remains live. Partial batches flush after a bounded wait, and Stop provides an immediate eligible-output opportunity. Output completion means simulated submission, not agent reception, repair or a clear follow-up review.

Stop begins automatically after the final authored arrival. Its fixed deadline gives unfinished preparation/review and an existing writer a bounded opportunity to settle. Ordinary per-edit readiness still applies during the wait. At the decision boundary, unfinished upstream work is cancelled once and completed partial findings become eligible. One Stop response selects one byte-bounded batch. There are at most four finding-bearing Stop responses in total; automatic follow-up finish attempts are separately counted and bounded, and do not imply repair. Retained overflow after that budget ends the run as INCOMPLETE; N cannot grant it a new budget. The game's original wave cutoff remains fixed across those simplified attempts. This is a game bound, not a claim that separate real host invocations share one deadline.

The dashboard distinguishes clear review completion, submitted findings, refusal, cancellation, output limitation and retained work. Retained output remains a live obligation in an incomplete debrief. Cancellation or failed output never counts as reviewed clear or submitted advice.

## Pressure and scope

```text
hot(t) = packets inside buildings, including waiting/held/reserved packets
absorbed(t) = automatic shield spending, bounded by remaining charge and local pressure
pressure += hot(t) - absorbed(t)
damage = pressure // pressureEvery
pressure = pressure % pressureEvery
```

Safe road travel contributes zero. For length L and speed v, road slack is approximately `ceil(L/v)` ticks: it delays both danger and service rather than increasing throughput. Building pressure is a gameplay abstraction, not a production rule that queues cause health damage.

Scenario data owns geometry, capacities, service/release roles, routes, work, output parameters and finite wave timing. Extending transition semantics still requires deliberate engine work. This model does not promise compatibility with arbitrary future architecture, represent delivery uncertainty/reoffers or simulate cooperative repair. The four support families are Parallelizer, Coordinator, Packager and a limited pressure shield. Their effects and shield spending are automatic; constructing, placing and upgrading them are player decisions.

## Automatic towers and architectural learning

Astra reviews these mechanics against a specific criterion: does the visible effect help a player explain a causal architectural rule? A tower name or higher score is insufficient. Directed examples must show both an effective intervention and a case it cannot solve. These are learning hypotheses and executable mechanics evidence, not measured learning outcomes.

| Tower | Architectural rule to predict | Visible intervention | Boundary that must remain |
| --- | --- | --- | --- |
| Parallelizer | Stored work and active service permits are different resources. | More jobs work simultaneously at one nearby ordinary-service building. | Storage does not grow; one job is not individually faster; Output remains one writer. |
| Coordinator | Findings from an edit can wait for an unfinished sibling review. | Accelerates an already-active sibling whose completion helps release waiting findings. | Cannot process a queued sibling without a permit, forge readiness, or change findings into clear results. |
| Packager | The host limit applies to encoded output bytes, including overhead. | Smaller modeled per-finding overhead can put another unchanged finding in the same reservation. | Content and identities stay fixed; the byte cap, one writer and Stop deadline remain. |
| Shield | Time spent protecting a backlog differs from time spent resolving it. | Automatically absorbs bounded pressure from arrived work while showing charge spent. | Backlog, service effort, findings and deadlines remain; finite charge exhausts. |

The underlying mathematical distinctions are:

- For homogeneous jobs with work `w` and `c` worker permits, service capacity is approximately `c / w` jobs per tick. Adding permits helps a multi-job queue; one job still requires its work. More storage delays refusal without increasing this capacity.
- For an edit with `k` completed findings waiting for a sibling, its waiting cost is the area `sum(k(t))` over ticks. Spending equal service effort on that active sibling can reduce this cost sooner than spending it on unrelated work. Coordinator targets a dependency rather than changing the readiness rule.
- A batch fits when `batchOverhead + sum(contentBytes) + n * itemOverhead <= byteCap`. Four 2,500-byte findings with 128 batch bytes and 32 bytes each require 10,256 bytes, exceeding 10,240. With 16 bytes each they require 10,192. The same findings fit through representation efficiency. Increasing the ordinary batch target also introduces a latency tradeoff; the existing flush bound and Stop behavior still apply.
- A shield with charge `Q = 240` can absorb at most `Q` arrived job-ticks over a wave. Overlapping shields share a ceiling of half the arrived pressure per covered building and globally; each tower also absorbs at most twice its level per tick. Upgrading never refills charge. It cannot stabilize an overloaded queue because its service rate is unchanged. After charge is gone, the original pressure resumes.

Coordinator costs the same 35 gold as Rapid and supplies 75% of its raw work per cooldown, at every level. Its conditional advantage is accelerating the sibling that holds completed findings; without such a dependency it supplies no extra work. This tuning is judged through matched positive and negative cases rather than presented as a universal optimum.

Parallelizer, Packager and Shield choose the nearest eligible building within range; Coordinator scans eligible active blockers in range. Parallelizer grants one extra permit at level one and two at higher levels, with a shared cap of two extra permits per building; level three expands range. Packager reduces item overhead by 16 bytes per covered level down to zero; further investment cannot reduce it below zero. Its higher ordinary batch target can increase waiting. Shield refills only when a legitimate new wave begins.

The Output Batching context uses 2,500-byte content and a four-item base target, making the near-cap decision available in normal play. Oversized individual content is still checked in directed examples rather than guaranteed losses in that scenario.

The mappings are deliberately limited. Actual Hapsland preparation dispatch and Jev requests have separate pools in `packages/agent-flow-bend/Dispatch.bend`; the game's generic buildings approximate those service resources without copying their production permit counts. Per-observation readiness is owned by `Canonical.collection_ready`. Production output measures serialized bytes in `src/resident/collection.ts` and enforces the cap through `Handoff.fits_batch`; Packager is a modeled efficiency investment, not an existing product codec setting. Building damage and Shield are game abstractions. No tower asserts that a user can tune the real backend in the same way.

For a later human teaching check, ask the player to predict the result before placing a tower, then explain it after observing the counters. Score correct predictions separately for worker/storage separation, per-edit readiness, byte accounting and finite protection. Include a single-job Parallelizer case, a queued-blocker Coordinator case, an already-fitting Packager batch and an exhausted Shield. Measure retries and enjoyment separately; no participant study has been run.

## Auto-wave validation

[Desktop evidence](validation-auto-native.txt) records actual keyboard/mouse controls, pause invariance, manual construction and a completed Stop before the next shared task starts. [Architecture review](validation-auto-astra.txt) assesses the reuse and teaching boundary. `RoadAutoHeadless.bend` exercises scheduler boundaries and preservation of manual investment; Monkey Business’s package tests compare the port against its independent test-only predecessor. Native execution was observed on Linux ARM64; macOS execution and human learning remain unmeasured.

To reproduce the scheduler checks:

```sh
./bend-check RoadAutoHeadless.bend --check-only
bend RoadAutoHeadless.bend -o /tmp/hapsland-auto-checks
/tmp/hapsland-auto-checks --threads 4
```

The portable bundle runs the native game. Monkey Business tests additionally require the full Hapsland checkout and its existing dependencies. From that checkout, run `npm test --prefix packages/monkey-business` and `node packages/session-bend/build.mjs --check`.

## Current tower validation

[Native mechanics evidence](validation-towers.txt) records pre-execution criteria, the original Coordinator calibration, declared candidate changes, directed cases, negative controls and matched campaign observations. [Desktop evidence](validation-towers-native.txt) records real keyboard/mouse inputs and source hashes. [Astra's teaching review](validation-towers-astra.txt) assesses each mechanic's architectural lesson against code, tests and the visible causal panels. These are bounded implementation observations; human learning and enjoyment have not been measured.

Controlled comparisons distinguish architectural causes at equal construction spend. At 35 gold each, Coordinator releases the blocked edit in 9 ticks versus Rapid's 24, but ordinary lone work takes 24 versus Rapid's 9. At 70 gold each, Parallelizer releases a tiny queued sibling in 1 tick versus two Rapids' 13; lone 24-work service takes 24 versus their 1. The Parallelizer example supplies heterogeneous remaining work explicitly and does not claim the current uniform wave generator commonly produces that scene. Packager reserves four unchanged 2,500-byte findings at 10,192 bytes where baseline encoding fits three. A 240-charge Shield reduces 600 arrived job-ticks to 360 while preserving work and deadlines.

The campaign matrix compares four fixed 120-gold packages across four contexts, plus an undeployed reference. Only two Rapids plus Shield wins: default at 45 health, Capture Pressure at 10 and Output Batching at 33; all packages lose Review Pressure. The other three packages lose all four contexts. A separate strategy investing between waves buys all four new families and wins all six waves, settling 234 units at 88 health. These establish conditional mechanics and a playable combined strategy, not broad balance of each family. Recorded waiting-area totals have different survival horizons and offered/completed work; they are not a causal percentage improvement in latency.

Packager-only at pace 18 reaches three reserved members in the near-cap campaign. The actual four-member desktop witness uses pace 6 with Packager and Coordinator. Byte arithmetic creates an opportunity; eligible findings must also accumulate before flushing. This cadence dependency is part of the lesson.

The preceding packaged tower snapshot’s desktop views show [worker permits](preview-towers-parallelizer.png), [a blocking sibling](preview-towers-coordinator.png), [four findings within the byte cap](preview-towers-packager.png), and [a Shield upgrade preserving spent charge](preview-towers-shield.png). All are screenshots of the native game after normal controls, without injecting game state. Pausing covers part of the map while leaving the causal panels visible.

To reproduce the current checks (the checker wrapper needs `timeout` or `gtimeout`):

```sh
./bend-check RoadMain.bend --check-only
./bend-check RoadHeadless.bend --verdict
bend RoadHeadless.bend -o /tmp/hapsland-road-towers-headless
/tmp/hapsland-road-towers-headless --threads 4
```

Native compilation and campaign execution are separate from the five-second checker limit. The normal game launcher does not require a timeout utility. Linux ARM64 execution is observed; macOS execution remains unvalidated.

## Earlier backbone evidence

The preceding worker/group/batch/Stop increment is preserved in `../bend-architecture-defense-increment-source.tar.gz`. Its executable checks and campaign observations belong in [validation-road-increment.txt](validation-road-increment.txt), with native window observations in [validation-road-increment-native.txt](validation-road-increment-native.txt). These files distinguish compiler checks, directed finite cases, campaign measurements and native input observations; none establishes human engagement or learning. macOS execution remains unvalidated by Linux ARM64 checks.

That earlier native run passed 33 directed fixtures and 12 campaign cases: eight defended wins and four undefended losses. Conservation and identity uniqueness are checked every executed tick; full capacity/worker/byte audits run every twenty ticks and at the first/final state, supplemented by directed saturation cases. The earlier 36-case declaration was explicitly amended before the final run after correcting the harness's primary mouse button and bounding audit cost.

| Default defended example | Clear | Submitted findings | Refused/cancelled/limited | Health | Ticks |
| --- | --- | --- | --- | --- | --- |
| Mixed bridge, pace 18, six waves | 78 | 156 | 0 | 118 | 5,429 |

The same mixed policy wins Capture pressure with 100 health and Review pressure with 42. The Output batching context deliberately includes oversized findings: it resolves the six-wave run with 147 submissions and nine truthful limitations, not 156 submissions. The displayed RUN COMPLETE label therefore asks the player to inspect outcome totals rather than claiming full coverage.

At default pace 12, Rapid finishes in 4,228 ticks with 107 health, while mixed Batch finishes in 4,182 with 102. At pace 28, Rapid finishes in 7,595 ticks with 127 health, while mixed Batch finishes in 7,619 with 123. These policies begin with 70 versus 90 gold of construction from the same 120 budget and invest between waves; they are joint policy witnesses, not equal-spend causal estimates. Human engagement and learning remain unmeasured.

Four discriminating negative runs fail as intended: restored ordinal/clock outcome coupling, output-slot restrictions, intermediate-road restrictions, and the earlier exhausted-budget reset. The full reserved route acknowledges within 150 ticks before a 240-tick expiry despite saturated pending queues. The Stop reservation and exhausted-budget reset regressions are fixed locally and captured in the source bundle. These are prototype defects, not production-reducer defects; their mistakenly created tracker issues were deleted.

Native input observations show autonomous Stop WAIT, OUTPUT and completion, one wave settling all 24 units, pause preserving its full diagnostic title, an affordable 40-gold upgrade, context reset and clean quit. DECIDING is an atomic intermediate transition and is covered by directed checks rather than claimed as a visually observed pause.

The preceding road mechanics study, headless results and native screenshots describe the earlier source captured in `../bend-architecture-defense-source.tar.gz`. Its fixed per-packet output holding time and 108-case balance results do not apply to this new worker/group/batch/Stop model. [RoadStudy.py](RoadStudy.py) and [its results](road-mechanics-results.json) remain an independent three-stage aggregate-service advisory study, not parity evidence for either native model. Candidate dispositions remain **BORROW** bounded road slack, construction budget and distributed service; **REJECT** indefinite waiting as victory and upstream-only acceleration as a general solution.

The preceding simultaneous-arrival capacity regression is fixed locally. New storage and worker checks must preserve that reservation boundary while separating service permits. The exhausted Stop-budget reset regression is fixed locally; its pre-fix native regression fails, and the increment must preserve retained work in a terminal incomplete debrief. Behavioral proposals in [LAWS.bend](LAWS.bend) remain unapproved and unproved; deterministic examples do not replace universal proofs.

## Queue-board exploration

The native flow game represents work as persistent identified tokens that pass through configurable stations. Stations process work rather than destroy enemies. Healthy busy queues are allowed; old work, capacity refusals and unmet wave demand cost health. Work cannot disappear without a recorded completion or drop.

Run `./run-flow.sh` for the flow game; `./run.sh` still runs the original combat experiment. Both compile native executables locally. All authored input, timing, simulation and rendering for either game are Bend. `MechanicsStudy.py` is an offline analytical study, not a dependency of either launcher.

The backbone has three boundaries:

- `FlowModel.bend` defines generic station configuration, runtime stations, identified packets and game state.
- `FlowGame.bend` advances that state and applies player actions. It does not import Hapsland's canonical reducer or know product stage names.
- `FlowScenario.bend` supplies the teaching scenario: station labels, clear/finding routes, queue and resource limits, service and retention durations, wave demands and difficulty. The native host selects that scenario.

A station declares its normal and finding successors. Terminal routes finish work. Ordinary full destinations apply backpressure: the completed packet stays upstream until the transfer can happen. An immediate-refusal destination drops refused work and records the loss. Service completion and retained resource holding are separate phases. Tokens enter a downstream station after processing the tick's snapshot, so one token cannot traverse multiple stations in one tick.

The Hapsland scenario is a teaching approximation, not a replay of the production reducer. It illustrates source preparation, review capacity, pending advice and host output. Clear review outcomes bypass advice/output. Output completion means completion of the simulated host boundary, not proof that an agent received, read or repaired anything. Assignable workers and purchasable upgrades are game controls; their presence does not assert that the real Jev service is configurable in those ways.

The initial engine supports finite configured stage graphs, per-token clear/finding routes and station resource holding. The current demand generator remains a fixed game rule: six-wave-shaped counts of 18, 24, 30, 36, 42 and 48, and two findings per three offered demand identities; configuration can change the number of waves and deadlines but cannot yet author a different demand schedule. The native renderer exposes up to four station cards; the engine also runs a two-station example without a logic change. It does not yet represent one edit spawning several review units, cancellation generations, delivery uncertainty/reoffers or every retained-advice lifetime. Architecture changes expressible as stage, route, duration, capacity or refusal changes belong in scenario data. New semantics such as fan-out need an explicit engine extension and corresponding executable examples; configuration alone cannot promise compatibility with arbitrary future changes.

The prototype remains isolated in `prototype/bend-tower-defense`. It changes no product dispatch or delivery contract.

## Mathematical selection method

The study evaluates decisions rather than trying to assign a number to enjoyment. Its declared criteria are coverage of fixed demand, completed output, lost work, latency, resource occupancy and sensitivity to the scenario. A promising decision changes the best response in at least two contexts, has an observable consequence, and offers a tradeoff rather than a free improvement. Difficulty is assessed by the gap between simple policies and informed ones. These are proposed design criteria, not validated measures of human engagement or learning.

The conservation identity for the executable engine is:

```text
offered = live tokens + finished + dropped
```

Unserved wave demand is counted as offered and dropped at the wave deadline. This prevents slow admission from appearing successful by shrinking the denominator. For each station, the corresponding recurrence is occupancy next = occupancy now + accepted arrivals - successful departures - removals. Blocked transfers remain upstream. Refused transfers leave the live set and enter the drop counter.

A useful capacity estimate separates work from holding. With c workers, service duration s, R resource slots and additional holding duration h, the sustained throughput upper bound is approximately `min(c/s, R/(s+h))` when each item holds one slot during both phases. Routing matters: if only fraction p of arrivals visits a station, that station sees approximately p times the external arrival rate. These are planning bounds, not a guarantee against burst refusals or deadlines. The executable study uses its declared discrete model rather than assuming these bounds are exact.

Three decisions follow from these constraints:

- **Pacing:** releasing work faster improves coverage of a finite wave until downstream capacity starts refusing it. Slowing too far misses the wave's remaining demand.
- **Allocation:** moving a scarce worker changes one station's capacity at another station's expense. Queue length alone can be misleading when upstream work is about to arrive or resource holding dominates the destination.
- **Upgrades:** reducing service duration helps a service bottleneck. It cannot erase a capacity or retention constraint, and can increase pressure downstream.

The independent Python comparison explores a simplified loss network. Native Bend headless experiments exercise the actual playable engine. Their results must be read separately: agreement on a tradeoff supports the design hypothesis; it does not establish equivalence between two differently scoped models. Neither automated policies nor formal invariants establish that a person understood or enjoyed the mechanic.

## Play the flow game

After extracting this directory, run:

```sh
./run-flow.sh
```

- **1–4** or click a card selects a station.
- **+ / =** assigns one reserve worker; **-** returns one worker when its reservations permit removal. There are six workers across four stations, initially one per station and two in reserve.
- **U** buys a service-speed upgrade for the selected station. The displayed price grows with its level; resource limits and holding duration remain independent.
- **[** admits faster; **]** admits slower. The HUD displays the actual interval in milliseconds. Demand identities and outcomes stay fixed.
- **N / Enter** starts a wave; **Space / P** pauses; **R** restarts the current scenario; **Escape** exits.
- **Tab** cycles the default, capture, review and advice bottleneck scenarios and resets the run. The selected scenario name appears in the HUD.

Each token retains its demand ID while moving between cards. Blue/gold distinguishes clear work from finding-bearing work; orange/red warns about age. Busy, waiting and held counts expose different occupancy. A refusal, age expiration or missed wave demand costs health. Each packet has a six-second age budget in the current scenario; each wave has an eighteen-second admission window. Configuration supplies these game durations, not production timing claims.

The four playable contexts use the same engine and renderer. The three bottleneck variants multiply the selected station's service duration by four and its holding duration by two. Route names and successor labels come from the configured graph. This demonstrates scenario changes without corresponding game-engine changes.

## Observed comparisons and current verdict

The analytical study retained **25,056** runs: 8,064 named-policy comparisons, 15,840 exploratory static-allocation grid runs and 1,152 exploratory fixed-demand pacing comparisons. Thirteen named policy pairs change advantage across contexts, and there is no named policy on every context's coverage/delivery Pareto frontier. See [the executable study](MechanicsStudy.py) and [its raw results and declarations](mechanics-results.json). The pacing extension is explicitly marked as an addition after the first run. The grid uses sixteen seeds, versus sixty-four for named policies; its best means are not the same estimate or evidence of a clear rate.

Candidate disposition: **BORROW** scarce worker/resource allocation and paced admission with fixed demand; **REJECT** naive occupancy gating as a generally beneficial policy in the studied loss network. Neither tested gate improves mean coverage across its eighteen contexts, although small delivery exceptions prevent claiming universal Pareto domination. The transient model uses explicit recurrence assertions; [MIT's queueing-model guidance](https://web.mit.edu/urban_or_book/www/book/chapter4/4.1.html) supports making its assumptions explicit, not treating a simplified model as the product.

The actual Bend engine ran **44 campaigns**, plus focused regression, pause, batching, transfer, retention and alternate-configuration checks. Full accounting/resource/worker invariants are checked for every tick of each first wave and at campaign completion. The retained [native headless evidence](validation-flow.txt) includes the final replay and source fingerprints.

| Actual-engine case | Policy | Observed outcome |
| --- | --- | --- |
| Default | Workers 1/2/2/1, interval 16 ticks, no upgrades | All 198 completed; 24 health; 3,786 ticks |
| Default | Same workers plus repeated affordable upgrades | All 198 completed; 24 health; 3,598 ticks; 720 more gold spent |
| Review bottleneck | Balanced workers with upgrades | Loses in wave 3; 42 completed |
| Review bottleneck | Review-focused workers 1/3/1/1 with same upgrade policy | All 198 completed; 24 health |
| Advice bottleneck | Balanced workers with upgrades | All 198 completed; 24 health |
| Advice bottleneck | Review-focused workers with same upgrade policy | 190 completed; 16 health |

Both investment policies attempt affordable upgrades every thirty ticks in the same review/advice/capture/output order; only the worker vector differs. The policy additions were exploratory and are recorded as amendments in the executable output. These examples show a causal allocation tradeoff; they do not establish an optimal strategy.

The default is an onboarding scenario. Upgrades are optional there and buy only a modest time improvement in the tested policy; they are not yet a strong independent decision. The original extreme-context static/greedy matrix loses every campaign. The investment witnesses establish reachable wins in each displayed bottleneck scenario, but broad player difficulty calibration remains open. The justified backbone is pacing plus scarce allocation, with speed upgrades retained for further exploration.

For a first human teaching check, play the default and review-bottleneck contexts in alternating order. Before acting, predict which station will refuse or hold work and whether moving a worker or buying speed will help. Afterward explain the observed result without looking at the source. Record correct causal predictions, repeated misconceptions, voluntary retries and frustration separately. In the advice context, compare the same two worker vectors instead of changing every variable at once. This protocol is proposed; no participant results exist. Enjoyment, challenge and learning should remain separate outcomes rather than a single weighted score.

The final [native window evidence](validation-flow-native.txt) exercises all four Tab-selected scenarios, worker assignment, wave start, pause, upgrade, reset and quit through the real launcher. [The paused view](preview-flow-paused.png) shows identified work across review, advice and resource-held output. Two paused observations held at tick 95; upgrading the selected review station changed budget from 82 to 32 without advancing the paused clock. Linux native execution is observed; macOS execution and human teaching/engagement are not.

Three prototype defects were fixed locally: immutable demand outcomes, blocked-transfer reservations, and elapsed-zero worker reservations. The mistakenly created tracker issues were deleted; tracker reports are reserved for confirmed Hapsland product-core defects. Each has a discriminating native regression: a scratch mutant restoring the defect exits 1 while the corrected core exits 0. These reports do not assert production-reducer defects. The prototype source is in the isolated worktree and downloadable bundle, with formal laws still proposed rather than approved/proved.

## Native prerequisites on macOS

Install [Bend](https://bend-lang.com/) and Apple's command-line developer tools if they are not already installed. The compiler's [native graphics guide](https://github.com/bendlang/bend/blob/main/guide/GUIDE.md) owns platform prerequisites. Development here uses Bend 2.0.34. On your Mac, a normal desktop session and the system Metal device supply the native window backend; this code uses CPU rendering and has no game GPU kernel.

```sh
xcode-select --install
brew install bendlang/bend/bend
cd /path/to/bend-tower-defense
./run-road.sh
```

The Homebrew command is listed in [Bend's release installation instructions](https://github.com/bendlang/bend/releases). Use the website installer if you do not use Homebrew; no installation is performed by this prototype.

The launcher compiles all Bend source for your own computer and starts the native window. No Node, browser, npm packages, credentials, Hapsland installation or Jev connection is needed. The first compile can take longer than launching the already built binary. The build goes under `$TMPDIR/hapsland-bend-road-defense-<uid>` (or `/tmp`); source remains in the worktree. Re-run the launcher after source changes. A Linux ARM64 binary is not a macOS executable.

On Linux, use an X11 or XWayland desktop with X11 development headers and Clang. This game was exercised here under Xvfb. The macOS launch itself is not validated by that Linux run.

The current increment has an [active gameplay preview](preview-road-increment-play.png), [native window observations](validation-road-increment-native.txt), and [directed checks and campaign results](validation-road-increment.txt). These observations are scoped to Linux ARM64; macOS execution and human teaching outcomes remain unvalidated.

## Play the original combat experiment

Place defenses while a wave runs or during preparation. The path must remain clear. Start with 120 gold and 15 lives; survive six waves. Runners move faster, armored enemies take more damage, and later waves bring more enemies. Kills fund more construction and upgrades. Preparing the next wave gives time to spend earned gold.

- **1** selects a gun (30 gold): rapid single-target damage.
- **2** selects frost (40 gold): slows enemies, with lower damage.
- **3** selects splash (55 gold): slower fire, area damage.
- **Left click** a valid spot to build, or an existing tower to select it.
- **U** upgrades the selected tower, up to level three; inspect the visible cost.
- **N / Enter** starts the next wave when the board is ready.
- **Space / P** pauses or resumes; **R** restarts; **Escape** exits.

Tower targeting, enemy movement, damage, slow duration, bounties, placement, costs, waves and terminal states are implemented in [Game.bend](Game.bend). [Model.bend](Model.bend) owns the state and path. [Render.bend](Render.bend) and [Font.bend](Font.bend) author the complete quadtree image and text. [Main.bend](Main.bend) owns input and the real-time clock using Bend's Base effects. Only the launcher is a shell script; no gameplay or rendering is implemented in a second language.

The game is independent of the Hapsland reducer and the earlier mechanics lab. No mechanic here changes product review behavior. These towers and enemies are ordinary game entities.

## Original combat timing and validation

Physics advances in fixed 20 ms ticks. The native driver accumulates elapsed monotonic milliseconds and retains partial ticks. It processes at most eight catch-up ticks after a stalled frame; a longer stall slows game time rather than applying an unbounded jump. Pause and preparation clear the accumulator. Rendering rate therefore does not select damage or movement per frame, although sustained rendering stalls can slow the game.

For type/termination checks with a five-second bound, run `./bend-check Main.bend --check-only` and `./bend-check Headless.bend --check-only`. The wrapper needs `timeout`, or `gtimeout` from coreutils on macOS. Native compilation is separate from this checking limit:

```sh
bend Headless.bend -o /tmp/bend-tower-defense-headless
/tmp/bend-tower-defense-headless --threads 4
```

Headless scenarios use the same pure gameplay code and run entirely in Bend. They inspect pause, preparation, economy, road placement, exact tick batching, restart, tower kills and bounded defended/undefended campaigns. They are finite examples, not human engagement evidence or a proof over all game states.

The retained [headless output](validation-headless.txt) records fifteen passing checks on Linux ARM64 with Bend 2.0.34, compiling `Headless.bend` to a native binary and running with four CPU threads. `Main.bend --verdict` and `Headless.bend --verdict` also pass the compiler's second kernel check under the five-second bound; these checks validate the program definitions, while the proposed behavioral laws below remain open. Directed scenarios distinguish gun bounty accounting, splash damage, frost slowing and upgrade affordability. An undefended campaign loses in wave two; three unchanged guns lose in wave six; spending between waves wins all six with fifteen lives. The draft HP ramp was raised from nine to eighteen points per wave after the original three-gun setup cleared the entire game without further spending. This tuning creates a tested need to invest for that setup, not a claim that every weapon or strategy is balanced.

Native input/render observations are retained in [validation-native.txt](validation-native.txt), with [a combat preview](preview-combat.png) and [paused preview](preview-paused.png). Real window injection exercised build, select, upgrade, wave start, pause and quit under X11; the tick advanced 150 steps in approximately three seconds of normal play and held at 461 during the observed paused interval. Those are local observations, not a frame-rate or macOS benchmark.

[LAWS.bend](LAWS.bend) holds proposed behavioral laws, including the flow accounting, identity, capacity and workload-independence requirements, for a later formal pass. Human approval precedes their proof under the environment-installed Bend law-driven development skill (`/home/node/.codex/skills/bend-ldd/SKILL.md`), which states: “no proof is written against it until the human approves it.” [PROOF.bend](PROOF.bend) therefore contains no proofs and intentionally reports open laws. Typechecking gameplay is not a claim that those behavioral laws are proved. This does not prevent running the game. The owner authorized merging the runnable prototype into master. A trailing blank line was removed from `RoadRender.bend` during merge preparation; recorded native-review fingerprints identify the tested source before that formatting-only cleanup, while `source-sha256.txt` identifies the committed source. That merge does not approve the proposed formal laws or claim their proofs; the laws remain advisory drafts for a later formalization pass.
