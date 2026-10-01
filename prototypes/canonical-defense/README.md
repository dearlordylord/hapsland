# Canonical architecture defense

**Purpose:** Explore three native tower-defense maps that teach Hapsland's queues and ownership using its actual canonical reducer.
**Status:** Throwaway gameplay prototype; executable evidence defines the validated scope.
**Authority:** Design proposal and implementation/validation evidence, not an accepted product contract.
**Expected use:** Play the finite workload, build spatial towers, inspect their effects, and compare how the maps explain preparation, review, sibling waiting and output.
**Lifecycle:** At the owner's game-layout selection, consolidate accepted layout/mechanic decisions into the game specification or implementation issue, update inbound links, and delete rejected variants and temporary evidence. Review whenever the canonical state/event/command interface changes.

## Run

With Bend and native graphics prerequisites installed:

```sh
./prototypes/canonical-defense/run.sh
```

- **1–7:** choose a tower; **click ground:** build; **click a tower:** select; **U:** upgrade.
- **N / Enter:** start the next wave; **Space / P:** pause; **R:** reset.
- **Tab:** choose a map while there are no towers, active workload or owned work. Reset before changing an invested map.
- **A:** toggle automatic waves using the shared Monkey Business Session scheduler; three-second countdowns pause with the game. Construction stays manual.
- **[ / ]:** speed up / slow down arrivals (20–400 ticks); the chosen pace persists between waves.
- **F:** choose a workload latency profile before a wave; independent of **Tab** geometry.
- **D:** choose the Stop window before a wave: normal 80 seconds or short 4.2 seconds after admission closes. These are host demonstration timings.
- **Escape:** close the window.

Initial gold is 160 and shared health is 100. Towers fire or provide support automatically. There are six finite waves. Each has eight files and sixteen review units; arrival intervals shorten from 200 to 100 ticks. Completing a survived wave grants 20 gold once. Towers, gold and health persist; defeat stops new waves while outstanding ownership drains. The shell compiles and runs the Bend application directly; there is no archive extraction step.

## What is actually reused

The game imports `../../packages/agent-flow-bend/Canonical.bend` directly, holds a real `Canonical.State`, and supplies facts through `Canonical.step`. Production and dashboard use the generated adapter for that same source. This prototype does not use the older game's lifecycle reducer. Automatic waves directly import `packages/session-bend/Session.bend`, the same scheduler used by Monkey Business; they reuse its tasks and finish transitions. Each wave retires its drained partition and opens a real canonical round.

Canonical owns admission, preparation fan-out, review requests, shared permits, retained findings, collection eligibility, Stop, leases, delivery authorization and retirement. The host authors work, simulated durations/outcomes, road arrival, gold and damage. Towers affect these simulated facts and timings; they do not create product features or overwrite canonical ownership. The imported-source manifest records the actual unchanged core files.

## Roads, buildings and ownership

Three authored maps—[Switchback District](preview-district-populated.png), [Forked Campus](preview-courtyard-populated.png) and [Resource Junction](preview-frontier.png)—show the same phases through different road arrangements. Roads have explicit right-angle bends and distance-based travel at one pixel per tick. All entrances are centered wall ports. The approaching segment has zero tangent component and points normally into the wall; exits obey the converse constraint. Startup rejects invalid maps, including crossed internal paths. Native ticks are scheduled every 20 ms. A long road therefore takes longer than a short one, and host launch facts wait for arrival.

Processing buildings are 64 × 48 pixels. Their five horizontal passes and four U-turns end rather than loop: position follows remaining simulated service work. Retained findings traverse a finite internal route and then wait. Source and Review queues are safe road yards; entering a processing/retention building can contribute to damage. Building anchors define tower coverage consistently. Changing layouts after an investment is blocked so coverage cannot change for free.

Canonical creates preparation children together. Separate roads and authored release spacing distinguish the children without inventing delayed admission. Unit and edit-family labels show their association. A source still retained during preparation is labelled as file ownership, rather than drawn as a second active enemy. Bars labelled **SHARED** display the same game health; the buildings do not have independent canonical capacity or health.

The fixture offers eight source observations, each preparing two units of 10 and 20 modeled bytes. Every unit starts with 100% findings risk. The [placement preview](preview-refiner-before.png), [actual Refiner shot](preview-refiner-after.png) and [level-two inspection](preview-upgrade.png) show the simulated risk and tower investment separately. A fixed authored draw gives repeatable outcomes when Refiner lowers that risk; the draw is independent of canonical ID allocation and timing. Source read, preparation and Jev service durations are host assumptions, not production measurements. Units can exit clear after Review; already observed findings retain their ownership until acknowledged delivery.

