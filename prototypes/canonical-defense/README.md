# Canonical architecture defense

<!--
**Purpose:** Present the shared continuous Monkey Business engine through an optional native tower game.
**Audience:** Prototype contributors and evaluators; Product and specification owners.
**Status:** Gameplay prototype under issue #199; the process-teaching redesign has focused local qualification on Linux ARM64. Earlier receipts cover their identified source only.
**Authority:** Design proposal and implementation evidence; the product contracts and shared engine own business behavior.
**Expected use:** Build spatial towers and inspect continuous review activity in a separate engine instance.
**Lifecycle:** At the owner's game-layout selection, consolidate accepted mechanics into the game owner, update inbound links, and delete rejected variants and obsolete evidence. Review this guide when shared engine controls or native rendering change.
-->

Current builds, laboratory generation and proof checks use the repository pin,
**Bend 2.0.38 / Lean 4.34.0**. Install it through
`node scripts/install-bend-toolchain.mjs` and use its printed `PATH`. The older
compiler versions in retained receipts describe those historical runs.

The [development-time balance laboratory](lab/README.md) provides editable ability catalogues, finite comparisons and replay over the shared engine. Its capability, focused local qualification and gameplay limits are recorded in that guide; the experimental roster remains provisional.

The completed performance investigation and its decisions are recorded below, with executable receipts retained in `performance-evidence/`. The temporary experiment journal has been consolidated here after the full consumer comparison passed.

The native window runs at half real-time speed: each unchanged 20 ms simulation tick takes 40 ms of wall time. Movement, arrivals, tower cooldowns and shot animations slow together; recorded physics steps and headless experiments retain their existing virtual-time semantics.

