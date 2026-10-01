# Canonical architecture defense layouts

**Purpose:** Compare three native game layouts driven by Hapsland's actual canonical reducer, rather than a game-specific copy of its lifecycle rules.
**Status:** Throwaway layout and host-workload prototype; execution evidence defines the validated scope.
**Authority:** Design proposal and implementation/validation evidence, not an accepted Hapsland product contract.
**Expected use:** Run the native prototype, switch layouts on the same paused state, and compare how clearly each explains real preparation, review, ownership and Stop decisions.
**Lifecycle:** At the owner's canonical game-layout selection, consolidate the chosen layout and any accepted host mechanics into the game specification or implementation issue, update inbound links, and delete rejected variants and temporary evidence. Review the prototype when the canonical reducer's state/event/command interface changes.

## What is reused

The prototype imports `../../packages/agent-flow-bend/Canonical.bend` directly. Production and dashboard use `src/canonical/adapter.ts`, whose generated module exports that same source's `initial` and `step`. The game holds an actual `Canonical.State` and applies actual canonical events. It does not import the previous tower-defense `RoadGame.bend` or maintain a second product lifecycle reducer.

The native host is a simulated environment: it authors finite edits, supplies read/preparation/backend completion facts, and animates time. Towers can change the simulated environment's service timing. Canonical owns admission, preparation/review state, shared permits, retained findings, eligibility, Stop and output permission. Game health, gold and visual placement are game-only values; they are not product state or production features.

The real preparation and Jev pools have fixed limits of eight. A tower must not invent extra canonical permits. There is no canonical Advice processing duration or game-style output batch target/flush timer; those earlier game abstractions are omitted from these layouts.

## Three layouts, one state

| Layout | Physical structure | Architectural question |
| --- | --- | --- |
| Switchback district | A winding road connects source-read, preparation, Jev and retained-finding buildings through open source/review queue yards; a separate branch exits clear results. | Where does work wait, and which service owns it? |
| Edit islands | Preparation feeds child roads into one shared Jev hub, with adjacent retained-finding bays. | How does one source produce several independent review units, and why do siblings wait? |
| Resource junction | Incoming roads converge at service checkpoints and a shared delivery bridge; clear results take a bypass. | Which shared capacity or ownership prevents progress? |

These are fixed authored maps, not procedural mazes. Each processing or retained-finding building contains a short internal route with smaller actors. AwaitingSourceRead and Reviewing are safe open road queues, not enclosed processing buildings. Incoming queues and in-building processing/retention must remain distinguishable. All maps project the same canonical phases and shared resources; map geometry does not create independent per-building permits.

Switching layout changes only presentation. It preserves canonical state, workload, service timers, tower investments and game outcome. The presentation tracks actor identities and phase entry separately from the reducer. Position, travel and departure animation never authorize a canonical transition.

Canonical creates all preparation children together. Their identities and owned counts appear immediately; a cosmetic release bay staggers their visible departure so the fan-out is legible. If a child advances before its animation finishes, the view catches up to its actual phase. This delay is not a backend, dispatch or admission delay. Internal routes are activity animations, not measurements of work completion.

## Review criteria

Astra at medium effort reviews actual reducer reuse, honest ownership and readiness cues, meaningful player choices, and readability. Source and native checks can demonstrate reducer identity and operation; they do not establish player engagement or learning. Native Linux execution does not establish macOS support.

## Run and controls

With Bend 2.0.34 and native graphics prerequisites installed, run:

```sh
./prototypes/canonical-defense/run.sh
```

- **Tab** cycles the three layouts without changing the simulation.
- **N** starts the finite workload; **Space** pauses; **R** resets the simulated resident and game.
- **1–3** choose an accelerator. Click its right-hand build dock to buy it once. All effects operate automatically; there is no activation action.
- **A** enables automatic initial-workload start after a three-second preparation grace. It never constructs anything.
- **Escape** closes the native window.

Initial gold is 120. Preparation Engine costs 50 and changes simulated preparation latency from 100 to 35 ticks. Backend Engine costs 50 and changes simulated backend responses from 160/320 to 50/100 ticks. Coordinator costs 40 and reduces a response to 25 ticks when its unfinished unit blocks already retained findings from the same observation. These are global service investments; layout geometry never changes their scope. Real canonical pool limits remain eight.

The finite fixture offers eight observations, each preparing two units of 10 and 20 modeled bytes. The synthetic backend returns clear for the 10-byte unit and a finding for the 20-byte unit. These authored results are stable when service timing or canonical ID allocation changes; the old game's Refiner/probability mechanic is not included in this experiment. Source read, preparation and backend durations are host assumptions, not measured production timings.