## Seven automatic towers

Hovering a valid build site displays the current value plus its exact next effect in a separate color. Radius, target links, work/risk overlays, output preview and mitigation numbers make scope visible. A muted red radius and **NO EFFECT HERE** identify unsuitable placement. Suitable scope with no current target is distinguished from a structurally useless location. Invalid or unaffordable placement does not promise an actionable improvement.

| Key / tower | Cost | Host effect | Architecture it illustrates |
| --- | ---: | --- | --- |
| 1 Rapid | 35 | Short-range shots advance approach-road travel or reduce active service work. | Travel and service latency differ from acquiring a worker permit and retained ownership. |
| 2 Refiner | 55 | Shots on approach roads or active service permanently lower unresolved findings risk; children inherit upstream reductions. | Prevention before an observed result can avoid downstream retained findings. |
| 3 Relay | 45 | Longer-range, weaker travel and service acceleration. | Placement and coverage trade off against throughput. |
| 4 Parallelizer | 70 | Raises local host launch budgets from two toward eight. | Concurrent service is bounded by actual shared canonical permits. |
| 5 Coordinator | 35 | Accelerates an unfinished Jev sibling that blocks retained siblings. | Finishing the blocker differs from accelerating arbitrary work. |
| 6 Packager | 60 | Raises the next output target from four toward eight and reduces host serialization work per item. | Batch policy differs from committed membership, retained bytes and acknowledged retirement. |
| 7 Shield | 50 | Finite charges reduce covered game damage, capped at half local pressure. | Damage mitigation does not free ledger ownership or process a queue. |

Levels are capped at three; upgrades cost 40 then 60. Refiner cannot rewrite an observed `PendingFinding`. Parallelizer respects the unchanged real pool limits. Packager does not shrink finding byte charges and cannot change a batch already committed. Shield consumes charges only when it provides additional protection during damaging pressure; overlapping protection cannot exceed the cap.

## Pressure and output

The actual ledger limits in this fixture are 32 items and 480 bytes. Game damage starts when work inside buildings owns at least 160 bytes: baseline one shared health every 50 hot ticks. Road ownership remains visible but does not damage health. The shield changes damage accumulation only. Actual health loss flashes the shared-health borders.

The host waits for its finite workload's retained units to become eligible before output. This is a fixture policy, not a canonical requirement. Actual collection fit, leases, Finish reservation/authorization/terminal facts, Submission authorization and retirement still go through the real reducer. The core allows four Finish reservations per round; baseline target four can deliver all sixteen findings in four batches. Larger targets use fewer reservations. A final partial batch waits for a bounded flush. Empty output does not reserve a writer.

The output HUD separates next policy from committed members, unchanged bytes, writer time and leases. Membership and host serialization duration freeze at commitment; upgrading changes the next batch. Refused authorization or acknowledgement retains work, bytes and leases. Only accepted acknowledged delivery permits retirement and game delivery credit.

## Validation and limits

[Headless host checks](validation-headless.txt), [preview checks](validation-preview.txt), [output checks](validation-output.txt), [native visual evidence](validation-native.txt) and [Astra medium review](validation-astra.txt) describe the exact executed scope. Output checks cover every retained count from zero through sixteen, fixed committed batches, declined authorization/terminal facts and actual reservation exhaustion. Source fingerprints identify the tested artifacts.

Root inspected the final [sixteen waiting findings](preview-retained-wait.png), [damage flash](preview-building-damage.png), [no-effect placement](preview-no-effect.png) and [complete drain](preview-complete.png). The live run delivered sixteen findings and ended with zero ledger, request, lease and writer ownership. Packager purchase preserved the current four-member batch and its remaining writer time; Shield left all 240 retained bytes intact while changing damage accumulation. Astra supplied the completed design input; further architecture and mechanics decisions belong to root or Sol.

These checks validate bounded mechanics and presentation examples. They do not establish human engagement or learning. The workload has fixed two-child fan-out and bounded density. Linux ARM64 native execution does not establish macOS support; live Jev, credentials and the production effect runtime are not exercised.

## Current increment

Visible monsters now have authored Bend bitmap silhouettes, eyes and animated feet, with smaller sprites inside rooms. The geometry suite executes twelve positive and negative checks, including exact one-pixel travel around elbows. These are executable constraints over the authored maps, not a universal formal proof. The campaign suite passed twenty-two assertions across seven cases, including six actual rounds, 96 outcomes, per-round reservation limits, manual construction, rewards and defeat cleanup.

