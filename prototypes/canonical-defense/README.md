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
- **N / Enter:** start the next wave; **Space:** pause; **R:** reset.
- **Tab:** choose a map while there are no towers, active workload or owned work. Reset before changing an invested map.
- **A:** toggle automatic waves using the shared Monkey Business Session scheduler; three-second countdowns pause with the game. Construction stays manual.
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
| 1 Rapid | 35 | Short-range shots reduce remaining active service work. | Service time differs from waiting and retained ownership. |
| 2 Refiner | 55 | Shots permanently lower unresolved findings risk; children inherit upstream reductions. | Prevention before an observed result can avoid downstream retained findings. |
| 3 Relay | 45 | Longer-range, weaker service acceleration. | Placement and coverage trade off against throughput. |
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

The launcher lowers native compilation to `-O0` on Linux ARM64 and macOS ARM64. LLVM 14 on Linux and the owner's Apple clang 21 both fail to optimize the expanded generated musttail graph. The Linux workaround was executed. The owner subsequently confirmed Apple clang 21 still crashes at `-O0`, so this flag does not fix macOS and a successful Mac build is not established. See [upstream report #1233](https://github.com/bendlang/bend/issues/1233) and `compiler-repro/evidence.txt` for the bounded investigation. Bend still supplies all native graphics and framework flags.
