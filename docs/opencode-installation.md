# OpenCode 1.14.44 integration

Hapsland's OpenCode adapter targets the exact `1.14.44` global plugin API. The plugin listens to `tool.execute.after` for direct `edit` and `write` calls. It sends an attributed event to the local Hapsland CLI, waits within the hook's 4.5 second watchdog, and appends a ready finding to that tool's output. This candidate path remains outside the [installed release support declaration](installed-release-compatibility.md).

The adapter requires a session ID, call ID, named file, current file evidence, and an eligible semantic root. It skips ambiguous input quietly. The local plugin runs with the user's filesystem privileges. Effective file settings select otherwise eligible files when Jev credentials are available.

| OpenCode 1.14.44 event | Adapter result |
| --- | --- |
| Direct `edit` with unique changed whole lines in the captured file | Candidate Update; unchanged lines in the edit arguments are excluded |
| `edit` with only partial, repeated, or otherwise ambiguous changed lines | Quiet skip |
| Direct `write` creating a file (`metadata.exists === false`) | Candidate Add |
| `write` replacing an existing file | **Unsupported; quiet skip.** The callback does not supply trustworthy before-source, so unchanged declarations cannot be excluded. |
| Shell write, `file.edited`, OpenCode v2, or `opencode run --pure` | Unsupported |

## Installation operations

Use the versioned installation operation in the Hapsland CLI with `host: "opencode"` and `opencodeConfigHome` when a nondefault XDG configuration location is desired. Preview returns a digest and the exact paths that will change. Pass that digest to install, update, or uninstall. Doctor is read-only and reports host version, runtime, owned plugin integrity, plugin-loading uncertainty, file settings, and credential accessibility.

```sh
printf '%s\n' '{"version":1,"operation":"install-preview","host":"opencode"}' | hapsland --install-preview
# Review proposal.ownedChanges and proposal.digest in the JSON result.
printf '%s\n' '{"version":1,"operation":"install","host":"opencode","proposalDigest":"<digest from preview>"}' | hapsland --install
printf '%s\n' '{"version":1,"operation":"doctor","host":"opencode","cwd":"."}' | hapsland --doctor
```

For an update, use `update-preview` followed by `update` with its fresh digest. For removal, call `uninstall` without a digest to preview, then repeat with that preview's digest. The request `cwd` for doctor identifies the repository.

The installer owns only `plugins/hapsland.mjs` and `.realtime-review-tool/opencode-installation-v1.json` under the OpenCode configuration directory. It preserves every other plugin and config file. A preexisting plugin at the owned path, missing ownership record, or local modification causes a conflict. Update replaces the owned plugin after a fresh preview. Uninstall removes only the owned plugin and record. A global plugin may load alongside other plugins; installing another copy through project configuration is outside this installer and should be checked during host validation.

Use a normal OpenCode session to confirm host plugin loading. `--pure` is unsupported. Source is sent to Jev only for attributed, selected, otherwise eligible files when credentials are available.

## Validation status

The [historical host evidence](../evidence/host-94/decision-and-evidence.md#remaining-decisions-and-evidence) records the local probe and its limits. Production support still requires a real agent reaction to a finding plus stale result, timeout, restart, failure, coexistence, and removal checks. A hook submission alone does not establish agent-visible advice.