Limits are 18 items and 240 bytes, shared through the real ledger. Game-only building pressure costs one health every 50 ticks while charged work assigned to building interiors owns at least 160 bytes. Road-waiting work can still own ledger capacity without causing health damage. The renderer and health overlay share the same classification from actual canonical state; animated pixel positions and cosmetic departure delay never change pressure. Total ledger ownership remains visible separately. This overlay is labelled host/game state, not a Hapsland damage rule. Stop deadline facts are measured from workload start, not from how long the user leaves the initial screen open.

This host waits until every retained unit in its finite decided round is marked eligible before starting one response. That is a prototype collection policy, not a general canonical requirement: production may select fitting partial batches. Actual lease, finish authorization, submission authorization and acknowledged terminal events still come from the canonical interface. Declined facts cannot count as successful delivery or authorize retirement.

## Executed validation

[Headless evidence](validation-headless.txt) records 38 passing native checks: direct canonical fork/join, real eight-request admission and ninth refusal, Stop waiting, denied authorization retaining ownership, accepted leases and delivery ownership, complete drain, layout invariance, manual purchases and finite automatic start. Seven additional cases distinguish safe charged road queues from building pressure, cover issued-but-not-started requests and retained ownership, and check pause/layout independence. A Coordinator comparison advances actual acknowledged delivery while preserving the authored outcomes. These are bounded witnesses, not a general balance or learning result.

The [imported-source manifest](canonical-source-sha256.txt) records 24 canonical source files whose bytes match the primary master checkout. The production authority chain is [`Canonical.bend`](../../packages/agent-flow-bend/Canonical.bend) → [`build-canonical.mjs`](../../packages/agent-flow-bend/scripts/build-canonical.mjs) → [`adapter.ts`](../../src/canonical/adapter.ts), used by the resident and [`canonical-replay.ts`](../../packages/agent-flow-viz/src/canonical-replay.ts). The prototype uses the first source directly, without an authored JavaScript host or a reducer copy. It does not exercise live Jev, credentials, files, or the production effect runtime.

Fan-out is already real: `BeginObservedPreparation` retains the source observation identity and `PreparationCompleted` supplies a list of unit sizes. Canonical assigns separate review operations with that parent. This fixture uses two units per source; the layout must distinguish upstream units from findings that only exist after a review outcome.

## Next mechanic candidate

The owner proposed a preparation-quality tower, analogous to the previous game's Refiner, to lower future findings probability before Review resolves. This is not implemented in these three layouts. Keep three quantities distinct: source observations, the review units produced from each source, and the findings recorded from completed reviews. Changing unit count or chunking must preserve source coverage; fewer review units alone does not establish fewer findings. Any quality simulation must supply honest pre-result host/backend facts and leave already observed `PendingFinding` ownership unchanged.


## Native maps and motion evidence

The final maps show the same paused tick 420: [Switchback District](preview-district.png), [Forked Campus](preview-courtyard.png), and [Resource Junction](preview-frontier.png). The shared Jev pool owns eight permits; a separate Reviewing road queue holds three units, split one and two across the Campus branches. Total ledger ownership is 210 bytes while building pressure is 170 bytes.

[Native evidence](validation-native.txt) includes motion pairs from the actual finite workload. Compare [road release A](preview-fanout-motion-a.png) with [road release B](preview-fanout-motion-b.png): distinct U19 and U20 move at ticks 217 and 225 while both remain Reviewing. Compare [interior A](preview-inside-motion-a.png) with [interior B](preview-inside-motion-b.png): smaller source-reading actors move on the fixed internal route at ticks 60 and 73. These are successive native frames, not staged replacement states.

A [manual purchase](preview-manual-build.png) changes gold 120 to 70 while paused. The [held delivery](preview-delivery-held.png) owns eight leases and one delivery slot before acknowledgement. The [completed run](preview-complete.png) has eight clear outcomes, eight acknowledged finding handoffs, and zero remaining ledger, request, lease or delivery ownership.

[Astra medium review](validation-astra.txt) recommends Forked Campus for visible child-road forks merging into one shared Jev hub, Switchback for the clearest sequential journey, and Junction for separating intake from retained output. Family association is less discoverable than in the superseded diagnostic courtyard: actor IDs are visible, but the maps do not yet label each child's source family. The Campus source-queue caption overlaps part of the paused header, and the Junction retention connector has a small visible gap. These are recorded prototype limits; no owner selection, player-learning result or macOS validation is claimed. Current fixed two-child workloads and bounded queue spacing do not validate arbitrary fan-out density.
