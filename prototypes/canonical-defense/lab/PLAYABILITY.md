# Tower Defense playability framework

**Purpose:** Make the visible game obey the player's expectations before tuning balance.
**Audience:** Product owners, contributors, and coding agents.
**Status:** Active.
**Authority:** Accepted user requirements from the 2026-10-15 session; the procedure below is maintained guidance. Captures and test results are evidence, not additional requirements.
**Expected use:** Apply before and after changes to movement, towers, targeting, effects, previews, and upgrades.
**Lifecycle:** Maintain with gameplay changes. Review whenever an entity, effect, timing model, or player-facing explanation changes.

## Player contract

A tower shoots a visible monster. A building is upgraded through a building upgrade, not represented as an invisible monster target. The monster shown on the map, its position used for range, and the recipient of the effect have one identity and one current position. An animation of past events cannot stand in for the current monster.

The player must be able to follow this chain without knowing implementation details:

**monster moves → enters radius → tower visibly fires at that monster → that monster visibly changes → the changed behavior has a visible consequence.**

An accelerator must show the selected monster progressing sooner. It does not imply a different review result or promise that a whole family completes. A courier acts on an authorized delivery packet, never on an undeliverable result. An unavailable action must have a visible reason.

## Acceptance questions

| Criterion | What the player must see | Reject when |
| --- | --- | --- |
| Identity | The same named monster before, during and after a shot; explicit split/merge for children or packets | A second square elsewhere represents the actual target |
| Space | The shot ends at the monster's visible position inside the radius | Range uses a building center or a future/past position |
| Time | Movement, eligibility, effect and completion belong to the same game time | A result completes while its actionable monster is still at an earlier building |
| Causality | A visible beam/pulse and changed remaining time or speed on its recipient | Only a counter elsewhere changes, or an unhit sibling appears accelerated |
| Continuity | Movement remains readable across firing and phase transitions | Rescheduling teleports a monster or makes it disappear without an outcome |
| Preview | The future action marks the same monster and quotes its actual change | Preview and shot disagree, or build legality is confused with effectiveness |
| Pause | Frozen movement and retained eligible preview; no shots until resume | Pausing hides valid targets or advances effects |
| Teaching | One sentence predicts what changes and what does not; the example visibly supports it | Understanding requires explaining away contradictory animation |
| Crowding | Multiple targets remain identifiable and an individual hit is attributable | Overlapping labels or a group symbol implies every member was hit |
| Responsiveness | The pointer and tower ghost track movement on an empty map and during play | A game that compiles has low FPS even before work is released |
| Upgrade | Range/cadence change has a visible, correctly quoted consequence | Upgrade text changes without a corresponding behavior change |

## Procedure

1. State the player question and expected observable sequence before editing mechanics.
2. First compare a complete no-tower journey with the previous accepted game build: entrance, preparation, branching, Jev checks, individual outcomes and exit. Identify both source/build identities; do not call an older Linux build yesterday’s macOS build. Then run the ordinary game, capture a failing sequence and its entity identities, positions, times and target selections. Inspect the images. A static green ring alone is insufficient.
3. Add an executable witness that rejects the failure. Keep independent expected values or before/after observations; do not merely compare two callers of the same possibly wrong helper.
4. Change the shared owner of the behavior. Rendering, preview and firing consume its result. Do not add a compensating overlay to hide a contradictory world.
5. Replay the same scenario and compare baseline versus intervention with equal initial input. Capture before shot, hit, progression and outcome. Inspect the native window, not only emitted rectangles.
6. Run the countercases below and affected checks from the testing matrix. Prove general invariants where practical; explicitly distinguish proofs, finite traces and visual assessment.
7. Audit proof wiring: name the state field and movement function consumed by the actual renderer, targeting and preview. A proof about a retired or diagnostic actor path does not qualify its replacement. Add a regression that fails when the rendered path bypasses the proved movement owner.
8. Record a verdict for each criterion: pass, fail or unverified. Any unexplained identity/space/time/causality failure blocks playability acceptance, regardless of balance or passing code checks.

## Required cases and countercases