The original game's 24–54-enemy wave sizes are not copied: sixteen findings fit the actual four-reservation baseline budget. Challenge increases through arrival cadence. Other original tuning controls are not claimed restored. Earlier screenshots and validation receipts above describe the prior single-wave version. Current [three map captures](geometry-campus.png), [visible monsters in an automatic wave](monsters-wave1.png), [geometry checks](validation-geometry.txt), [native capture receipt](validation-geometry-native.txt) and [campaign validation provenance](validation-campaign.txt) record this increment separately. The campaign snapshot predates only the later exact-pixel interpolation; it is not claimed to cover every final render or geometry edit.

Native builds use Bend's default `-O3` again. Compilation comparison isolated the regression to storing the shared Session state directly inside the game World: this expanded the common generated calling convention from 102 to 119 arguments. The scheduler now lives in a singleton list, which Bend represents as one boxed value. This restores 102 arguments without changing Session or Canonical, wave behavior, or maps. The prior version compiled, the unboxed campaign version crashed, and the boxed campaign version compiled and ran at `-O3` on Linux ARM64. All 22 campaign assertions passed at `-O3`; see [compilation comparison](validation-compiler-bisect.txt) and [native capture](compiler-fixed-wave.png). The owner subsequently confirmed that the boxed version builds and runs on their Mac; this is owner-reported platform evidence, not a local Mac test. Earlier compiler investigation describes the superseded unboxed version; the external report was closed at the owner's request.

## Dense queues and rendering cost

Waiting monsters are classified once per frame; slot ranking uses their cached IDs instead of recomputing every other monster's route. Actor positions choose their actual phase before calculating a route, and building membership evaluates the matching operation. Raster filtering stops when a foreground rectangle completely covers its tile. Tower indicators, sprites and ownership remain visible.

Linux ARM64 `-O3`, four workers: median frame preparation at sixteen waiting findings fell from **67.2 ms to 20.9 ms** (about 3.2×). Scene construction fell from 31.4 ms to 4.7 ms. These timings include quadtree construction/free but exclude native presentation; they are not display FPS or Mac measurements. [Timing evidence](validation-performance.txt), [raw samples](performance-samples.json), and [actual manual wave with sixteen waiting monsters](fps-fixed-pending.png) describe the scope. Full image trees matched before/after at 0, 8 and 16 waiting findings; 6144 pixels matched an independent layering oracle, and 42 host checks passed.

Reproduce bounded timing with `bend prototypes/canonical-defense/DefensePerformance.bend -o /tmp/defense-performance`, then `/tmp/defense-performance --threads 4`. Run the independent pixel checks with `bend prototypes/canonical-defense/DefenseRasterTests.bend`. The Linux window remains paced at 60 Hz; macOS uses display synchronization. Both continuously redraw even while paused; CPU use can therefore remain appreciable. Local worker comparison is recorded in `performance-workers.json`; two workers were close to four in this fixture, while one was slower. No Mac CPU-load improvement is claimed.

## Road targets and comparison with the previous game

Rapid, Relay and Refiner now acquire unresolved units at their actual positions on the source, preparation and review approach roads. Rapid and Relay advance the same permanent host progress used by rendering and by arrival facts sent to Canonical. Refiner reduces future findings risk without moving the unit. A road arrival still waits for actual worker/request permits; acceleration does not create concurrency. Observed pending findings remain immune to Refiner. Coordinator still targets an active Jev sibling blocking retained siblings. Support towers retain building-based coverage.

Targeting and rendering share `DefenseEffects.point_work`; there is no second position approximation. Hover links and stat changes follow the current mobile target. An empty covered road is suitable scope with zero current effect; a location with no suitable road/building is structurally ineffective. [Rapid road preview](preview-road-target.png), [actual road shot](road-target-fired.png), [Refiner road preview](preview-road-refiner.png), and [permanent road risk reduction](road-refiner-fired.png) have a [native Linux receipt](validation-road-native.txt). The Rapid witness advances from x46 to x61 over three ticks: three pixels of natural movement plus twelve from its shot.

