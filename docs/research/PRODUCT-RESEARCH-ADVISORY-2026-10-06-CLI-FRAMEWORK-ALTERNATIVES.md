# Hapsland CLI framework alternatives advisory

**Purpose:** Compare the newly identified TypeScript terminal frameworks with Hapsland's proposed setup renderer and verify the reported Abide/React example.
**Audience:** Contributors, including coding agents researching runtime and CLI design; Product and specification owners.
**Status:** Temporary product-specification advisory; it adopts no product behavior or dependency.
**Authority:** Primary-source research and source inspection; existing setup, stream, credential, and consent contracts remain authoritative. This report is not a runtime validation.
**Expected use:** Use this targeted comparison during setup-interaction design acceptance to decide whether to retain the small Effect prompt adapter or prototype a full TUI framework.
**Lifecycle:** Temporary until the setup-interaction design acceptance milestone. Consolidate selected architecture into an ADR and adopted behavior into `docs/installation-workflows.md` and `docs/configuration.md`, update inbound links, and delete this report. Git history retains the advisory evidence.

## Brief and scope

**Date and question.** 2026-10-06. Is a local reducer with Effect's `Prompt` adapter the only credible way to implement Hapsland's guided setup, or do current React, Effect-first, and Elm/Bubble Tea-style TypeScript terminal frameworks offer a realistic alternative?

This targeted follow-up to the [console-rendering advisory](PRODUCT-RESEARCH-ADVISORY-2026-10-06-CONSOLE-RENDERING.md) and [interaction-model advisory](PRODUCT-RESEARCH-ADVISORY-2026-10-06-INTERACTION-MODEL.md) adds Abide's actual renderer use and newly found Effect-oriented and TypeScript TEA packages. It is not an ecosystem census.

Constraints: TypeScript 7.0.2, Bun 1.3.14, exact Effect 4.0.0, macOS/Linux arm64 standalone builds, and Claude Code, Codex CLI, and Pi setup. Guided setup needs choices, digest-bound consent, masked credentials, cancellation and partial outcomes. It may read the controlling TTY while stdin carries JSON, and must keep UI output out of structured stdout. Headless version-one setup remains separate. A renderer cannot own setup transitions, credentials or consent. Simple prompts and a persistent TUI are separate use cases.

The baseline is a Hapsland-owned typed model with Effect commands and the current renderer or pinned Effect Prompt/Terminal services. Sources were manifests, tagged source and official package pages; npm metadata queries were read-only. No installs, target builds or terminal scenarios were run. This targeted pass does not establish ecosystem saturation.

## Abide identity and actual use

The Abide referenced in Hapsland's sibling research is [`coldteadotai/abide`](https://github.com/coldteadotai/abide); another “Abide” may differ. At commit `0fc600f92672ead28e360afa373636e88f4a66d7`, its [`@coldtea/abide` CLI manifest](https://github.com/coldteadotai/abide/blob/0fc600f92672ead28e360afa373636e88f4a66d7/packages/cli/package.json) is version 0.0.7, MIT, declares Node `>=22`, and pins Ink 6.8.0 + React 19.3.0 [A1]. [`InitView.tsx`](https://github.com/coldteadotai/abide/blob/0fc600f92672ead28e360afa373636e88f4a66d7/packages/cli/src/ui/views/InitView.tsx) uses Ink JSX, and [`init.ts`](https://github.com/coldteadotai/abide/blob/0fc600f92672ead28e360afa373636e88f4a66d7/packages/cli/src/commands/init.ts) calls that view; `chooseHosts` takes positional host names or auto-detects, rather than opening a selector [A2]. This verifies React-backed CLI presentation for this identity, not a React setup engine or guided selector. If a different Abide was intended, identity remains unknown.

| Claim | Exact proposition and evidence | Source class / verification | Limit |
|---|---|---|---|
| A1–A2 | Abide 0.0.7 pins Ink 6.8.0/React 19.3.0; `InitView` uses Ink JSX and `init` auto-detects or takes positional hosts. | META + SRC / SOURCE-INSPECTED | Node `>=22` is Abide's declared engine, not proof of Ink's minimum; no Bun runtime claim. |
| B1 | Bubbletea 1.2.0 describes a zero-runtime-dependency TS TEA TUI, Node/Bun use, input/output injection, TTY, signals, abort and resize. | DOC + SRC + META / DOCUMENTED, SOURCE-INSPECTED | Not exercised under Bun 1.3.14 or Hapsland standalone targets. |
| B2 | `@effect-tui/*` 2.0.1 peers on Effect `^3.0.0`; `effect-cli-tui` 2.2.0 peers on `^3.19.0`. | META / SOURCE-INSPECTED | Both exclude Effect 4.0.0; no bridge assessed. |
| B3 | Puppuccino's source says TEA/MIT/Node `>=18`; its README advertises npm install, but the registry returned 404. | DOC + SRC + META / DOCUMENTED, SOURCE-INSPECTED | No published artifact or Bun target evidence. |