- Before releasing any monsters, move the pointer and selected tower ghost across the map in the actual intended build mode. Compare frame delivery with the previous build; check all maps. An O0 launch workaround is not accepted from compilation alone. Separate pixel equality, window responsiveness and physics timing evidence.
- Release seven jobs with no towers, and move the pointer continuously during the first five seconds and again after Jev branching. Compare five interleaved native runs per build from the same recorded inputs. Record both delivered frames and simulation ticks: at normal pace five seconds should advance about 250 ticks. A higher frame rate obtained by skipping ticks, pausing work, hiding entities or reducing the workload fails this case. Separate input/reducer, scene construction, rasterization and window costs before choosing a fix. A paused comparison helps distinguish simulation cost from drawing cost.
- One eligible monster; the same **complete** journey with no tower and with a tower. The no-tower baseline must pass before any tower benefit is accepted.
- First visible root starts at the map entrance. Zero/short callback delays and spawning during an existing run must not skip entrance or preparation.
- Measure displacement for every visible entity on each tick, including phase boundaries. Each entity retains its base speed unless an explicit tower effect changes it; shorter callback deadlines must not create unbounded catch-up movement. The historical ordinary actor step is at most 4 pixels; rule fragments have their own fixed per-rule speeds. Preserve intentional queue waits and final short steps.
- Follow the same identity into Jev and inspect the configured check formation, split, branch count and individual outcomes in the actual scene. Internal fragment objects or a SPLIT label alone do not establish visible branching.
- A monster just outside/inside range; no hit through a building-center surrogate.
- Two siblings: only the selected one changes; subsequent family completion is distinguished from that hit. While the shot animation fades, its endpoint follows that exact moving recipient, including stacked shots from different towers. It must not remain at the old hit coordinates, switch to a sibling, or survive the recipient disappearing.
- Repeat recipient isolation after branching. Separate drawn fragments are separate physical entities even when they share a callback owner. A shot at one fragment cannot silently accelerate its off-screen or out-of-range siblings. A callback-identity assertion alone does not establish this criterion.
- When fragments assemble into one deliverable packet, observe their arrival at the common assembly point and the single packet departing from that point. A Finish packet cannot depart before every captured member arrives. Check indicators must be visually distinct from independently moving monsters.
- Several overlapping arrivals; identify the exact recipient and preserve independent outcomes.
- Pause before construction, after construction and around a shot; preview parity at equal parameters.
- Cooldown, insufficient budget, illegal ground, maximum upgrade and empty world.
- Preparation/review versus authorized individual delivery versus a committed Finish packet.
- Ready A / late B at Stop: deliver A and exclude B; no resurrection by a tower.
- Every offered tower on ordinary reachable journeys, on all maps. No claim that every workload offers every effect.

## Executable witnesses and evidence boundary

- `../playability.test.mjs` exercises actual Host movement and scene output: identity and position, single-recipient acceleration, no teleport, pause, phase handoff, automatic firing, frozen hit positions, stacked shots, uncertainty, partial event budgets and zero-duration stages.
- `../physical-movement.test.mjs` follows complete no-tower journeys on all three maps with zero and short callback delays. It independently bounds per-tick actor and fragment displacement and checks that entrance, Jev checks and split fragments are actually painted.
- `../packet-assembly.test.mjs` rejects targeting separate fragments as a single packet and checks physical assembly before packet eligibility.
- `../preview-render.test.mjs` exercises actual preview pixels and numeric quotes, all three maps, prebuild/built parity, upgrades, unavailable targets, Finish membership and crowd labels. Its scene-removal mutant must fail the positive visibility witness.
- `../LiveMotionLAWS.bend` and the existing preview/timing law owners pin their stated equations. They do not universally prove all scheduling, geometric interpolation or human learning.
- `../../../scripts/game-balance-lab.test.mts` owns the public replay and teaching countercases. Read its independently expected events, not only summary metrics.
- Native window captures must show the actual acceptance build before construction, at impact, during subsequent movement and at outcome. Rectangle tests alone are insufficient.

Keep these discovered counterexamples as regression requirements: a separately drawn phase-center target contradicts the moving monster; a hit must not move the body; a persistent beam must retain the hit point; stacked shots must retain their separate beams; an uncertain acknowledgement must not say delivered; a queued callback at its due time is not cancelled; a partial advance must not publish a future result or age a hit without elapsed game time; an accepted instantaneous stage still needs an outcome marker.

