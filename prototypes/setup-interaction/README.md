# Setup interaction prototype

**Purpose:** Compare a typed reducer and `effect-machine` on the same setup conversation, and exercise Effect Prompt through a project-owned terminal adapter.
**Status:** Throwaway executable prototype; not production onboarding or an accepted dependency choice.
**Authority:** Design experiment and bounded validation evidence. Current setup/credential owners remain authoritative; fake digests and outcomes are not their public contracts.
**Expected use:** Run the console demo, inspect state after each action, and use the replay/PTY evidence to choose a production design.
**Lifecycle:** Temporary until the setup-interaction design acceptance milestone. Consolidate the chosen architecture into an ADR and accepted behavior into `docs/installation-workflows.md` and `docs/configuration.md`; update links and delete this prototype from the implementation branch. This PR branch and Git history retain the experiment and evidence.

## Run

From this directory, install the isolated dependencies without lifecycle scripts:

```sh
npm ci --ignore-scripts
npm run demo
npm run demo -- --machine
npm run demo -- --existing
```

Requires Node, Python 3 for PTY probes, and the repository's pinned Bun 1.3.14. The launcher uses the existing pinned runtime resolver (PATH, explicit `HAPSLAND_BUILD_BUN`, then mise). It rejects a wrong Bun version. All Effect packages are pinned to 4.0.0 in this package; production manifests and dependencies are unchanged.

Use Space/arrow keys and Enter to select synthetic agents. Each later menu offers explicit approve/decline/back/cancel where applicable; Ctrl+C/Ctrl+D cancel input. Only enter a **fake key**. The demo discards it. It never reads environment credential values, opens a credential file/store, writes hooks or files, or makes network/provider requests. `--existing` supplies a synthetic environment-source label, not an actual environment lookup. Native storage is simulated.

The terminal prints the relevant state before each action and a durable final result on stderr. Only the final JSON goes to stdout. With `NO_COLOR=1`, the adapter strips SGR styling while retaining cursor controls for interactive menus. Non-TTY stdin/stderr and `TERM=dumb` are rejected with a plain-text next step; they never receive default answers. The replay command below supplies a readable, non-interactive experiment instead of introducing another unattended product format.

## Reproduce the evidence

```sh
npm run compare
npm run lifetime
npm run probe
npm run swarm:flow
npm run swarm:interaction
npm run swarm:terminal
npm run qualify
```

`qualify` has a 60-second aggregate deadline, typechecks the isolated package, compares both controllers, checks task lifetime, runs all three adversarial swarm probes and source PTY probes, compiles macOS/Linux arm64 standalone executables, and probes the host executable. It requires an arm64 macOS/Linux host and removes temporary binaries. `npm run qualify -- --write` refreshes [evidence.json](evidence.json) after a new experiment; the plain command leaves the recorded evidence unchanged.

The replay asserts matching state after each event in eight scenarios: two clients with a partial result; back and stale approval/result rejection; wrong command IDs; refusal of navigation during a write; each destination; skip; preserving a higher-priority environment source; keeping an existing credential; declined paid verification; and failed-save recovery. Keys never appear in events/model/command logs. These assertions are executable experiment probes, not a replacement production test suite.

The PTY probe runs both controllers at 80, 40 and 20 columns, resizes during selection, sends Ctrl+C, Ctrl+D, SIGINT, SIGTERM and SIGHUP, exercises no-color and color-enabled output, and rejects non-interactive and dumb-terminal inputs. It compares terminal flags before/after, parses stdout JSON, and checks that a synthetic secret marker is absent from both output channels. Passing small-window input probes does not establish visual legibility or screen-reader usability.

## Findings

The [recorded evidence](evidence.json) observes Bun 1.3.14 on macOS arm64 with Effect 4.0.0 and `effect-machine` 0.28.0. Eight scenario traces match after every event. Twenty source PTY cases and twenty compiled macOS PTY cases pass. Both arm64 targets compile; only macOS execution was observed. The dedicated lifetime experiment confirms an actor's state-owned task is interrupted and released on exit, and its late completion does not advance the state.

**Recommendation:** choose the typed reducer plus an Effect command interpreter for this bounded, sequential setup session. Its transitions are straightforward to inspect, and it needs less framework declaration than this statechart. Preserve revision/command correlation, common context, explicit approval steps and safe owner observations. Reconsider `effect-machine` when state-owned background work, concurrent child actors or subscriptions become a concrete requirement; its cancellation mechanism worked in this experiment. No performance or general framework superiority claim follows from this comparison.

