# Explicit setup interaction and credential destinations

**Purpose:** Preserve the proposed setup conversation and frame research into an explicit interaction model and terminal renderer.
**Status:** Design proposal; no implementation or dependency adoption is authorized by this document.
**Authority:** Design proposal recording the conversation of 2026-10-06. Existing setup, configuration, ownership and consent contracts remain authoritative; this is not an accepted product contract.
**Expected use:** Evaluate interaction-model and terminal-rendering candidates, then make an explicit design decision before implementing setup changes.
**Lifecycle:** Temporary until the setup-interaction design acceptance milestone. Consolidate accepted user behavior into `docs/installation-workflows.md` and `docs/configuration.md`, record the selected architecture in an ADR, update inbound links, and delete this proposal. Rejected options remain in Git history.

## Problem and current implementation

Current setup is an imperative sequence of Effect operations and branches, not an explicit workflow graph. `src/onboarding/pilot.ts` orchestrates guided setup; `src/onboarding/setup.ts` implements the structured engine; `src/cli.ts` assembles them. `src/onboarding/client-selection.ts` owns a hand-written checkbox menu using raw stdin events and ANSI redraws. Confirmation uses readline, and secret entry disables echo on `/dev/tty`.

The structured request currently selects `saved`, `environment` or `skip`; it does not select project/user file destinations. Current saved login uses macOS Keychain or Linux Secret Service. File lookup is environment, repository `.env.local`, repository `.env`, user configuration `.env`, then native saved login for the default credential reference. An explicit `credentialEnvVar` disables native fallback. An explicitly present empty process variable takes precedence over files.

The user reported repeated credential-store authorization prompts during the earlier installation audit. Attribution to particular helpers was not established. Do not use a user's real Keychain or Secret Service to investigate or validate this proposal; tests must use injected fake credential adapters or separately authorized isolated stores.

## Proposed interaction recorded before research

This preserves the conversation's proposed tree. It is not a claim that these choices or behavior exist today. File storage as the default, the optional native-store route, and exact write-approval placement remain design decisions.

```text
hapsland setup
│
├─ Select agent(s)
├─ Preview and approve owned hook changes
│
├─ Existing credential found?
│  ├─ Yes → Show selected source, never the key
│  │        ├─ Keep it → Continue
│  │        └─ Change → Choose destination
│  └─ No → Choose destination
│
├─ Where should Hapsland save your Jev key?
│  ├─ This project → <repository>/.env.local
│  ├─ All my projects → <user-config>/hapsland/.env
│  ├─ OS credential store → Keychain / Secret Service
│  └─ Skip for now
│
├─ Explain selected destination and effective precedence
├─ Read key through a masked prompt
├─ Preview and approve saving
│  └─ Preserve unrelated entries; file permissions owner-only
│
├─ Optional paid key check?
│  ├─ Approve → One check; sanitized outcome
│  └─ Decline → Continue with validity unverified
│
└─ Report readiness, partial results and next actions
   └─ Restart agent, complete native trust, make an eligible edit
```

Keeping an existing credential skips new entry and saving. Skipping credential setup skips entry, saving and paid verification; final readiness must explain that review lacks credentials. A paid check is offered only when a credential is actually available for the selected backend.

`<user-config>` means `$XDG_CONFIG_HOME` when set, otherwise `~/.config`. User credential scope is independent of agent-profile hook scope and review-file scope. A project key does not make hook registration project-only. A user-wide key does not constitute per-repository source-sharing consent.

## Proposed explicit representation

A candidate destination type, not an implemented schema:

```ts
type CredentialDestination =
  | { kind: "project"; root: string }
  | { kind: "user" }
  | { kind: "native-store" }
  | { kind: "skip" };
```

Research should determine whether to use a typed reducer, statechart/actor model, Elm-style model/update/command architecture, or another explicit representation. Calling an async Effect sequence a workflow is insufficient: states, events, transitions, guards, issued commands and terminal outcomes must be inspectable independently of terminal rendering.

Never put key values in serializable machine state, transition traces, saved plans, logs or UI models. An opaque short-lived handle or a dedicated secret adapter may be needed; that choice remains open. Public structured formats remain version 1 and are amended in place under the pre-release policy.