For Stop teaching, compare equal initial inputs: one accelerated sibling can become ready before cutoff while the other is excluded. Check whether two shots make both ready in the inspected journey; do not assume they guarantee an acknowledged Finish. A cadence upgrade can fail to help once the sibling leaves range. Delivery acceleration cannot change captured membership. Show readiness, accepted delivery and health consequences separately.

A native visual review supports the inspected scenarios and build mode only. Timing/geometry proofs, finite traces, native/emitted agreement and participant learning are distinct claims. Human learning and global balance remain unmeasured until their own studies establish them.

Execution receipts and captures belong under ignored `.test-runs/`; they must name source/build identity, scenario, criteria verdicts and limitations. Keep this framework current rather than accumulating historical reports here.

## Maze and resource counterexamples

A follower on an adjacent maze row must not stop merely because the row is only 8 pixels away. Compare directed progress along the authored route; a close body actually ahead still blocks, an older body behind does not. Completed bodies must release the queue, and their history timer must expire even when movement would be blocked. Pause freezes the entire tick, including history ageing.

For a displayed preparation refusal, inspect the captured event and its pre-decision capacity ledger. A currently empty room does not establish available capacity at that earlier decision. The 19-edit witness accepts four 100-byte preparations and refuses 15 while 400 of 480 bytes are reserved; after drain all work, reservations and historical actors must disappear. The one-edit countercase must have no refusal. These are deterministic observations of that workload, not universal throughput claims.

The global ledger may flash under shared pressure; an empty or occupied room must keep its own phase color and must not display global HP as room HP. Check numbers persist from one review to its separate result fragments. An authorized packet is one body drawn with stack marks and its exact finding count, including captured Finish members; it is never an invented collection of nearby bodies. Event labels have no decorative arcs.

## Retired packets must drain

A finite repeated-release run followed by Stop must not strand retired history at the retained-room assembly gate while the game is alive. Reproduction: release twelve edits forty ticks apart, press Stop at tick 640, then inspect tick 4000 on all three maps. Before the fix, the canonical work and ledger were empty but retired actors and their STORE labels remained indefinitely. Their stale room paths waited for a delivery authorization that could no longer arrive.

Retired history may finish its remaining physical path without acquiring a new room seat or packet authorization. Live work still requires both. This cannot create a delivery acknowledgement or successful exit; actual outcomes stay owned by Canonical. On drain require zero canonical work, reservations, actors, rule groups and actionable targets. Also run recurring arrivals without manual Stop, suspend them, and require the same drain. Game-over pause is a separate supported behavior; these witnesses require positive health.

## Confirmed output releases payload before expiry

After an accepted certain individual output, drain its same-time post-actions
and require that exact `PendingFinding`, its ready membership and its capacity
reservation to be absent. A later expiry sweep is not evidence for this criterion.
Keep the submitted token/fingerprint evidence so Stop cannot repeat it, and prune
that compact evidence through ordinary lifecycle cleanup. A retired body keeps
its truthful SENT outcome instead of being relabelled as an unsent result. Uncertain
output keeps its payload for the permitted single Stop reoffer. Other pending
findings and their reservations remain unchanged; failed retirement is atomic.

`journey-diagnostics.test.mjs` witnesses the complete actual Host sequence,
including a fresh preparation before the old expiry deadline, duplicate ACK,
uncertain output and Stop. `packages/monkey-business-bend/ack-cleanup.test.mjs`
checks the general helper laws with BendTT, independently compiling rejected
mutants, and a real-Host mutant omitting the finalization call. The law statements
cover cleanup selection, collection state preservation and rejection atomicity;
they do not prove the entire scheduler or arbitrary partial resident batches.
Shared NativeRun individual submissions currently capture one whole review work
item. Raw Canonical submission recording remains separate from finalization.

At zero health the existing game-over freeze is distinct from resource starvation:
the always-visible activity line must say `DEFEATED / WORLD FROZEN / R RESET`.
Do not increase health in player acceptance traces to conceal actual overload;
a diagnostic that raises health only to isolate ownership is separate evidence.