## Comparison and scoped recommendation

| Candidate and intended use | Classification | Evidence and Hapsland fit |
|---|---|---|
| Effect 4 `effect/cli/Prompt` for individual questions | `OPTIONAL INTEGRATION` | Already pinned; unstable Select/MultiSelect/Confirm/Hidden/Custom primitives support leaves, not the journey's transitions or digest guards. Prompt quit must return to the model. Use an owned controlling-TTY/stderr adapter; keep secrets out of model/events. [E1] |
| Foldkit model/update/commands; Foldkit renderer | `BORROW`; `REJECT` | Borrow its Effect/Schema Elm shape. Its HTML/DOM virtual-DOM lifecycle supplies no console input, terminal cells, or raw-mode lifecycle. [F1] |
| Abide's Ink/React output; Ink as Hapsland dependency | `BORROW`; `REJECT` for current finite flow | Abide proves React-backed CLI views exist, not that its Node profile works in Bun standalone or that React handles guided setup. [A1–A2, I1] |
| `@oakoliver/bubbletea@1.2.0` as persistent TUI | `OPTIONAL INTEGRATION` | Strongest full-TUI alternative. MIT, no runtime dependencies; tagged source provides TEA and `OpenTTY()` for `/dev/tty` plus input/output injection [B1]. Adapter must map commands to Effect and own cleanup. Keep masked capture outside public model state. |
| `@puppuccino/tui` production dependency | `REJECT` | TEA source exists but the advertised npm package returns 404; Bun/standalone support is unknown. Borrow vocabulary only. [B3] |
| `@effect-tui/core/react`, `effect-cli-tui` with Effect 4 | `REJECT` | Their published peer ranges require Effect 3; `effect-cli-tui` also adds Ink/React prompt dependencies. [B2] |
| `@opentui/core` with optional `@opentui/react` binding for a full-screen application | `OPTIONAL INTEGRATION` if required | React is an optional UI binding; the core renderer still brings native Zig assets. Existing report documents Bun intent, but the exact arm64 standalone path is open. Consider only if a rich view is justified and Bubbletea is insufficient. [O1] |

**Answer.** The reducer plus Effect Prompt adapter is not the only credible approach. `@oakoliver/bubbletea` is the strongest realistic alternative when the product needs a persistent TUI: it is TypeScript, has no runtime dependencies, documents Bun, and source-inspected `OpenTTY()` can read/write the controlling terminal separately from redirected process streams. Those are compatibility signals, not proof that it works in Hapsland's Bun 1.3.14 standalone targets. For simple choices, Hapsland's local reducer plus Effect Prompt/custom terminal adapter remains the smallest fit; Bubbletea would add an event loop, renderer, signal/TTY owner, and Effect-command adapter without a clear benefit.

**Strongest countercase.** A local reducer and custom terminal glue can recreate a small framework with less mature key decoding, resize and cleanup behavior. If a bounded prototype shows Bubbletea handles Hapsland's full controlling-TTY, stderr, cancellation, and resize cases with less code and no worse consent/secret isolation, that evidence would overturn the current small-adapter preference. Do not treat sample code or general Bun claims as that evidence.

## Decision gates and handoff

For Bubbletea, pin 1.2.0 and compare against the existing adapter on Bun 1.3.14/macOS arm64 and Linux arm64: piped stdin with controlling-TTY interaction, stderr UI with JSON stdout, no-TTY refusal, EOF/cancel/Ctrl+C/signals, resize, error cleanup, and both standalone artifacts. Map `Cmd` to typed Effect success/failure/cancel messages. Verify menu state cannot submit an owner digest, and preserve per-owner consent and masked credential capture. Compare implementation size, transition clarity and transcripts; documentation alone passes no package gate.