**Renderer:** Effect Prompt is a viable candidate with an owned stderr `Terminal` adapter. The experiment found and corrected adapter issues: default prompt styling still emits SGR under an empty-color theme, leaving stdin flowing prevents exit, and registering signal handlers after starting input permits an early-signal race. The adapter now strips SGR for `NO_COLOR`, restores raw mode and stream flow, and installs signal handlers before starting the Effect. Production consent must still use the existing full-line confirmation and digest contracts; these arrow-key approval menus are an experiment, not that contract.

## Luna max adversarial swarm (2026-10-06)

Three independent Luna max agents tested flow semantics, command/state boundaries, and actual console/launcher behavior. They used independent expectations rather than agreement between controllers. [swarm-flow.ts](swarm-flow.ts), [swarm-interaction.ts](swarm-interaction.ts), and [swarm-terminal.py](swarm-terminal.py) retain the regression witnesses. The refreshed evidence includes their results and a digest of the checked source inputs.

| Reproduced problem | Observable correction |
| --- | --- |
| Saving a lower-priority credential, especially twice, falsely reports it effective | Source precedence survives file/native choices and repeated saves; last save destination is reported separately. |
| Arbitrary owner outcome text reaches state/output | Observations become bounded safe status codes; raw synthetic error text and sentinels are absent. |
| Save failures discard recovery and retain an old approval digest | Canonical partial/failure status survives; the digest is cleared before retry and fresh approval is required. |
| Back from credential selection does nothing | Back returns to selected agents with prior outcomes and current selection preserved. |
| Reselecting an already-applied agent, then declining, overwrites complete/partial with declined | Prior observed setup remains; a separate declined-update marker explains that no undo occurred. |
| Skipping credentials ends with no readiness explanation | Readable final output explicitly says review is unavailable without credentials and names recovery/next steps. |
| Replaying command execution can repeat work | One executor per session deduplicates concurrent/replayed IDs; conflicting command fingerprints fail closed. |
| Launcher-only SIGTERM exits Node but leaves Bun running | The asynchronous launcher forwards termination, awaits child close, and keeps pipes/terminal cleanup owned. |
| A process-group signal reaches Bun twice and leaves the terminal raw | Bun runs in its own group; forwarding and persistent session cancellation restore terminal modes and produce a durable result. Resize signals are forwarded too. |
| An empty agent selection is trapped at a minimum-one prompt | Empty selection completes as a no-op, distinct from cancellation, with no command. |

The final swarm reports no findings in its checked scope: 86 flow expectations, state/command boundary expectations recorded in `swarmInteraction`, and 19 adversarial console cases. The terminal cases cover hidden-input cancel/EOF, repeated EOF, multibyte hidden input at width 12, explicit Back paths, typeahead, asymmetric TTY streams, and launcher/group termination. The first swarm's apparent wrong-screen failures were fixture errors, corrected by matching initial source metadata and structural comparison; they are not product defects.

This does not establish that arbitrary owner payloads are valid external input, that a native credential write is recoverable, or that an actor/reducer has passed all interleavings. The fake operation is private; both the demo and replay now use the session executor. Evidence remains synthetic and bounded.

## Boundaries and unresolved work

- The two controllers implement transitions independently. Shared domain helpers describe safe data, digests, context updates and view-derived commands; the machine does not call the reducer. No inspector, persistence or cluster features are enabled.
- `Schema.declare` trusts in-process typed context/events for this experiment. It is not an accepted decoder for saved plans, IPC or external input.
- Fake credential save previews/digests demonstrate where consent belongs. Production currently lacks the proposed destination-specific preview API; specification and owner changes are required before implementing it.
- Hidden input yields `Redacted`; the fake adapter consumes and drops it immediately and invalidates the wrapper. This does not prove memory zeroization. No real key is used or retained in the evidence.
- No filesystem preservation/permissions, Git-ignore changes, Keychain/Secret Service behavior, real engine partial writes, real cancellation during mutation, credential validity or paid checks were exercised. Cancel/back during simulated writes waits for the owner outcome rather than claiming rollback.
- Linux execution, prior externally established raw terminal modes, screen readers, wide/multibyte labels and visual readability remain unvalidated. A resize input probe confirms continuation, not optimal redraw/layout. Multibyte hidden input is exercised, but multibyte label layout remains unvalidated.
- The production CLI, unattended version-one JSON, saved plans, packaging assets and review policies are unchanged. Root `check:fast` excludes prototypes, so this package has its own typecheck and qualification.

See the [preserved flow](../../docs/setup-interaction-proposal.md), [model research](../../docs/research/PRODUCT-RESEARCH-ADVISORY-2026-10-06-INTERACTION-MODEL.md) and [renderer research](../../docs/research/PRODUCT-RESEARCH-ADVISORY-2026-10-06-CONSOLE-RENDERING.md). This is evidence for a design choice, not owner acceptance or release support.