## Cases the design must address

- Multiple selected agents: credential decisions should be understandable and not repeated unnecessarily per agent; hook proposals remain independently owned and approved.
- Existing environment/file/native credentials: show the source without exposing secrets; replacing a lower-priority destination cannot silently claim the replacement is effective.
- Project storage: verify Git ignore status before saving; decide explicitly whether a missing ignore entry blocks, offers an approved `.gitignore` change, or requires choosing another destination. Do not silently modify Git policy.
- User file storage: create private files, preserve unrelated entries, reject unsafe targets, handle unavailable directories and write failures.
- Native storage: inaccessible/locked stores must not create repeated automatic authorization prompts; an explicitly requested native-store operation may need one user interaction.
- Back, cancel, Ctrl+C, EOF, process interruption, retries and partial writes: make resulting state and remaining approvals explicit. Approval must bind the actual writes; changed previews require renewed approval.
- Headless execution: no menus, implicit approval, first-option fallback, masked prompt or automatic paid request. Existing unattended setup contracts remain the baseline.
- Paid verification: separate confirmation, bounded request count and time, explicit distinction between authorization success and real hook execution.
- Terminal behavior: small windows, resizing, no color, reduced capabilities, redirected output, accessibility, cleanup of raw mode and echo, and durable readable results after transient menus.

## Research brief

**Date:** 2026-10-06. **Scope:** Hapsland onboarding interaction architecture and terminal rendering; no review-core rewrite, implementation, release claim or credential-store experiment.

Two independent passes compare (1) explicit interaction-state models and state-of-the-art interaction design, and (2) terminal renderers, including the named Foldkit candidate's actual console suitability. Target CLI environments are macOS/Linux arm64, bundled Bun 1.3.14 with TypeScript and the repository's pinned Effect 4.0.0 cohort. Agent runtimes remain Claude Code, Codex CLI and Pi within their declared profiles. Human setup, unattended preview/apply, cancellation, partial installation, multiple clients and optional remote verification are representative workflows. Review-engine feedback is context, not a new requirement for terminal libraries.

Existing-solution baselines are the current Effect/ANSI implementation, a small typed reducer with the existing renderer, and reusable maintained interaction/rendering libraries. Any dependency recommendation must show a concrete advantage over those baselines and list license, exact compatibility, maintenance, packaging, failure and exit-cost gates. A more complex framework must earn its added interface.

Use primary docs, source, tests and first-party metadata. Discover through official Effect ecosystem sources, library repositories, registries, formal interaction/statechart references and terminal design guidance. Exclude web-only renderers from direct console-dependency recommendations, but assess reusable architecture separately. Stop after two successive discovery rounds add no materially different class, or after a declared bounded research budget; disclose lack of saturation. Distinguish source class (DOC/SRC/RUN/ISSUE/META) from verification state. Classify every intended candidate use BORROW, DEPEND ON, OPTIONAL INTEGRATION or REJECT; no research classification adopts a dependency.

## Research owners

- [Interaction-model advisory](research/PRODUCT-RESEARCH-ADVISORY-2026-10-06-INTERACTION-MODEL.md)
- [Console-rendering advisory](research/PRODUCT-RESEARCH-ADVISORY-2026-10-06-CONSOLE-RENDERING.md)

## Decisions still open

1. Model/runner choice and the seam between pure transitions, Effect command execution and rendering.
2. Renderer choice and exact Bun/Effect/native-terminal acceptance checks.
3. Default credential destination and whether native storage remains a visible option.
4. Explicit secret ownership, back/cancel behavior, overwrite approval and Git-ignore handling.
5. How accepted interaction behavior amends current setup JSON, saved plans and installation guidance.

## Post-research synthesis (advisory)

The original flow above remains the pre-research proposal. The two research passes recommend comparing a local typed reducer with `effect-machine@0.28.0` using the same events and fake command adapters. The community package declares Effect 4 compatibility; the first-party experimental Machine belongs to Effect 3. Neither package was runtime-validated here. Effect Workflow provides durable execution machinery, which does not by itself describe the foreground conversation's choices, approvals and navigation.

