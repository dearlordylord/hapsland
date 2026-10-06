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

The first dialog focuses Continue with no agents selected. Enter with an empty selection shows a warning and stays there. Use arrow keys to move, Space to toggle agents or Select All, and Enter to continue with a nonempty selection. Escape has the same effect as Back on menus offering Back. The first selection dialog has no previous step, so Escape exits there. Hidden-input cancellation still exits setup. Inverse selection is removed. Each later menu offers explicit approve/decline/back/cancel where applicable; Ctrl+C/Ctrl+D cancel input. Only enter a **fake key**. The demo discards it. It never reads environment credential values, opens a credential file/store, writes hooks or files, or makes network/provider requests. `--existing` supplies a synthetic environment-source label, not an actual environment lookup. Native storage is simulated.

The terminal prints the relevant state before each action and a durable final result on stderr. Only the final JSON goes to stdout. With `NO_COLOR=1`, the adapter strips SGR styling while retaining cursor controls for interactive menus. Non-TTY stdin/stderr and `TERM=dumb` are rejected with a plain-text next step; they never receive default answers. The replay command below supplies a readable, non-interactive experiment instead of introducing another unattended product format.

## Rules vertical slice

The second workflow uses the same Effect prompt/navigation module as setup, with a separate pure rules reducer and an injected in-memory owner. It exercises named scope selection, owner preview, full-line approval and observed outcome without changing production or adopting #243's pending package/build structure.

```sh
npm run demo:rules
npm run demo:rules -- --action=connect
npm run demo:rules -- --action=enable --outcome=stale
npm run demo:rules -- --action=disable --outcome=partial
npm run rules:probe
npm run rules:terminal
npm run interaction:probe
npm run interaction:terminal
```

Select Project or Personal, review the proposed rule change, and choose Continue to approval. Enter a complete **y** (case-insensitive, surrounding whitespace allowed) to approve. Empty input, **yes**, and any other line decline, matching existing production confirmation. Escape at approval returns to preview; Escape at preview returns to scope; Escape at the initial scope exits. Back/Exit appear in the choice menus. Ctrl+C/Ctrl+D terminate input. Scope selection and preview issue no write. A changed owner proposal is rejected before mutation, shown again with a new digest, and requires fresh approval.

All four actions—create, connect, enable and disable—are synthetic. Create/connect explicitly show connection and activation; disable shows disabled status. The owner checks the exact approved plan and deduplicates repeated accepted plans in memory. Failed and partial outcomes are distinct; partial status warns that recovery needs inspection. No real files, credential stores, registration or provider operations are accessed. The fake owner's digest and simulated write count are evidence of the interaction shape, not a replacement for production plan semantics or locks.

The scripted and live adapters satisfy the same interaction interface. The rules entry uses one top-level Effect runtime with scoped signal/input cleanup. Setup now reuses the extracted prompt/navigation functions; its preexisting runtime bridges remain a throwaway limitation to remove in production integration. The shared hidden method uses Prompt.Hidden; no custom hidden prompt was added. The scoped session now provides typed multiple choices, serialized input, handle revocation, full-line confirmation and explicitly authorized controlling-terminal acquisition. A generic nonblocking transport feeds the built-in prompt because Bun 1.3.14 implements separately constructed tty.ReadStream using blocking filesystem reads; those reads prevented process exit. The prototype launcher preserves the terminal session only for the explicit controlling-terminal probe. Real JSON setup and credential-owner integration against #243 remain unvalidated.

Qualification includes rules scripted witnesses plus source and host-compiled PTY cases, alongside all prior setup checks. PTY witnesses cover both scope choices, explicit approval/decline, Back/Exit, changed proposals, failure/partial status, narrow input, typeahead, Ctrl+D and launcher-forwarded signals. Setup and rules each emit replay-generated Mermaid Markdown with non-writing freshness checks.

## Reducer replay diagram

Open [the setup Mermaid Markdown](diagram.md) or [the rules Mermaid Markdown](rules-diagram.md) in a Mermaid-capable preview, then run `npm run demo` to try the corresponding console flow. The main graph contains observed state-changing transitions; a companion graph shows observed ignored inputs as self-loops. Replay tables retain event revisions and emitted command IDs without keys, raw owner payloads or approval digests. Prompt-only focus/warning changes and hidden key entry are outside this domain graph.

```sh
npm run diagram:write
npm run diagram:check
```

