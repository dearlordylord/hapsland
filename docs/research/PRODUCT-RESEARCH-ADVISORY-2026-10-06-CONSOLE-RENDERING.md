# Hapsland console-rendering advisory

**Purpose:** Compare terminal interaction/rendering candidates for Hapsland's explicit setup model, including the named Foldkit candidate.
**Status:** Temporary product-specification advisory; it adopts no product behavior or dependency.
**Authority:** Primary-source research, local source inspection, and design inference. Existing setup, credential, terminal, and consent contracts remain authoritative; this report is not an accepted product contract or runtime validation.
**Expected use:** Use the scoped recommendations and prototype gates during setup-interaction design acceptance; decide explicitly which findings become requirements.
**Lifecycle:** Temporary until the setup-interaction design acceptance milestone. Consolidate the selected architecture into an ADR and adopted behavior into `docs/installation-workflows.md` and `docs/configuration.md`, update inbound links, and delete this report. Git history retains rejected options and evidence.

## Research brief

**Date and question.** 2026-10-06. Which console layer best renders Hapsland's explicit setup interaction model, and can Foldkit supply it? Compare the current small renderer, Effect's own prompt API, console prompt packages, and richer terminal UI systems.

**Scope and target.** Human-guided setup on macOS/Linux arm64, TypeScript, Bun 1.3.14 standalone builds, and the repository's exact Effect 4.0.0 cohort. This is a renderer and terminal-boundary pass, not a decision about credential destinations, setup state-machine architecture, consent policy, or review eligibility. [The setup-interaction proposal](../setup-interaction-proposal.md) and [interaction-model advisory](PRODUCT-RESEARCH-ADVISORY-2026-10-06-INTERACTION-MODEL.md) own that context.

**Representative workflows.** Select installed clients; show a write preview and collect its approval; enter or replace a credential without echo; go back or cancel; report partial setup and next steps; run the version-one unattended JSON path with no menus or implied approval. A renderer may display choices and return input events. It must not become the setup engine, write owner, credential store, or approval authority.

**Evaluation and baseline.** Compare (1) the current project-owned finite renderer and input adapters, (2) a state-driven view over a pure update model with Effect commands, and (3) maintained terminal packages. Assess stream ownership, TTY detection, terminal cleanup, resize/narrow-window behavior, color and redirected output, durable/accessibility output, secret handoff, cancellation, dependency/runtime fit, and standalone physical assets. Evidence that would overturn a small renderer preference is a prototype showing materially better required workflows without weakening stream, cleanup, consent, secret, or packaging boundaries.

**Bounded discovery.** Round 1 followed first-party Effect v4 sources and the named Foldkit repository to separate model/update architecture from terminal rendering. Round 2 checked official package sources and runtime guidance for OpenTUI, Ink, Clack, Inquirer, Bun, CLI UX, and no-color behavior. No new direct TypeScript terminal-renderer class emerged; this is not an ecosystem-completeness claim. Rust-backed Tuvren TUI and `effect-cli-tui` were screened out: the former adds another FFI UI stack without stronger target evidence, while the latter is a third-party wrapper rather than an Effect-owned terminal API. No packages were installed and no terminal/build probes were run.

Candidates are console prompt/renderer components except Foldkit, which is a web frontend architecture candidate screened for terminal suitability. The [interaction-model pass](PRODUCT-RESEARCH-ADVISORY-2026-10-06-INTERACTION-MODEL.md) separately evaluates `effect-machine@0.28.0`; if selected, it can feed the same renderer seam as a local reducer: the renderer reads a view projection and returns typed events. Neither machine defaults nor prompt-library defaults own consent.

## Existing Hapsland boundary

Source inspection was against repository commit `16439f1d00583f501004662ddd3a126b38c5b260`; it establishes implementation shape, not live terminal behavior.