Keep three explicit boundaries: the model determines legal transitions and emits commands; an Effect runner executes commands through existing setup and credential owners; a renderer projects state and returns typed input events. Shared context retains completed client outcomes when navigating between steps. Correlation IDs reject late answers and command completions after back/cancel. Saving credentials needs its own visible approval state; choosing a destination is not permission to write. Secret values and Redacted wrappers stay outside model state and event traces.

For console rendering, the first experiment is the already-pinned Effect 4 `Prompt` API through a Hapsland-owned stderr terminal adapter. Its unstable API and terminal cleanup still need testing. Retain the current renderer as the baseline. Borrow Foldkit's model/update/command architecture; its browser renderer does not provide a console backend. Consider OpenTUI only if a richer persistent view demonstrates a concrete advantage and its native assets, exact Bun targets and terminal lifecycle pass the report's gates.

The next design experiment should replay identical synthetic scenarios through both model candidates: two clients with one partial failure, back/cancel with stale answers, a higher-priority existing credential, explicit save approval, skipped credentials and separately approved paid verification. Use fake credential and network adapters. Then compare renderer behavior under narrow/resized terminals, redirected channels, EOF/signals and plain-text output. This research performed no credential-store reads, package adoption, PTY probes or compatibility builds. Acceptance of a model, renderer, default storage choice and credential-write contract remains a separate decision.

## Prototype outcome (2026-10-06, advisory)

The subsequent [throwaway console prototype](../prototypes/setup-interaction/README.md) implements both controllers independently and records [bounded executable evidence](../prototypes/setup-interaction/evidence.json). On macOS arm64/Bun 1.3.14, eight synthetic scenarios match across 54 event transitions; twenty source and twenty compiled macOS PTY cases pass. Both arm64 standalone targets compile, but Linux execution remains untested. An actor lifetime probe confirms state-owned task cancellation and release on state exit.

The prototype recommends a typed reducer with an Effect interpreter for the current finite sequence, and Effect Prompt through an owned stderr adapter. This is an experiment-based recommendation, not accepted architecture or production validation. Arrow-key approval menus and synthetic save digests do not amend current full-line confirmation or owner contracts. Real credential/file/native operations, screen-reader usability and small-window visual readability remain untested. The original flow and open decisions above remain intact.

A subsequent three-agent Luna max adversarial swarm added independent semantic and console checks. It exposed and corrected source-precedence errors, lost partial and prior applied outcomes, missing Back/readiness paths, stale save approvals, repeated command execution, empty-selection trapping, and launcher/group signal cleanup. The refreshed prototype evidence records 86 flow and 196 state/command expectations plus 35 additional terminal cases, all passing. These results apply to the synthetic prototype; they do not expand credential-store or production support claims.

The revised user decision makes Escape equivalent to Back on menus offering Back. Escape exits at the first selection dialog, which has no previous step; hidden-input cancellation retains its exit behavior. Inverse selection is removed. Astra's first-dialog recommendation is a custom Effect Prompt with Continue focused initially, an empty selection, and a visible warning when Enter is pressed without selecting an agent. Space toggles individual agents or Select All; Enter continues only with a nonempty selection. This avoids automatic first-Enter exit without relying on console colors or disabled-button styling. UI focus, selection, and warning state remain separate from the setup reducer. The prototype implements this proposal; production onboarding is unchanged.

## Reducer diagram extension (prototype)

The [generated Mermaid Markdown](../prototypes/setup-interaction/diagram.md) replays the same named scenarios used for controller comparison through the actual reducer. It separates observed state-changing edges from ignored inputs and retains sanitized revision/command correlation in replay tables. Explicit regeneration and a non-writing freshness check are available and qualification includes the latter. Coverage is limited to those scenarios; freshness does not establish exhaustive behavior or correctness. This extension does not replace the reducer or adopt production architecture.

After prototype discussion, real credential-owner integration remains required before production adoption. Linux execution is deferred; the user will review visual readability after the prototype. Screen-reader work is outside this prototype's current scope. Broader CLI dialog-system work is a subsequent conversation, separate from this bounded diagram extension.