The write command explicitly regenerates the artifact. The check compares current output without rewriting it and is included in `qualify`. The setup generator uses the same [named scenario drivers](scenarios.ts) as the controller comparison, with explicit starting sources and fresh initial contexts. Drivers contain independent behavioral assertions; the generator records transitions from the actual current reducer instead of maintaining expected edges. The rules generator observes 19 scripted runs through the actual workflow/reducer, including scope, Back, default decline, stale proposals, input termination and partial/failure outcomes. It asserts outcomes and simulated writes independently and omits digests and raw plans. No real operation is executed.

**Coverage limit:** This diagram shows transitions observed by the declared scenario replays through the current reducer. Regeneration keeps it current for those scenarios; it does not establish exhaustive coverage. New states, guards or context-dependent branches may remain absent until scenarios exercise them. Diagram freshness does not establish behavioral correctness. The graph's branch labels describe observed paths. For example, the console's first-dialog empty-Continue warning is not a reducer transition, and the headless reducer's legal empty-selection completion is currently absent from these eight diagram scenarios.

Diagram presentation remains a prototype decision. Review the main graph's separation from ignored inputs and the multi-agent return to Hooks when comparing it with the console. This adds no transition-table migration or state-machine dependency.

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

`qualify` has a 90-second aggregate deadline, typechecks the isolated package, compares both controllers, checks the shared interaction seam and rules behavior/source and compiled PTY cases, both diagram freshness checks and task lifetime, runs all three adversarial swarm probes and source PTY probes, compiles macOS/Linux arm64 standalone executables, and probes the host executable. It requires an arm64 macOS/Linux host and removes temporary binaries. `npm run qualify -- --write` refreshes [evidence.json](evidence.json) after a new experiment; the plain command leaves the recorded evidence unchanged.

The replay asserts matching state after each event in eight scenarios: two clients with a partial result; back and stale approval/result rejection; wrong command IDs; refusal of navigation during a write; each destination; skip; preserving a higher-priority environment source; keeping an existing credential; declined paid verification; and failed-save recovery. Keys never appear in events/model/command logs. These assertions are executable experiment probes, not a replacement production test suite.

The PTY probe runs both controllers at 80, 40 and 20 columns, resizes during selection, sends Ctrl+C, Ctrl+D, SIGINT, SIGTERM and SIGHUP, exercises no-color and color-enabled output, and rejects non-interactive and dumb-terminal inputs. It compares terminal flags before/after, parses stdout JSON, and checks that a synthetic secret marker is absent from both output channels. Passing small-window input probes does not establish visual legibility or screen-reader usability.

## Findings

The [recorded evidence](evidence.json) observes Bun 1.3.14 on macOS arm64 with Effect 4.0.0 and `effect-machine` 0.28.0. Eight scenario traces match after every event. Twenty source PTY cases and twenty compiled macOS PTY cases pass with guarded Continue, Space selection, and Escape navigation. Both arm64 targets compile; only macOS execution was observed. The dedicated lifetime experiment confirms an actor's state-owned task is interrupted and released on exit, and its late completion does not advance the state.

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
| An empty agent selection is trapped at a minimum-one prompt | The headless reducer accepts empty selection as a no-op; the console guards empty Continue with a warning. |

The final swarm reports no findings in its checked scope: 86 flow expectations, state/command boundary expectations recorded in `swarmInteraction`, and 35 adversarial console cases. The terminal cases cover hidden-input cancel/EOF, repeated EOF, multibyte hidden input at width 12, explicit Back paths, typeahead, asymmetric TTY streams, launcher/group termination, and empty Enter guarding Continue, Space toggling all/on/off, and Escape navigation. The first swarm's apparent wrong-screen failures were fixture errors, corrected by matching initial source metadata and structural comparison; they are not product defects.

This does not establish that arbitrary owner payloads are valid external input, that a native credential write is recoverable, or that an actor/reducer has passed all interleavings. The fake operation is private; both the demo and replay now use the session executor. Evidence remains synthetic and bounded.

## Production Effect direction

The user intends the eventual production integration to use idiomatic Effect throughout orchestration. Keep the reducer pure; execute commands, terminal interaction, owner operations and cleanup through typed Effects. Assemble dependencies explicitly, using Effect services and Layers where they clarify ownership, scope and production/test wiring. An explicit ports interface such as production `PilotPorts` is compatible with this direction; it is a project interface, not an Effect-native type. Plain side-effecting callbacks such as output and exit-code updates should execute within Effect rather than escape the orchestration boundary.

