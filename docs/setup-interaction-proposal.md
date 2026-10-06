# Explicit setup interaction and credential destinations

**Purpose:** Preserve the proposed setup conversation and define an explicit CLI interaction architecture across human-input workflows, with bounded setup replay diagrams.
**Status:** Design proposal; no implementation or dependency adoption is authorized by this document.
**Authority:** Design proposal recording the conversation of 2026-10-06. Existing setup, configuration, ownership and consent contracts remain authoritative; this is not an accepted product contract.
**Expected use:** Evaluate interaction-model and terminal-rendering candidates, then make an explicit design decision before implementing setup changes.
**Lifecycle:** Temporary until the setup-interaction design acceptance milestone. Consolidate accepted user behavior into `docs/installation-workflows.md` and `docs/configuration.md`, record the selected architecture in an ADR, consolidate rule-interaction requirements into `docs/configuration.md`, update inbound links, and delete this proposal. Rejected options remain in Git history.

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
- [CLI framework alternatives and Abide comparison](research/PRODUCT-RESEARCH-ADVISORY-2026-10-06-CLI-FRAMEWORK-ALTERNATIVES.md)

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

## Production implementation direction

The user intends eventual production integration to use idiomatic Effect throughout orchestration while retaining a pure reducer. The [prototype guidance](../prototypes/setup-interaction/README.md#production-effect-direction) records this direction and distinguishes it from completed migration. Existing hook-installation approval behavior remains the baseline: the user confirms manual testing, and orchestration changes must preserve preview, confirmation and proposal-digest authorization. Concrete service and Layer boundaries remain integration choices.

## CLI-wide interaction scope

The broader CLI handoff is now in work. The user accepts sharing interaction conventions and rendering while retaining workflow-specific models and domain owners. Complete coverage means inventorying every human-input entry point and documenting deliberate exceptions, not forcing all commands into a wizard. The owner subsequently extended diagram generation to every modeled interactive CLI workflow. Each Mermaid Markdown graph remains bounded to named executable replay scenarios; direct/headless exceptions do not acquire invented dialog states.

### Observed entry points and ownership

This inventory is source inspection evidence; the proposed models below are design direction, not newly validated production behavior.

| Surface and executable owner | Current interaction and consent | Proposed explicit model and preserved exception |
| --- | --- | --- |
| Setup selection: `src/onboarding/client-selection.ts`, `src/cli.ts` (`chooseSetupClients`) | Client checkboxes; selected clients run separately; unchecking does not uninstall | Preserve installed labels/default selections and per-client results. First menu has no Back; Escape exits. Empty Continue is guarded in the accepted prototype. |
| Setup: `src/onboarding/pilot.ts`, `setup.ts` | Compatibility/preview, per-client confirmation, installation/default-rule digests, credential entry, activation, doctor, optional verification | Workflow-specific reducer invokes existing owners. Preview/approval stays bound to the actual proposal. Back retains completed or partial results; no implied undo. |
| Rule mutations: `src/rules/command.ts`, `management.ts` | Missing interactive scope uses a yes/no personal-vs-project question; preview/apply uses `plan.digest` | Named Project/Personal choices, explicit Preview/Approval/Applying/Outcome. Preserve create/connect activation semantics. Explicit unattended scope and existing noninteractive apply semantics remain separate; do not silently add prompts or consent. |
| Update: `src/onboarding/update.ts`, CLI `updateInteractive` | Registered-client discovery, target staging, per-client previews, one confirmation covering applicable client digests, independent results and retained-package activation/recovery | Keep batch approval cardinality, already-current/no-registration paths, and target retention. Back after staging does not claim the staged package was deleted or earlier activation undone. |
| Repair/reinstall/uninstall: `src/onboarding/maintenance.ts`, CLI `maintenanceInteractive` | Per-client inspection, journal recovery, preview, confirmation and digest-bound mutation | Workflow-specific model retains recovered operation, per-client approval and continuation after failures. No generic rollback or replacement of ownership/journal logic. |
| Login: CLI `loginCredential`, `src/credentials/masked-input.ts` | Explicit login probes native store with interaction permitted, hidden key input, save; input failure preserves prior credential; `--credential-stdin` is explicit | Resolve/probe, Capture, Save, Outcome without adding a destination choice. Preserve native-store status/recovery and explicit stdin path. Hidden cancellation remains terminal for the input session. |
| Credential verification/replacement: `src/onboarding/credential-verification.ts` | Separate paid-check consent; sanitized outcome; source-dependent replacement/recheck; at most three confirmed checks, 15-second requests, no automatic retries | Credential-owner model shared by setup, not duplicated in the setup reducer. Every additional request retains fresh consent. Environment-only keys are changed outside the CLI; file recheck and saved replacement are distinct actions. |
| Logout: CLI `logoutSavedCredential` | Explicit command, no dialog; deletion status, saved-use suspension/generation, environment override explanation | Keep direct command semantics and structured output. Reuse outcome formatting only if appropriate; do not invent a confirmation or wizard. |
| Explicitly interactive JSON setup: CLI `runJsonSetup`, credential owner | `interactive: true` explicitly injects masked `/dev/tty` reading even when stdin carries JSON | Preserve this authorized controlling-terminal input path and structured stdout. Prototype stdin/stderr TTY rejection cannot be copied wholesale. Ordinary unattended setup still never prompts; `--credential-stdin` remains a separate explicit path. |
| Doctor; rule list/show/explain; preview/JSON/headless commands | Direct inspection or explicitly structured automation | Keep direct output and version-one formats. No first-option fallback, prompts, hidden input or new implicit paid requests. |

No dedicated interactive rule editor was found. Creating/connecting rules does not imply an editor requirement. Native agent trust and OS credential authorization remain external interactions; the renderer cannot accept them on the user's behalf or report them complete merely because setup succeeded.

### Shared interface and Effect interpreter

The shared module owns terminal lifetime, input-session correlation, visible key hints, plain/interactive output routing, and safe presentation. Workflow modules own legal transitions, proposal identity, commands, retry policy and domain recovery. Installation, rule management and credential owners continue to compute and validate proposals and perform mutations.

Use a small discriminated view vocabulary: **selection**, **approval**, **secret input**, **operation status**, and **outcome**. Selection includes stable choice identities and an explicit navigation policy. Approval carries an owner-derived preview and authorization identity; selecting a destination or moving focus never grants mutation consent. Secret input yields a short-lived owner-consumed value outside serializable state, events and replay traces. Status/outcome represent observed facts and recovery actions, not presumed success.

The renderer returns typed interaction results (choice, submitted approval, Back, Exit, input termination) rather than calling owners. Each workflow translates those results into its own typed events. Back availability and destination are projected by the workflow. Escape is Back where Back exists and Exit at the initial selection; hidden input retains the accepted cancellation behavior. Distinguish EOF, process interruption and user navigation so depleted input cannot loop and mutation interruption cannot be misreported as rollback. Clear approval on a changed proposal and reject late input/completion by correlation identity.

The interpreter uses typed Effects for command execution and resource lifetime, with Effect services/Layers for shared production/test wiring where useful. Pure reducers have no terminal, process or storage dependency. Side-effecting output/exit callbacks execute within Effect. Keep global signal policy session-owned and raw mode/echo/cursor/listener restoration scoped. Avoid blanket catch-all handling that turns domain failure into Back or cancellation.

Existing production full-line write confirmation is an intentional consent adapter, not automatically replaced by the prototype's arrow-key Approve menu. The secret adapter is `Prompt.Hidden` in the prototype; production adoption must preserve the current controlling-terminal and explicit credential-stdin behavior. Sharing conventions does not require identical implementations for every input kind.

### Internal owner seams required before migration

Read-only source review found that `runSetup` already combines credential resolution, hidden capture and save within its credential stage. Moving only `pilot.ts` into a reducer would leave this interaction implicit. Extract an internal credential-owner interface shared by structured setup and human orchestration: it owns source resolution/precedence, availability, explicit capture eligibility, saving, replacement and safe recovery. The workflow model decides when to ask; it does not reimplement credential policy. Keep captured values out of reducer events and return only sanitized outcomes/correlation.

Credential verification currently owns source-dependent replacement and retry consent inside its loop. Make those decisions inspectable through the credential workflow rather than copying that loop into setup. Owner request execution retains its existing bounded request and sanitized-response implementation.

The original prototype terminal adapter fails `readLine`; built-in Prompt.String uses its scoped raw input path for full-line confirmation. The shared interaction milestone adds an explicitly authorized controlling-terminal transport and source/compiled PTY probes. It remains prototype evidence, not validation of production JSON setup or the real credential owner. Implement and verify full-line confirmation support, authorized `/dev/tty` input, and terminal acquisition/cleanup explicitly before replacing production input. Retain the built-in `Prompt.Hidden` constraint; do not add a custom hidden prompt or reinterpret hidden cancellation as navigation.

### Integration decisions already settled

- The setup flow is accepted; success presentation will be assessed during production integration.
- First integration presents current credential behavior. Project/user file-saving options remain an extension point. Creating an explicit follow-up task for these options is part of integration; it must cover default choice, preview/approval, overwrite preservation, private permissions, safe targets and Git-ignore policy.
- Preserve the manually tested production installation approval process and independent automated behavior assertions. Native agent trust remains a separate prerequisite.
- Readiness guidance must emit **Codex**, preserving the existing production test expectation; do not change that test to accept **Codex CLI**.
- Linux arm64 execution validation is required near the end of production integration. A Linux compile alone does not satisfy it.
- Real credential-owner integration is required after the prototype. Ordinary prototype/tests stay offline with fake/injected owners; do not inspect the user's credential store.
- Screen-reader work is outside the current scope. Visual review and success presentation belong to the integration review, not a claim made by PTY tests.

### Implementation and acceptance sequence

1. Audit all inventory rows against the shared interface and retain deliberate exceptions. Use the requested Astra architecture review to catch missing surfaces or duplicated policy.
2. Extend the throwaway prototype with representative rule scope/approval, batch update, maintenance recovery and credential verification/replacement flows. Drive distinct models through the same renderer/interpreter conventions with fake owners, including Back, decline, stale approval, partial outcomes and input termination. Keep login secret behavior unchanged and emit workflow-specific Mermaid Markdown from executable replay scenarios, with explicit regeneration and non-writing freshness checks.
3. Integrate shared Effect input/output/lifetime wiring and then workflow models with actual existing owners. Preserve proposal digests, multi-client consent cardinality, structured/headless behavior and secret isolation. Remove superseded production orchestration rather than retaining parallel implementations.
4. Create the additional credential-destination follow-up task, settle success presentation using real owner outcomes, and make the Codex wording correction.
5. Run focused model/owner tests and affected process/PTY and packaging checks from the testing matrix. Validate actual Linux arm64 execution near the end; record platform, executable and cleanup evidence. A broad CLI migration requires the full quality gate once its candidate is frozen, with its finite deadline declared before execution.

Acceptance requires every inventoried interactive entry point to be migrated or explicitly documented as a deliberate exception; no changed domain consent or unattended behavior; stale input/approval/completion rejection; no repeated mutation or paid request; preserved per-client partial/recovery results; restored terminal modes/listeners on all exits; secrets absent from model/view/replays/output; success claims limited to actual observed stages; and Linux execution evidence. Diagram freshness remains a separate bounded check, not proof of correctness or complete workflow coverage.

### Astra architecture review outcome

Astra reviewed the actual owners and prototype read-only and supports the shared module plus workflow-specific reducers and Effect interpreters. The review adds these requirements to the integration plan:

- Include bare setup, explicit-client setup, legacy pilot and explicitly interactive JSON as entry paths into the appropriate shared owner/workflow. Preserve setup's separate default-rule proposal digest as well as hook-installation authorization.
- Give the shared interaction module a live terminal adapter and a scripted adapter. Its small interface covers typed single/multiple choices, full-line confirmation, hidden input and durable presentation; navigation capability is explicit. A reusable runner must know nothing about credential precedence, host selection, rule scope or approval grouping. Avoid a universal command union and services around pure helpers.
- Production uses one application Effect runtime with scoped sessions. Do not migrate the prototype's repeated `runFork`/`runPromise` bridges or nested `runSync(Effect.cached(...))` into the implementation. Discovery, failure reporting, output and exit status are Effects or safe returned outcomes interpreted at the CLI edge.
- Session correlation/deduplication does not establish process-wide exactly-once mutation. Existing owner locks, digests and journals remain authoritative. Never cache a secret-bearing result in the generic command runner.
- Preserve active-package routing, staged target retention, activation and installed launcher behavior. Verify these physical seams through appropriate installed checks rather than only reducer equality.
- Replace the prototype's guessed credential precedence and synthetic readiness with owner observations. Keep native trust, installation, credential availability and verification separate in outcome presentation; changing readiness to Codex must not accidentally change all consumers of the shared client label.
- Check controlling-terminal capability early, then run actual source and installed relevant flows on Linux near completion using isolated fake stores. No real user credential store is needed for this acceptance evidence.

The review itself ran no tests and changed no files. The implementation sequence and owner baseline below distinguish executed checks from advisory review.

### Inspected owner baseline

The focused existing update, maintenance and credential-verification suites passed together on this worktree: 76 tests across three files. They establish the checked existing behavior, not the proposed migration. The earlier targeted pilot approval and terminal confirmation cases passed; the broader pilot run still has the known Codex/Codex CLI readiness-text mismatch that integration must correct in production output. Rules, controlling-TTY and Linux acceptance must run at their affected implementation gates; source inspection alone is not execution evidence.

### Remaining workflow prototype milestone

Update, maintenance/recovery, login and verification/replacement now have separate executable prototype models, injected synthetic owners, shared live/scripted input, replay-generated Mermaid Markdown and bounded source/compiled terminal checks. The [prototype guide](../prototypes/setup-interaction/README.md#remaining-workflow-prototypes) explains scenarios and evidence limits. Production integration remains blocked by #243; no final package/build choice or real owner integration is adopted here.

After #244 production integration and validation, consolidate adopted decisions, generators and useful tests into production owners, update inbound links, and delete every prototype created or extended for #244, including isolated manifests, demo scripts, fake owners, temporary replay Markdown and superseded qualification snapshots. Unrelated repository prototypes are outside that scope. Retain maintained production Mermaid documentation and its executable generator; Git history preserves the experiment chronology.
