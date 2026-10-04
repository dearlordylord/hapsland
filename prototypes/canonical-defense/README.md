# Canonical architecture defense

**Purpose:** Present the shared continuous Monkey Business engine through an optional native tower game.
**Status:** Throwaway gameplay prototype under issue #199; new runtime validation is pending.
**Authority:** Design proposal and implementation evidence; the product contracts and shared engine own business behavior.
**Expected use:** Build spatial towers and inspect continuous review activity in a separate engine instance.
**Lifecycle:** At the owner's game-layout selection, consolidate accepted mechanics into the game owner, update inbound links, and delete rejected variants and obsolete evidence. Review this guide when shared engine controls or native rendering change.

Run `./prototypes/canonical-defense/run.sh` with Bend and native graphics prerequisites installed. **1–7** choose towers; click ground to build, click a tower to select, **U** upgrades. **Space/P** pauses virtual time, **N/Enter** submits a generic workload burst, **A** suspends or resumes future recurring arrivals, and **[/]** changes their pace. **R** resets this game instance; **Escape** closes the window. Tab changes an uninvested empty map.

There are no authored waves or completion quota. The game stores a boxed `NativeRunTypes.State` and calls `NativeRun.create`, `advance`, `control`, and `observe`. The shared engine owns generated tasks, preparation/import graphs, Jev effects, Stop, collection and output. It continues the same resident across tasks. The game supplies a separate wall-clock endpoint every20ms; engine observation time remains the last actual transition. Dashboard and game instances do not share state or networking.

Geometry, roads, combat, tower costs, upgrades, shields, damage and gold remain game-owned. Rapid/Relay/Coordinator acceleration and risk timers affect presentation/combat only; they cannot rewrite issued business facts. A Refiner shot additionally applies the supported `JevProfile` control to **future** requests, reducing finding weight from1 to0.5 against clear weight1. Previously sampled outcomes and deadlines remain unchanged. Parallelizer and Packager indicators describe game support, not a production capacity or batch-size change. Gold starts at160; each acknowledged output bundle adds5 gold. These are game choices, not product guarantees.

The three maps retain their wall-port and finite-room geometry checks. Current actor phases and resource counters derive read-only from the actual Canonical projection. The game contains no local Canonical event driver, Stop implementation, output driver or Session scheduler. The sole workload scheduler belongs to `packages/monkey-business-bend/Session.bend`.

Configuration and creation-seed agreement are validated through the independently declared public consumer configuration and full observed runtime comparison. The redundant standalone proof of two concrete configuration equalities has been removed; it is not a business completion gate. `DefenseConsumerObserved.bend` now records original game keys through actual `Host.key` and `Host.tick_observed`, all returned frames, every tick's full engine state/queue, and complete game midpoints. Four finite control campaigns use declaration seeds0/3/17/41; the actual consumer configuration/creation seed152 stays fixed. `node scripts/run-game-consumer.mjs` requires the single generated `game_consumer` codec family and shared NativeRun full observed-frame sidecars. The in-place optional transport now emits145 lossless batches over all3222 original Host ticks, at most64 ticks per batch. One fresh native executable and one fresh emitted `.cjs` executable run the same IO main; each numeric-vector line is limited to16MiB and compared through the same owner codec/parser. Complete checkpoint worlds, tick/frame/physical states, original inputs and strict offsets remain required. The full stream and comparator have not yet been validated. The verifier refuses missing sidecars and checks native/emitted-JS full owner data, independent inputs, contract-required public midpoints and ordinary replay. Entire native/emitted encoded batches remain equal; public comparison preserves complete Canonical state, queue/actions/source identities/scopes/receipts and controls without requiring identical private Engine or prepared-context layout. No execution of this new source checkpoint is claimed.

The maintained entry point owns one 380-second overall deadline, including
source/tool checks, every public midpoint, replay, and process-group cleanup.
C emission uses its remaining budget; clang compilation is capped at 120 seconds,
JavaScript emission at 30 seconds, and each execution lane at 15 seconds, all
within that deadline. The ordinary runner defaults remain 30/30/5 seconds.
A zero C phase cap requires the finite supervisor handoff. Per-frame semantic validation runs through
`compareNativeFrames`; the outer loop separately accumulates actual delivered
targets and retains every tick's physical comparison, including silent callbacks.
It does not repeat the same context/state decoding loop. Scoped compiler failures
retain any produced C and captured identity receipts for manual diagnosis;
retention does not permit automatic reuse or convert a failed phase to a pass.


`DefenseConsumerTests.bend` supplies original generic Burst/Suspend/Pace inputs and checks independent instances, pause, construction cost, preservation and workload admission. `DefensePreviewTests.bend`, `DefenseMapTests.bend`, `DefenseDrawTests.bend` and `DefenseRasterTests.bend` retain game/geometry/pixel checks. `DefenseFeatureTests.bend` combines these. Native emission/execution uses5s limits; external C compilation uses15s. Passing source checks do not establish native execution or platform support. Earlier screenshots, balance files and validation receipts describe their recorded historical source and are not evidence for this continuous consumer.

`node prototypes/canonical-defense/verify-game-native.mjs` runs all five existing roots above sequentially, retaining all40 source assertions and their completion messages. Each root gets fresh emission, compilation and source/tool/artifact provenance validation with the same5/15/5-second phase bounds. Any failed root stops the suite with a nonzero exit; success is reported only after all five pass. The aggregate remains callable. The partitioned gate has not run; the earlier aggregate C emission timed out at5s. Interactive `DefenseMain.bend` window/input-device validation remains separate.

Existing [laws](LAWS.bend) and [proofs](PROOF.bend) retain the five concrete balance facts and universally quantified damage-preserves-Canonical-state statement. [Candidate engine-preservation laws](ConsumerLAWS.bend) quantify over every game World, and pointer coordinates over every U32, without premises. Their [proofs](ConsumerPROOF.bend) are proposals until owner review. The optional proposal-falsification runner has been removed because it launched external tooling without a time bound. These unaccepted proposals do not add a business completion gate; any future owner review must declare its own finite falsification and kernel-validation scope.

## Earlier prototype selection index

Retain [earlier game sources](../bend-tower-defense/) and the `prototypes/bend-*-source.tar.gz` bundles until the owner selects useful road, automatic-workload, flow or combat mechanics. These earlier prototypes are not runtime dependencies of this game, core or dashboard. Cleanup trigger: owner's mechanic selection; transfer selected mechanics to their chosen owner, update references and **delete** rejected variants/bundles. Do not delete them automatically during #199.