- [Client selection](../../packages/administration/src/onboarding/client-selection.ts) checks both stdin and stderr TTYs, reads key events from stdin, and redraws the menu to stderr. It captures and restores the prior raw-mode value on release.
- [Confirmation](../../packages/administration/src/onboarding/confirmation.ts) uses a full-line `[y/N]` prompt; only trimmed `y` approves. [Masked input](../../packages/administration/src/credentials/masked-input.ts) reads `/dev/tty`, disables echo, caps and clears owned buffers, and restores terminal mode with retries. It hides typed characters rather than drawing mask glyphs.
- [Pilot orchestration](../../packages/administration/src/onboarding/pilot.ts) previews setup, then submits the exact install proposal digest on approval. The version-one setup engine remains the authority for whether a write may apply. A prompt package's `Confirm`, `Password`, raw-mode ownership, or full-line answer does not replace that digest-bound approval or the engine's checks.
- [Unattended setup](../../packages/administration/src/onboarding/unattended.ts) uses a separate version-one JSON contract and rejects interactive secret entry and approval digests. Guided setup must not silently fall through to a first-choice/default prompt answer when input is redirected.
- `package.json`/`bun.lock` pin Bun 1.3.14 and Effect packages to 4.0.0. The standalone build uses `Bun.build` and [physical native binding rewriting](../../packages/source-analysis/src/direct-event/languages/native-bindings.ts) for selected tree-sitter `.node` bindings; this is not a general native-asset loader.

These are implementation observations, not additional requirements. In particular, the proposed interaction model and its state fields remain advisory until accepted.

## Candidate cards

### Effect 4 `effect/cli/Prompt` and `Terminal`