Run `./prototypes/canonical-defense/run.sh` with Bend, Node.js and native graphics prerequisites installed. **1–2** choose Work Accelerator / Result Courier; click ground to build, click a tower to select, **U** upgrades. Work Accelerator and Result Courier fire automatically at eligible targets in range, with independent cooldowns; selection is for inspection and upgrades. **Space/P** pauses virtual time. The game initially waits for construction. **N/Enter** starts arrivals from the entrance and submits a generic workload burst; subsequent presses add bursts. **B** selects 1, 5, 10 or 20 edits for the next release; **+ / =** and **−** adjust the exact batch size within 1–1024. Repeated releases remain available at any time. Before the first **N**, **F** selects an explicit source-and-credential outage scenario. Neither tower restores missing access. The Accelerator can reveal a captured preparation failure earlier; that is faster failure, not restored access. **S** requests Stop for the current activity while running. The HUD shows its cutoff while waiting; the shared engine selects ready findings, fences late work, and may finish without a packet. Holding S issues one request per press; a deliberate later press is a new caller input. **A** suspends or resumes future recurring arrivals, and **]** speeds up arrivals and **[** slows them down. **R** resets this game instance to construction before N/Enter; **Escape** closes the window. Tab changes an uninvested empty map.

If optimized host compilation reaches the 245-second deadline, use the explicit
local O0 mode:

```sh
HAPSLAND_GAME_OPTIMIZATION=0 ./prototypes/canonical-defense/run.sh --new
```

This appends `-O0` to the selected clang invocation, retains the Apple stack-probe
workaround, and uses a separate cache identity. It can reduce optimization work;
runtime performance and successful macOS compilation require host validation.
The same total build deadline applies. The launcher stops the compiler process
group before deleting temporary output, including clang processes started by Bend.

On Linux, `HAPSLAND_GAME_CPU_BANK=1 ./prototypes/canonical-defense/run.sh --new`
selects the explicit CPU register-bank / clang O0 build. It uses the same Bend
Main and game owners, but is a separate build mode from the default optimized
compiler path. The cache binds the mode, compiler flags and lowering source;
unknown emitted layouts fail closed. The build has a245-second total deadline.
The unchanged Darwin wrapper and ordinary optimized path retain their own
qualification scope. This Linux mode is the one exercised by the current window
and recording checks.

### Native pixel rendering

The window consumes the current `DefenseRender.scene` through the local
`DefenseRaster` IO adapter. Bend owns scene order, monster positions, targeting,
preview and physics. The adapter paints those ordered rectangles into pixels and
returns the same `Image` quadtree format to `Window.frame`. Each call owns its
buffers; there is no cached world or hidden targeting state. Recording source
qualification explicitly excludes the eight native-window IO definitions from
proof claims and rejects any additional unsafe definition or type error. The pure renderer
remains a pixel oracle for verification.

Run `node --test prototypes/canonical-defense/native-raster.test.mjs` for complete
image equivalence on edge cases in native and emitted JavaScript, actual
empty-map/hover/pause scenes in emitted JavaScript, and native-window wiring. Window performance
and macOS behavior require actual window checks; pixel equality alone does not
establish either.

### Tower preview

The owner-approved preview contract applies to the physical system, independently of tower type. At the same world, position and tower parameters, placement and an existing tower must show identical coverage. Pause and cooldown must preserve eligible green targets; only actual firing stops. The chosen immediate shot is yellow. Construction legality is separate: a red icon on a building, road or occupied ground does not erase coverage.

Room queues compare directed remaining distance to the same authored route exit, not screen distance across maze walls. A body behind or on a different exit cannot block a leader; finished history bodies do not occupy a queue and their end timer ages once per unpaused tick. A retained result awaiting authorized delivery still occupies the queue. The first two rooms retain their five-pass maze. This is a physical presentation queue, separate from canonical capacity admission.

Retired packet history finishes its remaining route even when its old room seat or packet authorization is gone. A live packet still waits for physical assembly and authorization. Cancellation never creates a successful delivery; on a finite live run, both canonical reservations and retired visual history must drain. The repeated-release/Stop regression covers all three maps, and recurring-arrival tests cover operation without a manual Stop.

A preparation refusal reserves no new work. `PREP FULL` is a captured refusal shown when its source journey finishes, not a new admission decision at display time. The refusal is caused by shared capacity. Tests inspect the exact pre-decision ledger, including reservation purposes, rather than inferring availability from visible room occupancy. Shared pressure flashes the `SHARED LEDGER` HUD only. Rooms have no duplicated global-health bar. Event text remains visible without decorative partial circles.

Monsters retain their original silhouettes. During Jev work, one moving monster carries numbered check-status glyphs; actual outcomes split into separate visible fragments that keep their original check numbers. Finding fragments follow the road to the retained-room entry and assemble there. One delivery packet, drawn as a stack with `PACKET XN` for its exact finding count, then traverses the existing room and exit; a Finish packet waits for every captured member. Separate fragments are not Courier targets. `DefenseMotion` and `DefenseRules` own their routes and positions; `DefenseLiveMotion` joins current exact callback identities to those actual positions for range and preview. It does not advance an independent body or draw a second target. An automatic shot shows the numeric change and speeds its recipient along the remaining route without teleporting it. The fading shot animation follows that same moving monster; stacked hits retain separate beams from their original towers. The animation does not apply extra hits, and disappears when its recipient is no longer visible. Finish is a separate authorized packet with its captured member count. Coincident bodies show a count and identifiers. Buildings are not targets; empty, completed, cancelled, unauthorized and out-of-range work cannot invent green coverage.

Coverage reads the original physical world. Sequential prediction of earlier towers may change which target is yellow, but cannot erase green coverage. Preview never commits a shot, advances the clock or changes the world. Its read-only targeting projection depends on the engine, elapsed time, map layout and current moving bodies; historical playback, pause and tower selection are not physics inputs.

[DefensePreviewMarks.bend](DefensePreviewMarks.bend) owns the small pure annotation/painting model; [DefenseTowerPreview.bend](DefenseTowerPreview.bend) reads the same eligibility and sequential target selection as the game and joins full identities to drawn bodies. [PreviewLAWS.bend](PreviewLAWS.bend) and [PreviewPROOF.bend](PreviewPROOF.bend) pin inclusion, complete traversal, identity, membership, coordinates, colors and real drawing commands. Their gate includes the mathematical kernel. The eligibility, choice, wiring and entry law/proof pairs pin the world adapter with Bend's checker; no mathematical-kernel pass is claimed for that full-game import graph. Full-game kernel attempts reached the five-second guard, which was not raised. This is distinct from the proved small annotation core. The scene composition laws quantify over well-typed child layer functions and the background builder while retaining the actual wrapper bodies. They establish composition, not the behavior of arbitrary children; actual emitted-scene tests separately bind the real renderer and targeting implementation. Selection, placement and their guards are pinned separately, so an empty conditional branch cannot satisfy the entry laws.

Run the preview checks from the repository root:

```sh
node --test prototypes/canonical-defense/preview-proofs.test.mjs
node --test prototypes/canonical-defense/preview-wiring-proofs.test.mjs
node --test prototypes/canonical-defense/preview-render.test.mjs
```

Each proof/mutant subprocess has a five-second limit. Mutants must compile and fail the named law, rather than fail for unrelated syntax or ownership errors. The emitted actual-scene regression checks visible actor silhouettes at their physical positions, absence of duplicate target bodies, crowded targets, pause, cooldown, unauthorized output, exact Finish capture and read-only inspection. It also removes the actual scene's preview call in a compilable copy and requires the positive visibility witness to reject that copy. Native-window qualification remains separate from these checks. [preview-falsify.ts](preview-falsify.ts) supplies adversarial literal instances to an existing `bend-falsify` installation; `PREVIEW_BATCH=0` through4 split the full set into bounded batches, while `--each` checks every instance separately. No new project dependency is required by the preview gates.

The ordinary-journey acceptance check discovers tower choices through the real keyboard input, runs each of the three maps from the normal game start, and requires a reachable legal placement with visible target and green radius for each choice. It compares built and prebuild scenes both running and paused. This is finite reachability evidence under that workload, not a claim that every workload contains an opportunity for every tower (for example, no authorized output means no Courier target). Universal laws cover shared coverage, pause invariance, source-world independence and drawing; the emitted actual-scene tests and native window separately cover integration.

The selected tower shows a large operation label, remaining travel time → half (with a 100ms minimum), pause/cooldown status, and an upgrade purchase card. While paused or cooling, the numbers are explicitly conditional on being ready now; the future target may change. Its active-work and family panels focus the selected operation. Radius is72→84→96; shot gap is20→10→6 ticks (400→200→120ms) at default strength. Accelerator upgrades cost40 then60; Courier upgrades cost32 then48 and preserve an already armed cooldown. One shot accelerates one callback; it does not promise to finish a whole sibling family. `TowerTimingLAWS.bend` / `TowerTimingPROOF.bend` pin elapsed-time transport and these quotes; run `node --test prototypes/canonical-defense/tower-timing-proofs.test.mjs`. These additional laws use Bend’s checker, not a claimed full-game mathematical-kernel pass.



### Save and replay

The native game appends controls, mouse positions and exact 20 ms tick batches
in realtime to **`prototypes/canonical-defense/game-recording.bin`** (ignored by
Git). Writes go to the operating system before the corresponding game change;
closing the window is not required to retain the complete prefix. The log binds
the initial map and the cached build identity, which includes the shared engine,
configuration and seeded game rules. It reconstructs the complete game World,
including towers, investment, health and presentation history, through the actual
Host. It is a local input journal, separate from the laboratory experiment format.

- `./prototypes/canonical-defense/run.sh` starts a new game and overwrites the
  recording after the window opens.
- `./prototypes/canonical-defense/run.sh --new` starts fresh and replaces the
  same file after the window opens. **R** also replaces that file, retaining the
  currently selected map.
- `./prototypes/canonical-defense/run.sh --resume` explicitly resumes an existing
  recording.
- `./prototypes/canonical-defense/run.sh --replay` watches the saved run without
  writing it. **Space/P** pauses or resumes playback; **Escape** exits. Gameplay
  controls are disabled during replay, and the final state stays visible.

Set `HAPSLAND_GAME_RECORDING` to override the file path. Resume reconstructs the
entire journal before opening it for append; there are no checkpoints yet. Replay
shows one recorded tick batch every 20 ms and skips pauses and other periods with
no simulation steps; it preserves simulation order rather than wall-clock idle
time. An incomplete final record from an interrupted write is discarded on resume
and ignored during read-only playback. Invalid complete records or a different
build identity are rejected by resume and replay without replacing the save;
normal launch or `--new` replaces it after a mechanics change. Operating-system writes establish process
interruption recovery, not a guarantee against power loss. Use one live game per
recording path.

Run `node --test prototypes/canonical-defense/recording-launch.test.mjs
prototypes/canonical-defense/cached-build.test.mjs` for launcher/file validation,
and `node prototypes/canonical-defense/check-recording.mjs` for bounded native
and emitted-JavaScript checks at the actual event/tick seam. The latter compares
complete encoded Worlds for restore and playback, reads realtime writes while the
writer is still open, checks playback isolation, and verifies R leaves only the
new initial map record. Its 380-second deadline includes compilation and execution;
logs remain under ignored `.test-runs/`. These are focused host checks, separate
from the shared-engine consumer and motion proof boundaries.

The interactive game captures four rule checks at 100% Finding per request. Preparing supplies two synthetic review units per edit (`[10,20]`); this is a fixture choice, not a product rule. Each moving review monster represents one actual request and outcome. Accepted Clear, Finding, split, confirmed delivery and uncertain delivery have distinct outcome labels. Rule-history fragments remain diagnostic data; they are not separate moving targets.

**J/K** change the Finding chance and **comma/period** change the captured rule count (1–4) for future requests. Existing requests retain their captured profile and towers preserve their outcomes. The game maps captured findings through the existing `FindingCountUpdated` input; this synthetic training scenario is not live Jev's probability model. Historical window receipts below predate the current live-body representation and do not qualify it.

On Darwin ARM64 with Apple clang 21, the runner automatically adds `-fno-stack-check` through [a scoped compiler wrapper](clang-no-stack-check.sh), preserving an explicit `CC` selection and Bend's `-O3` build. Darwin stack probing conflicts with a live `preserve_none` argument in `x9`, producing the Apple diagnostic reported in [Bend #1233](https://github.com/bendlang/bend/issues/1233). The [small C reproducer](compiler-repro/apple-clang21-stack-probe.c) isolates that trigger independently of Bend and the game. This workaround disables stack probing for this prototype; other compiler/host combinations use the ordinary build. Remove it when the affected Apple compiler can build the reproducer with `-fstack-check`; the issue's closed status alone does not establish a fix.

The runner caches successful native builds in `.tools/canonical-defense/` (ignored by Git). Unchanged launches reuse the executable. The cache key hashes the game and its transitive local imports, installed Bend runtime files, runner/wrapper code, Bend and clang executables and versions, host identity and compiler-related environment settings. A failed build, changed input during compilation, missing receipt or damaged executable cannot be reused. Runtime controls and command-line arguments do not trigger a rebuild. Delete `.tools/canonical-defense/` to force a clean build. Verify cache behavior with `node --test prototypes/canonical-defense/cached-build.test.mjs`. On 2026-10-04, a fresh native startup took 177.668 seconds and an unchanged cached startup took 0.939 seconds on Darwin ARM64 with Bend 2.0.34 / Apple clang 21; both stayed alive for a two-second startup smoke. These are individual startup observations, not gameplay or stable performance guarantees.

The header names two observation goals: earlier feedback and lower ledger pressure. These are distinct objectives, not a new win condition; earlier confirmation does not promise improved health. There are no authored waves or completion quota. The game stores a boxed `NativeRunTypes.State` and calls `NativeRun.create`, `advance`, `control`, and `observe`. The shared engine owns generated tasks, preparation/import graphs, Jev effects, Stop, collection and output. It continues the same resident across tasks. After N/Enter, the game supplies a separate wall-clock endpoint every20ms; engine observation time remains the last actual transition. Dashboard and game instances do not share state or networking.

The game advances the shared simulator with a budget of 256 inputs per active 20 ms tick. Base actors move at most 4 pixels per tick; rule fragments retain their 2–5 pixel rule speeds. A tower can increase its recipient’s cadence. The game-only output lease is 12 seconds to accommodate this physical route; shared simulator defaults are unchanged. Game-owned transport postpones a queued callback until its actual actors and fragments reach their destination, through the public callback transport control. `DefenseMotion.bend` reads every accepted native frame, preserves full partition/lifetime/round/operation identity, and appends the observed stages to a continuous visual path. Even stages that begin and end in one simulator tick remain in this history. Counters and actions use the actual engine; retired bodies retain outcome animation without remaining target authority.

The [source-bound qualification receipt](validation-evidence/2026-10-06-motion-laws/qualification.json) records the proof and mutation checks. The owner-approved [motion laws](MotionLAWS.bend) state discrete position preservation, stable actor identity and outcome, bounded steps, no overshoot, nonincreasing distance to an unchanged target, and arrival at a close target. Run the optional `timeout 130 node prototypes/canonical-defense/verify-motion-laws.mjs` gate with the pinned Bend 2.0.38 and Lean 4.34.0 installed; then run `node --test prototypes/canonical-defense/motion-law-tools.test.mjs`. These commands are separate from production release gates.

Five [state proofs](MotionStatePROOF.bend) use Bend and its mathematical kernel. The runner selects owner declarations and exact Canonical Work types. For the two observation laws it proves a stronger statement: **any well-typed appended path preserves the existing pose and identity**. Only that path field is generalized; the actor fields remain their owner expressions. Nine [arithmetic statements](MotionArithmeticLAWS.bend) are lowered from actual geometry functions into unsigned Lean BitVec 32. The [generated proof artifact](MotionArithmeticPROOF.lean) and [supporting non-overflow proofs](MotionArithmeticFacts.lean) make this boundary inspectable. The source-expression lowering and correspondence between Bend U32 primitives and Lean BitVec remain trusted; they are not a proved cross-language theorem. The final theorem checks reject additional computational or placeholder axioms. Each checker, elaboration and kernel subprocess has a five-second limit; the aggregate command has a 130-second limit. Unknown source syntax or changed proof inventories fail qualification.

These laws do not prove continuous interpolation between render frames, complete frame ingestion, split/merge correctness, branch-body identity, eventual passage through a spatial queue, or agreement with rescheduled simulator deadlines. Monotonicity means distance to the **current unchanged waypoint**, not increasing screen X/Y or increasing business phase. The base four-pixel bound applies to `Motion.travel`; the coordinate helper has a bound for every supplied U32 pixel allowance. Existing rule fragments use that helper with their own speeds, but their complete update function is outside this proof scope. [Executable probes](MotionLawProbes.bend) cover U32 boundaries and illustrate why screen-coordinate monotonicity is false. Update the laws and proof gate with changes to the motion owners; changes to guarantee meaning require owner review.

Manual bursts enter the workload immediately. A separate visual entrance queue spaces their bodies by at least 24 pixels; it does not delay simulator admission. Shared room and retained-finding paths keep distinct bodies spaced in a visual queue. The persistent REFUSED counter counts actual capacity and preparation refusals; requesting more edits does not bypass the shared ledger. Source and credential availability are visible in the HUD. Each child waits for its actual predecessor's displayed path: preparation follows the source operation, and review branches follow the completed preparation operation. Family labels retain the originating edit identity across this fan-out. Without towers, actors advance at most four pixels per tick; individual rule bodies move two to five pixels per tick after the fork. Shots increase the recipient’s movement cadence without changing its current position. The overlay counts bodies waiting for visual release. The recurring arrival interval starts at 30 seconds and can be suspended independently of manual release.

Two automatic game-owned interventions use exact shared simulator callback controls:

| Tower | Cost | Placement and effect |
| --- | --- | --- |
| Work Accelerator | 50 | Complete one queued preparation or already started request settlement in range. Preserve captured identity, payload and outcome. |
| Result Courier | 40 | Deliver one still-authorized individual result or committed Finish packet in range. Preserve token, packet membership and retained ownership. |

The cursor ring and target crosses show eligible current work; the **BEFORE BUILDING** card displays remaining callback delay before/after the proposed effect. Forbidden ground and insufficient budget explicitly refuse construction. No current target means no current benefit, although future work may enter range.

A successful shot arms its own cooldown: `max(2, floor(20 / (level * strength)))` game ticks. Refused/no-target shots consume no cooldown. The shot halves that callback’s remaining delay, with a 100 ms floor, relative to max(last business transition, game tick×20ms), and doubles the recipient’s movement cadence. Physical arrival remains required. Captured output completion cleanup travels with its terminal event; independent cancellations do not. Construction and upgrades leave business profiles and captured outcomes unchanged. Target positions come from the same actors and fragments that the scene draws; pause freezes motion but retains this read-only targeting query. Automatic choice takes the eligible target with the greatest remaining delay; this is a visible heuristic, not an optimal strategy guarantee.

The teaching mode has a fixed160 construction budget, shared with the laboratory. The previous Finish-only5-gold income was removed because it rewarded a slower Stop path while giving no income for successful earlier individual delivery. Upgrades cost80% then120% of the tower’s default base price, so Courier L2 costs72 versus80 for two basic Couriers; Accelerator L2 costs90 versus100 for two basics. This preserves a cost/burst/coverage choice without claiming an optimized price. `INDIVIDUAL` counts accepted certain individual delivery events; `FINISH` counts acknowledged packets, not members. Neither count means findings were retired. Health pressure reads actual ledger occupancy independently of geometry and playback. These are game rules, not Hapsland guarantees.

Successful exits require accepted outcome evidence: only a clear settlement selects the clear road, and an acknowledged finish selects delivery. Unavailability, timeout, interruption, and neutral retirement have separate labels. The sidebar reports canonical waiting/request states. Road labels use U for operation, E for originating edit, with independent full identities for each child. Hover a released body to inspect its full partition/lifetime/round/operation identity, predecessor, displayed stage, last observed stage and accepted terminal outcome. Pause with Space/P to inspect a moving body. This read-only history card also works for retired bodies; engine counters retain their current meaning. Terminal abbreviations are CL clear, DL delivered, UN unavailable, PR preparation refused, HO handed off, TO timeout, IN interrupted, NS not sent, and RT neutral retirement. Defeat stops business advancement while accepted visual paths continue, and pause freezes both. Map switching waits for unfinished presentation history as well as owned work.

The game state stores tower position/type/level and accepted-frame actor history. It retains the active towers’ next-ready tick. Motion/Rules own geometry and Transport owns physical arrival scheduling; callback identity, applicability and output authority come from the shared engine. Refusal history keeps at most32 service markers plus two brief release/admission notifications, and selection/expiry/drawing traverse each list once.

The maps retain their wall-port and finite-room geometry checks. The game contains no local Canonical event driver, Stop implementation, output driver or Session scheduler. The sole workload scheduler belongs to `packages/monkey-business-bend/Session.bend`. `DefenseProcessTests`, `DefenseStartupTests`, `DefenseMotionTests`, `DefenseDisplayTests`, `DefenseCueTests` and `DefenseTowerTests` exercise the actual game boundary and the named presentation cases. Interactive window/input validation remains separate from these offline checks.

Configuration and creation-seed agreement are validated through the independently declared public consumer configuration and full observed runtime comparison. The redundant standalone proof of two concrete configuration equalities has been removed; it is not a business completion gate. `DefenseConsumerObserved.bend` now records original game keys through actual `Host.key` and `Host.tick_observed`, all returned frames, every tick's full engine state/queue, and complete game midpoints. Four finite control campaigns use declaration seeds0/3/17/41; the actual consumer configuration/creation seed152 stays fixed. `node scripts/run-game-consumer.mjs` requires the single generated `game_consumer` codec family and shared NativeRun full observed-frame sidecars. The in-place optional transport now emits145 lossless batches over all3222 original Host ticks, at most64 ticks per batch. One fresh native executable and one fresh emitted `.cjs` executable run the same IO main; each numeric-vector line is limited to16MiB and compared through the same owner codec/parser. Complete checkpoint worlds, tick/frame/physical states, original inputs and strict offsets remain required. The full stream and comparator passed with fresh C/native and emitted-JS preparation at source `e823083a` with Bend 2.0.35: all 145 batch pairs were byte-identical (82,121,538 bytes per lane), all four campaigns and 3,222 ticks agreed with public histories and midpoint replay. The complete maintained run took 138.673 seconds. See the [qualification receipt](performance-evidence/2026-10-04-full-game-qualified.json). The verifier refuses missing sidecars and checks native/emitted-JS full owner data, independent inputs, contract-required public midpoints and ordinary replay. Entire native/emitted encoded batches remain equal; public comparison preserves complete Canonical state, queue/actions/source identities/scopes/receipts and controls without requiring identical private Engine or prepared-context layout. This receipt establishes the offline continuous consumer boundary; interactive window/input-device validation remains separate.

The maintained entry point owns one 380-second overall deadline, including
source/tool checks, every public midpoint, replay, and process-group cleanup.
C emission uses its remaining budget; clang compilation is capped at 120 seconds,
JavaScript emission at 30 seconds, and each full-validation execution lane at 180 seconds, all
within that deadline. Diagnostic performance probes remain capped at 10 seconds.
The stdout reader scans each incoming chunk once and assembles each complete JSON
line once, retaining the 16 MiB line bound and 145-batch maximum.
The ordinary runner defaults remain 30/30/5 seconds.
A zero C phase cap requires the finite supervisor handoff. Per-frame semantic validation runs through
`compareNativeFrames`; the outer loop separately accumulates actual delivered
targets and retains every tick's physical comparison, including silent callbacks.
It does not repeat the same context/state decoding loop. Scoped compiler failures
retain any produced C and captured identity receipts for manual diagnosis;
retention does not permit automatic reuse or convert a failed phase to a pass.


`DefenseConsumerTests.bend` supplies original generic Burst/Suspend/Pace inputs and checks independent instances, pause, construction cost, preservation and workload admission. `DefensePreviewTests.bend`, `DefenseMapTests.bend`, `DefenseDrawTests.bend` and `DefenseRasterTests.bend` retain game/geometry/pixel checks. `DefenseStartupTests.bend` adds startup and route regression checks; `DefenseDisplayTests.bend` covers presentation feedback. `DefenseFeatureTests.bend` combines these. Native emission and C compilation each use30-second limits; execution uses5 seconds. Passing source checks do not establish native execution or platform support. Earlier screenshots, balance files and validation receipts describe their recorded historical source and are not evidence for this continuous consumer.

`node prototypes/canonical-defense/verify-game-native.mjs` runs fourteen distinct native roots sequentially, covering the consumer, process, motion, presentation, tower, startup, display, inspection, cue, command-scope, preview, map, draw and raster boundaries. Optional filename arguments select distinct known roots for focused qualification. Each root gets fresh emission, compilation and source/tool/artifact provenance validation with 30/30/5-second phase bounds. A failed root stops the suite with a nonzero exit; the final message names the number actually selected. Interactive `DefenseMain.bend` window/input validation remains separate.

Existing [laws](LAWS.bend) and [proofs](PROOF.bend) retain two concrete pressure facts, universally quantified damage-preserves-Canonical-state and fixed-investment statements, and accepted-delivery counter laws. [Candidate engine-preservation laws](ConsumerLAWS.bend) quantify over every game World, and pointer coordinates over every U32, without premises. Their [proofs](ConsumerPROOF.bend) are proposals until owner review. The optional proposal-falsification runner has been removed because it launched external tooling without a time bound. These unaccepted proposals do not add a business completion gate; any future owner review must declare its own finite falsification and kernel-validation scope.

## Teaching purpose and design boundary

The owner's direction is to teach Hapsland through the shared simulator's actual work. An edit can fan out into source, preparation, review and advice operations; Stop is a separate input. Roads and queues explain observed progress. Issued operations retain their captured outcomes, while work waiting for eligibility or a resource has no guaranteed start time. The game delays physical callback delivery until travel completes, records that control in its replay journal, and leaves acceptance and stale-result fencing to the shared engine.

Players can release arbitrary repeated edit bursts and suspend automatic arrivals independently. Towers retain placement, range, construction costs, upgrades and pressure-based health consequences. Their effects use supported simulator controls. The active experimental roster includes Work Accelerator for local current-work completion and Result Courier for authorized delivery. Service, Relay and Repair have been removed from the playable roster; their original non-spatial research probes remain in the development laboratory. These choices remain replaceable; they do not establish a final roster or human learning outcomes.

The maintained laboratory in this checkout owns balance comparisons, finite search and experiment replay. The temporary viewer and separate prototype worktree have been removed. The laboratory must not become another business scheduler. The enduring laboratory contract is [#203](https://github.com/dearlordylord/hapsland/issues/203). Experiments should distinguish measured effects, dead investments, interactions and held-out countercases.

The intended next design steps are reversible mechanism selection and replacement, wider context comparisons, and precise development-time tuning where evidence warrants it. Human prediction and explanation checks remain separate from measured difficulty, engagement and replay interest. No adaptive difficulty or automatic balance patch application is included.

## Bounded mechanism configuration

Host construction accepts strength1–16 and a base radius20–240 pixels. Interactive purchases use strength1 and base radius60 (effective level-one radius72). Radius is `baseRadius + 12 * level`; automatic cooldown is `max(2, floor(20 / (level * strength)))` ticks. Upgrades preserve configured strength, base radius and an already armed cooldown. They cost80% then120% of the default base price (Accelerator40/60, Courier32/48); maximum level is3 for both towers. Invalid parameters refuse purchase without charging resources. Construction and upgrades do not rewrite future business profiles. The ring and inspection panel use these actual functions. These bounds define supported experiments, not recommended balance values.

## Process-teaching qualification

The [2026-10-05 receipt](validation-evidence/2026-10-05-process-teaching/qualification.json) binds the full native/emitted/public consumer comparison and the separately built window to their source identities. The consumer passed all 145 batch pairs and 3,222 Host ticks in 115.74 seconds. Focused native checks passed 13 motion, seven display, twelve startup and three inspection cases; boundary/cache tests, `check:fast` and local documentation checks also passed. The ordinary proof-file source check passed; an optional `--verdict` attempt reached its five-second limit and does not establish enhanced mathematical validity.

The [bounded-configuration receipt](validation-evidence/2026-10-05-process-teaching/bounded-configuration.json) also qualifies a fresh window after the strength/radius extension. Its [current hover panel](validation-evidence/2026-10-05-process-teaching/qualified-tuned-hover.png) repeats the full-identity/refused-source history case; the current [outage](validation-evidence/2026-10-05-process-teaching/qualified-tuned-outage.png), [repair](validation-evidence/2026-10-05-process-teaching/qualified-tuned-repair.png), [playback](validation-evidence/2026-10-05-process-teaching/qualified-tuned-playback.png), [Campus](validation-evidence/2026-10-05-process-teaching/qualified-tuned-map-1.png) and [Junction](validation-evidence/2026-10-05-process-teaching/qualified-tuned-map-2.png) captures repeat the same input boundary. These are current-source validation captures, with no intended new visual design difference.

The window cases use a virtual X11 display at 1024×768 on Linux ARM64. Inspect the specific panels rather than treating screenshots as a motion proof:

- [Before repair](validation-evidence/2026-10-05-process-teaching/qualified-outage.png): top-left availability line shows both channels unavailable, batch7, clock0 and gold160.
- [After repair](validation-evidence/2026-10-05-process-teaching/qualified-repair.png): the same availability line shows both channels available and gold115; the simulator remains at clock0.
- [Accepted work and playback](validation-evidence/2026-10-05-process-teaching/qualified-playback.png): the top counter reports three real refusals, while short operation/edit labels identify displayed history independently of the two current retained findings.
- [Mob history card](validation-evidence/2026-10-05-process-teaching/qualified-hover.png): the right-hand panel at x800/y330 shows the refused source operation's full identity, originating edit, displayed/last-observed stages and preparation-refusal outcome. Its opaque background replaces the ordinary active-work panel while hovered.
- [Forked Campus](validation-evidence/2026-10-05-process-teaching/qualified-map-1.png) and [Resource Junction](validation-evidence/2026-10-05-process-teaching/qualified-map-2.png): route geometry changes while engine counters continue to describe actual ownership. The all-map motion fixtures establish the base four-pixel bound; these are individual window captures.

These checks qualify the named local execution and presentation boundaries. They do not establish current Darwin support, physical input-device behavior, live Jev behavior, or human learning/enjoyment.

## Presentation counterexamples and approved game laws

The [pre-fix diagnostic trace](validation-evidence/2026-10-05-process-teaching/presentation-counterexamples.json) supplies falsification inputs from the default map, no towers and one edit per manual burst. It describes the earlier defects, not current behavior. The controlled Finding run isolates the reported stall; it does not reconstruct the player's unrecorded button timings. Review these approved rules and their source-bound qualification whenever the presentation policy changes.

1. **Premature grey:** at business time 800 ms, source operation 1 has completed logically but its body remains at x192/y174 with 17 waypoints. The pre-fix renderer immediately used the terminal colour. Approved rule: while historical travel remains, body colour follows the visible phase, independently of later business completion. Completion information may appear separately.
2. **Handoff ghosts:** the source predecessor completes its route at tick 152, its successor starts at 153, and the predecessor remains until 181. Preparation repeats this at ticks 276/277/305. Approved rule: a handed-off predecessor with a completed visual route ceases to be a body; successors retain its full causal identity for inspection.
3. **Clear without advice:** both review units receive actual RequestClear at 4000 ms. No finding or advice exists for these units. Approved request-history rule: displayed request Clear requires a matching RequestClear; acknowledged delivery and neutral retirement must remain distinct outcomes. This preserves legitimate Clear rather than forcing advice for every edit.
4. **Retained findings appear frozen:** in the controlled Finding run, individual advice submissions succeed at 4800 ms. At tick 701 the leader reaches the retained-room exit and the follower stops 24 pixels behind it. Their records expire at 24000 ms; this is not a finish acknowledgement. Approved rule: visible stationary work exposes its actual reason, distinguishing retained advice already submitted from a body blocked by an identified predecessor. Retention must not be labelled unfinished delivery. A spatial parking policy remains a design choice; this law does not promise that every wait has a known deadline.
5. **One preparation, two reviews:** PreparationCompleted explicitly contains unit sizes [10, 20], followed by UnitAdmitted for operations 3 and 4. The fan-out is real. Pre-fix movement cleared each child's predecessor field. Approved rule: movement preserves the full causal parent identity, and the displayed fork derives from actual admitted units. A released child need not keep waiting on that parent; release eligibility and causal history are separate meanings.

The owner approved these five presentation rules with the explicit boundary that only game code changes. They are game design requirements, not simulator or product requirements. The [pure presentation policy](DefensePresentation.bend) is used by movement and rendering. [History descriptions](DefenseHistory.bend) supply shared colours and explanations without importing the raster renderer into event regressions. Its [fourteen laws](PresentationLAWS.bend) and [proofs](PresentationPROOF.bend) cover movement preserving causal identity and witnessed outcomes, release eligibility, terminal appearance, body retention and explicit wait classification. Run `timeout 5s bend prototypes/canonical-defense/PresentationPROOF.bend --verdict` and `node --test prototypes/canonical-defense/presentation-proofs.test.mjs`; the latter checks thirteen deliberately broken implementations. [Actual-Host regressions](DefensePresentationTests.bend) cover the five observed cases and submission scope. These proofs cover the named pure decisions, not every event adapter, rendered pixel or human interpretation.

The [game-only correction receipt](validation-evidence/2026-10-05-process-teaching/presentation-fixes.json) records 37 focused native assertions: eleven actual-Host cases, fifteen motion checks, seven display checks and four pixel/inspection checks. All fourteen presentation laws passed the mathematical kernel; thirteen planted mistakes were rejected. The deliberately disabled-kernel control failed as expected. `check:fast`, documentation links and eight cache/boundary tests passed. This is focused game qualification, not full-project coverage.

The current window was freshly compiled with `-O0` under separate 45/60-second emission/compilation bounds. Native test fixtures retained their 30/30/5-second limits. An earlier ordinary `-O3` cache build exhausted a 240-second bound; this receipt does not qualify a current optimized cache or Darwin build. [Before](validation-evidence/2026-10-05-process-teaching/presentation-before-window.json) and [after](validation-evidence/2026-10-05-process-teaching/presentation-after-window.json) receipts bind images to their builds. Polling paused at nearby rather than identical ticks; each receipt reports the actual tick.

- First road, y174 left of Source: [before](validation-evidence/2026-10-05-process-teaching/presentation-before-first-road.png) the unfinished body is grey; [after](validation-evidence/2026-10-05-process-teaching/presentation-after-first-road.png) it retains its visible-stage colour despite business completion.
- Source handoff, exit x412/y174: [before](validation-evidence/2026-10-05-process-teaching/presentation-before-source-handoff.png) the predecessor lingers while preparation moves away; [after](validation-evidence/2026-10-05-process-teaching/presentation-after-source-handoff.png) only the preparation body remains on the road.
- Review-child card, x800/y330: [before](validation-evidence/2026-10-05-process-teaching/presentation-before-fork-hover.png) it says `PREDECESSOR NONE`; [after](validation-evidence/2026-10-05-process-teaching/presentation-after-fork-hover.png) it shows preparation `1/1/1/2` and two actual units in playback. The current [preparation card](validation-evidence/2026-10-05-process-teaching/presentation-after-preparation-hover.png) separately shows its source parent `1/1/1/1` and its own two children; there is no captured before view of that card.

The controlled Finding fixture establishes `SENT`, retained-record and full-identity spatial-queue distinctions. These default-window captures have legitimate Clear outcomes and do not establish the Finding panel visually. Waiting and retention remain part of the game; this correction explains their reasons rather than claiming that every visible body must keep moving.

## Earlier prototype selection index

Retain [earlier game sources](../bend-tower-defense/) ; archived source bundles are available in [Git history](https://github.com/dearlordylord/hapsland/tree/886c16f60/prototypes) until the owner selects useful road, automatic-workload, flow or combat mechanics. These earlier prototypes are not runtime dependencies of this game, core or dashboard. Cleanup trigger: owner's mechanic selection; transfer selected mechanics to their chosen owner, update references and **delete** rejected variants. The current tree keeps source and images; generated native binaries and source archives are excluded from Git.

## Completed performance investigation

The finite experiment plan is complete. Measurements below are individual trials, not stable speed guarantees; compiler preparation is separate from workload execution. Required ticks, frames, numeric data, source identities and replay assertions were preserved.

| Experiment | Result and decision | Evidence |
| --- | --- | --- |
| Concrete Bool branches | Replace 14 record-valued `Bool.pick` sites with eager typed matches; preserve boxed continuation carriers for Bend's 247-live-word limit. | [Initial investigation](performance-evidence/2026-10-04-initial-experiments.json) |
| Global and selective O1 | Both compiler attempts exhausted their separate 120-second limits; no optimized executable or runtime improvement established. Stop compiler-flag retries. | [Global attempt](performance-evidence/2026-10-04-initial-experiments.json), [selective attempt](performance-evidence/2026-10-04-selective-c-optimization.json) |
| Chunked String output | Exact common output, but lower throughput in the 10-second pair. Rejected as a speed improvement. | [Comparison](performance-evidence/2026-10-04-chunked-output-comparison.json) |
| Compiler runtime | Identical compiler payload and emitted C: Bun 1.3.14 took 36.69 seconds, 1.4.2 took 24.35 seconds and used 28.1% less peak RSS. No global runtime upgrade or new upstream defect claim. | [Comparison](performance-evidence/2026-10-04-compiler-runtime-comparison.json) |
| TypeScript observations | Reuse immutable before/after snapshots rather than copying them again. Full timing pair: 5.913 to 2.842 seconds; separate full frame and endpoint hashes match. | [Comparison](performance-evidence/2026-10-04-ts-observation-comparison.json) |
| Envelope/carrier changes | Repeated envelope was only about 2.5% of the retained 20-batch prefix; no deduplication justified. No costly carrier family was attributed; retain working arity mitigation. | [Envelope measurement](performance-evidence/2026-10-04-envelope-measurement.json) |
| Direct numeric IO | Supported prototype-local C/JS effects consume the unchanged word list, avoiding decimal cons-String construction. Canary exact; 10-second comparison increased complete batches from 19 to 62, all 19 common batches exact. Integrated and subsequently qualified on the complete original workload. | [Canary](performance-evidence/2026-10-04-direct-numeric-canary.json), [prefix comparison](performance-evidence/2026-10-04-direct-numeric-game-comparison.json), [full qualification](performance-evidence/2026-10-04-full-game-qualified.json) |
| SourceJob continuation | Full comparisons exposed loss on post actions and prepared command emissions. Preserve the original tuple independently of active binding, before callback capture; post actions have no inherited prepared context. Full public/replay comparison now passes. | [First diagnosis](performance-evidence/2026-10-04-sourcejob-diagnosis.json), [intermediate result](performance-evidence/2026-10-04-sourcejob-fix-game.json), [full qualification](performance-evidence/2026-10-04-full-game-qualified.json) |

The earlier bounded component measurement separates the original TypeScript workload from validation overhead. These are diagnostic observations before the optimizations above, not a current native/TypeScript speed ratio.

| Component | Purpose | Original TypeScript | Native observation |
| --- | --- | --- | --- |
| Engine and workload | Advance the same 3,222 ticks and application logic | 1.271 s; 28.2% of the 4.503 s run, excluding structural hooks | Not isolated from game and retained snapshots |
| Structural observations | Capture full frames and state for comparison | 3.222 s; 71.5% | Included in the 3.759 s simulation/snapshot phase |
| Creation | Initialize the run | 0.008 s; 0.2% | Not isolated from process startup |
| Game plus snapshots | Execute the optional consumer and retain comparison state | Not part of this TypeScript measurement | 3.759 s before numeric encoding |
| Encoding and IO | Serialize comparison evidence | No equivalent native stream in this measurement | First text ready at 3.807 s; full stream not timed by this probe |

The native timestamps include process startup and additional game/snapshot work. Therefore a percentage speed difference between engines cannot be inferred. The separate pure-native fixture exhausted its 90-second C-emission limit and produced no runtime measurement. [Component evidence](performance-evidence/2026-10-04-component-comparison.json) preserves the measured boundaries and limitations.

Short diagnostic probes remain limited to 10 seconds. Do not repeat a terminal optional experiment without new evidence. Use explicit source/tool/artifact-validated compiler or output receipts to resume work; reuse never converts a failed phase into success. Comparison-only changes can use retained vectors with matching identities, while producer changes require fresh affected outputs.

The current dashboard build also passed with this optional game directory physically absent, then restored: [no-game build receipt](performance-evidence/2026-10-04-no-game-build.json).

The seven original shared NativeRun scenarios also passed with fresh native and emitted-JS preparation against the final SourceJob owner: [final owner qualification](performance-evidence/2026-10-04-native-run-final-qualified.json).

Remaining original owner qualification completed: [four fault/finding recovery scripts](performance-evidence/2026-10-04-recovery-qualified.json), [five collector-response authority cases](performance-evidence/2026-10-04-collection-response-qualified.json), and [five output timing/outcome cases](performance-evidence/2026-10-04-output-qualified.json). Each includes native/emitted vector agreement plus independently expected public observations and ordinary replay.

Current-master reconciliation includes freshly generated Engine JavaScript and a Bend 2.0.35 compatibility correction for importer-local numeric IO names. Seven NativeRun cases and the complete game comparison passed with fresh producers; the final dashboard build also passed with this game directory physically absent and restored. [Integration evidence](performance-evidence/2026-10-04-toolchain-integration.json) records the checks and toolchain boundary.

## Rule-check visualization qualification

The [rule-check receipt](validation-evidence/2026-10-05-rule-checks/qualification.json) records all 145 native/emitted-JS/public batch comparisons, 3,222 Host ticks and midpoint replay. The original execution produced source-bound native and JS outputs; the resumed comparison passed after resolving only an ownerless finding-count acknowledgement against its already checked event owner. The simulator was unchanged. Eleven fresh emitted-JS rule regressions pass, including captured-profile stability, mixed exits, canonical multiplicity, separation through the fork and eventual cleanup. Seven native policy assertions cover 2,048 bounded sampling cases. Existing approved presentation proofs and their mutation checks pass; they do not prove the new sampler universally.

The [fresh window receipt](validation-evidence/2026-10-05-rule-checks/window.json) binds native build identity, captures and pixel assertions. At tick 480, [eight orange bodies](validation-evidence/2026-10-05-rule-checks/presentation-rules-parallel-eight.png) occupy the Jev room, replacing one request body with its parallel checks. The [rule card](validation-evidence/2026-10-05-rule-checks/presentation-rules-rule-inspection.png), right panel at x800/y330, identifies rule 4, its parent, eight captured checks at 100% and shared speed. At tick 548, [mixed exits](validation-evidence/2026-10-05-rule-checks/presentation-rules-mixed-exits.png) show green Clear and red Finding bodies after five J presses set 50%. Inspection provides per-body details.

The fresh window uses diagnostic O0 compilation on Linux ARM64 virtual X11. This receipt does not qualify the ordinary optimized build, Darwin, physical input devices or live Jev. The standalone native rule-regression fixture reached its existing 30-second C-emission deadline; its emitted-JS execution and the full actual native consumer passed. The existing native fixture limit remains unchanged. [Focused emitted-JS regressions](validation-evidence/2026-10-05-rule-checks/emitted-js-regressions.json) also pass for motion, the five reported presentation cases, display and inspection.

## Placement-preview qualification

The [placement window receipt](validation-evidence/2026-10-05-placement-preview/window.json) identifies the diagnostic native build and five captures before any construction. [Connected service](validation-evidence/2026-10-05-placement-preview/presentation-placement-service-ground.png) shows the Jev target and `3200 TO 1600`; [hovering the building](validation-evidence/2026-10-05-placement-preview/presentation-placement-service-building.png) keeps that feedback while the card rejects construction. Previously this forbidden position hid the target and parameter. [No service in range](validation-evidence/2026-10-05-placement-preview/presentation-placement-service-no-target.png) has no target link and explicitly reports absence. [Delivery](validation-evidence/2026-10-05-placement-preview/presentation-placement-delivery-ground.png) shows `800 TO 400` for future submissions. [Access outage](validation-evidence/2026-10-05-placement-preview/presentation-placement-access-outage.png) shows two unavailable channels becoming zero. The right-hand card at x800/y538 names recipients; the linked building identifies the service affected. Gold remains 160, clock 0 and no tower is built. Bend source checking also passed. These captures qualify Linux ARM64 virtual X11 with diagnostic O0 compilation; they do not qualify an ordinary optimized build or Darwin.

## Three request lanes and four checks

The [qualification receipt](validation-evidence/2026-10-05-three-jev-lanes/qualification.json) records the current game-only change. The complete fresh native/emitted-JS consumer comparison passed all 145 batches and 3,222 ticks with midpoint replay. Fifteen emitted-JS rule regressions cover lane reservation, the waiting fourth request, mixed exits, captured profiles, non-overlap and eventual cleanup. Eight native policy assertions include all sixteen four-check outcome shapes and 512 bounded sampling profiles; these are executable checks, not universal proofs of the new lane policy.

Diagnostic O0 native-window checking did not obtain the required three-request/twelve-body capture. C emission passed in 149.342 seconds; clang compilation exceeded 60- and 120-second bounds, but retained an object that linked successfully. The window launched and showed the new lane diagnostics. At approximately five ticks per second, the host caught up by eight ticks per frame and debug-title polling missed the brief three-checking state; the final 150-second state wait failed. No current screenshot, optimized build, Darwin, physical input-device or live Jev qualification is claimed. The successful tick-by-tick rule regressions and complete fresh native consumer comparison above establish their stated offline boundaries.
