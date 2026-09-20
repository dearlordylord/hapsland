# Codex adapter contract v1

**Status:** experimental compatibility contract for Codex CLI `0.155.1` on Linux.
Both `codex exec` and the interactive TUI have runtime evidence. This document is
normative for the adapter. The earlier Codex research remains advisory.

## Supported path

The adapter consumes a synchronous `PostToolUse` command-hook event whose canonical
`tool_name` is `apply_patch`. It extracts every `*** Add File`, `*** Update File`, and
`*** Delete File` path from `tool_input.command`, translates them to the product-owned
version-1 review request, waits for review, and returns findings as
`hookSpecificOutput.additionalContext`.

The adapter never returns `decision: "block"`, `continue: false`, a permission decision,
or exit code 2. The edit is already complete before this adapter runs. A backend or adapter
failure becomes bounded, model-visible review unavailability and cannot reverse the edit.

Shell-mediated writes are explicitly unsupported in contract v1. Codex emits a `Bash`
event containing the command, but the event does not provide a reliable resulting-file set.
Guessing paths from arbitrary shell syntax would overstate interception and privacy
coverage. Configure the product hook matcher for `apply_patch|Edit|Write`, not `Bash`.

## Evidence ledger

Evidence labels mean: **documented** (official current documentation),
**source-inspected** (pinned source), **runtime-tested** (sanitized local probe),
**inferred**, or **unknown**.

| Claim | Evidence | Result |
|---|---|---|
| Hook discovery is additive across user, project, plugin, and managed layers. | documented | Matching hooks from multiple sources all run; higher-precedence layers do not replace lower hooks. |
| Command hooks receive one JSON object on stdin. | documented, source-inspected, runtime-tested | The fixture shape matches the generated `post-tool-use.command.input.schema.json`. |
| `PostToolUse` supports `apply_patch`; aliases `Edit` and `Write` match it while stdin reports `apply_patch`. | documented, source-inspected, runtime-tested | Native file creation and a two-file patch emitted one event each, with the complete patch in `tool_input.command`. |
| Default command hooks are synchronous. | documented, runtime-tested | Both marker handlers completed and both marker strings were visible to the model before its next action. |
| `PostToolUse` occurs only after a successful local tool result. | source-inspected, runtime-tested | Pinned registry code gates post hooks on `success`; a deliberately failed patch emitted no hook event. |
| Post-write feedback cannot undo the tool side effect. | documented, source-inspected, runtime-tested | A file remained after malformed output, exit 7, and a host-killed one-second timeout. Codex continued. |
| Matching handlers coexist. | documented, runtime-tested | Two handlers ran for the same event and both contexts reached the model. |
| Plain stdout is ignored; valid JSON `additionalContext` reaches the model. | documented, source-inspected, runtime-tested | Probe markers were delivered as additional developer context. |
| Malformed JSON, crash, and timeout are fail-open for the completed edit. | source-inspected, runtime-tested | All three handlers ran; the edit persisted and the turn continued. |
| Shell writes are observable as `Bash`. | documented, source-inspected, runtime-tested | `printf x > shell.txt` emitted a `Bash` event, but no reliable changed-path field. Unsupported by this adapter. |
| `codex exec` supports this hook path. | runtime-tested | Passed on Linux with `codex-cli 0.155.1`. |
| The product command delivers advice for the exact reviewed snapshot before the next action. | runtime-tested | Codex repeated rule `r1_inferred_case`, p=0.95, path, and hash prefix `48a53e989644`; the completed file had the same SHA-256 prefix and no intervening tool action. |
| One patch affecting multiple files is reviewed per eligible file. | runtime-tested | A two-file patch produced two advice items with independently verified snapshot hashes before the next action. |
| The interactive TUI supports the same synchronous product hook path. | runtime-tested | The TUI showed the hook running, then received rule, probability, path, and reviewed hash before any next tool action. The independently computed file hash matched. |
| Hosted tools and every specialized local path are covered. | documented limitation | Not claimed; official documentation says specialized paths may opt out. |

## Pinned sources and provenance

- Official hook documentation: <https://developers.openai.com/codex/hooks>, inspected
  2026-09-19. It defines discovery, trust, matcher aliases, input/output fields,
  synchronous default behavior, and `PostToolUse` semantics.
- Codex tag `rust-v0.155.1`, commit
  `4e21628f9ec9ee656650cd2b62ef92225725b5ac`:
  `codex-rs/hooks/schema/generated/post-tool-use.command.input.schema.json`,
  `codex-rs/hooks/src/events/post_tool_use.rs`,
  `codex-rs/core/src/tools/registry.rs`, and
  `codex-rs/core/src/tools/handlers/apply_patch.rs`.
- Sanitized runtime evidence and the reproducible probe are under
  [`evidence/codex/0.155.1`](./evidence/codex/0.155.1/README.md).

## Product-owned process contract

The stable seam is newline-terminated JSON on stdin/stdout:

```json
{
  "version": 1,
  "event": {
    "id": "session:turn:tool-use",
    "kind": "successful-edit",
    "host": "codex-cli/0.155.1",
    "cwd": "/absolute/repository/root",
    "paths": ["src/example.ts"]
  }
}
```

The response has `version`, `eventId`, `results`, and a globally budgeted `advice` array.
Each result is exactly one of `reviewed`, `skipped`, or `unavailable`. Reviewed results
carry the SHA-256 identity of the content read after the edit. Stdout contains only the
single response object; diagnostics must use stderr and must not contain source content.
Unknown fields, wrong versions, and malformed values are rejected at the boundary.

When the response also carries structured diagnostic observations, the adapter renders only
an unsuppressed observation notification. Codex `systemMessage` is the user-visible
diagnostic channel in the pinned 0.155.1 TUI; `hookSpecificOutput.additionalContext` remains
agent-facing review context. Problem/recovery copy is product-owned and bounded: provider
reasons, source text, repository paths used as identities, environment dumps, and credential
values are never rendered. Suppression affects the notification only; the structured result
and its `status` remain available to receipts and headless callers.

To suppress duplicate advice across short-lived hook processes, the runtime atomically
claims a SHA-256 event/snapshot fingerprint under the OS temporary directory. Marker names
contain no source text, repository path, or credentials. Failure to access this best-effort
store fails open and may repeat advice; it never suppresses review or changes the edit.
