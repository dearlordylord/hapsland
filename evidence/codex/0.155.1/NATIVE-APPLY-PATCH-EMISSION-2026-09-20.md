# Native `apply_patch` emission: runtime evidence

## Answer

The Codex edit call is **not** the standard unified diff shown in the input-contract
dashboard. In the tested `codex-cli 0.155.1` host, the post-tool hook received a
Codex-specific patch command in a JSON envelope:

```json
{
  "hook_event_name": "PostToolUse",
  "tool_name": "apply_patch",
  "tool_input": {
    "command": "*** Begin Patch\n*** Update File: <WORKSPACE>/baseline.ts\n@@\n+export const nativeProbe = true;\n*** End Patch"
  },
  "tool_response": "<TOOL_RESPONSE>",
  "tool_use_id": "<TOOL_USE>"
}
```

The path, identity fields, and response are sanitized. The retained command is the
actual command text observed by the hook, and the source line is synthetic.

For a new file, the same probe observed:

```diff
*** Begin Patch
*** Add File: <WORKSPACE>/native-probe.ts
+export const nativeProbe = true;
*** End Patch
```

This is a patch-language command, not `--- before`, `+++ after`, and `@@ -n,+n @@`
unified-diff text. The dashboard's `textual-diff@2` payload is therefore a
product-generated normalized review representation, not the raw Codex edit call.

## What was observed

| Boundary | Observed result |
| --- | --- |
| Codex version | `codex-cli 0.155.1` |
| Invocation | `codex exec --ephemeral --json` in a disposable repository |
| Hook event | One `PostToolUse` event for one successful native `apply_patch` call |
| `tool_input` shape | Object with one key: `command` (string) |
| Command syntax | `*** Begin Patch`, `*** Add/Update File`, optional `@@` hunk marker, `+` lines, `*** End Patch` |
| Edit result | The created/updated file existed after the hook; Codex exited `0` |
| Host JSONL | Separate `item.started`/`item.completed` records with `item.type: "file_change"`; the retained summary did not contain the raw patch command |
| Review event | No separate host “review” event was emitted. The configured `PostToolUse` command is the integration entry point. |

The tested `PostToolUse` envelope also carried `session_id`, `turn_id`,
`transcript_path`, `cwd`, `model`, `permission_mode`, `tool_response`, and
`tool_use_id`, plus the event name and tool name. The product receives this envelope
through the hook stdin; it does not receive the model provider's private API trace.

## Ten-field interface edit probe

The probe was rerun with a `Delivery` interface containing exactly ten named fields and one requested edit:
`email?: string` became `email: string`. Codex emitted this exact sanitized command:

```diff
*** Begin Patch
*** Update File: <WORKSPACE>/ten-field-baseline.ts
@@
-  email?: string;
+  email: string;
*** End Patch
```

It made one successful `PostToolUse` callback and changed the file. Codex chose a
minimal hunk here: it did not include the other interface lines as context. The full
sanitized capture is [`native-ten-field-interface-edit-emission-2026-09-20.json`](./native-ten-field-interface-edit-emission-2026-09-20.json).
The validator for this example is [`validate-ten-field-interface-patch-shape.mjs`](./probe/validate-ten-field-interface-patch-shape.mjs); its latest result is [`native-ten-field-interface-edit-validation-2026-09-20.json`](./native-ten-field-interface-edit-validation-2026-09-20.json). It reruns the real Codex probe and fails if the command gains context lines, includes the full interface, or otherwise changes shape.

The source has ten named fields: `id`, `channel`, `email`, `phone`, `priority`, `retries`,
`scheduledAt`, `metadata`, `region`, and `locale`. The dashboard shows that source beside
the exact callback.

## What this does not establish

- It does not establish that every Codex release uses this exact patch grammar.
- It does not establish the direct model/API tool-call envelope. This probe observes
  the host's post-tool hook input, which is the boundary available to the integration.
- The probe sanitizer intentionally replaced `tool_response` with a placeholder, so
  its original response contents are not retained here.
- This probe covered one file creation and one file update. Multi-file behavior is
  separately represented by the older sanitized fixture
  [`post-tool-use-multi-file.json`](./post-tool-use-multi-file.json).
- No paid Jev request or external review call was made by this probe.

## Reproduction

Run from the repository root:

```sh
node evidence/codex/0.155.1/probe/native-patch-emission.mjs
node evidence/codex/0.155.1/probe/native-patch-emission.mjs --update
node evidence/codex/0.155.1/probe/validate-native-patch-shape.mjs
```

The runner uses a temporary `CODEX_HOME`, copies authentication only into that
temporary home when available, captures the hook stdin, redacts identities and
temporary paths, writes the sanitized records to:

- [`native-patch-emission-2026-09-20.json`](./native-patch-emission-2026-09-20.json)
- [`native-update-emission-2026-09-20.json`](./native-update-emission-2026-09-20.json)

and deletes the temporary repository and home afterward. It does not print or commit
credentials.
