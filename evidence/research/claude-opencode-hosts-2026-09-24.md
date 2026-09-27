# Claude Code and OpenCode host adapter research — 2026-09-24

**Status: historical advisory research.** At the time of this report, no Claude Code or OpenCode adapter had been implemented. Its candidate cards, unknowns, and recommendations are not current support claims. The later [Claude host decision and evidence](../host-94/decision-and-evidence.md) records the implemented exact-profile path and selected host trials; [installed release compatibility](../../docs/installed-release-compatibility.md) names the verified release cells. This report does not supersede the [direct-event v1 supported profile](../../docs/direct-event-v1-supported-profile.md). The [issue](https://github.com/dearlordylord/hapsland/issues/94) requires real-host compatibility and advice-reaction evidence before support is declared.

## Brief and scope

Question: which *direct successful edit* lifecycle and feedback surfaces could carry Hapsland's existing immutable review input on Claude Code and OpenCode? Representative workflows are advisory findings after a native edit, an optional later blocking policy, coexistence with other hooks/plugins, non-interactive runs, a missing or slow Jev backend, and an idle or failed host. Required evidence for support is a successful direct edit, attributable snapshot and advicee, usable delivery, installation and removal, and a tested failure path. A file watcher, shell write, or checkpoint is outside #94's initial path.

This is a **named-host targeted pass**, not ecosystem discovery. The existing-solution baseline is each host's own hook/plugin mechanism; no third-party adapter is assumed. The preference for a small host adapter would change if a first-party API already provided a stable immutable edit snapshot, advicee identity, and late-result delivery. Discovery used the official Claude Code hooks/settings/CLI references, official OpenCode plugins/CLI/SDK references, their first-party issue trackers, local CLI help, and this repository's current contract. Search stopped after those two host classes and their obvious direct-edit and feedback surfaces; ecosystem saturation is not claimed. No serious third-party candidate was evaluated because #94 names the two hosts and asks for native adapter paths.

## Version and evidence ledger

Source-class labels (`DOC`, `SRC`, `RUN`, `ISSUE`) identify evidence type; verification states (`DOCUMENTED`, `SOURCE-INSPECTED`, `RUNTIME-TESTED`) identify how a claim was checked. `DOCUMENTED` means a current official page states the claim. It does **not** prove the installed binary behaves that way. `RUNTIME-TESTED` below applies only to the exact version/help command, not an edit. All web pages were accessed 2026-09-24; dynamic pages can change. The OpenCode tag [v1.14.44](https://github.com/anomalyco/opencode/tree/v1.14.44) exists, but this pass did not inspect its implementation. Current [OpenCode v2 documentation](https://opencode.ai/v2/docs/build/plugins/migrate-v1) explicitly describes a different hook API, so it cannot establish behavior of 1.14.44.

| ID | Exact proposition and scope | Source class | Verification state | Limit or counterevidence |
| --- | --- | --- | --- | --- |
| H1 | Local Claude binary reports `2.1.218`; local OpenCode reports `1.14.44`; Linux workspace. | RUN | RUNTIME-TESTED: `claude --version`; `opencode --version`, exit 0, observed versions as stated. | Metadata only; no tool call tested. |
| H2 | Hapsland's implemented advicee and input are Codex-specific, including `host`, `hostVersion`, `sessionId`, `turnId`, `toolUseId`, `agentId`; the supported native path is Codex `apply_patch`. | SRC | SOURCE-INSPECTED: [model](../../src/direct-event/model.ts), [adapter](../../src/direct-event/adapter.ts), [profile](../../docs/direct-event-v1-supported-profile.md). | Host-neutral core cannot be inferred from product description; advicee needs explicit evolution. |
| C1 | Claude `PostToolUse` fires after successful tools; `Edit|Write` matching does not cover Bash writes. Payload has `session_id`, `cwd`, `tool_name`, `tool_input`, `tool_response`, `tool_use_id`; file-tool path is absolute. | DOC | DOCUMENTED: [Claude hooks reference](https://code.claude.com/docs/en/hooks#posttooluse). | Exact Edit/Write response schema and tool success invariants require a 2.1.218 fixture. |
| C2 | A synchronous `PostToolUse` hook can add `hookSpecificOutput.additionalContext` beside the completed tool result. `decision: block` adds a reason after the edit; it does not undo it. | DOC | DOCUMENTED: [Claude hooks reference](https://code.claude.com/docs/en/hooks#posttooluse-decision-control). | Agent reaction and ordering against another hook are untested. |
| C3 | Async command hooks defer output until the next conversation turn; idle output waits for user interaction unless `asyncRewake` exits 2; `claude -p` kills still-running async hooks at teardown. | DOC | DOCUMENTED: [Claude async hooks](https://code.claude.com/docs/en/hooks#run-hooks-in-the-background). | No fixed edit-to-visible-advice bound; `asyncRewake` semantics and suitability for ordinary findings need testing. |
| C4 | Hooks can live in user/project/local settings or plugins; settings hooks merge. Interactive sessions defer settings hooks until workspace trust, while `-p` treats the folder as trusted and can run repository hooks. | DOC | DOCUMENTED: [Claude hook locations and trust](https://code.claude.com/docs/en/hooks#hook-locations). | Host trust is not Hapsland source-egress consent. Managed policy may prohibit user hooks. |
| O1 | OpenCode 1.x documentation advertises local and npm plugins, sequential load order, `tool.execute.after`, `file.edited`, and session events. | DOC | DOCUMENTED: [OpenCode plugins](https://opencode.ai/docs/plugins/). | The page is dynamic and not pinned to 1.14.44; event payload and success predicate are unspecified there. |
| O2 | `opencode run` is non-interactive; installed 1.14.44 help offers `--format json`, `--session`, `--continue`, `--pure`. | DOC; RUN | DOCUMENTED: [OpenCode CLI](https://opencode.ai/docs/cli/#run); RUNTIME-TESTED: `opencode run --help`, exit 0. | Help does not prove hooks run or advice enters model context in `run`. |
| O3 | OpenCode SDK describes `client.session.prompt` with `noReply: true` as context-only injection. | DOC | DOCUMENTED: [OpenCode SDK](https://opencode.ai/docs/sdk/). | A plugin calling it from a post-tool hook may re-enter or race the current turn; no delivery or authority guarantee established. A first-party [1.14.44 issue](https://github.com/anomalyco/opencode/issues/26635) reports `prompt_async`/SSE failure in one environment (documented issue counterevidence), not a reproduced result here. |
| O4 | First-party v2 migration documentation says the v1 hook object and v2 domain registration differ. | DOC | DOCUMENTED: [OpenCode migration](https://opencode.ai/v2/docs/build/plugins/migrate-v1). | Do not carry a 1.x adapter promise to v2. A first-party [issue](https://github.com/anomalyco/opencode/issues/40808) reports silent legacy hook failure on a later 1.x version (documented issue counterevidence); reproduce on targeted versions. |

No source-bearing hook payload or credentials were retained. No live edit, failure injection, Jev call, or paired agent reaction was run in this pass. Thus there is no `RUNTIME-TESTED` host behavior cell.

## Candidate cards and contract map

| Contract stage | Claude Code 2.1.218 candidate | OpenCode 1.14.44 candidate |
| --- | --- | --- |
| Input evidence unit | `PostToolUse` for `Edit|Write`, restricted to a successful direct file tool call (C1). | Plugin `tool.execute.after`, restricted to successful native `edit`/`write`/`apply_patch` once actual names and success payload are probed (O1). `file.edited` is discovery only until writer and advicee attribution is shown. |
| Change selection | Parse named path and actual added/changed text; re-read bounded snapshot using existing containment rules. Exact Edit/Write delta shape unknown. | Parse tool args/result and, if reliable, select named path and changed lines. Exact args/result unknown. |
| Semantic context and evaluator | Reuse Hapsland's same-file semantic extraction, policy, consent, Jev `DecisionModel`, snapshot validation (H2). | Same (H2). |
| advicee authority | Candidate `session_id` + `tool_use_id` + subagent fields if available; tool event lacks known turn identity. Define and test authority lifetime. | Candidate session/message/tool-call identifiers in plugin input; their exact availability is unknown. Define and test authority lifetime. |
| Advice delivery owner | Synchronous `additionalContext` is a direct candidate (C2); async response only at next conversation turn, with headless teardown risk (C3). | Mutating current tool output or context-only SDK prompt is a candidate. Neither is evidenced as agent-visible in 1.14.44 (O1/O3). |
| Failure/egress | Host command timeout, process crash and JSON error handling require a bounded probe. Hapsland should complete the edit and skip/non-spam on review failure. | Plugin exception/timeout/re-entry behavior requires a bounded probe. Host permission/plugin trust and Jev consent remain separate. |

### Claude Code card

**Identity/portability.** Agent host, installed 2.1.218 on Linux (H1), proposed adapter use `PostToolUse` direct Edit/Write only. The current docs also name `FileChanged`, but that can observe external or shell writes without direct tool attribution and should not be treated as equivalent (C1). Host source and license are not a proposed runtime dependency; the CLI itself is an optional integration edge.

**Lifecycle/canonical contract.** `PostToolUse` is after success and carries a tool response (C1); `PostToolUseFailure` is separate. The exact response shape, changed-line extraction, multiple-file behavior, and whether all successful writes have a stable path are UNKNOWN. Hapsland should accept only events with a named eligible file, a supported semantic root, and verified current snapshot. The `decision: block` field is feedback after completion, not a rollback or permission algebra (C2).

**Feedback/failure.** Synchronous `additionalContext` looks closest to immediate advisory handoff, subject to #97 latency results. Async hooks have next-turn and `-p` teardown limits (C3). No later event, stale result, restart, handler timeout/crash, and model reaction are UNKNOWN. A hook return proves submission at most; a captured later model response must prove reaction.

**Install/composition/trust.** User settings, project settings and plugin hooks exist, and settings hooks merge (C4). An installer must own one exact entry, preserve unrelated groups/order, and detect modified entries; managed hooks and workspace trust must be reported independently from Hapsland consent. Claude's headless trust behavior (C4) needs explicit warning in preview, not silent project installation. Hook code runs with the user's filesystem privileges [per official security section](https://code.claude.com/docs/en/hooks#security-considerations). Packaging, update/removal, hook order, and any plugin marketplace route are not yet runtime checked.

### OpenCode card

**Identity/portability.** Agent host, installed 1.14.44 on Linux (H1). The candidate is a v1 plugin, loaded locally or from npm (O1), with exact-version support only after probe. OpenCode's v2 hook API is separate (O4); no blanket OpenCode claim follows from a 1.x result.

**Lifecycle/canonical contract.** Official 1.x docs list `tool.execute.after` and `file.edited` (O1), but do not prove their 1.14.44 invocation, payload, success status, or relation to the native edit tools. The plugin hook is the preferred experiment because it might pair tool args/result with an agent session; `file.edited` alone may be unowned. Native write, patch and shell paths should each be separate cells. Exact snapshot and advicee checks remain Hapsland-owned (H2).

**Feedback/failure.** Mutating the tool output, if supported by the actual hook callback, is a possible immediate channel; `noReply` prompt injection is another documented but untested path (O3). A noReply message may persist for an idle or wrong advicee, so it requires an authority check and a real-host reaction probe. The 1.14.44 `prompt_async` first-party report is a specific caution, not a general failure conclusion (O3). Plugin exceptions, timeouts, cancellation, restart and headless delivery are UNKNOWN.

**Install/composition/trust.** Docs give global/project plugin locations and sequence, and warn a local plus similarly named npm plugin can load twice (O1). An owned install should preserve unrelated config/plugins, detect duplicate representations, and avoid unpinned updates until tested. `opencode run` is the headless target (O2); `--pure` explicitly removes external plugins and must be marked unsupported for this adapter unless an alternative injection surface is tested. Plugin code executes in the host process with access to its SDK and filesystem; Hapsland consent must still gate Jev egress. Explicit host trust behavior for a new project plugin is UNKNOWN.

## Capability and decision matrices

| Capability | Claude 2.1.218 | OpenCode 1.14.44 |
| --- | --- | --- |
| Successful direct-edit callback | C1: source class DOC, verification state DOCUMENTED | O1: source class DOC, verification state DOCUMENTED; exact version UNKNOWN |
| Attributable path and tool call | C1: source class DOC, verification state DOCUMENTED; Edit delta UNKNOWN | UNKNOWN; O1 names only event |
| Agent-visible synchronous finding | C2: source class DOC, verification state DOCUMENTED; reaction UNKNOWN | UNKNOWN |
| Late/idle advice | C3: source class DOC, verification state DOCUMENTED; next-turn limitation | O3: source class DOC, verification state DOCUMENTED; context-only API, authority/reaction UNKNOWN |
| Headless lifecycle | C3/C4: source class DOC, verification state DOCUMENTED | O2: source class DOC, verification state DOCUMENTED; CLI help source class RUN, verification state RUNTIME-TESTED; hook delivery UNKNOWN |
| Install/coexistence | C4: source class DOC, verification state DOCUMENTED | O1: source class DOC, verification state DOCUMENTED |
| Real-host adapter conformance | UNKNOWN | UNKNOWN |

| Candidate component and intended use | Classification | Reason |
| --- | --- | --- |
| Claude Code native hook lifecycle as Hapsland host edge | **OPTIONAL INTEGRATION** | Host-specific event and feedback path; core review contract remains Hapsland-owned. |
| Claude synchronous `additionalContext` after a direct edit | **BORROW** | Candidate delivery pattern to implement in adapter if #97 and host probe favor bounded wait. |
| Claude `FileChanged` as a substitute for an attributed direct edit | **REJECT** | Observes writes without proving tool cause or intended advicee (C1). |
| OpenCode v1 plugin lifecycle as Hapsland host edge | **OPTIONAL INTEGRATION** | Exact-version adapter required; not a review-core dependency. |
| OpenCode context-only prompt for late advice | **BORROW** | Candidate pattern only; needs stale authority and re-entry experiments (O3). |
| OpenCode v2 plugin API for 1.14.44 | **REJECT** | Different API generation (O4). |

No `DEPEND ON` recommendation is made, so no dependency gate is passed or implied. The existing native host surfaces are sufficient to justify adapter prototypes, but **insufficient to satisfy #94** without live attribution, reaction, failure and install checks.

## Synthesis, disconfirmation and handoff

Both hosts expose extension points after tool execution (C1/O1). They differ in documented advice ownership: Claude explicitly defines `additionalContext` and async next-turn behavior; the OpenCode v1 page does not specify a comparable immediate feedback contract. The strongest case against direct hooks is that successful edit callbacks may lack a trustworthy delta or stable advicee, and late advice can be delivered after the agent moves on. Evidence that would change the recommendation is a pinned host fixture proving a complete stable edit snapshot and an advicee-scoped delivery API, or proving hooks cannot correlate to the edited snapshot. #97 may favor a synchronous bounded path; this report does not select one.

| ID | Advisory implication | Support / counterevidence | Handoff and acceptance check |
| --- | --- | --- | --- |
| I1 | Prototype Claude `PostToolUse` Edit/Write with strict named-path filtering. | C1/H2; exact delta unknown. | **Both:** specify candidate/reject cases; isolated 2.1.218 Edit and Write fixtures with sanitized event fields, exact snapshot and subagent advicee. |
| I2 | Choose Claude sync or async delivery only after #97. | C2/C3; no timing or reaction run. | **Prototype:** paired edit-to-submission/agent-visible timing, no later event, stale edit, `-p` teardown, restart, timeout and crash. |
| I3 | Prototype OpenCode v1 `tool.execute.after` before selecting output mutation or `noReply`. | O1/O3/O4; first-party issue O3. | **Both:** pin 1.14.44, inspect released plugin types/source, run native edits and capture sanitized session/message/call identity; test actual model reaction and noReply re-entry. |
| I4 | Keep installation, host trust and source-egress consent independent. | C4/O1/H2. | **Specification:** owned config entry, duplicate detection, preview/update/remove, unrelated plugin coexistence, normal trust and headless flags. |
| I5 | Keep shell writes, external file events and v2 OpenCode outside initial support. | C1/O4. | **Specification:** explicit unsupported matrix; revisit only with separately attributable event and real-host evidence. |

### Minimum next probes

Use disposable repositories and isolated host homes with controlled offline findings. For each exact binary, record OS/architecture, host version, mode, plugin/hook config digest, tool name, sanitized event-key names and path-counts, monotonic timestamps, whether the edit completed, whether the hook/plugin ran, whether advice was submitted, whether the next model message referenced it, and whether a later edit changed. Keep source, prompts, credentials, full tool payloads, and model responses out of evidence. Exercise an unrelated hook/plugin and uninstall only Hapsland's owned entry. Repeat headless with no later event, stale result, host exit, handler timeout/crash, and unavailable review backend. An accepted result must be dropped if snapshot or advicee authority is stale.

Search limitation: official docs are mutable, the v1 OpenCode page is not version pinned, and this pass did not inspect tagged source or execute edit fixtures. The next discovery step is source inspection at the 1.14.44 tag and direct host probes. These limitations prevent declaring compatibility from the tables above.