| Implication | Support / counterevidence | Affected workflow | Disposition |
|---|---|---|---|
| CLI-01 Keep setup transitions/digests out of renderer ownership. | E1, F1, B1; Bubbletea adds another async lifecycle. | Guided setup | Take to specification. |
| CLI-02 Preserve controlling-TTY input and clean JSON stdout. | B1 has `OpenTTY` and stream injection; Hapsland artifact behavior unknown. | Interactive JSON/piped setup | Prototype both candidate adapters. |
| CLI-03 Keep secret capture outside model/events and distinguish cancellation. | Effect Hidden returns caller-owned `Redacted`; Bubbletea has no inspected secret API. | Login/key replacement | Specify and test with fake owners/sentinel values. |
| CLI-04 Match renderer to journey size. | Prompt is a leaf; Bubbletea/OpenTUI are full loops. | Choices vs progress/partial outcomes | Prototype only if richer view clarity is needed. |

## Source registry

- **E1 — Effect 4.0.0:** [immutable Prompt source](https://github.com/Effect-TS/effect/blob/67ba4e46a11ccda0b6761578bfd22c04ae00167d/packages/effect/src/cli/Prompt.ts), [Terminal source](https://github.com/Effect-TS/effect/blob/67ba4e46a11ccda0b6761578bfd22c04ae00167d/packages/effect/src/Terminal.ts). The modules are marked unstable.
- **F1 — Foldkit 0.166.0:** [README](https://github.com/foldkit/foldkit/blob/7590156835c822a0aa135a5fde14c8e2009c9124/README.md), [package manifest](https://github.com/foldkit/foldkit/blob/7590156835c822a0aa135a5fde14c8e2009c9124/packages/foldkit/package.json).
- **I1 — Ink 6.8.0 / React:** Abide's [manifest](https://github.com/coldteadotai/abide/blob/0fc600f92672ead28e360afa373636e88f4a66d7/packages/cli/package.json), [`InitView`](https://github.com/coldteadotai/abide/blob/0fc600f92672ead28e360afa373636e88f4a66d7/packages/cli/src/ui/views/InitView.tsx), and [`init` command](https://github.com/coldteadotai/abide/blob/0fc600f92672ead28e360afa373636e88f4a66d7/packages/cli/src/commands/init.ts). Ink's [upstream README](https://github.com/vadimdemedes/ink/tree/master) describes its terminal renderer and stream APIs.
- **B1 — Bubbletea TypeScript 1.2.0:** [tagged README](https://github.com/oakoliver/bubbletea/blob/v1.2.0/README.md), [tagged manifest](https://github.com/oakoliver/bubbletea/blob/v1.2.0/package.json), [`OpenTTY` and stream options in source](https://github.com/oakoliver/bubbletea/blob/v1.2.0/src/program.ts), [MIT license](https://github.com/oakoliver/bubbletea/blob/v1.2.0/LICENSE). npm metadata records 1.2.0 published 2026-10-04; repository main advanced separately during this pass, so evidence is pinned to the release tag.
- **B2 — Effect-first package metadata:** [`@effect-tui/core` 2.0.1](https://www.npmjs.com/package/@effect-tui/core/v/2.0.1), [`@effect-tui/react` 2.0.1](https://www.npmjs.com/package/@effect-tui/react/v/2.0.1), [`effect-cli-tui` 2.2.0](https://www.npmjs.com/package/effect-cli-tui/v/2.2.0). Exact peer/dependency ranges were read from npm's version metadata; no packages were installed.
- **B3 — Puppuccino:** [repository README](https://github.com/averagejoeslab/tui/blob/main/README.md), [manifest](https://github.com/averagejoeslab/tui/blob/main/package.json), [advertised npm package](https://www.npmjs.com/package/@puppuccino/tui) (registry lookup returned 404 on 2026-10-06).
- **O1 — OpenTUI:** [console-rendering advisory candidate card and compatibility gates](PRODUCT-RESEARCH-ADVISORY-2026-10-06-CONSOLE-RENDERING.md#opentui), based on its [upstream README](https://github.com/anomalyco/opentui/tree/31a93fbe66992298d6d0f27481fa781f43d0c1e2) and [runtime-support documentation](https://opentui.com/docs/getting-started/runtime-support/).

No runtime claim in this report is `RUNTIME-TESTED`. Secondary package-health rankings and popularity signals were excluded because they do not establish exact behavior, target compatibility, or API ownership.