[51 host/road checks](validation-road-targets.txt) include radius without building coverage, three approach-road stages, actual earlier source-start facts, risk reduction without travel change, preview consistency and unchanged permits. [Current feature checks](validation-feature-parity-current.txt) rerun preview, output, six-wave shared scheduling, geometry and the independent raster oracle. [Previous feature checks](validation-feature-parity-previous.txt) execute the last old worktree's directed service/storage, readiness, output, Stop, frontier, construction, tower, hover and prevention cases. They do not rerun its full campaign balance grid. Run the combined current suites with `bend prototypes/canonical-defense/DefenseFeatureTests.bend -o /tmp/defense-features`, then `/tmp/defense-features --threads 4`. Exact source hashes and executed scope are recorded in `feature-parity.json`; the old worktree includes uncommitted Refiner changes, so its commit alone does not identify the tested source. Native validation here is Linux ARM64, not a fresh Mac execution.

The old version also restricted projectile targets to worker-active jobs and used building centers. Road targeting is a new correction to the requested spatial behavior, rather than an assertion that those old selectors already handled road units.

## Architecture teaching increment

This increment restores manual arrival pacing and the P pause alias. It adds explicit Stop deadline/cancellation/cleanup behavior through the imported reducer, rather than reproducing the old game's Stop implementation. The normal 4,000-tick window preserves complete baseline campaign drainage; the short 210-tick window deliberately demonstrates an incomplete result. Pausing freezes the window and cancellation settlement. Cancellation is not acknowledged delivery: retained findings and bytes survive, and auto mode starts another wave only after actual ownership drains. A refused Finish reservation stops new work visibly with ownership retained.

The workload profile and map are separate selectors. All three maps can run all four profiles. Geometry changes travel distances and tower coverage; profiles change only synthetic effect latency, not reducer rules or workload size. Baseline has the existing timings; Read/Prep doubles reading and preparation; Large Jev Sibling doubles the second child's review time; Output ACK adds 160 ticks to acknowledgement latency. These are demonstration assumptions, not measured production workloads. Read/Prep demonstrates intake latency; Large Jev Sibling makes family waiting visible; Output ACK demonstrates retention after writer work. Profiles cannot change during an active wave.

| Feature | Decision / visible behavior | Architecture lesson |
| --- | --- | --- |
| Manual wave pace | Restored `[ / ]`, live interval; N/Enter and A preserved | Arrival rate is distinct from processing capacity |
| Local queue caps | No invented room caps; actual shared ledger, partition limits, preparation and Jev pools shown | Both preparation rooms consume one shared pool; concurrency and retained bytes differ |
| Stop and incomplete completion | Waiting, deadline, actual cancellation IDs, delayed effect settlement, retained output drainage | Closing admission, cancelling work, releasing permits and acknowledging findings are different events |
| Rapid/Relay after Review | No acceleration of retained PendingFinding; road/service targets preserved | Retained ownership is not an active processing task; Packager targets actual output policy |
| Coordinator | Target and waiting sibling links; exact last-sibling forecast | Finishing a sibling, becoming collection-ready, starting a batch and receiving ACK are separate |
| Family summaries | Focus target then blocked families; work/finding counts, unique owned bytes, ready and committed counts | Fan-out creates related units; shared charges must not be double-counted |
| Packager ghost | Actual candidate IDs/count/bytes and writer ticks before/after; immutable committed IDs | Larger batches preserve bytes, reserve fixed membership and affect the next writer |
| Flush hint | Counts down only when actual scenario eligibility permits output; otherwise explains waiting | The all-work readiness gate is this scenario's policy, not a universal core requirement |
| Shield | Raw pressure, marginal protection, next charge cost and unchanged ledger | Explicit game metaphor: damage protection never implies processing or capacity gains |
| Economy | Existing costs/rewards retained without new balancing work | No additional synthetic mechanic introduced |

[Astra design input](validation-teaching-astra.txt) and final visual review informed the retained-work distinction, dependency forecast, family summaries and output ghost. [Combined directed validation](validation-business-features.txt) passes the existing suites plus 27 new business/presentation checks: Stop commands and permit settlement, retained acknowledged output after cutoff, unsafe Finish refusal, pacing bounds, all profile effects, exact candidate membership and bytes, deduplicated family ownership, and marginal shield charges. These bounded checks do not establish human learning or engagement. [Stop/input evidence](validation-teaching-native.txt) record actual inputs and captures for this increment; Linux execution is not a fresh macOS test. [Validation provenance](teaching-validation.json) records source fingerprints and compilation parameters. Root also checked the final wording correction natively: explicit DOES NOT MEAN and TO replace unsupported symbolic glyphs. The native application remains at 102 common ABI arguments and `WL_RESW=60`. A follow-up sample at sixteen retained findings measured 6.3 ms scene construction and 29.4 ms image preparation, excluding presentation; the additional teaching text costs rendering time and this is not a performance improvement claim.
