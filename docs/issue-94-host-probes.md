# Issue #94 bounded host probes — 2026-09-24

**Status:** early exact-version probe supplement. This probe alone establishes no
supported adapter. It supplements, and does not supersede,
[`issue-94-host-research.md`](issue-94-host-research.md). The actual model reaction,
delivery timing, stale-result handling, and installation acceptance checks remain open.

## Scope and method

The [#94 issue](https://github.com/dearlordylord/hapsland/issues/94) requires exact host
versions and modes, successful direct edits, and a distinction between advice submitted
to the host and a model's observed reaction. This probe tested those event and submission
surfaces only, using synthetic text in disposable Git repositories.

Both installed profiles lacked real provider authentication: Claude Code's
`claude auth status --json` reported `loggedIn: false`; OpenCode's `opencode auth list`
reported zero credentials. To exercise the actual host tool loops anyway, each run used a
scripted Anthropic-compatible or OpenAI-compatible provider bound to loopback with a
synthetic key. No external model endpoint received a request. The scripted provider
issued only `Read`, `Edit`, and `Write` calls against synthetic files. Its canned final
response does not count as model reaction evidence.

The host stdout, stderr, hook input values, synthetic advice tokens, request bodies, and
responses were held only in process memory or disposable temporary directories. Retained
JSON contains field names, value types, normalized fixture paths, booleans, and run
metadata; it contains no source text, credentials, raw host logs, or model responses.

## Evidence ledger

`RUN` and `SRC` identify the source class; the verification state is separate.

| ID | Proposition | Source class | Verification state and limit |
| --- | --- | --- | --- |
| H1 | The installed host versions are Claude Code `2.1.218` and OpenCode `1.14.44`, on Linux aarch64. | `RUN` — local CLI version and platform commands | `RUNTIME-TESTED`; host identity only. |
| H2 | The configured Claude profile is logged out and OpenCode has no saved provider credentials. | `RUN` — `claude auth status --json`, `opencode auth list` | `RUNTIME-TESTED`; the controlled local provider runs used synthetic keys. |
| C1 | Claude Code 2.1.218 emits `PostToolUse` after successful synthetic `Edit` and `Write` calls in headless print mode. | `RUN` — exact installed binary, local provider | `RUNTIME-TESTED`; not a run against an authenticated Claude model. |
| C2 | Synchronous `hookSpecificOutput.additionalContext` reached the next local provider request after each successful edit. | `RUN` — exact installed binary and hook output | `RUNTIME-TESTED` host submission; no real-model reaction observed. |
| O1 | OpenCode 1.14.44 emits `tool.execute.after` after successful synthetic `edit` and `write` calls in headless `run` mode. | `RUN` — exact installed binary, local provider | `RUNTIME-TESTED`; not a run against an authenticated OpenCode model. |
| O2 | Mutating `output.output` inside the local `tool.execute.after` plugin hook reached the next local provider request after each successful edit. | `RUN` — exact installed binary and plugin | `RUNTIME-TESTED` host submission; no real-model reaction observed. |
| D1 | Claude documents `PostToolUse` as post-success and documents `additionalContext` for the tool result. | `DOC` — [Claude hooks reference](https://code.claude.com/docs/en/hooks#posttooluse) | `DOCUMENTED`; the page is mutable and is not a pinned 2.1.218 contract. |
| S1 | OpenCode's v1.14.44 plugin type defines `tool.execute.after` input as `tool`, `sessionID`, `callID`, `args`, and output as `title`, `output`, `metadata`. | `SRC` — [tagged v1.14.44 plugin source](https://github.com/anomalyco/opencode/blob/v1.14.44/packages/plugin/src/index.ts) | `SOURCE-INSPECTED`; the runtime probe also observed an `attachments` output key. |
| D2 | OpenCode documents project plugins under `.opencode/plugins/`. | `DOC` — [OpenCode plugins reference](https://opencode.ai/docs/plugins/) | `DOCUMENTED`; this current page is not version-pinned. The exact installed binary loaded the local plugin in the probe. |

## Claude Code 2.1.218

**Mode:** `claude -p --output-format stream-json --verbose --no-session-persistence`, with
`Read`, `Edit`, and `Write` enabled and `acceptEdits` permission mode. Settings and the
hook lived inside a temporary Git repository and isolated `CLAUDE_CONFIG_DIR`. The hook
matched `Edit|Write` and returned synchronous `PostToolUse` `additionalContext`.

The scripted run completed `Read → Edit → Write`. Both edited files matched the expected
synthetic post-edit state when the hook inspected them. The two `PostToolUse` inputs had
these fields:

| Tool | `tool_input` fields | `tool_response` fields | Correlation fields present |
| --- | --- | --- | --- |
| `Edit` | `file_path`, `old_string`, `new_string`, `replace_all` | `filePath`, `newString`, `oldString`, `originalFile`, `replaceAll`, `structuredPatch`, `userModified` | `session_id`, `tool_use_id`, `prompt_id` |
| `Write` | `file_path`, `content` | `content`, `filePath`, `originalFile`, `structuredPatch`, `type`, `userModified` | `session_id`, `tool_use_id`, `prompt_id` |

For both events, the top-level fields were `cwd`, `duration_ms`, `effort`,
`hook_event_name`, `permission_mode`, `prompt_id`, `session_id`, `tool_input`,
`tool_name`, `tool_response`, `tool_use_id`, and `transcript_path`. `duration_ms` was an
integer. No `turn_id` or `agent_id` field was present in these events. Each unique hook
note was present in the next request sent to the local provider. This establishes a
host-owned synchronous submission path in `-p` mode; the note was not supplied in the
original prompt. It does not establish how an authenticated model would interpret or
respond to the note.

An earlier fixture attempt that called `Edit` without first calling `Read` returned a
tool error. The successful fixture used `Read` first. This does not prove that every
Claude Code `Edit` requires a preceding `Read`; the initial error's cause was not retained.

## OpenCode 1.14.44

**Mode:** `opencode run --format json --dangerously-skip-permissions`, using an isolated
XDG profile, a temporary Git repository, a project-local JavaScript plugin, and a local
scripted OpenAI-compatible provider. Although permission prompts were bypassed for this
disposable run, the scripted provider issued only the three file-tool calls below; it
issued no shell command.

The local plugin loaded and the successful tool sequence was `read → edit → write`. The
synthetic edit and write were confirmed from disk. Runtime `tool.execute.after` input keys
were `args`, `callID`, `sessionID`, and `tool`; the corresponding edit arguments had keys
`filePath`, `newString`, `oldString`, and `replaceAll`, while write arguments had
`content` and `filePath`. For each callback, `sessionID` and `callID` were present; no
`messageID`, `turnID`, or `agentID` field was present.

The runtime output keys were `attachments`, `metadata`, `output`, and `title`. The
metadata keys differed by tool: `diagnostics`, `diff`, `filediff`, `truncated` for edit;
`diagnostics`, `exists`, `filepath`, `truncated` for write. The local plugin appended a
unique note to the mutable `output.output` string. The next local provider request
contained the note for both edit and write. This establishes a synchronous tool-result
submission candidate for the tested `run` mode. It does not establish model reaction or
behavior with an authenticated provider.

The hook input has no standalone success flag in the pinned type signature; successful
state in this probe was confirmed by checking the synthetic file after the host call. A
product adapter must define its success predicate and failure behavior from tested
runtime evidence before declaring support.

## Handoff and unresolved checks

These runs support prototyping the two synchronous paths after the #97 delivery result:
Claude `PostToolUse.additionalContext` and OpenCode v1 `tool.execute.after` result-output
mutation. For both, this is evidence of host submission in a headless tool loop, not of a
real model reacting to a finding. Keep the compatibility claim scoped to the exact tested
versions and modes until an authenticated paired run verifies reaction.

Not tested here: interactive mode; an authenticated provider or real model reaction;
edit-to-visible latency; late or idle delivery; a stale snapshot or advicee; restart;
hook/plugin timeout or crash; unavailable review backend; installation, coexistence,
disablement, update, or removal; shell or external writes; and behavior outside the
specific versions above. No adapter support is declared by this report.

| Evidence file | Contents |
| --- | --- |
| [`claude-2.1.218-local-probe.json`](../evidence/host-94/claude-2.1.218-local-probe.json) | Sanitized `Edit` and `Write` event fields, successful fixture state, and next-request submission flags. |
| [`opencode-1.14.44-local-probe.json`](../evidence/host-94/opencode-1.14.44-local-probe.json) | Sanitized v1 plugin event fields, successful fixture state, and next-request submission flags. |