This is an implementation direction for adoption after prototype review, not a claim that the throwaway prototype or existing production code already completes that migration. Preserve the tested installation-preview, confirmation and proposal-digest behavior when changing orchestration; the user confirms having manually tested the existing approval flow. Keep secrets outside reducer state and retain owner-controlled mutation, correlation and scoped cleanup. Select the concrete services/Layer boundary during integration rather than migrating interfaces for naming alone.

## Boundaries and unresolved work

- The two controllers implement transitions independently. Shared domain helpers describe safe data, digests, context updates and view-derived commands; the machine does not call the reducer. No inspector, persistence or cluster features are enabled.
- `Schema.declare` trusts in-process typed context/events for this experiment. It is not an accepted decoder for saved plans, IPC or external input.
- Real credential-owner integration follows prototype review and must use the existing setup/credential owners. Fake credential save previews/digests demonstrate where consent belongs. Production currently lacks the proposed destination-specific preview API; specification and owner changes are required before implementing it.
- Hidden input yields `Redacted`; the fake adapter consumes and drops it immediately and invalidates the wrapper. This does not prove memory zeroization. No real key is used or retained in the evidence.
- No filesystem preservation/permissions, Git-ignore changes, Keychain/Secret Service behavior, real engine partial writes, real cancellation during mutation, credential validity or paid checks were exercised. Cancel/back during simulated writes waits for the owner outcome rather than claiming rollback.
- Linux execution is deferred to a later milestone; compilation alone does not establish it. The user will review visual readability after this prototype. Screen-reader work is outside the current scope. Prior externally established raw terminal modes and wide/multibyte labels remain unvalidated. A resize input probe confirms continuation, not optimal redraw/layout. Multibyte hidden input is exercised, but multibyte label layout remains unvalidated.
- The production CLI, unattended version-one JSON, saved plans, packaging assets and review policies are unchanged. Root `check:fast` excludes prototypes, so this package has its own typecheck and qualification.

See the [preserved flow](../../docs/setup-interaction-proposal.md), [model research](../../docs/research/PRODUCT-RESEARCH-ADVISORY-2026-10-06-INTERACTION-MODEL.md) and [renderer research](../../docs/research/PRODUCT-RESEARCH-ADVISORY-2026-10-06-CONSOLE-RENDERING.md). This is evidence for a design choice, not owner acceptance or release support.

## CLI-wide extension direction

The broader interaction handoff is now in work. The [CLI-wide inventory and acceptance sequence](../../docs/setup-interaction-proposal.md#cli-wide-interaction-scope) owns the next prototype extension: share input/view/lifetime conventions while keeping setup, rules, update, maintenance and credential models separate. Preserve distinct approval cardinalities, actual owner digests and unattended paths. The owner extended diagram scope: every modeled interactive workflow must emit Mermaid inside Markdown from executable replay scenarios, with explicit regeneration, non-writing freshness checks and bounded coverage guidance. Setup and rules artifacts exist now; update, maintenance, login and verification/replacement artifacts land with their models. Direct/headless exceptions do not acquire invented dialog states.

Integration presents current credential behavior and creates a follow-up task for additional project/user file-saving choices. Success presentation is resolved with production owner outcomes; readiness says **Codex**. Linux arm64 execution is a required late integration check, not deferred beyond integration. The initial selection dialog remains accepted, and hidden-input cancellation remains unchanged.

## Shared interaction milestone evidence boundary

The shared process/session runner installs scoped signal handlers before input starts. The input lease serializes concurrent callers and refuses new input after release; workflow reducers still own revision/command correlation. Scripted hidden input requires an explicit synthetic step and consumes EOF/Exit as termination rather than inventing a credential. Secrets never become replay events or generated Markdown.

The dedicated physical probe exercises ordinary and controlling-terminal Prompt.Hidden, Escape/Ctrl+C/Ctrl+D, process interruption, multiple-selection guarding/Back, and strict full-line approval. It checks process exit, secret absence, pure JSON stdout and restored terminal configuration. On macOS it excludes only the kernel-owned PENDIN pending-input marker from flag equality; input/echo configuration and control characters remain checked. Complete OS settings are restored for the separately acquired terminal. These fake-input checks do not establish real owner integration or Linux execution.