**Identity and boundary.** `effect@4.0.0`, source tag commit [`67ba4e46a11ccda0b6761578bfd22c04ae00167d`](https://github.com/Effect-TS/effect/tree/67ba4e46a11ccda0b6761578bfd22c04ae00167d); MIT. `Prompt` provides Select, MultiSelect, Confirm, Password, Hidden, custom prompts, and `Prompt.run`; `Terminal.make` exposes a replaceable service. These are prompt/render primitives, not a setup workflow or state machine. The Prompt module marks its API unstable. Sources: [Prompt.ts](https://github.com/Effect-TS/effect/blob/67ba4e46a11ccda0b6761578bfd22c04ae00167d/packages/effect/src/cli/Prompt.ts), [Terminal.ts](https://github.com/Effect-TS/effect/blob/67ba4e46a11ccda0b6761578bfd22c04ae00167d/packages/effect/src/Terminal.ts).

**Fit and limits.** It is the lowest-cost first prototype because Effect is already pinned. Password masks entry and returns `Redacted<string>`; Hidden suppresses input display and also returns Redacted. Prompt execution still needs a `Terminal` implementation, message-to-model bridge, no-color/accessibility policy, and explicit cancellation mapping. The default `@effect/platform-node-shared` NodeTerminal reads stdin but writes prompts to stdout, derives dimensions from stdout, and releases raw mode by setting it false rather than restoring the exact initial value. That conflicts with Hapsland's current stderr interaction stream and stdout's data channel. Use a project-owned `Terminal.make` adapter, or retain the current renderer; do not install/route the default service without resolving ownership.

**Secret boundary.** Redacted controls ordinary display/JSON inspection; it is not lifecycle isolation. The underlying secret remains retrievable while the wrapper exists, and `wipeUnsafe` is not memory zeroization or removal of other string references. Prompt internals temporarily hold ordinary input text before wrapping it. Keep both plaintext and Redacted wrappers out of serializable UI/model state, transition events, traces, and logs. Hand the shortest-lived input reference directly to the credential command/adapter, then drop references; test cancellation and partial completion. A redacted JSON value is not permission to persist the wrapper.

**Classification.** `DEPEND ON` only as a conditional prototype over the already-pinned Effect package for simple prompts; this is not adoption. `BORROW` its custom-service seam and scoped execution shape. The setup state model remains a separate owner.

### Foldkit

**Identity and boundary.** Foldkit 0.166.0, commit [`7590156835c822a0aa135a5fde14c8e2009c9124`](https://github.com/foldkit/foldkit/tree/7590156835c822a0aa135a5fde14c8e2009c9124), MIT; package declares Effect 4.0.0 and `@effect/platform-browser` peer dependencies. Sources: [README](https://github.com/foldkit/foldkit/blob/7590156835c822a0aa135a5fde14c8e2009c9124/README.md), [package manifest](https://github.com/foldkit/foldkit/blob/7590156835c822a0aa135a5fde14c8e2009c9124/packages/foldkit/package.json).

**Fit and limits.** Foldkit describes an Effect/Schema model, fact-named messages, exhaustive update, explicit commands, and Elm Architecture. Its view lifecycle renders server/browser HTML and updates a DOM through a virtual-DOM implementation; its UI package supplies web controls. Those sources do not implement stdin, raw terminal input, ANSI/cell layout, stderr, resizing, terminal signal cleanup, or masked console input. Web DOM/virtual-DOM renderers must not be assumed to render a console.

**Classification.** `BORROW` the model/update/command separation and exhaustive message handling. `REJECT` Foldkit itself as Hapsland's console renderer or a runtime dependency for this purpose. It cannot supply the needed terminal boundary.

### OpenTUI

**Identity and boundary.** `@opentui/core@0.5.14`, MIT, repository commit [`31a93fbe66992298d6d0f27481fa781f43d0c1e2`](https://github.com/anomalyco/opentui/tree/31a93fbe66992298d6d0f27481fa781f43d0c1e2). It is a Zig terminal renderer with TypeScript and React bindings. Sources: [README](https://github.com/anomalyco/opentui/blob/31a93fbe66992298d6d0f27481fa781f43d0c1e2/README.md), [core manifest](https://github.com/anomalyco/opentui/blob/31a93fbe66992298d6d0f27481fa781f43d0c1e2/packages/core/package.json), [runtime support docs](https://opentui.com/docs/getting-started/runtime-support/) (accessed 2026-10-06).

**Fit and limits.** Its docs specify Bun 1.3.0 or later, native optional platform packages, layout, input, resize, and a test renderer with explicit dimensions and mocked input. Its lifecycle docs restore renderer-owned terminal modes on shutdown but cannot await application-owned async cleanup. The core manifest includes platform-native optional packages and FFI-related code. Standalone docs require embedding its native library/worker/grammars and, on Linux, setting `OPENTUI_LIBC`; Hapsland's current standalone build does not set that variable or embed OpenTUI assets. Official runtime docs list macOS arm64 and Linux libc variants but report a test matrix that does not establish Linux arm64 parity. Bun's FFI documentation labels `bun:ffi` experimental and warns of known issues, which conflicts in confidence with OpenTUI's supported Bun profile; neither source settles Hapsland's compiled-artifact behavior.

**Classification.** `DEPEND ON` only conditionally for a richer full-screen setup application if a prototype demonstrates a real workflow advantage over finite prompts. It is not the simple-flow recommendation. Its 1.3.0 Bun minimum makes Bun 1.3.14 a documented version match, not proof that Hapsland's two standalone targets work.

### Ink / React

**Identity and boundary.** Ink 8.0.0, MIT, commit [`26d2c3f83008142061c22267482489588cc3823c`](https://github.com/vadimdemedes/ink/tree/26d2c3f83008142061c22267482489588cc3823c); React terminal renderer. Sources: [README](https://github.com/vadimdemedes/ink/blob/26d2c3f83008142061c22267482489588cc3823c/readme.md), [manifest](https://github.com/vadimdemedes/ink/blob/26d2c3f83008142061c22267482489588cc3823c/package.json).

**Fit and limits.** It documents stream injection, resize support, an interactive/non-interactive mode, a screen-reader mode, raw-mode cleanup helpers, and alternate-screen behavior. Package metadata requires Node 22 and React 19.3; no Bun 1.3.14 support claim was found in the inspected sources. React and Yoga/layout dependencies increase the stack for a finite onboarding flow. Screen-reader mode is a useful candidate to inspect, not evidence that Hapsland's full transcript is accessible.

**Classification.** `BORROW` explicit stream injection, static-output fallback, and screen-reader mode as design questions. `REJECT` a new Ink dependency for the current finite flow. Reconsider as the rich-app fallback only if OpenTUI's native/build gates fail and a React renderer's behavior is justified; then prove Bun/standalone compatibility first.

### Clack and Inquirer

**Clack identity.** `@clack/prompts@1.8.1`, MIT, source commit [`da44e23128c2f6a64f908224683e22d1190a576b`](https://github.com/bombshell-dev/clack/tree/da44e23128c2f6a64f908224683e22d1190a576b). Its prompt package offers text/password, confirm, select, autocomplete, multiselect, intro/outro; password masks typing. Sources: [README](https://github.com/bombshell-dev/clack/blob/da44e23128c2f6a64f908224683e22d1190a576b/packages/prompts/README.md), [manifest](https://github.com/bombshell-dev/clack/blob/da44e23128c2f6a64f908224683e22d1190a576b/packages/prompts/package.json). It returns ordinary values and uses a separate prompt/cancel API. The reviewed sources do not settle stdout/stderr ownership or Bun standalone behavior.

**Inquirer identity.** `@inquirer/prompts@8.7.3`, MIT, source commit [`a9436bd94d55a439df308f50e77a7cd0b2078e98`](https://github.com/SBoudrias/Inquirer.js/tree/a9436bd94d55a439df308f50e77a7cd0b2078e98). It documents select, checkbox, confirm, password, stream injection, AbortSignal, and a Bun install recipe; the root prompt package assembles multiple prompt packages. Sources: [README](https://github.com/SBoudrias/Inquirer.js/blob/a9436bd94d55a439df308f50e77a7cd0b2078e98/README.md), [manifest](https://github.com/SBoudrias/Inquirer.js/blob/a9436bd94d55a439df308f50e77a7cd0b2078e98/packages/prompts/package.json). A Bun recipe documents usage intent, not bundled-Bun runtime conformance.

**Fit and classification.** Both are serious finite-prompt options, but each introduces a second interaction/effect/cancellation model beside Effect, and neither owns Hapsland's setup approval. `BORROW` concise prompt, masking, stream injection, and explicit cancellation conventions. `REJECT` as the first direct dependency: the existing Effect prompt path has a closer runtime boundary and avoids parallel result semantics. Reopen if the Effect adapter fails a named acceptance gate.

### Small Hapsland-owned renderer

**Identity and boundary.** Existing finite selector, full-line confirmation, and masked `/dev/tty` input are project code. This avoids an added renderer dependency and allows the interaction model to render either a transient selector or durable text through project-owned streams.

**Fit and limits.** It already has TTY gating, stderr redraw, restoration of prior raw mode, full-line confirmation and separate hidden input. It still needs behavior-driven evaluation of terminal widths/resizing, no-color and dumb terminals, accessibility, and robust signal/error/cancellation cleanup. A custom renderer is not inherently safer; its lifecycle and stream contract must remain tested.

**Classification.** `BORROW` from the current implementation's stream and ownership seams; retain as the no-new-dependency baseline and fallback. Do not infer current compliance with every UX capability from these source-level observations.

## Capability comparison

`SI` means source-inspected; `D` documented by the cited project; `I` inference from those sources; `U` unknown in the bounded pass. All cells are advisory evidence, not runtime results.

| Capability / claim | Effect Prompt | Foldkit | OpenTUI | Ink | Clack | Inquirer | Hapsland small renderer |
|---|---|---|---|---|---|---|---|
| Finite prompts and typed input | D/SI E1 | U/F1 (not console) | D/O1 | D/I1 | D/C1 | D/I2 | SI/H1 |
| Explicit model/update/commands | D/SI E1 (prompt scope) | D/F1 | U | U | U | U | I/H1 + separate model |
| stdin input with stderr UI / clean stdout data | I/E2 custom adapter required | U/F1 | U/O1 | D/I1 injectable streams | U/C1 | D/I2 injectable streams | SI/H1 |
| Raw terminal/signal lifecycle | SI/E2; exact state mismatch | U/F1 | D/O1; app cleanup remains | D/I1 helpers | U/C1 | D/I2 abort support | SI/H1 |
| Resize/narrow layout | SI/E1 reads width; behavior untested | U/F1 | D/O1; test renderer resize | D/I1 resize | U/C1 | U/I2 | U/H1 |
| No color / `TERM=dumb` policy | U/E1 | U/F1 | U/O1 | U/I1 | U/C1 | U/I2 | U/H1 |
| Durable/accessibility output | U/E1 | Web UI only/F1 | U/O1 | D/I1 screen-reader mode | U/C1 | U/I2 | U/H1 |
| Secret API result/ownership | D/SI E3 Redacted; lifetime still caller-owned | U/F1 | U/O1 | U/I1 | D/C1 ordinary value | D/I2 ordinary value | SI/H1 hidden non-echo input |
| Bun 1.3.14 standalone target assets | D/SI E1 existing Effect, custom adapter untested | U/F1; browser target | D/O1 runtime floor; assets/build parity unresolved | U/I1 | U/C1 | D/I2 recipe only; runtime U | SI/H1 current build scope |

No candidate received `RUNTIME-TESTED`. Documentation of a feature, test-renderer, or supported runtime does not establish Hapsland's exact PTY or compiled-binary behavior.

## Use-scoped classification

| Component and use | Classification | Reason / boundary |
|---|---|---|
| Effect `Prompt` for simple prompts on existing Effect 4.0.0 | `DEPEND ON` conditionally | Best first prompt prototype; unstable API, custom stderr terminal and lifecycle gates remain open. No extra package install implied. |
| Effect `Terminal.make` seam and scoped cleanup | `BORROW` | Adapt streams and raw-mode ownership under Hapsland's existing Effect runtime. |
| Foldkit model/update/command design | `BORROW` | Reuse architecture ideas only. |
| Foldkit browser/virtual-DOM renderer for console | `REJECT` | No console I/O or terminal lifecycle surface. |
| OpenTUI full-screen application | `DEPEND ON` conditionally | Only if persistent progress/preview materially improves a defined workflow and native/standalone gates pass. |
| Ink React renderer for current finite prompts | `REJECT` | Adds a large second stack without demonstrated workflow benefit or Bun target evidence. |
| Ink screen-reader/static-output/stream patterns | `BORROW` | Useful acceptance criteria and fallback design ideas. |
| Clack / Inquirer prompt libraries | `REJECT` as first dependency; `BORROW` interaction conventions | Mature finite prompt scope, but separate execution/result/cancellation semantics; reconsider after Effect prototype gate. |
| Current Hapsland small renderer | `BORROW` and retain as baseline | Existing stream/approval/secret boundaries and no added renderer dependency; validate remaining gaps. |
| Headless JSON setup | `OPTIONAL INTEGRATION` at frontend boundary | A separate invocation path over the setup engine; it is not a terminal renderer or prompt fallback. |

## Conditional dependency gates

Status is `UNRESOLVED` until the named experiment is run. License/version statements below are source-level evidence only; they do not pass runtime or release-support gates.

| Gate | Effect Prompt, simple prompt use | OpenTUI, rich app use |
|---|---|---|
| License | **PASS, metadata only:** Effect package is MIT at 4.0.0. Confirm repository policy during adoption review. | **PASS, metadata only:** core package declares MIT; review all bundled native and optional package notices. |
| API/versioning | **UNRESOLVED:** module is unstable. Prototype against exact 4.0.0, estimate wrapper/upgrade cost, and compare against retaining local renderer. | **UNRESOLVED:** pin 0.5.14 and all target artifacts; inspect ABI/release notes and upgrade process. |
| Real-host workflow | **UNRESOLVED:** PTY-test select, confirm, secret handoff, cancellation, and model event mapping on macOS/Linux arm64. | **UNRESOLVED:** demonstrate richer workflow value and real PTY conformance on both targets. |
| Trust and secret boundary | **UNRESOLVED:** prove no secret enters serializable model/logs; test cancellation and shortest-lived handoff. | **UNRESOLVED:** same secret boundary plus audit renderer/worker/native asset supply chain. |
| Failure/degradation | **UNRESOLVED:** test EOF, interruption, signals, redirected channels, `NO_COLOR`, `TERM=dumb`, cleanup, and no prompt fallback. | **UNRESOLVED:** test renderer destruction, async app cleanup, signals, unsupported terminal capabilities, and non-TTY behavior. |
| Maintenance/compatibility | **UNRESOLVED:** assess unstable module changes during Effect cohort upgrades; Effect remains an existing mandatory dependency. | **UNRESOLVED:** confirm project release cadence and supported Bun/native matrix at adoption time; current docs and Bun FFI stability signal differ. |
| Integration/packaging cost | **UNRESOLVED:** implement custom stderr `Terminal.make`; confirm raw-mode restore and no native artifact changes in both bundles. | **UNRESOLVED:** compile embedded assets for macOS arm64 and Linux arm64/glibc; set Linux `OPENTUI_LIBC`; prove loader and standalone startup with Bun 1.3.14. |
| Exit cost/fallback | **PASS by design, inferred:** keep a narrow adapter and typed input events so local renderer remains usable if prompt API changes. | **UNRESOLVED:** keep interaction model renderer-neutral and prove a small renderer can show final state/continue unattended if OpenTUI is removed. |

Do not treat either conditional `DEPEND ON` as adoption. Failed mandatory gates change the candidate to `BORROW`/`REJECT` (Effect Prompt) or `REJECT` (OpenTUI for this scope).

## UX patterns, synthesis, and disconfirmation

The CLI Guidelines recommend channel-aware TTY checks, stdout for data and stderr for human interaction, no prompts when input is not interactive, explicit behavior for EOF/cancel, and disabling color for `NO_COLOR`, `TERM=dumb`, or redirected output. The no-color convention defines non-empty `NO_COLOR` as disabling color. These are guidance to evaluate against Hapsland, not guarantees supplied by the libraries. Sources: [Command Line Interface Guidelines](https://clig.dev/) and [NO_COLOR](https://no-color.org/) (accessed 2026-10-06).

Across the candidates and current code, the reusable pattern is a renderer-neutral model/event boundary and an interpreter-owned terminal scope. Whether the controller is `effect-machine` or a local reducer, views should show one actionable choice at a time when input is narrow; after a selection or approval, emit a readable, stable transcript including completed, failed, skipped, and next steps. Transient redraws need a plain-text path for non-TTY and accessibility settings. A password prompt can hide characters, but it must not put even a Redacted wrapper into a serializable state/event log. The terminal adapter owns only terminal resources; setup commands and digest checks remain with their existing owners.

**Best simple workflow option.** Prototype Effect 4 `Prompt` for finite select/confirm/hidden input through a project-owned Terminal adapter that reads stdin, writes human interaction to stderr, preserves original raw mode, and maps outputs to renderer-neutral events. Keep the current project renderer if the adapter and unstable-API upgrade cost exceed the prompt reuse. Neither variant approves writes on its own: only the existing setup engine's digest-bound operation can authorize its owned change. Full-line confirmation remains useful for explicit consent and must retain its y/N behavior where that contract applies.

**Richer app option.** OpenTUI merits a conditional prototype only if a persistent full-screen progress/preview view makes backtracking or multi-client partial results materially clearer. Its Bun documentation is a promising stated fit; FFI status, physical assets, exact Linux arm64 profile, and current standalone build integration are unresolved. Ink is the named fallback comparison if OpenTUI fails those gates, not a default recommendation.

**Foldkit answer.** Foldkit cannot render Hapsland's console. Borrow its model/update/command idea; use Effect commands to invoke existing setup owners; keep terminal rendering and setup authority as separate adapters. Do not route browser DOM or virtual-DOM output to a terminal by assumption.

**Strongest case against this recommendation.** A small prompt adapter may duplicate lifecycle work, while an established renderer can supply resize, screen-reader, and redraw behavior that the finite current UI lacks. The recommendation reverses toward a richer terminal app only after an explicit user-workflow gain, exact target PTY proof, no-color/accessibility checks, and standalone asset gates pass. The present evidence does not establish that these checks pass or that Effect Prompt currently meets them.

## Prototype handoff: named acceptance checks

All checks below are **UNEXECUTED** in this research pass. Parent implementation/design work should select only relevant checks after defining the state model. Do not install candidates or use real credentials as part of this report.

1. **Effect Prompt compatibility spike:** using the repository's installed Effect 4.0.0 and Bun 1.3.14, build a narrow selection/confirmation/password adapter. Inject a fake Terminal for deterministic reducer/view tests. Demonstrate stdin input with stderr output, clean stdout, original raw-mode restoration, cursor restoration, `Prompt.run` cancellation/error mapping, and no extra native asset in `bun-darwin-arm64` and `bun-linux-arm64` standalone outputs.
2. **Approval boundary:** change the setup preview after a prior confirmation and verify the old digest is rejected. Verify a prompt's `true` result alone causes no write, and the approval path passes the exact currently displayed proposal digest to the existing engine. Confirm guided TTY and full-line input do not alter unattended JSON semantics.
3. **Ephemeral secret handoff:** enter a synthetic marker only. Confirm the prompt returns Redacted, and confirm marker is absent from stdout, stderr, serialized model/state, transition events, traces, and logs. Exercise the credential command while the value is available, then cancellation, no-save, failure, and partial-result paths. Inspect `Redacted.value` lifetime; do not claim `wipeUnsafe` zeros memory. Verify renderer and model retain no wrapper/reference after completion.
4. **PTY stream matrix:** on macOS arm64 and Linux arm64, test stdin+stderr TTY with stdout redirected; stdin pipe with output TTY; stderr pipe; and stdout TTY. Verify human prompts use stderr, structured output remains parseable on stdout, and non-interactive guided setup exits with an explicit error/next step instead of selecting a default.
5. **Terminal conditions and cleanup:** test widths 80x24, 40x12, and 20x8; multibyte and wide labels; resize during selection; `NO_COLOR=1`; `TERM=dumb`; redirected/no-ANSI output; static readable completion; screen-reader output; EOF, Esc/back, Enter, Ctrl+C, SIGINT/SIGTERM/SIGHUP, Effect interruption, renderer error, and normal completion. Assert exact initial raw-mode/echo/cursor/screen modes are restored where the process can run cleanup. Forced kill/power loss cannot be guaranteed by an application.
6. **OpenTUI gate (only if richer UI is justified):** against `@opentui/core@0.5.14`, use its in-memory renderer for deterministic width/resize/input cases, then exercise a real PTY. Build with Bun 1.3.14 for macOS arm64 and Linux arm64/glibc using matching optional native packages and explicit `OPENTUI_LIBC=glibc`; prove required native library, worker, grammar, and parser assets are embedded, standalone launch succeeds, and terminal modes are restored on cancel/failure. Run a separate Linux architecture/libc check if product targets expand beyond glibc.

## Evidence ledger

Source class and verification state are separate. No `RUN` evidence was produced; source inspection of Hapsland code does not prove PTY or binary behavior.

| ID | Exact proposition / candidate scope | Primary source and version | Class / state | Limit or next check |
|---|---|---|---|---|
| H1 | Current selector checks stdin+stderr, redraws stderr, and restores captured raw state; confirmation is full-line y/N; secret reader hides input and restores terminal state. | Local source at `16439f1d00583f501004662ddd3a126b38c5b260`: `src/onboarding/{client-selection,confirmation}.ts`, `packages/administration/src/credentials/masked-input.ts` | SRC / SOURCE-INSPECTED | Run PTY lifecycle and channel matrix. |
| H2 | Setup installation approval passes proposal digest to the setup engine; renderer confirmation is not the write authority. | Same local revision: `packages/administration/src/onboarding/pilot.ts`, `packages/administration/src/onboarding/setup.ts` | SRC / SOURCE-INSPECTED | Prototype stale-preview rejection; no live write run here. |
| H3 | Unattended version-one requests reject interactive key entry and approval digest fields. | Same local revision: `packages/administration/src/onboarding/unattended.ts` | SRC / SOURCE-INSPECTED | Keep tests/behavior under setup contract owner. |
| B1 | Current compiled output targets Bun and current physical loader rewrites selected tree-sitter `.node` assets only. | [Bun 1.3.14 executable docs](https://github.com/oven-sh/bun/blob/3bf4b335ea867e46a7d344398de53d7cd3a8d1a7/docs/bundler/executables.mdx); local `scripts/compile-standalone.mjs`, `packages/source-analysis/src/direct-event/languages/native-bindings.ts`; package Bun 1.3.14 | DOC / DOCUMENTED; SRC / SOURCE-INSPECTED | No candidate standalone build executed. |
| E1 | Effect 4.0.0 has unstable Prompt APIs (Select/MultiSelect/Confirm/Password/Hidden/custom/run) and Terminal service seam. | [Prompt.ts](https://github.com/Effect-TS/effect/blob/67ba4e46a11ccda0b6761578bfd22c04ae00167d/packages/effect/src/cli/Prompt.ts), [Terminal.ts](https://github.com/Effect-TS/effect/blob/67ba4e46a11ccda0b6761578bfd22c04ae00167d/packages/effect/src/Terminal.ts) | SRC / SOURCE-INSPECTED | Exact package is installed locally; prompt behavior not executed. |
| E2 | Default NodeTerminal uses stdout and releases raw mode by setting false; Hapsland currently uses stderr and captures raw state. | [NodeTerminal.ts](https://github.com/Effect-TS/effect/blob/67ba4e46a11ccda0b6761578bfd22c04ae00167d/packages/platform/node-shared/src/NodeTerminal.ts), local H1 source | SRC / SOURCE-INSPECTED | Verify custom adapter under PTY. |
| E3 | Effect Password returns Redacted; Redacted hides ordinary inspection/serialization but value is retrievable and wiping wrapper does not zeroize memory/other references. | [Prompt.ts](https://github.com/Effect-TS/effect/blob/67ba4e46a11ccda0b6761578bfd22c04ae00167d/packages/effect/src/cli/Prompt.ts), [Redacted.ts](https://github.com/Effect-TS/effect/blob/67ba4e46a11ccda0b6761578bfd22c04ae00167d/packages/effect/src/Redacted.ts) | SRC / SOURCE-INSPECTED | Prototype ephemeral handoff; wrapper is not secret lifecycle isolation. |
| F1 | Foldkit 0.166.0 describes Effect/Schema model, messages, update, commands, HTML/DOM/virtual-DOM; package peers on Effect 4/browser platform. | [Foldkit README](https://github.com/foldkit/foldkit/blob/7590156835c822a0aa135a5fde14c8e2009c9124/README.md), [manifest](https://github.com/foldkit/foldkit/blob/7590156835c822a0aa135a5fde14c8e2009c9124/packages/foldkit/package.json) | DOC / DOCUMENTED | No terminal I/O implementation was found in the reviewed scope; no console behavior is inferred from DOM rendering. |
| O1 | OpenTUI 0.5.14 advertises Bun >=1.3, platform native artifacts, test renderer and standalone embedding; docs give `OPENTUI_LIBC` Linux guidance. | [immutable source](https://github.com/anomalyco/opentui/tree/31a93fbe66992298d6d0f27481fa781f43d0c1e2); [runtime docs](https://opentui.com/docs/getting-started/runtime-support/); [standalone docs](https://opentui.com/docs/reference/standalone-executables/) (2026-10-06) | DOC / DOCUMENTED; SRC / SOURCE-INSPECTED | Does not prove Hapsland target artifact support; run gate 5. |
| O2 | OpenTUI shutdown resets renderer-owned terminal modes but cannot await application-owned async cleanup. | [Lifecycle docs](https://opentui.com/docs/core-concepts/lifecycle/) (2026-10-06) | DOC / DOCUMENTED | Verify app handlers and actual PTY outcomes. |
| O3 | Bun 1.3.14 FFI docs call FFI experimental/known-issue-prone, in tension with OpenTUI's stated Bun profile. | [Bun FFI source at 1.3.14 commit](https://github.com/oven-sh/bun/blob/3bf4b335ea867e46a7d344398de53d7cd3a8d1a7/docs/runtime/ffi.mdx), O1 | DOC / DOCUMENTED; comparison is INFERRED | Neither source establishes this app's failure; exact standalone prototype resolves it. |
| I1 | Ink 8.0.0 documents stream injection, resize, interactive/static behavior, and screen-reader mode; metadata requires Node 22/React 19.3. | [README](https://github.com/vadimdemedes/ink/blob/26d2c3f83008142061c22267482489588cc3823c/readme.md), [manifest](https://github.com/vadimdemedes/ink/blob/26d2c3f83008142061c22267482489588cc3823c/package.json) | DOC / DOCUMENTED; SRC / SOURCE-INSPECTED | No Bun compatibility or screen-reader completeness claim. |
| C1 | Clack 1.8.1 offers masked password and finite prompt types; package is MIT. | [README](https://github.com/bombshell-dev/clack/blob/da44e23128c2f6a64f908224683e22d1190a576b/packages/prompts/README.md), [manifest](https://github.com/bombshell-dev/clack/blob/da44e23128c2f6a64f908224683e22d1190a576b/packages/prompts/package.json) | DOC / DOCUMENTED; SRC / SOURCE-INSPECTED | Output stream and Bun standalone behavior are UNKNOWN. |
| I2 | Inquirer 8.7.3 documents finite prompts, injected streams, AbortSignal, and a Bun usage recipe. | [README](https://github.com/SBoudrias/Inquirer.js/blob/a9436bd94d55a439df308f50e77a7cd0b2078e98/README.md), [manifest](https://github.com/SBoudrias/Inquirer.js/blob/a9436bd94d55a439df308f50e77a7cd0b2078e98/packages/prompts/package.json) | DOC / DOCUMENTED; SRC / SOURCE-INSPECTED | Install recipe is not standalone runtime proof; exact Hapsland channel semantics need test. |
| G1 | CLI guidance recommends TTY/channel-aware prompting, stdout data vs stderr UI, explicit cancellation, and no-color fallback; NO_COLOR uses nonempty variable. | [CLI Guidelines](https://clig.dev/), [NO_COLOR](https://no-color.org/) (2026-10-06) | DOC / DOCUMENTED | Guidance is not a library guarantee or accepted Hapsland requirement. |

## Scope and validation limits

This is a targeted primary-source comparison; package source and metadata were inspected, and Hapsland implementation sources were read. No install, compatibility build, PTY session, terminal emulator, screen-reader, credential, native-store, or production experiment was performed. Linux arm64 OpenTUI parity, exact native-asset embedding, library behavior under `NO_COLOR`/`TERM=dumb`, and real resize/cleanup behavior remain unresolved. Research does not adopt a renderer or change the product contract.
